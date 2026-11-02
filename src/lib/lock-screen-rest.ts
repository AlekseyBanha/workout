import { uk } from "../i18n/uk.ts";

export const REST_MS = 2 * 60 * 1000;

let bed: HTMLAudioElement | null = null;
let chime: HTMLAudioElement | null = null;
let bedUrl: string | null = null;
let chimeUrl: string | null = null;
let attached = 0;
let chimedFor = 0;
let onSkip: (() => void) | null = null;

function wavUrl(samples: Int16Array, sampleRate: number): string {
  const dataSize = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(offset, samples[i] ?? 0, true);
    offset += 2;
  }
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function quietBedUrl(): string {
  if (bedUrl) return bedUrl;
  const rate = 8000;
  const samples = new Int16Array(rate);
  for (let i = 0; i < samples.length; i += 1) {
    samples[i] = Math.round(Math.sin((2 * Math.PI * 20 * i) / rate) * 1800);
  }
  bedUrl = wavUrl(samples, rate);
  return bedUrl;
}

function chimeUrlOnce(): string {
  if (chimeUrl) return chimeUrl;
  const rate = 22050;
  const samples = new Int16Array(Math.floor(rate * 0.9));
  const tone = (start: number, frequency: number, length: number) => {
    for (let i = 0; i < length; i += 1) {
      const index = start + i;
      const attack = Math.min(1, i / 180);
      const release = Math.min(1, (length - i) / 500);
      samples[index] = Math.round(Math.sin((2 * Math.PI * frequency * i) / rate) * attack * release * 14000);
    }
  };
  tone(0, 880, Math.floor(rate * 0.16));
  tone(Math.floor(rate * 0.28), 1175, Math.floor(rate * 0.32));
  chimeUrl = wavUrl(samples, rate);
  return chimeUrl;
}

function clock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // This phone does not expose that lock-screen button.
  }
}

function publish(remainingMs: number, done: boolean) {
  const session = navigator.mediaSession;
  if (!session) return;
  const duration = REST_MS / 1000;
  const position = Math.min(duration, Math.max(0, (REST_MS - remainingMs) / 1000));
  session.metadata = new MediaMetadata({
    title: done ? uk.workout.restDone : clock(remainingMs),
    artist: uk.workout.rest,
    album: uk.appName,
  });
  session.playbackState = "playing";
  try {
    session.setPositionState({ duration, playbackRate: 1, position });
  } catch {
    // Position state is optional on some phones.
  }
}

function ensureBed(): HTMLAudioElement {
  if (bed) return bed;
  const audio = new Audio(quietBedUrl());
  audio.loop = true;
  audio.preload = "auto";
  audio.hidden = true;
  audio.dataset.rest = "bed";
  audio.setAttribute("playsinline", "true");
  document.body.appendChild(audio);
  bed = audio;
  return audio;
}

function bindTransport() {
  const keep = () => {
    void bed?.play().catch(() => undefined);
    if (navigator.mediaSession) navigator.mediaSession.playbackState = "playing";
  };
  setHandler("play", keep);
  setHandler("pause", keep);
  setHandler("stop", () => onSkip?.());
  setHandler("seekbackward", null);
  setHandler("seekforward", null);
  setHandler("seekto", null);
  setHandler("previoustrack", null);
  setHandler("nexttrack", null);
}

export function armLockScreenRest(): void {
  if (!("mediaSession" in navigator)) return;
  void ensureBed().play().catch(() => undefined);
  bindTransport();
  if (attached === 0) publish(REST_MS, false);
}

export function cancelLockScreenArm(): void {
  if (attached === 0) stopLockScreenRest();
}

export function syncLockScreenRest(remainingMs: number, done: boolean, until: number) {
  if (!bed || !("mediaSession" in navigator)) return;
  publish(Math.max(0, remainingMs), done);
  if (!done || chimedFor === until) return;
  chimedFor = until;
  const bell = chime ?? new Audio(chimeUrlOnce());
  if (!chime) {
    bell.hidden = true;
    bell.dataset.rest = "chime";
    bell.setAttribute("playsinline", "true");
    document.body.appendChild(bell);
  }
  chime = bell;
  bell.currentTime = 0;
  void bell.play().catch(() => undefined);
  bell.onended = () => {
    void bed?.play().catch(() => undefined);
  };
}

export function attachLockScreenRest(skip: () => void): () => void {
  attached += 1;
  onSkip = skip;
  armLockScreenRest();
  const generation = attached;
  return () => {
    window.setTimeout(() => {
      if (attached !== generation) return;
      attached = 0;
      stopLockScreenRest();
    }, 0);
  };
}

export function stopLockScreenRest() {
  bed?.pause();
  if (bed) bed.currentTime = 0;
  chime?.pause();
  onSkip = null;
  if (!("mediaSession" in navigator)) return;
  const session = navigator.mediaSession;
  session.playbackState = "none";
  session.metadata = null;
  try {
    session.setPositionState();
  } catch {
    // Clearing position state is optional.
  }
  for (const action of ["play", "pause", "stop", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"] as const) {
    setHandler(action, null);
  }
}
