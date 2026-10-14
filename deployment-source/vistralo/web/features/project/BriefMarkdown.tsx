import React from "react";

/**
 * A brief's Markdown drawn as React nodes. Nothing is ever inserted as HTML and links are shown
 * as text, so a brief cannot run a script or send the reader anywhere.
 */
export type BriefBlock =
  | { kind: "heading"; level: 1 | 2 | 3; text: string; id: string }
  | { kind: "paragraph"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; text: string }
  | { kind: "code"; text: string };

export function parseBrief(markdown: string): BriefBlock[] {
  const blocks: BriefBlock[] = [];
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const used = new Map<string, number>();
  const slug = (text: string) => {
    const base = "brief-" + (text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "section");
    const n = (used.get(base) || 0) + 1;
    used.set(base, n);
    return n === 1 ? base : `${base}-${n}`;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^```/.test(line)) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !/^```/.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ kind: "code", text: code.join("\n") });
      continue;
    }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      const text = heading[2].replace(/\s+#+\s*$/, "").trim();
      const level = Math.min(heading[1].length, 3) as 1 | 2 | 3;
      blocks.push({ kind: "heading", level, text, id: slug(text) });
      i++;
      continue;
    }
    const bullet = /^\s*[-*+]\s+/, numbered = /^\s*\d+[.)]\s+/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line), pattern = ordered ? numbered : bullet;
      const items: string[] = [];
      while (i < lines.length && pattern.test(lines[i])) items.push(lines[i++].replace(pattern, ""));
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: quote.join(" ") });
      continue;
    }
    if (!line.trim()) {
      i++;
      continue;
    }
    const paragraph: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,6}\s|```|>\s?|\s*[-*+]\s+|\s*\d+[.)]\s+)/.test(lines[i])
    )
      paragraph.push(lines[i++].trim());
    blocks.push({ kind: "paragraph", text: paragraph.join(" ") });
  }
  return blocks;
}

/** `code`, **strong** and [label](address), the last shown as "label (address)" without a link. */
function inline(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const pattern = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0, match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const key = parts.length;
    if (match[1] !== undefined) parts.push(<code key={key}>{match[1]}</code>);
    else if (match[2] !== undefined) parts.push(<strong key={key}>{match[2]}</strong>);
    else parts.push(`${match[3]} (${match[4]})`);
    last = pattern.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export function BriefDocument({ blocks }: { blocks: BriefBlock[] }) {
  return (
    <article className="brief-doc">
      {blocks.map((block, index) => {
        switch (block.kind) {
          case "heading": {
            const Tag = block.level === 3 ? "h4" : "h3";
            return (
              <Tag key={index} id={block.id} tabIndex={-1} className={block.level === 1 ? "brief-doc-title" : undefined}>
                {inline(block.text)}
              </Tag>
            );
          }
          case "list": {
            const Tag = block.ordered ? "ol" : "ul";
            return (
              <Tag key={index}>
                {block.items.map((item, n) => (
                  <li key={n}>{inline(item)}</li>
                ))}
              </Tag>
            );
          }
          case "quote":
            return <blockquote key={index}>{inline(block.text)}</blockquote>;
          case "code":
            return (
              <pre key={index}>
                <code>{block.text}</code>
              </pre>
            );
          default:
            return <p key={index}>{inline(block.text)}</p>;
        }
      })}
    </article>
  );
}

/** The brief's sections, for jumping to one. Buttons, not links: the app's address is its route. */
export function BriefContents({ blocks }: { blocks: BriefBlock[] }) {
  const sections = blocks.filter(
    (block): block is Extract<BriefBlock, { kind: "heading" }> => block.kind === "heading" && block.level === 2,
  );
  if (sections.length < 3) return null;
  return (
    <nav className="brief-contents" aria-label="Sections of this brief">
      <p className="edge">In this brief</p>
      <ol>
        {sections.map((section) => (
          <li key={section.id}>
            <button
              type="button"
              onClick={() => {
                const target = document.getElementById(section.id);
                target?.scrollIntoView({ block: "start" });
                target?.focus({ preventScroll: true });
              }}
            >
              {section.text.replace(/[`*]/g, "")}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
