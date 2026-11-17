// Dice clatter generated with WebAudio (short filtered noise bursts). No sound files.

export class Clatter {
  enabled = false;
  private ctx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private last = 0;

  private ensure(): AudioContext | null {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return null;
      }
      const len = Math.floor(this.ctx.sampleRate * 0.12);
      this.buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.exp((-i / len) * 9);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  /** One collision. `power` is roughly the impact speed (0..30). */
  hit(power: number): void {
    if (!this.enabled || power < 1.2) return;
    const now = performance.now();
    if (now - this.last < 18) return;
    this.last = now;
    const ctx = this.ensure();
    if (!ctx || !this.buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = this.buffer;
    src.playbackRate.value = 0.8 + Math.random() * 0.9;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1400 + Math.random() * 2600;
    filter.Q.value = 1.4;
    const gain = ctx.createGain();
    gain.gain.value = Math.min(0.5, 0.04 + power * 0.02);
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }
}
