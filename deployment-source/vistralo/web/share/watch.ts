// The page a share link opens: app.vistralo.com/watch#<token>. It is not the React app: a viewer
// has no account and wants the video, so this is one small script. It asks the vistralo-share
// function for the link's content as JSON and draws it. The token stays in the fragment, which
// the browser never sends to Vercel; it goes only to the function that checks it.
import { briefToHtml, SHARE_TOKEN, type SharedProject } from "../../supabase/functions/_shared/share-page";

declare const VISTRALO_SUPABASE_URL: string;

// The theme follows the device, set before the first paint (this script loads in the head).
const dark = window.matchMedia("(prefers-color-scheme: dark)");
const theme = () => document.documentElement.setAttribute("data-theme", dark.matches ? "dark" : "light");
theme();
dark.addEventListener("change", theme);

function element<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { className?: string } = {}, ...children: (Node | string)[]) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const day = (iso?: string) => {
  const at = iso ? new Date(iso) : null;
  return at && Number.isFinite(at.getTime()) ? at.toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "";
};

function show(title: string, ...children: Node[]) {
  document.title = title;
  const main = document.getElementById("watch")!;
  main.setAttribute("aria-busy", "false");
  main.replaceChildren(...children);
}

function message(heading: string, text: string) {
  show(`${heading} · Vistralo`, element("div", { className: "watch-gone" }, element("h1", { textContent: heading }), element("p", { textContent: text })));
}

const unavailable = () =>
  message("This link is unavailable", "It has expired, or the person who made it has switched it off. Ask them for a new one.");

export function draw(project: SharedProject) {
  const name = project.name || "Shared project";
  const kind = project.type === "brief" ? "Visual brief" : "Walkthrough";
  const until = day(project.expiresAt);
  const parts: Node[] = [element("h1", { textContent: name }), element("p", { className: "watch-edge", textContent: until ? `${kind} · Link works until ${until}` : kind })];
  if (project.mediaUrl) {
    const video = element("video", { controls: true, preload: "metadata", src: project.mediaUrl });
    video.setAttribute("playsinline", "");
    video.setAttribute("aria-label", name);
    parts.push(element("div", { className: "watch-frame" }, video));
    if (project.working)
      parts.push(element("p", { className: "watch-note", textContent: "This is the recording as it was made. A narrated version is being prepared and will replace it at this address." }));
    else if (project.narrated) parts.push(element("p", { className: "watch-note", textContent: "Narrated by an AI voice." }));
    const download = element("a", { href: project.mediaUrl, textContent: "Download the video" });
    download.setAttribute("download", "");
    parts.push(element("p", { className: "watch-get" }, download));
  }
  if (project.brief) {
    const article = element("article", { className: "watch-brief" });
    // briefToHtml escapes everything first and adds back only its own tags.
    article.innerHTML = briefToHtml(project.brief);
    parts.push(article);
  }
  show(`${name} · Vistralo`, ...parts);
}

export async function open() {
  const token = location.hash.slice(1);
  if (!SHARE_TOKEN.test(token)) return unavailable();
  document.getElementById("watch")!.setAttribute("aria-busy", "true");
  let response: Response;
  try {
    response = await fetch(`${VISTRALO_SUPABASE_URL}/functions/v1/vistralo-share?${new URLSearchParams({ t: token, format: "json" })}`, {
      cache: "no-store",
      referrerPolicy: "no-referrer",
    });
  } catch {
    return message("This link could not be opened", "Vistralo could not be reached. Check your connection and reload the page.");
  }
  if (response.status === 404) return unavailable();
  const project = response.ok ? await response.json().catch(() => null) : null;
  if (!project || typeof project.name !== "string")
    return message("This link could not be opened", "Something went wrong on our side. Reload the page, or try again in a few minutes.");
  draw(project);
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", open);
else open();
window.addEventListener("hashchange", open);
