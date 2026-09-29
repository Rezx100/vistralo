import React, { useEffect, useRef, useState } from "react";
import type { Project } from "../contracts";
import { Icon } from "./Icon";
import { Menu, ToolButton, type MenuAction } from "./Primitives";
import {
  durationText,
  durationLabel,
  relativeTime,
  absoluteTime,
  projectTitle,
  sourceText,
  typeText,
  statusText,
  statusIcon,
  statusHint,
  accessText,
  accessIcon,
} from "../utils";

type ThumbnailVariant = { src: string; width: number; type: string };
const thumbnailSizes =
  "(min-width: 1600px) calc((100vw - 400px) / 4), (min-width: 1280px) calc((100vw - 344px) / 3), (min-width: 1024px) calc((100vw - 320px) / 2), (min-width: 768px) calc((100vw - 144px) / 2), calc(100vw - 32px)";

function thumbnailVariants(project: Project): ThumbnailVariant[] {
  if (Array.isArray(project.data.thumbnailVariants)) {
    return project.data.thumbnailVariants.filter(
      (variant: any) =>
        typeof variant?.src === "string" &&
        Number.isFinite(variant.width) &&
        variant.width > 0 &&
        ["image/avif", "image/webp", "image/svg+xml"].includes(variant.type),
    );
  }
  if (project.thumbnail === "/assets/walkthrough-poster.webp") {
    return [480, 820, 1240].flatMap((width) =>
      ["avif", "webp"].map((format) => ({
        src: `/assets/walkthrough-poster-${width}.${format}`,
        width,
        type: `image/${format}`,
      })),
    );
  }
  return [];
}

function webDestination(value?: string): string | undefined {
  if (!value) return;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.href : undefined;
  } catch {
    return;
  }
}

function faviconSource(project: Project): string | undefined {
  if (project.source !== "web" || !project.url) return;
  // Use a favicon supplied by captured project evidence. Do not contact guessed
  // domains, public favicon aggregators, or fictional sample source labels.
  const value = project.data.faviconUrl || project.data.favicon;
  if (typeof value !== "string") return;
  if (value.startsWith("/") && !value.startsWith("//")) return value;
  return webDestination(value);
}

function SourceIcon({ project }: { project: Project }) {
  const source = faviconSource(project);
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return source && !failed ? (
    <img
      className="source-favicon"
      src={source}
      width={16}
      height={16}
      alt=""
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <Icon
      name={
        project.source === "web"
          ? "globe"
          : project.source === "screen"
            ? "video"
            : "upload"
      }
      size={16}
    />
  );
}

export function StatusBadge({ project: p }: { project: Project }) {
  return (
    <span
      className={`status-badge status-${p.status}`}
      aria-description={statusHint(p)}
      title={statusHint(p)}
    >
      <Icon name={statusIcon(p)} size={14} />
      {statusText(p)}
    </span>
  );
}

