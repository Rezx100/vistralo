// The camera bubble's contents: an extension page, so the camera permission belongs to Vistralo
// and the recorded website never receives the camera stream.
const device = decodeURIComponent(location.hash.slice(1));
const video = document.querySelector("video")!;

void (async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { ...(device && device !== "default" ? { deviceId: { exact: device } } : {}), width: { ideal: 640 }, height: { ideal: 640 } },
      audio: false,
    });
    video.srcObject = stream;
    await video.play().catch(() => {});
    // The bubble is removed with its frame; stop the camera with it.
    window.addEventListener("pagehide", () => stream.getTracks().forEach((t) => t.stop()));
  } catch {
    document.body.classList.add("is-off");
  }
})();
