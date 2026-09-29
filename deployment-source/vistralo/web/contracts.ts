export type AppMode = "demo" | "cloud";
export type ProjectStatus =
  | "uploading"
  | "queued"
  | "processing"
  | "failed"
  | "draft"
  | "ready";
export type ProjectType = "walkthrough" | "brief";
export type ProjectSource = "screen" | "web" | "upload";
export type ProjectAccess = "private" | "workspace" | "link";
export interface Collaborator {
  name: string;
  initials: string;
  avatar?: string;
}
export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  source: ProjectSource;
  url?: string;
  /** Display-only host for fictional demo records; never used as a destination. */
  sourceLabel?: string;
  status: ProjectStatus;
  progress?: number;
  error?: string;
  created: string;
  updated: string;
  eventAt: string;
  eventLabel:
    | "Recorded"
    | "Analyzed"
    | "Uploaded"
    | "Edited"
    | "Ready"
    | "Updated";
  duration?: number;
  references?: number;
  sections?: number;
  moments?: number;
  access: ProjectAccess;
  collaborators?: Collaborator[];
  pinned?: boolean;
  trashed?: boolean;
  trashedAt?: string;
  lastOpened?: string;
  folder?: string;
  thumbnail?: string;
  video?: string;
  data: Record<string, any>;
  nativeState?: string;
}
export interface ProjectFile {
  file: string;
  size: number;
  mime?: string;
}
export interface ShareLink {
  id: string;
  token?: string;
  path?: string;
  url?: string;
  expiresAt?: string;
  created?: string;
  revoked?: boolean;
  localOnly?: boolean;
}
export interface ProjectDetail {
  project: Project;
  files: ProjectFile[];
  evidence: any;
  jobs: any[];
  events: any[];
  progress?: any;
  shares?: ShareLink[];
  brief?: string;
}
export interface CreateProjectInput {
  name: string;
  source: ProjectSource;
  url?: string;
  type?: ProjectType;
}
export type ProjectPatch = Partial<
  Pick<
    Project,
    | "name"
    | "type"
    | "source"
    | "url"
    | "folder"
    | "pinned"
    | "lastOpened"
    | "access"
  >
> & { status?: "draft" | "ready" };
export interface UploadProgress {
  phase: "hashing" | "uploading" | "verifying";
  percent: number;
  uploaded?: number;
  total?: number;
}
export interface UploadOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
  kind?: "video" | "audio" | "captions";
  /**
   * microphone: the recording already contains the person's voice.
   * ai: write a narration from the video and replace its audio with an AI voice.
   * original: keep the video's own audio.
   */
  voice?: "microphone" | "ai" | "original";
}
export interface UploadResult {
  file: string;
  sha256?: string;
  demo?: boolean;
  voice?: "queued" | "offline" | "microphone" | null;
}
export interface AdapterCapabilities {
  manage: boolean;
  share: boolean;
  workspaceAccess: boolean;
  upload: boolean;
  capture: boolean;
  providers: boolean;
  localOnly: boolean;
}
export interface WorkspaceSettings {
  theme?: "dark" | "light" | "system";
  locale?: string;
  direction?: "ltr" | "rtl";
  [key: string]: unknown;
}
export interface WorkspaceAdapter {
  readonly mode: AppMode;
  readonly capabilities: AdapterCapabilities;
  list(): Promise<Project[]>;
  create(input: CreateProjectInput): Promise<Project>;
  update(id: string, patch: ProjectPatch): Promise<Project>;
  duplicate(id: string): Promise<Project>;
  trash(ids: string[]): Promise<void>;
  restore(ids: string[]): Promise<void>;
  remove(ids: string[]): Promise<void>;
  project(id: string): Promise<ProjectDetail>;
  rpc<T = any>(method: string, args?: Record<string, any>): Promise<T>;
  media(id: string, file: string, download?: boolean): string;
  upload(
    id: string,
    file: File,
    options?: UploadOptions,
  ): Promise<UploadResult>;
  login(token: string): Promise<void>;
  logout(): Promise<void>;
  share(id: string, expiresInDays?: 1 | 7 | 30): Promise<ShareLink>;
  revoke(shareId: string): Promise<void>;
  shares(id: string): Promise<ShareLink[]>;
  settings(patch?: WorkspaceSettings): Promise<WorkspaceSettings>;
  readText(id: string, file: string): Promise<string>;
}
export type Adapter = WorkspaceAdapter;
