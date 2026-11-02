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
  const seconds = REST_MS / 1000 + 30;
  const samples = new Int16Array(rate * seconds);
  for (let offset = 0; offset < samples.length; offset += cycle.length) {
    samples.set(cycle.subarray(0, Math.min(cycle.length, samples.length - offset)), offset);
  }
  bedUrl = wavUrl(samples, rate);
  return bedUrl;
}

function ensureArtwork(): string {
  if (artworkUrl) return artworkUrl;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.fillStyle = "#14161c";
  ctx.fillRect(0, 0, 512, 512);
  ctx.strokeStyle = "#d6ff4a";
  ctx.lineWidth = 28;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(256, 256, 168, -Math.PI / 2, Math.PI * 1.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(256, 256);
  ctx.lineTo(256, 132);
  ctx.stroke();
  artworkUrl = canvas.toDataURL("image/png");
  return artworkUrl;
}

function ensureBed(): HTMLAudioElement {
  if (bed) return bed;
  const audio = new Audio(quietBedUrl());
  audio.preload = "auto";
  audio.loop = false;
  audio.setAttribute("playsinline", "true");
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

function present() {
  if (!armed || !endsAt || !("mediaSession" in navigator)) return;
  const audio = ensureBed();
  const remaining = Math.max(0, endsAt - Date.now());
  const done = remaining === 0;
  const duration = REST_MS / 1000;
  const position = Math.min(duration, Math.max(0, (REST_MS - remaining) / 1000));
  setAudioSession("playback");
  if (alignedFor !== endsAt) {
    try {
      audio.currentTime = position;
      alignedFor = endsAt;
    } catch {
      // Seeking can fail before the file has loaded.
    }
  }
  void audio.play().catch(() => undefined);
  const artwork = ensureArtwork();
  const session = navigator.mediaSession;
  session.metadata = new MediaMetadata({
    title: done ? uk.workout.restDone : clock(remaining),
    artist: uk.workout.rest,
    album: uk.appName,
    artwork: artwork ? [{ src: artwork, sizes: "512x512", type: "image/png" }] : [],
  });
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
  if (done) notifyRestDone(endsAt);
}

function hidePlayer() {
  bed?.pause();
  alignedFor = 0;
  setAudioSession("ambient");
  clearPresentation();
}

export function armLockScreenRest(): void {
  armed = true;
  const ctx = audioContext();
  if (ctx) void ctx.resume();
  if (!("mediaSession" in navigator)) return;
  const audio = ensureBed();
  setAudioSession("playback");
  // play() has to start in the tap. Pause afterwards so the phone does not keep a player over the workout.
  void audio.play().then(() => {
    if (armed && document.visibilityState === "hidden" && endsAt) {
      present();
      return;
    }
    audio.pause();
    try {
      audio.currentTime = 0;
    } catch {
      // The file may not be seekable yet.
    }
    alignedFor = 0;
    setAudioSession("ambient");
    clearPresentation();
  }).catch(() => undefined);
}

export function cancelLockScreenArm(): void {
  if (attached > 0) return;
  armed = false;
  endsAt = 0;
  bed?.pause();
  alignedFor = 0;
  setAudioSession("ambient");
  clearPresentation();
}

export function syncLockScreenRest(until: number) {
  endsAt = until;
  if (!armed) return;
  if (document.visibilityState === "hidden") present();
  else if (until <= Date.now()) notifyRestDone(until);
}

export function attachLockScreenRest(skip: () => void): () => void {
  attached += 1;
  onSkip = skip;
  const onVisibility = () => {
    if (document.visibilityState === "hidden") present();
    else hidePlayer();
  };
  document.addEventListener("visibilitychange", onVisibility);
  const timer = window.setInterval(() => {
    if (document.visibilityState !== "hidden") return;
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
      setAudioSession("ambient");
      clearPresentation();
    }, 0);
  };
}
