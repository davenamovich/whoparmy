/**
 * Doors game sound effects — 100% WebAudio-synthesized, no asset files.
 *
 * Every sound is built from oscillators + filtered noise at play time:
 *  - ring:    classic dual-tone (440+480 Hz) warble, tremolo-modulated
 *  - click:   UI tick
 *  - sting:   door slide + pluck (triangle sweep up)
 *  - pop:     meme reveal pop (sine pitch drop + noise tick)
 *  - taiko:   festival drum — low sine thump + noise burst (jackpot = ×3)
 *  - thud:    the Dud — low square drop through a lowpass
 *
 * Rules (browser autoplay policy + SPEC Addendum v3 B3):
 *  - only ever call playDoorSound from a user-gesture handler, or from a
 *    state change that directly follows one;
 *  - the AudioContext is created lazily inside those calls and resumed
 *    if the browser left it suspended;
 *  - SSR-safe: every entry point no-ops when window is undefined;
 *  - mute is persisted in localStorage ("doors-muted") and defaults to on
 *    (sound enabled) until the player turns it off.
 */

export type DoorSoundName = "ring" | "click" | "sting" | "pop" | "taiko" | "jackpot" | "thud";

const MUTE_KEY = "doors-muted";

let ctx: AudioContext | null = null;

export function isDoorsMuted(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDoorsMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    // storage unavailable (private mode etc.) — mute just won't persist
  }
}

function audioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (isDoorsMuted()) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

interface ToneOpts {
  freq: number;
  freqEnd?: number;
  type?: OscillatorType;
  dur: number;
  gain?: number;
  delay?: number;
}

function tone(ac: AudioContext, { freq, freqEnd, type = "sine", dur, gain = 0.15, delay = 0 }: ToneOpts): void {
  const t0 = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

interface NoiseOpts {
  dur: number;
  gain?: number;
  delay?: number;
  filterFreq?: number;
  filterEnd?: number;
  type?: BiquadFilterType;
}

function noise(ac: AudioContext, { dur, gain = 0.1, delay = 0, filterFreq = 1200, filterEnd, type = "lowpass" }: NoiseOpts): void {
  const t0 = ac.currentTime + delay;
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = ac.createBufferSource();
  src.buffer = buffer;
  const filter = ac.createBiquadFilter();
  filter.type = type;
  filter.frequency.setValueAtTime(filterFreq, t0);
  if (filterEnd !== undefined) filter.frequency.exponentialRampToValueAtTime(Math.max(10, filterEnd), t0 + dur);
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(ac.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.05);
}

/** One taiko hit: drum-skin thump + stick noise. */
function taikoHit(ac: AudioContext, delay: number, power = 1): void {
  tone(ac, { freq: 110, freqEnd: 45, type: "sine", dur: 0.32, gain: 0.34 * power, delay });
  tone(ac, { freq: 220, freqEnd: 90, type: "triangle", dur: 0.12, gain: 0.1 * power, delay });
  noise(ac, { dur: 0.08, gain: 0.12 * power, delay, filterFreq: 900 });
}

function ringBurst(ac: AudioContext, delay: number): void {
  // Dual-tone warble: 440 + 480 Hz with a 20 Hz tremolo on the gain,
  // the classic North-American ring cadence compressed into one burst.
  const dur = 1.1;
  const t0 = ac.currentTime + delay;
  const g = ac.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(0.055, t0 + 0.03);
  g.gain.setValueAtTime(0.055, t0 + dur - 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const lfo = ac.createOscillator();
  lfo.frequency.setValueAtTime(20, t0);
  const lfoGain = ac.createGain();
  lfoGain.gain.setValueAtTime(0.028, t0);
  lfo.connect(lfoGain).connect(g.gain);
  for (const freq of [440, 480]) {
    const osc = ac.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, t0);
    osc.connect(g);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  g.connect(ac.destination);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.05);
}

const PLAYERS: Record<DoorSoundName, (ac: AudioContext) => void> = {
  ring: (ac) => {
    ringBurst(ac, 0);
    ringBurst(ac, 1.45);
  },
  click: (ac) => {
    tone(ac, { freq: 1250, type: "square", dur: 0.045, gain: 0.05 });
  },
  sting: (ac) => {
    // door slide: filtered noise sweep, then a plucked note as it latches
    noise(ac, { dur: 0.22, gain: 0.07, filterFreq: 500, filterEnd: 2600, type: "bandpass" });
    tone(ac, { freq: 320, freqEnd: 880, type: "triangle", dur: 0.2, gain: 0.12, delay: 0.1 });
    tone(ac, { freq: 1320, type: "sine", dur: 0.1, gain: 0.05, delay: 0.16 });
  },
  pop: (ac) => {
    tone(ac, { freq: 520, freqEnd: 180, type: "sine", dur: 0.13, gain: 0.2 });
    noise(ac, { dur: 0.05, gain: 0.08, filterFreq: 3000, type: "highpass" });
    tone(ac, { freq: 940, type: "triangle", dur: 0.12, gain: 0.07, delay: 0.05 });
  },
  taiko: (ac) => {
    taikoHit(ac, 0);
  },
  jackpot: (ac) => {
    taikoHit(ac, 0, 0.9);
    taikoHit(ac, 0.16, 1);
    taikoHit(ac, 0.34, 1.15);
    // gold shimmer arpeggio over the drums
    [1318, 1568, 2093].forEach((f, i) => tone(ac, { freq: f, type: "triangle", dur: 0.22, gain: 0.05, delay: 0.1 + i * 0.09 }));
  },
  thud: (ac) => {
    tone(ac, { freq: 150, freqEnd: 38, type: "square", dur: 0.38, gain: 0.16 });
    noise(ac, { dur: 0.2, gain: 0.06, filterFreq: 300, filterEnd: 120 });
  },
};

export function playDoorSound(name: DoorSoundName): void {
  const ac = audioContext();
  if (!ac) return;
  try {
    PLAYERS[name](ac);
  } catch {
    // a failed sound must never break the game
  }
}
