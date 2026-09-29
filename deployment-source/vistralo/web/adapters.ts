import { CloudAdapter } from "./cloud";
import type {
  AppMode,
  WorkspaceAdapter,
  AdapterCapabilities,
  Project,
  ProjectDetail,
  ProjectPatch,
  CreateProjectInput,
  UploadOptions,
  UploadResult,
  ShareLink,
  WorkspaceSettings,
} from "./contracts";
import {
  createDemoFixtures,
  DEMO_STORAGE_KEY,
  DEMO_VERSION,
  demoBrief,
} from "./fixtures";
import { uuid } from "./id";
import { abortIfNeeded } from "./checksum";

export class ApiError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message);
    this.name = "ApiError";
  }
}
export class UnsupportedOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedOperationError";
  }
}
const now = () => new Date().toISOString();
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const statuses = new Set([
  "uploading",
  "queued",
  "processing",
  "failed",
  "draft",
  "ready",
]);
const number = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : undefined;

/** An unprocessed native Ready project is a draft, not a completed deliverable. */
export function normalizeProject(raw: any): Project {
  const data = raw.data || {};
  const w = raw.workspace || data.workspace || {};
  const source = ["screen", "web", "upload"].includes(w.source)
    ? w.source
    : raw.mode === "walkthrough"
      ? "web"
      : data.imported
        ? "upload"
        : "screen";
  let status = statuses.has(w.status)
    ? w.status
    : data.output || data.brief || data.analysis || data.manifest
      ? "ready"
      : "draft";
  if (!statuses.has(w.status)) {
    if (raw.state === "Failed") status = "failed";
    else if (
      ["Processing", "Recording", "Paused", "Stopping"].includes(raw.state)
    )
      status = "processing";
    else if (raw.state === "Interrupted") status = "failed";
  }
  const created = raw.created || now(),
    updated = raw.updated || created;
  const eventLabel =
    w.eventLabel ||
    (status === "ready"
      ? source === "web"
        ? "Analyzed"
        : source === "upload"
          ? "Uploaded"
          : "Recorded"
      : "Updated");
  return {
    id: raw.id,
    name: raw.name || "Untitled project",
    type:
      w.type === "brief" || w.type === "walkthrough"
        ? w.type
        : source === "web"
          ? "brief"
          : "walkthrough",
    source,
    url: w.url || undefined,
    status,
    progress: number(w.progress),
    error:
      status === "failed"
        ? w.error ||
          data.error ||
          (raw.state === "Interrupted"
            ? "The task was interrupted. Review the retained source and try again."
            : undefined)
        : undefined,
    created,
    updated,
    eventAt: w.eventAt || updated,
    eventLabel,
    duration: number(w.duration) ?? number(data.output?.duration),
    references: number(w.referenceCount),
    sections: number(w.sectionCount),
    moments: number(w.moments),
    access:
      w.access === "link"
        ? "link"
        : w.access === "workspace"
          ? "workspace"
          : "private",
    collaborators: w.collaborators,
    pinned: !!w.pinned,
    trashed: !!w.trashedAt,
    trashedAt: w.trashedAt || undefined,
    lastOpened: w.lastOpened || undefined,
    folder: w.folder || undefined,
    thumbnail:
      typeof w.thumbnail === "string" ? w.thumbnail : w.thumbnail?.file,
    video: data.output?.file || data.video,
    data,
    nativeState: raw.state,
  };
}

