// Every sound is synthesised: no audio files to load.
export type Sfx = 'jump' | 'land' | 'roll' | 'splash' | 'pickup' | 'gold' | 'jar' | 'break' | 'bounce' | 'climb' | 'click' | 'follow' | 'magic';

const VOICES: Record<string, number> = { Sally: 880, Tygo: 520, Hector: 330, Barnabé: 300, Pipa: 990, Lila: 1050, Lou: 940, Gaston: 260 };
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];

export class Audio {
	sfxOn = true;
	musicOn = true;
	private ctx: AudioContext | null = null;
	private master!: GainNode;
	private musicBus!: GainNode;
	private noise!: AudioBuffer;
	private nextNote = 0;
	private step = 0;
	night = 0;

	start(): void {
		if (this.ctx) {
			void this.ctx.resume();
			return;
		}
		const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
		if (!AC) return;
		this.ctx = new AC();
		this.master = this.ctx.createGain();
		this.master.gain.value = 0.55;
		this.master.connect(this.ctx.destination);
		this.musicBus = this.ctx.createGain();
		this.musicBus.gain.value = this.musicOn ? 0.22 : 0;
		this.musicBus.connect(this.master);
		const len = this.ctx.sampleRate;
		this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
		const d = this.noise.getChannelData(0);
		for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
		this.nextNote = this.ctx.currentTime + 0.5;
	}

	setMusic(on: boolean): void {
		this.musicOn = on;
		if (this.ctx) this.musicBus.gain.setTargetAtTime(on ? 0.22 : 0, this.ctx.currentTime, 0.3);
	}

	suspend(on: boolean): void {
		if (!this.ctx) return;
		if (on) void this.ctx.suspend();
		else void this.ctx.resume();
	}

	private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, when = 0, bus?: AudioNode): void {
		const c = this.ctx!;
		const t = c.currentTime + when;
		const o = c.createOscillator();
		const g = c.createGain();
		o.type = type;
		o.frequency.setValueAtTime(freq, t);
		if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
		g.gain.setValueAtTime(0.0001, t);
		g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		o.connect(g).connect(bus ?? this.master);
		o.start(t);
		o.stop(t + dur + 0.05);
	}

	private hiss(dur: number, vol: number, from: number, to: number, when = 0): void {
		const c = this.ctx!;
		const t = c.currentTime + when;
		const s = c.createBufferSource();
		s.buffer = this.noise;
		const f = c.createBiquadFilter();
		f.type = 'bandpass';
		f.Q.value = 1.2;
		f.frequency.setValueAtTime(from, t);
		f.frequency.exponentialRampToValueAtTime(to, t + dur);
		const g = c.createGain();
		g.gain.setValueAtTime(vol, t);
		g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
		s.connect(f).connect(g).connect(this.master);
		s.start(t);
		s.stop(t + dur + 0.05);
	}

	play(name: Sfx): void {
		if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
		switch (name) {
			case 'jump':
				this.tone(320, 0.16, 'triangle', 0.18, 620);
				break;
			case 'land':
				this.tone(140, 0.12, 'sine', 0.22, 70);
				break;
			case 'roll':
				this.hiss(0.35, 0.25, 600, 2400);
				break;
			case 'splash':
				this.hiss(0.6, 0.4, 2600, 400);
				this.tone(500, 0.2, 'sine', 0.12, 180, 0.05);
				break;
			case 'pickup':
				[0, 4, 7].forEach((s, i) => this.tone(660 * 2 ** (s / 12), 0.18, 'triangle', 0.16, undefined, i * 0.06));
				break;
			case 'gold':
				[0, 7, 12, 19].forEach((s, i) => this.tone(990 * 2 ** (s / 12), 0.22, 'sine', 0.13, undefined, i * 0.05));
				break;
			case 'jar':
				[0, 4, 7, 12, 16].forEach((s, i) => this.tone(523 * 2 ** (s / 12), 0.5, 'triangle', 0.14, undefined, i * 0.09));
				break;
			case 'break':
				this.hiss(0.5, 0.5, 900, 200);
				this.tone(110, 0.3, 'square', 0.08, 55);
				break;
			case 'bounce':
				this.tone(180, 0.35, 'sine', 0.28, 720);
				break;
			case 'climb':
				this.hiss(0.15, 0.12, 1800, 900);
				break;
			case 'click':
				this.tone(880, 0.05, 'square', 0.05);
				break;
			case 'follow':
				this.tone(1400, 0.08, 'sine', 0.12, 1800);
				this.tone(1700, 0.1, 'sine', 0.1, 2100, 0.08);
				break;
			case 'magic':
				for (let i = 0; i < 10; i++) this.tone(660 * 2 ** (SCALE[i] / 12), 0.6, 'sine', 0.1, undefined, i * 0.08);
				break;
		}
	}

	// A short blip per letter, pitched to the speaker.
	voice(who: string): void {
		if (!this.ctx || !this.sfxOn || this.ctx.state !== 'running') return;
		const f = VOICES[who] ?? 600;
		this.tone(f * (0.9 + Math.random() * 0.25), 0.05, 'triangle', 0.05);
	}

	// Gentle procedural music: a pad every bar, pentatonic plucks on top.
	tick(): void {
		if (!this.ctx || this.ctx.state !== 'running') return;
		const c = this.ctx;
		while (this.nextNote < c.currentTime + 0.3) {
			const beat = 0.42 + this.night * 0.12;
			const bar = Math.floor(this.step / 8);
			const roots = [0, -3, 5, 2];
			const root = 220 * 2 ** (roots[bar % 4] / 12) * (this.night > 0.5 ? 0.84 : 1);
			const when = this.nextNote - c.currentTime;
			if (this.step % 8 === 0)
				for (const s of [0, 7, 16]) this.tone(root * 2 ** (s / 12) * 0.5, beat * 8, 'sine', 0.05, undefined, when, this.musicBus);
			const seed = Math.sin(this.step * 12.9898 + bar * 7.1) * 43758.5453;
			const rnd = seed - Math.floor(seed);
			if (rnd > 0.42) {
				const n = SCALE[Math.floor(rnd * 100) % 7];
				this.tone(root * 2 ** (n / 12) * 2, beat * 1.6, 'triangle', 0.06, undefined, when, this.musicBus);
			}
			this.nextNote += beat;
			this.step++;
		}
	}
}
