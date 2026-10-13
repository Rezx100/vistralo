import type { CaptureArea, DisplaySurface } from "../capture";

export const DEFAULT_AREA: CaptureArea = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 };

export interface ChosenDisplay {
  stream: MediaStream;
  surface: DisplaySurface;
  width: number;
  height: number;
}

export function liveMicTrack(microphone: MediaStream | null) {
  return microphone?.getAudioTracks().find((track) => track.readyState === "live" && track.enabled);
}

export async function openMicrophone() {
  const audio = {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false,
    channelCount: 1,
  };
  try {
    return await navigator.mediaDevices.getUserMedia({ audio, video: false });
  } catch (failure) {
    if (failure instanceof DOMException && failure.name === "OverconstrainedError")
      return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    throw failure;
  }
}

export function recorderMime(withMicrophone: boolean) {
  const types = withMicrophone
    ? ["video/webm;codecs=vp8,opus", "video/webm"]
    : ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported(type));
}

export function buildRecording(
  display: MediaStream,
  microphone: MediaStream | null,
  video: MediaStreamTrack[] = display.getVideoTracks(),
) {
  const mic = liveMicTrack(microphone);
  const recorded = new MediaStream();
  for (const track of video) recorded.addTrack(track);
  if (!mic) {
    for (const track of display.getAudioTracks()) recorded.addTrack(track);
    return {
      recorded,
      context: null as AudioContext | null,
      analyser: null as AnalyserNode | null,
      source: null as MediaStreamAudioSourceNode | null,
      gain: null as GainNode | null,
    };
  }
  let context: AudioContext;
  try {
    context = new AudioContext({ sampleRate: 48000 });
  } catch {
    context = new AudioContext();
  }
  const destination = context.createMediaStreamDestination();
  const source = context.createMediaStreamSource(new MediaStream([mic]));
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  const gain = context.createGain();
  gain.gain.value = 0;
  source.connect(analyser);
  analyser.connect(destination);
  source.connect(gain);
  gain.connect(context.destination);
  const audio = destination.stream.getAudioTracks()[0];
  if (audio) recorded.addTrack(audio);
  return { recorded, context, analyser, source, gain };
}
