import React, { type Dispatch, type SetStateAction } from "react";
import type { WorkspaceAdapter } from "../contracts";
import { Button } from "../components/Controls";
import { Icon } from "../components/Icon";
import { Dialog } from "../components/Primitives";
import type { Run } from "./projectActions";
import { docsUrl } from "./routing";
import { ShortcutList } from "./Shortcuts";

/**
 * The few things that are still dialogs: a reference card (shortcuts), two short notes
 * (support, what's new) and one decision that blocks (resetting the demo). Settings and
 * the profile are pages.
 */
export function AppModal({
  modal,
  setModal,
  adapter,
  run,
}: {
  modal: string;
  setModal: Dispatch<SetStateAction<string>>;
  adapter: WorkspaceAdapter;
  run: Run;
}) {
  const close = () => setModal("");
  if (modal === "shortcuts")
    return (
      <Dialog
        title="Keyboard shortcuts"
        icon="keyboard"
        onClose={close}
        footer={
          <Button variant="primary" data-autofocus onClick={close}>
            Done
          </Button>
        }
      >
        <ShortcutList />
      </Dialog>
    );
  if (modal === "support")
    return (
      <Dialog
        title="Contact support"
        icon="mail"
        size="compact"
        description="Contact Dynamix LTD for Vistralo support."
        onClose={close}
        footer={
          <a
            href="mailto:contact@vistralo.com"
            className="button button-primary"
            data-autofocus
          >
            <Icon name="mail" />
            contact@vistralo.com
          </a>
        }
      >
        <p className="caption">
          Include the action that failed and the error message. Keep access
          tokens and private recordings out of your message.
        </p>
      </Dialog>
    );
  if (modal === "reset")
    return (
      <Dialog
        title="Reset demo workspace?"
        icon="restore"
        tone="danger"
        size="compact"
        className="sheet-alert"
        closable={false}
        description="This removes this browser’s demo changes and restores the eight fictional projects."
        onClose={close}
        footer={
          <>
            <Button data-autofocus onClick={close}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() =>
                run(async () => {
                  await adapter.rpc("resetDemo");
                  close();
                }, "Demo reset")
              }
            >
              Reset demo
            </Button>
          </>
        }
      />
    );
  return (
    <Dialog
      title="What’s new"
      icon="info"
      description="Record from any page, with a count-in before each take and a way to start over or discard it. A share link is offered as soon as you stop. Projects open with the player first and each screen’s line beneath it, and the library reads large workspaces a page at a time."
      onClose={close}
      footer={
        <a
          className="button button-primary"
          href={docsUrl}
          target="_blank"
          rel="noreferrer"
          data-autofocus
        >
          How Vistralo works <Icon name="external" />
        </a>
      }
    />
  );
}
