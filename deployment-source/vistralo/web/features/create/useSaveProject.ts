import { useEffect, useRef, useState, type RefObject } from "react";
import type {
  Project,
  ProjectSource,
  UploadProgress,
  WorkspaceAdapter,
} from "../../contracts";
import { clearRecording } from "../recording-store";
import { automaticName, errorMessage, publicWebsite, validateVideo } from "../flow-utils";
import type { CreateFlow } from "../create-flows";
import { screenshotsVideo } from "../../slideshow";

interface SaveOptions {
  source: ProjectSource;
  flow?: CreateFlow;
  screenshots: boolean;
  adapter: WorkspaceAdapter;
  name: string;
  url: string;
  file: File | null;
  shots: File[];
  mobile: boolean;
  narrate: boolean;
  voiceover: boolean;
  spoken: boolean;
  activeRecording: boolean;
  offersVoiceover: boolean;
  mounted: RefObject<boolean>;
  setError: (message: string) => void;
  notify: (message: string, error?: boolean) => void;
  onCreated: (project: Project) => void;
}

export function useSaveProject({
  source,
  flow,
  screenshots,
  adapter,
  name,
  url,
  file,
  shots,
  mobile,
  narrate,
  voiceover,
  spoken,
  activeRecording,
  offersVoiceover,
  mounted,
  setError,
  notify,
  onCreated,
}: SaveOptions) {
  const controller = useRef<AbortController | null>(null),
    created = useRef<Project | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadProgress | null>(null);
  const [building, setBuilding] = useState<number | null>(null);
  const built = useRef<{ shots: File[]; video: File } | null>(null);
  // A take that is thrown away takes its half-made project with it, so the next take starts a new one.
  useEffect(() => {
    if (!file && !shots.length) created.current = null;
  }, [file, shots.length]);

  async function save() {
    if (busy || activeRecording) return;
    setError("");
    setBusy(true);
    try {
      // The site address is only asked for where narration will use it; elsewhere a value left
      // over from before the field was hidden is ignored.
      const typed =
        (source === "screen" && spoken) ||
        (source === "upload" && !screenshots && !voiceover)
          ? ""
          : url;
      const sourceUrl =
        source === "web" || typed.trim() ? publicWebsite(typed) : undefined;
      let media = file;
      if (source !== "web") {
        if (screenshots) {
          if (!shots.length) throw new Error("Add at least one screenshot.");
          if (built.current?.shots !== shots) {
            controller.current = new AbortController();
            setBuilding(0);
            built.current = {
              shots,
              video: await screenshotsVideo(shots, {
                signal: controller.current.signal,
                onProgress: setBuilding,
              }),
            };
          }
          media = built.current.video;
        }
        if (!media) throw new Error("Choose or record a video first.");
        validateVideo(media, adapter.mode === "cloud");
      }
      const projectName =
        name.trim().slice(0, 120) ||
        automaticName({
          flow,
          source,
          url: sourceUrl,
          fileName: media?.name,
          shots: shots.length,
          spoken,
          locale: localStorage.getItem("vistralo-locale") || undefined,
        });
      const project =
        created.current ??
        (await adapter.create({
          name: projectName,
          source,
          type: source === "web" ? "brief" : "walkthrough",
          url: sourceUrl,
        }));
      created.current = project;
      if (source === "web") {
        await adapter.rpc("walkthrough", {
          id: project.id,
          url: sourceUrl,
          pages: [],
          viewports: [
            { width: 1440, height: 900 },
            ...(mobile ? [{ width: 390, height: 844 }] : []),
          ],
          narrate,
        });
        notify(
          adapter.mode === "demo"
            ? "Demo website analysis started. This is a local simulation."
            : "Website analysis started. You can leave this page while it runs.",
        );
      } else {
        controller.current = new AbortController();
        const uploaded = await adapter.upload(project.id, media!, {
          signal: controller.current.signal,
          onProgress: setProgress,
          ...(source === "screen" && spoken
            ? { voice: "microphone" as const }
            : source === "upload" && offersVoiceover
              ? {
                  voice:
                    screenshots || voiceover
                      ? ("ai" as const)
                      : ("original" as const),
                }
              : {}),
        });
        if (source === "screen") await clearRecording().catch(() => {});
        const voice = (uploaded as { voice?: string }).voice;
        notify(
          adapter.mode === "demo"
            ? "Recording saved in this browser demo."
            : voice === "microphone"
              ? "Recording saved with your voice."
              : voice === "queued"
              ? "Upload finished. Vistralo is writing the narration and adding the AI voice. This takes a few minutes."
              : voice === "offline"
                ? "Recording saved. The capture worker is offline, so the voice was not started."
              : "Recording uploaded. The worker checks its checksum before processing it.",
        );
      }
      let refreshed = project;
      try {
        refreshed = (await adapter.project(project.id)).project;
      } catch {
        /* The successful job still exists when a subsequent refresh fails. */
      }
      onCreated(refreshed);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setProgress(null);
        setBuilding(null);
      }
    }
  }

  return { controller, created, busy, progress, building, save };
}
