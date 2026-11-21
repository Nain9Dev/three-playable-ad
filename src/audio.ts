/**
 * Sound is synthesized with the Web Audio API, so the file carries no audio data.
 * The context is created on the first tap: ad networks require the ad to stay
 * muted until the player interacts.
 */
let context: AudioContext | null = null;

export function unlockAudio(): void {
  if (!context) {
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context = new Ctor();
  }
  void context.resume();
}

export function tone(
  frequency: number,
  duration = 0.14,
  type: OscillatorType = "triangle",
  volume = 0.16,
): void {
  if (!context || context.state !== "running") return;
  const now = context.currentTime;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, now);
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  oscillator.connect(gain).connect(context.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

/** Pentatonic steps so a streak of perfect drops sounds like a rising melody. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];

export function perfectChime(combo: number): void {
  const step = SCALE[Math.min(combo, SCALE.length - 1)] ?? 0;
  tone(523.25 * 2 ** (step / 12), 0.22, "sine", 0.18);
}

export function cutThud(): void {
  tone(196, 0.12, "triangle", 0.14);
}

export function missThud(): void {
  tone(110, 0.35, "sawtooth", 0.12);
}

export function winFanfare(): void {
  [0, 4, 7, 12].forEach((step, i) => {
    window.setTimeout(() => tone(523.25 * 2 ** (step / 12), 0.25, "sine", 0.18), i * 90);
  });
}
