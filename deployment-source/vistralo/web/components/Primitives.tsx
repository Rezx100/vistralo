import React, { useEffect, useRef, useState, useId } from "react";
import { createRoot } from "react-dom/client";
import { Icon } from "./Icon";
export function CounterBadge({ count }: { count: number }) {
  return <span className="counter">{count}</span>;
}

export function ToolButton({
  label,
  icon,
  onClick,
  pressed,
  disabled,
  className = "",
  children,
  ...rest
}: any) {
  return (
    <button
      type="button"
      className={`icon-button tooltip-host ${className}`}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      {...rest}
    >
      <Icon name={icon} />
      {children}
      <span className="tooltip" role="tooltip">
        {label}
      </span>
    </button>
  );
}
export type SheetSize = "compact" | "default" | "wide";
export function SheetHeader({
  titleId,
  descriptionId,
  title,
  description,
  icon,
  tone,
  closeLabel = "Close dialog",
  onClose,
}: {
  titleId: string;
  descriptionId?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: string;
  tone?: "danger";
  closeLabel?: string;
  onClose?: () => void;
}) {
  return (
    <header className="sheet-header">
      {icon && (
        <span className={`sheet-icon ${tone ? `is-${tone}` : ""}`} aria-hidden="true">
          <Icon name={icon} />
        </span>
      )}
      <div className="sheet-titles">
        <h2 id={titleId}>{title}</h2>
        {description && <p id={descriptionId}>{description}</p>}
      </div>
      {onClose && (
        <button
          type="button"
          className="sheet-close"
          aria-label={closeLabel}
          onClick={onClose}
        >
          <Icon name="close" />
        </button>
      )}
    </header>
  );
}
export function Dialog({
  title,
  description,
  icon,
  tone,
  size = "default",
  footer,
  closable = true,
  onClose,
  children,
  className = "",
}: {
  title: string;
  description?: React.ReactNode;
  icon?: string;
  tone?: "danger";
  size?: SheetSize;
  footer?: React.ReactNode;
  closable?: boolean;
  onClose: () => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    id = useId(),
    descriptionId = `${id}-description`;
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.showModal();
    ref.current
      ?.querySelector<HTMLElement>(
        "[data-autofocus],input:not([type=checkbox]),textarea,select",
      )
      ?.focus();
    return () => {
      if (before?.isConnected) before.focus?.();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog sheet sheet-${size} ${className}`}
      aria-labelledby={id}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <SheetHeader
        titleId={id}
        descriptionId={descriptionId}
        title={title}
        description={description}
        icon={icon}
        tone={tone}
        onClose={closable ? onClose : undefined}
      />
      {children && <div className="sheet-body">{children}</div>}
      {footer && <footer className="sheet-footer">{footer}</footer>}
    </dialog>
  );
}
export function SheetToggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`sheet-row sheet-toggle ${disabled ? "is-disabled" : ""}`}>
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}
export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  icon?: string;
  tone?: "danger";
}
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  icon = "warning",
  tone,
  onDone,
}: ConfirmOptions & { onDone: (confirmed: boolean) => void }) {
  return (
    <Dialog
      title={title}
      description={message}
      icon={icon}
      tone={tone}
      size="compact"
      className="sheet-alert"
      closable={false}
      onClose={() => onDone(false)}
      footer={
        <>
          <button
            type="button"
            className="button"
            onClick={() => onDone(false)}
            {...(tone ? { "data-autofocus": true } : {})}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`button ${tone === "danger" ? "button-danger-solid" : "button-primary"}`}
            onClick={() => onDone(true)}
            {...(tone ? {} : { "data-autofocus": true })}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    const done = (confirmed: boolean) => {
      queueMicrotask(() => {
        root.unmount();
        host.remove();
      });
      resolve(confirmed);
    };
    root.render(<ConfirmDialog {...options} onDone={done} />);
  });
}
export interface MenuAction {
  label: string;
  icon?: string;
  description?: string;
  key?: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  separator?: boolean;
  checked?: boolean;
  role?: "menuitem" | "menuitemradio" | "menuitemcheckbox";
}
export function Menu({
  items,
  onClose,
  align = "end",
}: {
  items: MenuAction[];
  onClose: () => void;
  align?: "start" | "end";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current
      ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
      ?.focus();
    const listener = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const timer = setTimeout(
      () => document.addEventListener("pointerdown", listener),
      0,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("pointerdown", listener);
      if (before?.isConnected) before.focus();
    };
  }, []);
  return (
    <div
      className={`menu menu-${align}`}
      ref={ref}
      role="menu"
      onKeyDown={(e) => {
        const buttons = Array.from(
          ref.current?.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ) || [],
        );
        let index = buttons.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          index =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? buttons.length - 1
                : (index + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) %
                  buttons.length;
          buttons[index]?.focus();
        }
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        const item = items.find(
          (i) => i.key?.toLowerCase() === e.key.toLowerCase(),
        );
        if (item && !item.disabled) {
          e.preventDefault();
          onClose();
          item.onClick();
        }
      }}
    >
      {items.map((item, i) => (
        <React.Fragment key={`${item.label}-${i}`}>
          {item.separator && (
            <div className="menu-separator" role="separator" />
          )}
          <button
            type="button"
            role={item.role || "menuitem"}
            aria-checked={
              item.role && item.role !== "menuitem" ? !!item.checked : undefined
            }
            disabled={item.disabled}
            className={`menu-item ${item.danger ? "danger-text" : ""}`}
            onClick={() => {
              onClose();
              item.onClick();
            }}
          >
            <Icon name={item.icon || (item.checked ? "check" : "blank")} />
            <span>
              <span>{item.label}</span>
              {item.description && <small>{item.description}</small>}
            </span>
            {item.key && <kbd>{item.key}</kbd>}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
export function TextDialog({
  title,
  label,
  initial = "",
  onClose,
  onSubmit,
  submitLabel = "Save",
  description,
  icon = "edit",
}: {
  title: string;
  icon?: string;
  label: string;
  initial?: string;
  onClose: () => void;
  onSubmit: (value: string) => Promise<void>;
  submitLabel?: string;
  description?: string;
}) {
  const [value, setValue] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    formId = useId();
  return (
    <Dialog
      title={title}
      description={description}
      icon={icon}
      size="compact"
      onClose={() => !busy && onClose()}
      footer={
        <>
          <button
            type="button"
            className="button"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            form={formId}
            className="button button-primary"
            disabled={busy || !value.trim()}
          >
            {busy ? "Saving…" : submitLabel}
          </button>
        </>
      }
    >
      <form
        id={formId}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit(value.trim());
            onClose();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          {label}
          <input
            autoFocus
            required
            maxLength={120}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
        {error && (
          <p className="error-message" role="alert">
            {error}
          </p>
        )}
      </form>
    </Dialog>
  );
}

export function NavigationProgress({ pending }: { pending: boolean }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!pending) { setVisible(false); return; }
    const timer = window.setTimeout(() => setVisible(true), 100);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return <div className={`navigation-progress ${visible ? "is-pending" : ""}`} aria-hidden="true"><span /></div>;
}
