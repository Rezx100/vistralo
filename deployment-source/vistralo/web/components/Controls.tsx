import React, { useId } from "react";
import { Icon } from "./Icon";

export type ButtonVariant = "secondary" | "primary" | "ghost" | "danger" | "record";

const VARIANT_CLASS: Record<ButtonVariant, string> = {
  secondary: "",
  primary: "button-primary",
  ghost: "button-ghost",
  danger: "button-danger-solid",
  record: "button-record",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** One primary per view. Record is the only red, pill-shaped button. */
  variant?: ButtonVariant;
  /** Large is for a page's single primary action. */
  size?: "medium" | "large";
  icon?: string;
  /** Disables the button and, when given, swaps the label for what is happening. */
  busy?: boolean;
  busyLabel?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "secondary", size = "medium", icon, busy, busyLabel, className, children, disabled, type = "button", ...rest },
  ref,
) {
  const classes = ["button", VARIANT_CLASS[variant], size === "large" ? "button-large" : "", className || ""];
  return (
    <button
      ref={ref}
      type={type}
      className={classes.filter(Boolean).join(" ")}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {busy && busyLabel ? busyLabel : children}
    </button>
  );
});

type Control = React.ReactElement<{
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}>;

/**
 * A label, one control, and either help text or an error beneath it. The error replaces the
 * help text and carries an icon, so colour is never the only sign that something is wrong.
 */
export function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  error?: React.ReactNode;
  className?: string;
  children: Control;
}) {
  const generated = useId();
  const id = children.props.id || generated;
  const noteId = `${id}-note`;
  const note = error || hint;
  const described = [children.props["aria-describedby"], note ? noteId : ""].filter(Boolean).join(" ");
  return (
    <div className={`field ${error ? "is-invalid" : ""} ${className}`.trim()}>
      <label htmlFor={id}>{label}</label>
      {React.cloneElement(children, {
        id,
        "aria-describedby": described || undefined,
        "aria-invalid": error ? true : undefined,
      })}
      {error ? (
        <span id={noteId} className="field-error" role="alert">
          <Icon name="warning" />
          {error}
        </span>
      ) : (
        hint && (
          <span id={noteId} className="field-hint">
            {hint}
          </span>
        )
      )}
    </div>
  );
}

/** A switch. Give it a visible label through a wrapping <label>, or `aria-label` when there is none. */
export function Toggle({
  checked,
  onChange,
  ...rest
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "role" | "onChange" | "checked"> & {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="switch"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      {...rest}
    />
  );
}

/**
 * One sentence about what just happened, with at most one action. The words are also
 * announced by the app's live region, so the visible toast is not a second announcement.
 */
export function Toast({
  tone = "success",
  message,
  action,
  onDismiss,
  inert,
}: {
  tone?: "success" | "error";
  message: string;
  action?: { label: string; onClick: () => void };
  onDismiss: () => void;
  inert?: boolean;
}) {
  return (
    <div className={`toast is-${tone}`} inert={inert}>
      <span className="toast-icon" aria-hidden="true">
        <Icon name={tone === "error" ? "warning" : "checkCircle"} />
      </span>
      <span className="toast-message">{message}</span>
      {action && (
        <button type="button" className="button button-ghost" onClick={action.onClick}>
          {action.label}
        </button>
      )}
      <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={onDismiss}>
        <Icon name="close" />
      </button>
    </div>
  );
}