interface DemoStore {
  version: number;
  projects: Project[];
  shares: (ShareLink & { projectId: string })[];
  settings: WorkspaceSettings;
}
const objectURLs = new Map<string, string>();
let demoDatabase: Promise<IDBDatabase> | undefined;
function database(): Promise<IDBDatabase> {
  if (!demoDatabase)
    demoDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open("vistralo-demo-media", 1);
      request.onupgradeneeded = () => request.result.createObjectStore("files");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        demoDatabase = undefined;
        reject(
          new Error(
            "Browser storage could not be opened. Local demo uploads are unavailable.",
          ),
        );
      };
    });
  return demoDatabase;
}
async function blobStore(
  action: "get" | "put" | "delete",
  key: string,
  file?: Blob,
): Promise<any> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      "files",
      action === "get" ? "readonly" : "readwrite",
    );
    const store = tx.objectStore("files");
    const request =
      action === "get"
        ? store.get(key)
        : action === "delete"
          ? store.delete(key)
          : store.put(file!, key);
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () =>
      reject(
        new Error(
          "There is not enough browser storage to save this file. Sign in to your Vistralo workspace for large recordings.",
        ),
      );
  });
}
function readDemo(): DemoStore {
  const raw = localStorage.getItem(DEMO_STORAGE_KEY);
  if (!raw) {
    const initial = {
      version: DEMO_VERSION,
      projects: createDemoFixtures(),
      shares: [],
      settings: { theme: "dark" },
    } as DemoStore;
    writeDemo(initial);
    return initial;
  }
  let value: DemoStore;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error(
      "The saved demo workspace is unreadable. Export browser data or reset this demo workspace in settings.",
    );
  }
  if (
    value.version !== DEMO_VERSION ||
    !Array.isArray(value.projects) ||
    !Array.isArray(value.shares)
  )
    throw new Error("This demo workspace uses an unsupported format.");
  return value;
}
function writeDemo(value: DemoStore) {
  try {
    localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(value));
  } catch {
    throw new Error(
      "The demo change could not be saved in this browser. Check available storage and try again.",
    );
  }
}
function validateInput(input: CreateProjectInput) {
  if (!input.name?.trim() || input.name.trim().length > 120)
    throw new Error("Use a project name of 1–120 characters.");
  if (!["screen", "web", "upload"].includes(input.source))
    throw new Error("Choose a supported project source.");
  if (input.url) {
    let url: URL;
    try {
      url = new URL(input.url);
    } catch {
      throw new Error("Enter a complete website URL.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Use an HTTP(S) URL without embedded credentials.");
  }
}
class DemoAdapter implements WorkspaceAdapter {
  readonly mode = "demo" as const;
  readonly capabilities: AdapterCapabilities = {
    manage: true,
    share: true,
    workspaceAccess: true,
    upload: true,
    capture: true,
    providers: false,
    localOnly: true,
  };
  private find(store: DemoStore, id: string) {
    const project = store.projects.find((p) => p.id === id);
    if (!project) throw new Error("This demo project was not found.");
    return project;
  }
  private mutate<T>(fn: (store: DemoStore) => T): T {
    const store = readDemo(),
      result = fn(store);
    writeDemo(store);
    return clone(result);
  }
  async list() {
    const store = readDemo();
    let changed = false;
    for (const project of store.projects) {
      if (
        project.status === "processing" &&
        project.data.simulationDueAt &&
        Date.parse(project.data.simulationDueAt) <= Date.now()
      ) {
        if (!project.trashed) {
          project.status = "draft";
          project.eventLabel = "Edited";
          project.eventAt = project.updated = now();
          project.references = 0;
          project.sections = 5;
          project.data.brief = demoBrief(
            project.name,
            project.url || project.sourceLabel || "Fictional example",
          );
          project.data.simulationState =
            "Simulation complete. Review and edit this fictional example; no website evidence was captured.";
          project.data.events = [
            ...(project.data.events || []),
            { type: "demo-simulation-complete", created: now() },
          ];
        }
        delete project.data.simulationDueAt;
        changed = true;
      }
    }
    if (changed) writeDemo(store);
    for (const project of store.projects)
      for (const key of Object.values(project.data.localMedia || {})) {
        if (!objectURLs.has(String(key))) {
          const blob = await blobStore("get", String(key));
          if (blob) objectURLs.set(String(key), URL.createObjectURL(blob));
        }
      }
    return clone(store.projects);
  }
  async create(input: CreateProjectInput): Promise<Project> {
    validateInput(input);
    return this.mutate((store) => {
      const project: Project = {
        id: `demo-${uuid()}`,
        name: input.name.trim(),
        type: input.type || (input.source === "web" ? "brief" : "walkthrough"),
        source: input.source,
        url: input.url,
        status: "draft",
        access: "private",
        created: now(),
        updated: now(),
        eventAt: now(),
        eventLabel: "Edited",
        data: { demo: true, fictional: false },
      };
      store.projects.unshift(project);
      return project;
    });
  }
  async update(id: string, patch: ProjectPatch) {
    return this.mutate((store) => {
      const project = this.find(store, id);
      if (
        patch.name !== undefined &&
        (!patch.name.trim() || patch.name.trim().length > 120)
      )
        throw new Error("Use a project name of 1–120 characters.");
      if (
        patch.pinned &&
        !project.pinned &&
        store.projects.filter((p) => p.pinned && !p.trashed).length >= 5
      )
        throw new Error("You can pin up to five projects.");
      Object.assign(project, patch);
      if (Object.keys(patch).some((key) => key !== "lastOpened"))
        Object.assign(project, {
          updated: now(),
          eventAt: now(),
          eventLabel: "Edited",
        });
      return project;
    });
  }
  async duplicate(id: string) {
    return this.mutate((store) => {
      const original = this.find(store, id);
      if (["processing", "uploading", "queued"].includes(original.status))
        throw new Error(
          "Wait for this project to finish before duplicating it.",
        );
      const copy = {
        ...clone(original),
        id: `demo-${uuid()}`,
        name: `${original.name.slice(0, 113)} (copy)`,
        access: "private" as const,
        collaborators: [],
        pinned: false,
        trashed: false,
        trashedAt: undefined,
        lastOpened: undefined,
        created: now(),
        updated: now(),
        eventAt: now(),
        eventLabel: "Edited" as const,
      };
      store.projects.unshift(copy);
      return copy;
    });
  }
  async trash(ids: string[]) {
    this.mutate((store) => {
      for (const id of ids) {
        const p = this.find(store, id);
        p.trashed = true;
        p.trashedAt = now();
        p.pinned = false;
        delete p.data.simulationDueAt;
        store.shares
          .filter((s) => s.projectId === id)
          .forEach((s) => {
            s.revoked = true;
          });
      }
      return true;
    });
  }
  async restore(ids: string[]) {
    this.mutate((store) => {
      for (const id of ids) {
        const p = this.find(store, id);
        p.trashed = false;
        delete p.trashedAt;
      }
      return true;
    });
  }
  async remove(ids: string[]) {
    this.mutate((store) => {
      for (const id of ids) {
        if (!this.find(store, id).trashed)
          throw new Error(
            "Move a project to Trash before permanently deleting it.",
          );
      }
      store.projects = store.projects.filter((p) => !ids.includes(p.id));
      store.shares = store.shares.filter((s) => !ids.includes(s.projectId));
      return true;
    });
  }
  async project(id: string): Promise<ProjectDetail> {
    await this.list();
    const store = readDemo(),
      project = clone(this.find(store, id));
    const files = [
      ...(project.video
        ? [{ file: project.video, size: project.data.fileSize || 0 }]
        : []),
      ...(project.data.brief
        ? [
            {
              file: "visual-brief.md",
              size: new Blob([project.data.brief]).size,
            },
          ]
        : []),
    ];
    return {
      project,
      files,
      evidence: project.data.evidence || null,
      jobs: project.data.jobs || [],
      events: project.data.events || [],
      brief: project.data.brief,
      shares: await this.shares(id),
      progress: {
        stage: "Demo workspace",
        detail:
          project.data.simulationState ||
          "This example is stored in your browser. No server job is running.",
      },
    };
  }
  media(id: string, file: string, download = false) {
    const project = this.find(readDemo(), id);
    const key = project.data.localMedia?.[file];
    if (key) return objectURLs.get(key) || "";
    if (file === "visual-brief.md" && project.data.brief) {
      const cacheKey = `${id}:brief:${project.updated}`;
      if (!objectURLs.has(cacheKey))
        objectURLs.set(
          cacheKey,
          URL.createObjectURL(
            new Blob([project.data.brief], { type: "text/markdown" }),
          ),
        );
      return objectURLs.get(cacheKey)!;
    }
    if (file.startsWith("/assets/")) return file;
    return "";
  }
  async readText(id: string, file: string) {
    const project = this.find(readDemo(), id);
    if (file === "visual-brief.md" && typeof project.data.brief === "string")
      return project.data.brief;
    const key = project.data.localMedia?.[file];
    if (key) {
      const blob = await blobStore("get", key);
      if (blob) return blob.text();
    }
    throw new Error("This demo file was not found.");
  }
  async upload(
    id: string,
    file: File,
    options: UploadOptions = {},
  ): Promise<UploadResult> {
    abortIfNeeded(options.signal);
    const kind = options.kind || "video";
    const extensions = {
      video: /\.(mp4|webm|mov|mkv)$/i,
      audio: /\.(mp3|wav|m4a)$/i,
      captions: /\.(srt|vtt)$/i,
    };
    if (!file.size || !extensions[kind].test(file.name))
      throw new Error("Choose a supported, nonempty media file.");
    this.find(readDemo(), id);
    const key = uuid(),
      name = `imports/demo-${key}.${file.name.split(".").pop()!.toLowerCase()}`;
    options.onProgress?.({
      phase: "uploading",
      percent: 0,
      uploaded: 0,
      total: file.size,
    });
    await blobStore("put", key, file);
    if (options.signal?.aborted) {
      await blobStore("delete", key);
      abortIfNeeded(options.signal);
    }
    objectURLs.set(key, URL.createObjectURL(file));
    this.mutate((store) => {
      const project = this.find(store, id);
      project.data.localMedia = { ...project.data.localMedia, [name]: key };
      project.data.fileSize = file.size;
      if (kind === "video") {
        project.video = name;
        project.data.video = name;
        delete project.data.sampleVideo;
        delete project.data.sampleVideoNotice;
      } else if (kind === "audio") project.data.narration = name;
      else project.data.captions = name;
      project.status = "draft";
      delete project.progress;
      delete project.error;
      if (options.voice === "microphone") project.data.microphone = true;
      project.eventLabel =
        project.source === "screen" ? "Recorded" : "Uploaded";
      project.updated = project.eventAt = now();
      return true;
    });
    options.onProgress?.({
      phase: "uploading",
      percent: 100,
      uploaded: file.size,
      total: file.size,
    });
    return {
      file: name,
      demo: true,
      voice: options.voice === "microphone" ? "microphone" : undefined,
    };
  }
  async login() {
    throw new UnsupportedOperationError(
      "Demo mode does not sign in to a server. Switch to the connected workspace first.",
    );
  }
  async logout() {
    /* The demo has no authenticated session. */
  }
  async share(id: string, expiresInDays: 1 | 7 | 30 = 7): Promise<ShareLink> {
    return this.mutate((store) => {
      const project = this.find(store, id);
      if (project.trashed)
        throw new Error("Restore this project before sharing it.");
      if (!project.video && !project.data.brief)
        throw new Error(
          "Add a recording or visual brief before sharing this demo project.",
        );
      const shareId = `demo-share-${uuid()}`;
      const share: ShareLink & { projectId: string } = {
        id: shareId,
        projectId: id,
        path: `/#demo/share/${shareId}`,
        url: `${location.origin}${location.pathname}#demo/share/${shareId}`,
        expiresAt: new Date(
          Date.now() + expiresInDays * 86_400_000,
        ).toISOString(),
        created: now(),
        localOnly: true,
      };
      project.access = "link";
      store.shares.push(share);
      return share;
    });
  }
  async revoke(shareId: string) {
    this.mutate((store) => {
      const share = store.shares.find((s) => s.id === shareId);
      if (!share) throw new Error("This local share link was not found.");
      share.revoked = true;
      if (
        !store.shares.some(
          (s) =>
            s.projectId === share.projectId &&
            !s.revoked &&
            Date.parse(s.expiresAt || "") > Date.now(),
        )
      )
        this.find(store, share.projectId).access = "private";
      return true;
    });
  }
  async shares(id: string) {
    return clone(
      readDemo().shares.filter(
        (s) =>
          s.projectId === id &&
          !s.revoked &&
          Date.parse(s.expiresAt || "") > Date.now(),
      ),
    );
  }
  async settings(patch?: WorkspaceSettings) {
    if (!patch) return clone(readDemo().settings);
    return this.mutate((store) => {
      Object.assign(store.settings, patch);
      return store.settings;
    });
  }
  private simulateCapture(id: string, url?: string) {
    this.mutate((store) => {
      const p = this.find(store, id);
      if (p.trashed)
        throw new Error("Restore this project before running a simulation.");
      p.status = "processing";
      p.error = undefined;
      if (url) p.url = url;
      p.data.simulationState =
        "Simulating a website analysis locally. No remote website is being accessed.";
      p.data.simulationDueAt = new Date(Date.now() + 1800).toISOString();
      p.updated = now();
      return true;
    });
    return {
      id: `demo-job-${uuid()}`,
      project: id,
      demo: true,
      simulated: true,
    };
  }
  async rpc<T = any>(
    method: string,
    args: Record<string, any> = {},
  ): Promise<T> {
    let result: any;
    if (method === "status")
      result = {
        projects: await this.list(),
        execution: "demo",
        credentials: { openai: false, heygen: false },
        obsAvailable: false,
        active: null,
      };
    else if (method === "project") result = await this.project(args.id);
    else if (method === "files") result = (await this.project(args.id)).files;
    else if (method === "evidence")
      result = (await this.project(args.id)).evidence;
    else if (method === "walkthrough" || method === "retry")
      result = this.simulateCapture(args.id, args.url);
    else if (method === "cancel") {
      result = this.mutate((store) => {
        const p = this.find(store, args.id);
        p.status = "draft";
        delete p.progress;
        delete p.error;
        delete p.data.simulationDueAt;
        p.data.simulationState = "Demo operation cancelled.";
        return { cancelled: true, demo: true };
      });
    } else if (method === "briefSave") {
      if (typeof args.text !== "string" || args.text.length > 1_000_000)
        throw new Error("Use a visual brief smaller than 1 MB.");
      result = this.mutate((store) => {
        const p = this.find(store, args.id);
        p.data.brief = args.text;
        p.sections = (args.text.match(/^##\s/gm) || []).length;
        p.status = "draft";
        p.eventLabel = "Edited";
        p.updated = p.eventAt = now();
        return p;
      });
    } else if (method === "plan" || method === "narratedPlan") {
      if (
        method === "plan" &&
        (!Array.isArray(args.plan?.clips) ||
          !args.plan.clips.length ||
          args.plan.clips.some(
            (c: any) =>
              !Number.isFinite(c.start) ||
              !Number.isFinite(c.end) ||
              c.start < 0 ||
              c.end <= c.start,
          ))
      )
        throw new Error("Choose valid start and end times for every clip.");
      result = this.mutate((store) => {
        const p = this.find(store, args.id);
        p.data[method === "plan" ? "editPlan" : "narratedPlan"] =
          args.plan || args.segments;
        p.status = "draft";
        p.eventLabel = "Edited";
        p.updated = p.eventAt = now();
        return p;
      });
    } else if (method === "process")
      throw new UnsupportedOperationError(
        "Video rendering requires a Vistralo cloud workspace. Your demo edit plan is saved, and your original video is unchanged.",
      );
    else if (method === "mediaInfo") {
      const detail = await this.project(args.id),
        url = this.media(args.id, args.file);
      if (!url) throw new Error("No playable media is available.");
      result = await new Promise((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        const clear = () => {
          video.removeAttribute("src");
          video.load();
        };
        video.onloadedmetadata = () => {
          const info = {
            file: args.file,
            duration: Number.isFinite(video.duration)
              ? video.duration
              : detail.project.duration || 0,
            width: video.videoWidth,
            height: video.videoHeight,
            hasAudio: undefined,
            demo: true,
          };
          clear();
          resolve(info);
        };
        video.onerror = () => {
          clear();
          reject(
            new Error(
              "This browser cannot read this video format. Use MP4 or WebM, or process it in your Vistralo cloud workspace.",
            ),
          );
        };
        video.src = url;
      });
    } else if (method === "resetDemo") {
      const old = readDemo();
      writeDemo({
        version: DEMO_VERSION,
        projects: createDemoFixtures(),
        shares: [],
        settings: old.settings,
      });
      for (const project of old.projects)
        for (const key of Object.values(project.data.localMedia || {})) {
          await blobStore("delete", String(key));
          const url = objectURLs.get(String(key));
          if (url) URL.revokeObjectURL(url);
          objectURLs.delete(String(key));
        }
      result = { reset: true, demo: true };
    } else if (method === "check")
      result = {
        demo: true,
        platform: "browser",
        message:
          "Local demo only. Setup checks run in your Vistralo cloud workspace.",
      };
    else if (method === "transcript")
      throw new UnsupportedOperationError(
        "Word-timed transcript processing requires a Vistralo cloud workspace.",
      );
    else
      throw new UnsupportedOperationError(
        `${method} is unavailable in the local demo. Switch to the connected workspace.`,
      );
    return result as T;
  }
}

/** Mode is selected by the app boundary; authentication failures never switch to demo. */
export function createAdapter(mode: AppMode): WorkspaceAdapter {
  if (mode === "cloud") return new CloudAdapter();
  if (mode === "demo") return new DemoAdapter();
  throw new Error("Choose an explicit Vistralo workspace mode.");
}

export interface DemoSharedContent {
  id: string;
  name: string;
  type: Project["type"];
  project: Project;
  video?: string;
  thumbnail?: string;
  brief?: string;
  files: { file: string; url: string; size: number }[];
  expiresAt: string;
  readOnly: true;
  localOnly: true;
}

/** Resolves #demo/share/<shareId> only against this browser's active local links. */
export async function readDemoShare(
  shareId: string,
): Promise<DemoSharedContent> {
  const store = readDemo();
  const share = store.shares.find(
    (item) =>
      item.id === shareId &&
      !item.revoked &&
      Date.parse(item.expiresAt || "") > Date.now(),
  );
  if (!share)
    throw new Error(
      "This demo link is unavailable or expired. Demo links work only in the browser where they were created.",
    );
  const saved = store.projects.find(
    (project) => project.id === share.projectId && !project.trashed,
  );
  if (!saved) throw new Error("This demo project is no longer shared.");
  const adapter = new DemoAdapter(),
    detail = await adapter.project(saved.id),
    project = detail.project;
  return {
    id: project.id,
    name: project.name,
    type: project.type,
    project,
    video: project.video ? adapter.media(project.id, project.video) : undefined,
    thumbnail: project.thumbnail,
    brief: detail.brief,
    files: detail.files.map((file) => ({
      ...file,
      url: adapter.media(project.id, file.file, true),
    })),
    expiresAt: share.expiresAt!,
    readOnly: true,
    localOnly: true,
  };
}
