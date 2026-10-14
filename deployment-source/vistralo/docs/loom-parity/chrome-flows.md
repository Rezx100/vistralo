# Chrome extension flows

What a person sees and what they get at the end, for each flow as built in this branch. Loom comparisons carry the labels from `sources.md`.

## First run

1. Installing opens **Set up Vistralo** (`welcome.html`): allow the microphone, allow the camera, pin Vistralo, the start/stop shortcut.
2. Each Allow button triggers Chrome's own prompt; the page shows Allowed, Blocked or Not asked yet, and how many devices it found. Blocked explains how to unblock from the address bar.
3. Done: "Click Vistralo in the toolbar to record."

If someone skips this, the popup shows "Chrome needs your permission…" with a link back here whenever the chosen microphone or camera is not allowed.

## Record a tab

1. Click Vistralo on the page to record. The popup shows: **This tab** · Window or screen · Camera only; Microphone; Camera; show my camera in a bubble; record the tab's sound; count down from 3; open in Vistralo when I stop.
2. **Start recording.** The popup closes. A 3-second count-in covers the page ("Esc to cancel"). The toolbar badge shows "…", then "REC".
3. Recording: a bar at the bottom left of the page shows a red dot, the clock, the microphone meter and mute (when recording the microphone), the bubble size (when the bubble is on), pause, start over, discard, **Stop** and hide. The bubble (if on) sits above it and can be dragged. The tab's sound keeps playing. The bar and bubble are part of the recorded pixels; hide the bar to leave it out.
4. Browsing on: links and reloads in the tab do not stop the recording. On another site the bar is drawn again only with "Keep the controls on every site" ticked (Chrome asks once); the popup and shortcuts always work.
5. **Stop** (bar, popup, Alt+Shift+V, or Chrome's "Stop sharing"; closing the tab also stops and keeps the recording).
6. Result: with "Open in Vistralo" on, the app opens on the save sheet with the recording ready, its page address filled in. Otherwise the **recordings page** opens: player, length and size, Save to Vistralo, Download, Discard.

Restricted pages (chrome://, the Chrome Web Store): tab mode is disabled with "Chrome does not let extensions record this page. Open a website, or choose Window or screen."

## Record a window or screen

As above, but Start opens Chrome's **Choose what to share** dialog (tab, window or entire screen, with "share system audio" where Chrome offers it). Cancelling the dialog cancels quietly. The bar and bubble appear on the tab you started from; they are not drawn on other applications (Loom documents the same limit for its bubble, L1).

## Camera only

Start opens the recordings page with the camera on show while recording; the popup, page shortcuts and that page control it.

## Pause, mute, start over, discard

- **Mute** silences the microphone in the recording without stopping it; the meter keeps moving so you can see you are talking while muted. Start over keeps it muted.

- **Pause** freezes the clock; the file has no paused time. Resume continues the same take.
- **Start over** throws the take away and counts in again on the same tab, window or screen (Loom documents restart with a countdown, L6).
- **Discard** (asks to confirm on the page bar and the recordings page) deletes everything, including pieces already stored.

## Errors and interruptions

| What happens | What the person sees | What is kept |
| --- | --- | --- |
| Microphone not allowed | "Vistralo is not allowed to use the microphone…" in the popup | Nothing starts |
| Chooser cancelled | Nothing; the session is cancelled | Nothing |
| Tab closed, shared window gone, Stop sharing | The take finishes as if Stop was pressed | All of it |
| Microphone unplugged | "The microphone was disconnected. The rest of this recording has no voice." | All of it |
| Storage full | "The recording stopped early: … Everything recorded until then is kept." | Up to the last stored second |
| Chrome quits or crashes | Next start: the recordings page lists it as "interrupted" | Up to the last stored second |
| The engine disappears while the popup says recording | The next control marks it failed: "The recording stopped unexpectedly. What was recorded is kept." | Up to the last stored second |
| A second Start | "A recording is already in progress." | The first recording |
| Less than 300 MB free | "This computer is almost out of disk space for recordings…" | Nothing starts |

## Saving to Vistralo

1. The app opens at `#import/<id>`. Not signed in: the sign-in screen first, then it continues.
2. If an unsaved recording from this browser is already waiting in the app, that one is shown and the new one stays in the extension ("…Save or discard it, then open the new one from the extension.").
3. Otherwise the save sheet opens: **Record an AI walkthrough** (or **Record a talk-through** when the microphone was recorded), the recording previewed, the website address prefilled. Save uploads it like any recording made in the app.
4. The extension deletes its copy once the app has stored its own. If the extension does not answer within 8 seconds, the app says so and the recording stays in the extension.
