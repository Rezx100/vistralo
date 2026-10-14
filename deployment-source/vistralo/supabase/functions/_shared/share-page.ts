// What a share link shows. The vistralo-share function works it out from the stored project and
// returns it as JSON; the app's /watch page draws it. Pure functions with no Deno or network use,
// so the Node tests and the browser can both run them.
//
// The page is drawn by the app because Supabase's gateway serves any HTML a function returns on
// *.supabase.co as plain text under a sandbox policy, so a page built here cannot render.

export const escapeHtml = (value: unknown) =>
  String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Bold, code and links to http(s) addresses inside a line that is already escaped. */
function inline(escaped: string) {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_all, label, href) =>
      `<a href="${href}" rel="noopener noreferrer nofollow">${label}</a>`);
}

/**
 * A Visual brief is Markdown the owner can edit, so it is untrusted. Everything is escaped
 * first; then a small set of block and inline marks is turned back into tags. Anything else,
 * raw HTML included, stays visible as text.
 */
export function briefToHtml(markdown: string): string {
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let paragraph: string[] = [];
  let code: string[] | null = null;
  const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
  const closeParagraph = () => { if (paragraph.length) { out.push(`<p>${inline(paragraph.join(" "))}</p>`); paragraph = []; } };
  for (const raw of markdown.replace(/\r\n?/g, "\n").split("\n")) {
    if (code) {
      if (/^```/.test(raw)) { out.push(`<pre>${code.join("\n")}</pre>`); code = null; }
      else code.push(escapeHtml(raw));
      continue;
    }
    const line = escapeHtml(raw.trimEnd());
    if (/^```/.test(raw)) { closeParagraph(); closeList(); code = []; continue; }
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (heading) {
      closeParagraph(); closeList();
      // The page's own title is the h1, so a brief's headings start one level down.
      const level = Math.min(heading[1].length + 1, 4);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
    } else if (bullet || numbered) {
      closeParagraph();
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) { closeList(); out.push(`<${kind}>`); list = kind; }
      out.push(`<li>${inline((bullet || numbered)![1])}</li>`);
    } else if (!line.trim()) { closeParagraph(); closeList(); }
    else { closeList(); paragraph.push(line.trim()); }
  }
  if (code) out.push(`<pre>${code.join("\n")}</pre>`);
  closeParagraph(); closeList();
  return out.join("\n");
}

/** A share token: 32 random bytes as hex. Only its SHA-256 hash is stored. */
export const SHARE_TOKEN = /^[a-f0-9]{64}$/;

/** The app's page for a share link. The token rides in the fragment, which browsers never send to a server. */
export const watchUrl = (origin: string, token: string) => `${origin.replace(/\/+$/, "")}/watch#${token}`;

/** What the function returns to the /watch page. */
export interface SharedProject {
  name: string;
  type: "walkthrough" | "brief";
  /** A signed address for the film or, until it exists, the recording. */
  mediaUrl?: string;
  /** The film is narrated by an AI voice. Said on the page, so a viewer is not left to guess. */
  narrated?: boolean;
  /** The recording is showing because the narrated film is still being made. */
  working?: boolean;
  brief?: string;
  expiresAt?: string;
}

/** Headers for the JSON answer. Anyone with the token may read it, from any page, so any origin may ask. */
export const shareJsonHeaders: Record<string, string> = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "X-Robots-Tag": "noindex, nofollow",
};

/**
 * What a share link may show, worked out from the stored project. Returns null when there is
 * nothing: no film, no recording and no brief. `file` must sit in the owner's own folder for
 * this project, so a tampered document cannot point the page at someone else's media.
 */
export function shareContent(document: any, ownerId: string, projectId: string) {
  if (!document || document.trashed) return null;
  const data = document.data || {};
  const output = typeof data.output?.file === "string" ? data.output.file : "";
  const candidate = output || (typeof document.video === "string" ? document.video : "");
  const file = candidate.startsWith(`${ownerId}/${projectId}/`) && !candidate.includes("..") && data.files?.[candidate] ? candidate : "";
  const brief = typeof data.brief === "string" ? data.brief : "";
  if (!file && !brief) return null;
  return {
    name: String(document.name || "Shared project"),
    type: document.type === "brief" ? ("brief" as const) : ("walkthrough" as const),
    file,
    narrated: !!file && file === output && !!data.narratedVideo,
    working: !!file && !output && (document.status === "queued" || document.status === "processing"),
    brief,
  };
}

/** The JSON body for a link that works. The brief is capped at a megabyte. */
export function shareJson(content: NonNullable<ReturnType<typeof shareContent>>, mediaUrl: string | undefined, expiresAt: string): SharedProject {
  return {
    name: content.name,
    type: content.type,
    ...(mediaUrl ? { mediaUrl, narrated: content.narrated, working: content.working } : {}),
    ...(content.brief ? { brief: content.brief.slice(0, 1024 * 1024) } : {}),
    expiresAt,
  };
}
