// The public page a share link opens. Pure functions with no Deno or network use, so the Node
// tests can run them. The page has no script: its policy allows one hashed stylesheet, the
// video from Supabase storage, and nothing else.

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

// Colours mirror web/styles/tokens.css: paper, ink, the frame's black edge and the accent.
export const SHARE_STYLE = `
:root{color-scheme:light dark;--paper:#f4f5f7;--surface:#fff;--ink:#12141a;--ink2:#454a57;--ink3:#5c6270;--line:#e1e3e8;--accent:#4b52cf;--rebate:#0c0d10}
@media (prefers-color-scheme:dark){:root{--paper:#0b0d12;--surface:#171a22;--ink:#f4f5f8;--ink2:#b9bdc8;--ink3:#9ea3b2;--line:#2a2d38;--accent:#a8adfd}}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent)}
a:focus-visible,video:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.bar{display:flex;align-items:center;justify-content:space-between;gap:16px;max-width:1008px;margin:0 auto;padding:16px 24px}
.brand{display:inline-flex;align-items:center;gap:8px;color:var(--ink);font-weight:600;font-size:18px;text-decoration:none}
.brand svg{width:22px;height:22px;fill:currentColor}
.edge{font-size:12px;line-height:16px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3);font-variant-numeric:tabular-nums}
main{max-width:1008px;margin:0 auto;padding:24px 24px 64px}
h1{margin:0 0 8px;font-size:clamp(28px,5vw,40px);line-height:1.15;letter-spacing:-.01em;text-wrap:balance;overflow-wrap:anywhere}
.frame{margin:24px 0 12px;padding:2px;border-radius:4px;background:var(--rebate)}
video{display:block;width:100%;max-height:78vh;border-radius:2px;background:var(--rebate)}
.note{margin:0 0 8px;color:var(--ink2);font-size:14px;line-height:20px}
.get{margin:16px 0 0;font-size:14px}
.brief{margin-top:40px;padding-top:24px;border-top:1px solid var(--line);max-width:72ch;overflow-wrap:anywhere}
.brief h2{margin:32px 0 8px;font-size:22px;line-height:1.3}
.brief h3,.brief h4{margin:24px 0 4px;font-size:17px;line-height:1.4}
.brief p,.brief ul,.brief ol{margin:0 0 16px;color:var(--ink2)}
.brief li{margin-bottom:4px}
.brief code,.brief pre{font:14px/1.5 ui-monospace,Consolas,monospace;background:var(--surface);border:1px solid var(--line);border-radius:4px}
.brief code{padding:1px 4px}
.brief pre{padding:12px;overflow:auto;white-space:pre-wrap}
footer{max-width:1008px;margin:0 auto;padding:24px;border-top:1px solid var(--line);color:var(--ink3);font-size:14px;line-height:20px}
footer p{margin:0 0 4px}
.gone{max-width:56ch;margin:15vh auto 0;padding:0 24px}
.gone p{color:var(--ink2)}
`.trim();

const EMBLEM = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 4H24L20 8H8V20L4 24Z M28 8V28H8L12 24H24V12Z"/></svg>';

/** The value for style-src: the stylesheet's own hash, so no 'unsafe-inline' is needed. */
export async function styleHash(style = SHARE_STYLE): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(style)));
  let binary = "";
  for (const byte of digest) binary += String.fromCharCode(byte);
  return `'sha256-${btoa(binary)}'`;
}

export function shareHeaders(hash: string): Record<string, string> {
  return {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Content-Security-Policy": `default-src 'none'; style-src ${hash}; media-src https://*.supabase.co; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  };
}

const shell = (title: string, body: string) =>
  `<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta name="color-scheme" content="light dark"><title>${escapeHtml(title)}</title><style>${SHARE_STYLE}</style></head><body>\n<header class="bar"><a class="brand" href="https://vistralo.com/">${EMBLEM}vistralo</a><span class="edge">Shared with you · Read only</span></header>\n${body}\n</body></html>`;

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

const day = (iso?: string) => {
  const at = iso ? new Date(iso) : null;
  return at && Number.isFinite(at.getTime())
    ? at.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "";
};

export function sharePage(project: SharedProject): string {
  const name = project.name || "Shared project";
  const expires = day(project.expiresAt);
  const kind = project.type === "brief" ? "Visual brief" : "Walkthrough";
  const parts = [`<h1>${escapeHtml(name)}</h1>`, `<p class="edge">${kind}${expires ? ` · Link works until ${escapeHtml(expires)}` : ""}</p>`];
  if (project.mediaUrl) {
    const url = escapeHtml(project.mediaUrl);
    parts.push(`<div class="frame"><video controls playsinline preload="metadata" src="${url}" aria-label="${escapeHtml(name)}"></video></div>`);
    if (project.working)
      parts.push('<p class="note">This is the recording as it was made. A narrated version is being prepared and will replace it at this address.</p>');
    else if (project.narrated) parts.push('<p class="note">Narrated by an AI voice.</p>');
    parts.push(`<p class="get"><a href="${url}" download>Download the video</a></p>`);
  }
  if (project.brief) parts.push(`<article class="brief">${briefToHtml(project.brief.slice(0, 1024 * 1024))}</article>`);
  const footer = '<footer><p>Made with <a href="https://vistralo.com/">Vistralo</a>, which turns a screen recording into a narrated walkthrough.</p><p>Something wrong with this page? Write to <a href="mailto:contact@vistralo.com">contact@vistralo.com</a>.</p></footer>';
  return shell(`${name} · Vistralo`, `<main>${parts.join("\n")}</main>\n${footer}`);
}

export const unavailablePage = () =>
  shell("Link unavailable · Vistralo", '<main class="gone"><h1>This link is unavailable</h1><p>It has expired, or the person who made it has switched it off. Ask them for a new one.</p></main>');

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