function BriefPreview({ project: p }: { project: Project }) {
  const brief = typeof p.data.brief === "string" ? p.data.brief : "";
  const headings = [...brief.matchAll(/^#{1,3}\s+(.+)$/gm)].map(
    (match) => match[1],
  );
  const body = brief
    .replace(/^#{1,6}.*$/gm, "")
    .replace(/[*_`]/g, "")
    .trim()
    .slice(0, 180);
  return (
    <div className="brief-preview" aria-hidden="true">
      <div className="brief-kicker">
        <Icon name="document" size={16} />
        Visual brief
      </div>
      <strong>{headings[0] || p.name}</strong>
      <div className="brief-rule" />
      {brief ? (
        <>
          <b>{headings[1] || "Overview"}</b>
          <p>{body}</p>
          {headings[2] && <b>{headings[2]}</b>}
          <div className="brief-reference-grid">
            <span />
            <span />
            <span />
          </div>
        </>
      ) : (
        <p>
          {p.status === "failed"
            ? "Analysis could not be completed."
            : p.status === "ready"
              ? "Open this project to read the visual brief."
              : "Your brief will appear here when it is ready."}
        </p>
      )}
    </div>
  );
}

export function Thumbnail({ project: p }: { project: Project }) {
  const [decoded, setDecoded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setDecoded(false);
    setFailed(false);
  }, [p.thumbnail]);
  const processing = p.status === "processing" || p.status === "queued";
  const variants = thumbnailVariants(p);
  const duration =
    Number.isFinite(p.duration) && (p.duration || 0) > 0
      ? Math.floor(p.duration!)
      : 0;
  const hasImage =
    !!p.thumbnail && !failed && !processing && p.status !== "uploading";
  return (
    <div className={`thumbnail thumbnail-${p.type}`}>
      <span className="thumbnail-brackets" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      {processing ? (
        <div className="document-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : p.status === "failed" ? (
        <div className="thumbnail-failed">
          <Icon name="warning" size={32} />
          <span>Preview unavailable</span>
        </div>
      ) : hasImage ? (
        <picture>
          {["image/avif", "image/webp"].map((type) => {
            const set = variants
              .filter((variant) => variant.type === type)
              .sort((a, b) => a.width - b.width);
            return set.length ? (
              <source
                key={type}
                type={type}
                srcSet={set
                  .map((variant) => `${variant.src} ${variant.width}w`)
                  .join(", ")}
                sizes={thumbnailSizes}
              />
            ) : null;
          })}
          <img
            src={p.thumbnail}
            alt=""
            loading="lazy"
            decoding="async"
            sizes={thumbnailSizes}
            onLoad={async (event) => {
              const img = event.currentTarget;
              try {
                await img.decode();
              } catch {
                /* Loaded fallback formats can still display. */
              }
              if (img.isConnected) setDecoded(true);
            }}
            onError={() => setFailed(true)}
            className={decoded ? "decoded" : ""}
          />
        </picture>
      ) : p.type === "brief" ? (
        <BriefPreview project={p} />
      ) : (
        <div className="poster-fallback" aria-hidden="true">
          <Icon name={p.source === "screen" ? "video" : "upload"} size={32} />
          {(p.status === "uploading" || failed || (!p.video && !p.duration)) && (
            <span>
              {p.status === "uploading"
                ? "Transferring your recording"
                : failed
                  ? "Preview unavailable"
                  : "No recording yet"}
            </span>
          )}
        </div>
      )}
      {p.type === "walkthrough" &&
        duration > 0 &&
        !processing &&
        p.status !== "uploading" && p.status !== "failed" && (
          <time
            className="duration"
            dateTime={`PT${duration}S`}
            aria-label={durationLabel(duration)}
          >
            {durationText(duration)}
          </time>
        )}
      {p.type === "brief" && p.status === "ready" && (
        <span className="reference-count">{p.references || 0} refs</span>
      )}
      {p.type === "walkthrough" && p.status === "ready" && (
        <span className="play-overlay" aria-hidden="true">
          <Icon name="play" />
        </span>
      )}
      {p.status === "uploading" && (
        <progress
          max="100"
          value={Math.max(0, Math.min(100, p.progress || 0))}
          aria-label={`Upload progress for ${p.name}`}
        />
      )}
      {processing && (
        <progress
          aria-label={`${p.status === "queued" ? "Queued" : p.type === "brief" ? "Analyzing site" : "Processing video"}: ${p.name}`}
        />
      )}
    </div>
  );
}

type ProjectCardProps = {
  project: Project;
  selected: boolean;
  anySelected: boolean;
  onSelect: (event: any) => void;
  onOpen: () => void;
  actions: MenuAction[];
  onShare: () => void;
  locale: string;
  index: number;
  focused: boolean;
  onFocus: () => void;
  onKeyDown: (event: React.KeyboardEvent) => void;
  href: string;
};

export function ProjectCard({
  project: p,
  selected,
  anySelected,
  onSelect,
  onOpen,
  actions,
  onShare,
  locale,
  index,
  focused,
  onFocus,
  onKeyDown,
  href,
}: ProjectCardProps) {
  const [menu, setMenu] = useState(false);
  const [titleTruncated, setTitleTruncated] = useState(false);
  const title = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const node = title.current;
    if (!node) return;
    const measure = () =>
      setTitleTruncated(
        node.scrollHeight > node.clientHeight ||
          node.scrollWidth > node.clientWidth,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [p.name]);
  const name = projectTitle(p, locale);
  const destination = webDestination(p.url);
  const retry = actions.find((action) => action.label === "Retry");
  return (
    <article
      className={`project-card ${selected ? "is-selected" : ""} ${anySelected ? "selection-active" : ""}`}
      data-card-index={index}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu(true);
      }}
      onKeyDown={onKeyDown}
    >
      <Thumbnail project={p} />
      <label className="card-selection tooltip-host">
        <input
          type="checkbox"
          aria-label={`Select ${p.name}`}
          checked={selected}
          onChange={(event) => onSelect(event.nativeEvent)}
        />
        <span className="tooltip" role="tooltip">
          Select project
        </span>
      </label>
      {destination && (
        <a
          className="source-link icon-button tooltip-host"
          href={destination}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Open ${sourceText(p)} in a new tab`}
        >
          <Icon name="external" size={16} />
          <span className="tooltip" role="tooltip">
            Open {sourceText(p)} in a new tab
          </span>
        </a>
      )}
      <div className="card-body">
        <div className="card-title-row">
          <h2>
            <a
              href={href}
              className="card-title tooltip-host"
              aria-label={name}
              tabIndex={focused ? 0 : -1}
              onFocus={onFocus}
              onClick={(event) => {
                event.preventDefault();
                if (event.ctrlKey || event.metaKey || event.shiftKey)
                  onSelect(event);
                else onOpen();
              }}
            >
              <span ref={title}>{name}</span>
              {titleTruncated && (
                <span className="tooltip" role="tooltip">
                  {name}
                </span>
              )}
            </a>
          </h2>
          <div className="menu-anchor card-menu">
            <ToolButton
              icon="more"
              label={`More actions for ${p.name}`}
              aria-haspopup="menu"
              aria-expanded={menu}
              onClick={() => setMenu(!menu)}
            />
            {menu && <Menu items={actions} onClose={() => setMenu(false)} />}
          </div>
        </div>
        <div className="card-meta">
          {p.status !== "ready" && <StatusBadge project={p} />}
          <span className="source-name tooltip-host" tabIndex={0}>
            <SourceIcon project={p} />
            <span className="tooltip" role="tooltip">
              {typeText(p)} · {sourceText(p)}
            </span>
          </span>
          <time
            className="event-time tooltip-host"
            tabIndex={0}
            dateTime={p.eventAt}
          >
            {relativeTime(p.eventAt, locale)}
            <span className="tooltip" role="tooltip">
              {p.eventLabel} {absoluteTime(p.eventAt, locale)}
            </span>
          </time>
          {p.access !== "private" && (
            <span
              className="access tooltip-host"
              role="img"
              tabIndex={0}
              aria-label={accessText(p)}
            >
              <Icon name={accessIcon(p)} size={16} />
              <span className="tooltip" role="tooltip">
                {accessText(p)}
              </span>
            </span>
          )}
          {p.collaborators?.length ? (
            <span
              className="facepile"
              role="group"
              aria-label={`Shared with ${p.collaborators.map((person) => person.name).join(", ")}`}
            >
              {p.collaborators.slice(0, 3).map((person) => (
                <span title={person.name} key={person.name}>
                  {person.initials}
                </span>
              ))}
              {p.collaborators.length > 3 && (
                <span>+{p.collaborators.length - 3}</span>
              )}
            </span>
          ) : null}
          {p.status === "failed" ? (
            <button
              className="button button-ghost card-share card-retry"
              onClick={() => retry?.onClick()}
              disabled={!retry || retry.disabled}
            >
              Retry
            </button>
          ) : (
            <button
              className="button button-ghost card-share"
              onClick={onShare}
            >
              Share
            </button>
          )}
        </div>
        {p.error && (
          <p className="card-detail error-reason" title={p.error}>
            {p.error}
          </p>
        )}
      </div>
    </article>
  );
}
