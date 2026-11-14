// Synthesised sounds: an engine hum that follows the speed, and short blips for events.
const MUTE_KEY = 'ludiven-kart-mute';

export class Sfx {
	muted: boolean;
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private engine: OscillatorNode | null = null;
	private engine2: OscillatorNode | null = null;
	private engineGain: GainNode | null = null;
	private noise: AudioBuffer | null = null;

	constructor() {
		let m = false;
		try {
			m = localStorage.getItem(MUTE_KEY) === '1';
		} catch {
			/* storage blocked */
		}
		this.muted = m;
	}

	/** Must run inside a user gesture (iOS). */
	unlock() {
		if (this.ctx) {
			void this.ctx.resume();
			return;
		}
		const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (!AC) return;
		const ctx = new AC();
		this.ctx = ctx;
		this.master = ctx.createGain();
		this.master.gain.value = this.muted ? 0 : 0.5;
		this.master.connect(ctx.destination);
		const lp = ctx.createBiquadFilter();
		lp.type = 'lowpass';
		lp.frequency.value = 700;
		this.engineGain = ctx.createGain();
		this.engineGain.gain.value = 0;
		this.engine = ctx.createOscillator();
		this.engine.type = 'sawtooth';
		this.engine2 = ctx.createOscillator();
		this.engine2.type = 'square';
		this.engine.connect(lp);
		this.engine2.connect(lp);
		lp.connect(this.engineGain);
		this.engineGain.connect(this.master);
		this.engine.start();
		this.engine2.start();
		const len = ctx.sampleRate * 0.5;
		this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
		const d = this.noise.getChannelData(0);
		for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
	}

	setMuted(m: boolean) {
		this.muted = m;
		try {
			localStorage.setItem(MUTE_KEY, m ? '1' : '0');
		} catch {
			/* storage blocked */
		}
		if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.05);
	}

	/** speed 0..1, boost adds a whine. */
	engineAt(speed: number, boost: boolean, on: boolean) {
		if (!this.ctx || !this.engine || !this.engine2 || !this.engineGain) return;
		const t = this.ctx.currentTime;
		const f = 55 + speed * 120 + (boost ? 40 : 0);
		this.engine.frequency.setTargetAtTime(f, t, 0.08);
		this.engine2.frequency.setTargetAtTime(f * 1.505, t, 0.08);
		this.engineGain.gain.setTargetAtTime(on ? 0.05 + speed * 0.06 : 0, t, 0.1);
	}

	private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.18, slide = 0, delay = 0) {
		if (!this.ctx || !this.master) return;
		const t = this.ctx.currentTime + delay;
		const o = this.ctx.createOscillator();
		const g = this.ctx.createGain();
		o.type = type;
		o.frequency.setValueAtTime(freq, t);
		if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		o.connect(g);
		g.connect(this.master);
		o.start(t);
		o.stop(t + dur + 0.02);
	}

	private hiss(dur: number, from: number, to: number, vol = 0.2) {
		if (!this.ctx || !this.master || !this.noise) return;
		const t = this.ctx.currentTime;
		const s = this.ctx.createBufferSource();
		s.buffer = this.noise;
		const f = this.ctx.createBiquadFilter();
		f.type = 'bandpass';
		f.Q.value = 1.2;
		f.frequency.setValueAtTime(from, t);
		f.frequency.exponentialRampToValueAtTime(to, t + dur);
		const g = this.ctx.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.001, t + dur);
		s.connect(f);
		f.connect(g);
		g.connect(this.master);
		s.start(t);
		s.stop(t + dur);
	}

	play(ev: string) {
		switch (ev) {
			case 'count': return this.tone(440, 0.25, 'square', 0.15);
			case 'go': return this.tone(880, 0.6, 'square', 0.18);
			case 'box': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.08, 'triangle', 0.12, 0, i * 0.05)); return;
			case 'got': return this.tone(1318, 0.15, 'triangle', 0.14);
			case 'use:laser': return this.tone(1400, 0.25, 'sawtooth', 0.12, 0.2);
			case 'use:mine': return this.tone(180, 0.2, 'square', 0.15, 0.6);
			case 'use:hyper': this.hiss(0.9, 300, 4000, 0.25); return this.tone(220, 0.9, 'sawtooth', 0.1, 4);
			case 'use:tractor': return this.tone(300, 0.8, 'sine', 0.2, 0.5);
			case 'hit': this.hiss(0.4, 2000, 200, 0.3); return this.tone(160, 0.4, 'square', 0.15, 0.4);
			case 'turbo': return this.hiss(0.5, 600, 3000, 0.22);
			case 'charge': return this.tone(990, 0.07, 'triangle', 0.08);
			case 'pad': return this.hiss(0.4, 800, 3500, 0.2);
			case 'wall': return this.tone(90, 0.15, 'square', 0.12, 0.7);
			case 'bump': return this.tone(130, 0.1, 'square', 0.1, 0.8);
			case 'hop': return this.tone(330, 0.08, 'triangle', 0.08, 1.5);
			case 'lap': [784, 988].forEach((f, i) => this.tone(f, 0.15, 'square', 0.12, 0, i * 0.12)); return;
			case 'final': [659, 784, 988, 1318].forEach((f, i) => this.tone(f, 0.14, 'square', 0.12, 0, i * 0.1)); return;
			case 'finish': [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'square', 0.13, 0, i * 0.13)); return;
		}
	}

	stop() {
		this.engineAt(0, false, false);
	}
}
