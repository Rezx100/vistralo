import React, { type Dispatch, type SetStateAction } from "react";
import type { WorkspaceAdapter } from "../contracts";
import type { Run } from "./projectActions";
export type Profile = { name: string; email: string; workspace: string };
export function ProfileForm({
  profile,
  setProfile,
  adapter,
  run,
  setModal,
}: {
  profile: Profile;
  setProfile: Dispatch<SetStateAction<Profile>>;
  adapter: WorkspaceAdapter;
  run: Run;
  setModal: Dispatch<SetStateAction<string>>;
}) {
  return (
    <form
      id="profile-form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => {
          await adapter.settings({
            name: profile.workspace,
            displayName: profile.name,
            email: profile.email,
          });
          setModal("");
        }, "Profile saved");
      }}
    >
      <label className="field">
        Name
        <input
          required
          value={profile.name}
          onChange={(e) =>
            setProfile({ ...profile, name: e.target.value })
          }
        />
      </label>
      <label className="field">
        Email
        <input
          type="email"
          value={profile.email}
          onChange={(e) =>
            setProfile({ ...profile, email: e.target.value })
          }
        />
      </label>
      <label className="field">
        Workspace name
        <input
          required
          value={profile.workspace}
          onChange={(e) =>
            setProfile({ ...profile, workspace: e.target.value })
          }
        />
      </label>
    </form>
  );
}
