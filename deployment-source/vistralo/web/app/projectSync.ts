import type { Project, ProjectChunk, WorkspaceAdapter } from "../contracts";

export interface LibraryState {
  projects: Project[];
  /** How many projects the workspace holds, whether or not they have all been read yet. */
  total: number;
  /** False while a large workspace is still being read in the background. */
  complete: boolean;
}

export interface SyncOptions {
  /** The first read: enough for the first screen to appear at once. */
  first: number;
  /** Each background read after that. */
  chunk: number;
  /** Changes are asked for from this long before the newest change seen, because clients' clocks differ. */
  overlapMs: number;
  /** A complete re-read catches what a change-only poll cannot see: rows deleted elsewhere. */
  resyncMs: number;
}

const DEFAULTS: SyncOptions = { first: 200, chunk: 500, overlapMs: 120_000, resyncMs: 300_000 };

const newestFirst = (a: Project, b: Project) =>
  a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Keeps the library in step with the workspace without reading every project on every poll.
 * The first refresh reads one chunk and publishes it, then reads the rest in the background.
 * Later refreshes ask only for what changed since the newest change already seen.
 */
export class ProjectSync {
  private items = new Map<string, Project>();
  private running = new Set<string>();
  private cursor = "";
  private total = 0;
  private complete = false;
  private started = false;
  private filling = false;
  private generation = 0;
  private lastFull = 0;
  private options: SyncOptions;

  constructor(
    private adapter: WorkspaceAdapter,
    private publish: (state: LibraryState) => void,
    options: Partial<SyncOptions> = {},
    private clock: () => number = () => Date.now(),
  ) {
    this.options = { ...DEFAULTS, ...options };
  }

  /** Forget everything, for example after signing out. */
  reset() {
    this.generation++;
    this.items = new Map();
    this.running = new Set();
    this.cursor = "";
    this.total = 0;
    this.complete = false;
    this.started = false;
    this.filling = false;
  }

  state(): LibraryState {
    return { projects: this.view(), total: Math.max(this.total, this.items.size), complete: this.complete };
  }

  /** Adds or replaces one project at once, before the next poll would have brought it. */
  upsert(project: Project) {
    if (!this.items.has(project.id)) this.total++;
    this.items.set(project.id, project);
    this.emit();
  }

  /**
   * Brings the library up to date and returns the projects whose status changed since the
   * last call, so the caller can tell the person a job finished.
   */
  async refresh(): Promise<{ projects: Project[]; changed: Project[] }> {
    const generation = this.generation;
    const before = this.statuses();
    if (!this.adapter.summaries || !this.adapter.changes) {
      const all = await this.adapter.list();
      if (generation !== this.generation) return { projects: [], changed: [] };
      this.items = new Map(all.map((p) => [p.id, p]));
      this.total = all.length;
      this.complete = true;
      this.started = true;
    } else if (!this.started) {
      const first = await this.adapter.summaries({ offset: 0, limit: this.options.first });
      if (generation !== this.generation) return { projects: [], changed: [] };
      this.take(first, true);
      this.started = true;
      this.complete = this.items.size >= this.total;
      if (this.complete) this.lastFull = this.clock();
    } else {
      const since = this.cursor
        ? new Date(Date.parse(this.cursor) - this.options.overlapMs).toISOString()
        : new Date(0).toISOString();
      const delta = await this.adapter.changes(since);
      if (generation !== this.generation) return { projects: [], changed: [] };
      this.take(delta, false);
      // A different row count means something was deleted or missed; only a re-read finds which.
      const stale = this.complete && (delta.total !== this.items.size || this.clock() - this.lastFull > this.options.resyncMs);
      if (stale) void this.reread(generation);
    }
    this.emit();
    if (!this.complete && !this.filling) void this.fill(generation);
    const view = this.view();
    return {
      projects: view,
      changed: view.filter((p) => before.has(p.id) && before.get(p.id) !== p.status),
    };
  }

  private statuses() {
    return new Map(this.view().map((p) => [p.id, p.status]));
  }

  private take(chunk: ProjectChunk, replaceRunning: boolean) {
    for (const project of chunk.items) {
      this.items.set(project.id, project);
      if (project.updated > this.cursor) this.cursor = project.updated;
    }
    this.total = chunk.total;
    if (chunk.running) this.running = new Set(chunk.running);
    else if (replaceRunning) this.running = new Set();
  }

  /** Reads the rest of a large workspace, publishing as each chunk arrives. */
  private async fill(generation: number) {
    this.filling = true;
    try {
      let offset = this.items.size;
      while (generation === this.generation && offset < this.total) {
        const next = await this.adapter.summaries!({ offset, limit: this.options.chunk });
        if (generation !== this.generation) return;
        if (!next.items.length) break;
        this.take(next, false);
        offset += next.items.length;
        this.emit();
      }
      if (generation !== this.generation) return;
      this.complete = true;
      this.lastFull = this.clock();
      this.emit();
    } catch {
      // The next refresh carries on from what was read.
    } finally {
      if (generation === this.generation) this.filling = false;
    }
  }

  /** Reads everything again into a fresh map and swaps it in, so the screen never empties. */
  private async reread(generation: number) {
    if (this.filling) return;
    this.filling = true;
    try {
      const fresh = new Map<string, Project>();
      let total = 0,
        offset = 0;
      do {
        const next = await this.adapter.summaries!({ offset, limit: this.options.chunk });
        if (generation !== this.generation) return;
        for (const project of next.items) fresh.set(project.id, project);
        total = next.total;
        if (next.running) this.running = new Set(next.running);
        if (!next.items.length) break;
        offset += next.items.length;
      } while (offset < total);
      // Anything changed while this ran was newer than what was read; keep it.
      for (const [id, project] of this.items) {
        const read = fresh.get(id);
        if (read && project.updated > read.updated) fresh.set(id, project);
      }
      this.items = fresh;
      this.total = total;
      this.lastFull = this.clock();
      this.emit();
    } catch {
      // Keep what is on screen; the next refresh tries again.
    } finally {
      if (generation === this.generation) this.filling = false;
    }
  }

  /** A queued project whose job a worker has claimed is shown as under way. */
  private view(): Project[] {
    return [...this.items.values()]
      .map((p) => (p.status === "queued" && this.running.has(p.id) ? { ...p, status: "processing" as const } : p))
      .sort(newestFirst);
  }

  private emit() {
    this.publish(this.state());
  }
}
