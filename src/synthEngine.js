/**
 * Brutalist Web Audio Procedural Synth Engine
 * Provides authentic analog retro-futuristic audio playback for Demo cards
 * and zero-dependency offline audio experience.
 */

let audioCtx = null;
let currentSynthNodes = null;

function getAudioContext() {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Frequencies and harmonic setups tailored for each brutalist geometric artType
 */
const SOUNDSCAPES = {
  monolith: { baseFreq: 55, chords: [55, 110, 164.81, 220], type: 'sawtooth', tempo: 0.8 },
  horizon: { baseFreq: 65.41, chords: [130.81, 164.81, 196.00, 246.94], type: 'sine', tempo: 1.2 },
  waveform: { baseFreq: 82.41, chords: [164.81, 220.00, 246.94, 329.63], type: 'triangle', tempo: 0.6 },
  isometric: { baseFreq: 73.42, chords: [146.83, 174.61, 220.00, 293.66], type: 'sawtooth', tempo: 1.0 },
  radar: { baseFreq: 98.00, chords: [196.00, 246.94, 293.66, 392.00], type: 'sine', tempo: 0.5 },
  blocks: { baseFreq: 61.74, chords: [123.47, 155.56, 185.00, 246.94], type: 'square', tempo: 0.75 },
  scanlines: { baseFreq: 87.31, chords: [174.61, 220.00, 261.63, 349.23], type: 'triangle', tempo: 0.9 },
  eclipse: { baseFreq: 51.91, chords: [103.83, 130.81, 155.56, 207.65], type: 'sawtooth', tempo: 1.1 },
  tunnel: { baseFreq: 69.30, chords: [138.59, 164.81, 207.65, 277.18], type: 'sine', tempo: 0.7 },
  matrix: { baseFreq: 77.78, chords: [155.56, 185.00, 233.08, 311.13], type: 'square', tempo: 0.85 }
};

export function startSynthPlayback(artType = 'waveform', onProgress = null) {
  stopSynthPlayback();
  const ctx = getAudioContext();
  const preset = SOUNDSCAPES[artType] || SOUNDSCAPES.waveform;

  // Master Gain
  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0.18, ctx.currentTime);
  masterGain.connect(ctx.destination);

  // Sub bass oscillator
  const subOsc = ctx.createOscillator();
  subOsc.type = preset.type;
  subOsc.frequency.setValueAtTime(preset.baseFreq, ctx.currentTime);

  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.3, ctx.currentTime);
  subOsc.connect(subGain);
  subGain.connect(masterGain);
  subOsc.start();

  // Lowpass filter with subtle resonance sweep
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(800, ctx.currentTime);
  filter.Q.setValueAtTime(4, ctx.currentTime);
  filter.connect(masterGain);

  // Harmonic arpeggiator oscillators
  const oscs = [];
  let noteIndex = 0;
  const arpInterval = setInterval(() => {
    if (!currentSynthNodes) return;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const freq = preset.chords[noteIndex % preset.chords.length];
    noteIndex++;

    osc.type = preset.type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);

    env.gain.setValueAtTime(0.001, ctx.currentTime);
    env.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.08);
    env.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);

    osc.connect(env);
    env.connect(filter);
    osc.start();
    osc.stop(ctx.currentTime + 0.65);
  }, 280 / preset.tempo);

  currentSynthNodes = {
    ctx,
    masterGain,
    subOsc,
    arpInterval,
    stop: () => {
      clearInterval(arpInterval);
      try {
        subOsc.stop();
        subOsc.disconnect();
        masterGain.disconnect();
      } catch (e) {}
    }
  };
}

export function stopSynthPlayback() {
  if (currentSynthNodes) {
    currentSynthNodes.stop();
    currentSynthNodes = null;
  }
}

export function isSynthPlaying() {
  return currentSynthNodes !== null;
}
