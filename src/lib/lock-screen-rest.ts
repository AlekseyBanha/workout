import { uk } from "../i18n/uk.ts";

export const REST_MS = 2 * 60 * 1000;

const ACTIONS = ["play", "pause", "stop", "seekbackward", "seekforward", "seekto", "previoustrack", "nexttrack"] as const;

let bed: HTMLAudioElement | null = null;
let bedUrl: string | null = null;
let artworkUrl: string | null = null;
let context: AudioContext | null = null;
let endsAt = 0;
let armed = false;
let attached = 0;
let alignedFor = 0;
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
  const cycleLength = rate / 20;
  const cycle = new Int16Array(cycleLength);
  for (let i = 0; i < cycle.length; i += 1) {
    cycle[i] = Math.round(Math.sin((2 * Math.PI * i) / cycleLength) * 1800);
  }
  const seconds = REST_MS / 1000;
  const samples = new Int16Array(rate * seconds);
  for (let offset = 0; offset < samples.length; offset += cycle.length) {
    samples.set(cycle.subarray(0, Math.min(cycle.length, samples.length - offset)), offset);
  }
  bedUrl = wavUrl(samples, rate);
  return bedUrl;
}

function artworkList(): MediaImage[] {
  if (!artworkUrl) artworkUrl = new URL("/rest-lock.png", window.location.origin).href;
  return [{ src: artworkUrl, sizes: "512x512", type: "image/png" }];
}

function ensureBed(): HTMLAudioElement {
  if (bed) return bed;
  const audio = new Audio(quietBedUrl());
  audio.preload = "auto";
  audio.loop = false;
  audio.hidden = true;
  audio.setAttribute("playsinline", "true");
  document.body.appendChild(audio);
  bed = audio;
  return audio;
}

function audioContext(): AudioContext | null {
  const Ctx = window.AudioContext;
  if (!Ctx) return null;
  context ??= new Ctx();
  return context;
}

function setAudioSession(type: "ambient" | "playback") {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (!session) return;
  try {
    session.type = type;
  } catch {
    // This browser does not accept that audio session type.
  }
}

function setHandler(action: MediaSessionAction, handler: MediaSessionActionHandler | null) {
  try {
    navigator.mediaSession.setActionHandler(action, handler);
  } catch {
    // This phone does not expose that lock-screen button.
  }
}

function clearPresentation() {
  if (!("mediaSession" in navigator)) return;
  const session = navigator.mediaSession;
  session.playbackState = "none";
  session.metadata = null;
  try {
    session.setPositionState();
  } catch {
    // Clearing position state is optional.
  }
  for (const action of ACTIONS) setHandler(action, null);
}

function clock(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function playChime() {
  const ctx = audioContext();
  if (!ctx) return;
  const start = () => {
    const now = ctx.currentTime;
    const tone = (at: number, frequency: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.18, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
    };
    tone(now, 880, 0.16);
    tone(now + 0.28, 1175, 0.32);
  };
  if (ctx.state === "suspended") {
    void ctx.resume().then(start).catch(() => undefined);
    return;
  }
  start();
}

export function notifyRestDone(until: number) {
  if (!until || chimedFor === until) return;
  chimedFor = until;
  playChime();
}

function publish(remainingMs: number, done: boolean) {
  if (!("mediaSession" in navigator)) return;
  const audio = bed ?? ensureBed();
  const duration = REST_MS / 1000;
  const position = Math.min(duration, Math.max(0, (REST_MS - remainingMs) / 1000));
  setAudioSession("playback");
  if (endsAt && alignedFor !== endsAt) {
    try {
      audio.currentTime = position;
      alignedFor = endsAt;
    } catch {
      // Seeking can fail before the file has loaded.
    }
  }
  if (audio.paused) void audio.play().catch(() => undefined);
  const session = navigator.mediaSession;
  const title = done ? uk.workout.restDone : `${uk.workout.rest} · ${clock(remainingMs)}`;
  try {
    session.metadata = new MediaMetadata({
      title,
      artist: uk.appName,
      album: uk.workout.rest,
      artwork: artworkList(),
    });
  } catch {
    session.metadata = new MediaMetadata({ title, artist: uk.appName, album: uk.workout.rest });
  }
  session.playbackState = "playing";
  try {
    session.setPositionState({ duration, playbackRate: done ? 0 : 1, position });
  } catch {
    // Position state is optional on some phones.
  }
  const keep = () => {
    void audio.play().catch(() => undefined);
    session.playbackState = "playing";
  };
  setHandler("play", keep);
  setHandler("pause", keep);
  setHandler("stop", () => onSkip?.());
  setHandler("seekbackward", null);
  setHandler("seekforward", null);
  setHandler("seekto", null);
  setHandler("previoustrack", null);
  setHandler("nexttrack", null);
  if (done && endsAt) notifyRestDone(endsAt);
}

function present() {
  if (!armed || !endsAt) return;
  const remaining = Math.max(0, endsAt - Date.now());
  publish(remaining, remaining === 0);
}

export function armLockScreenRest(): void {
  armed = true;
  const ctx = audioContext();
  if (ctx) void ctx.resume();
  if (!("mediaSession" in navigator)) return;
  const audio = ensureBed();
  setAudioSession("playback");
  // Playback has to begin in the tap and stay running, or iOS will not keep the card on the lock screen.
  void audio.play().catch(() => undefined);
  publish(endsAt ? Math.max(0, endsAt - Date.now()) : REST_MS, false);
}

export function cancelLockScreenArm(): void {
  if (attached > 0) return;
  armed = false;
  endsAt = 0;
  bed?.pause();
  alignedFor = 0;
  clearPresentation();
}

export function syncLockScreenRest(until: number) {
  endsAt = until;
  if (!armed) return;
  present();
}

export function attachLockScreenRest(skip: () => void): () => void {
  attached += 1;
  onSkip = skip;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") present();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const timer = window.setInterval(() => {
    present();
  }, 1000);
  const generation = attached;
  return () => {
    document.removeEventListener("visibilitychange", onVisibility);
    window.clearInterval(timer);
    window.setTimeout(() => {
      if (attached !== generation) return;
      attached = 0;
      armed = false;
      endsAt = 0;
      onSkip = null;
      alignedFor = 0;
      bed?.pause();
      clearPresentation();
    }, 0);
  };
}
