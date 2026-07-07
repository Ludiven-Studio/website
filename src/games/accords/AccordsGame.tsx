import { useEffect, useRef, useState, useCallback } from 'react';

/* =====================================================
   ACCORDS & GOUFFRES — prototype (ear-training, real spectrum-analyser).
   X axis = frequency (bass left → treble right). Each chord note is a PEAK the
   player slides horizontally onto its frequency. No correctness feedback while
   tuning — you judge by ear. On "Traverser" the avatar hops peak to peak (in
   frequency order): a peak on the right frequency holds, a wrong one drops it
   through. Web Audio, no assets.
   ===================================================== */

const NOTE_FR = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const pitchName = (m: number): string => NOTE_FR[((Math.round(m) % 12) + 12) % 12];
const noteFull = (m: number): string => `${pitchName(m)}${Math.floor(Math.round(m) / 12) - 1}`;
const centsOff = (midi: number, target: number): number => (midi - target) * 100;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const PASS = 45; // cents tolerance for a peak to sit on its frequency
const SEG = 18; // spectrum segments per peak

interface Instrument {
	label: string;
	type: OscillatorType;
	attack: number;
	decay: number;
	sustain: number;
	release: number;
	harmonics: readonly (readonly [number, number])[];
}
const INSTRUMENTS = {
	piano: { label: 'Piano', type: 'triangle', attack: 0.005, decay: 0.5, sustain: 0.22, release: 0.35, harmonics: [[1, 1], [2, 0.28], [3, 0.12]] },
	orgue: { label: 'Orgue', type: 'sine', attack: 0.02, decay: 0.1, sustain: 0.9, release: 0.25, harmonics: [[1, 1], [2, 0.55], [4, 0.3]] },
	cordes: { label: 'Cordes', type: 'sawtooth', attack: 0.09, decay: 0.2, sustain: 0.8, release: 0.3, harmonics: [[1, 0.6], [2, 0.18]] },
	trompette: { label: 'Trompette', type: 'sawtooth', attack: 0.03, decay: 0.15, sustain: 0.75, release: 0.2, harmonics: [[1, 0.7], [2, 0.4], [3, 0.25], [4, 0.12]] },
	violon: { label: 'Violon', type: 'sawtooth', attack: 0.12, decay: 0.2, sustain: 0.85, release: 0.35, harmonics: [[1, 0.6], [2, 0.25], [3, 0.12]] },
	timbale: { label: 'Timbale', type: 'sine', attack: 0.002, decay: 0.4, sustain: 0.06, release: 0.25, harmonics: [[1, 1], [2, 0.2], [3, 0.08]] },
	synthe: { label: 'Synthé', type: 'square', attack: 0.01, decay: 0.15, sustain: 0.6, release: 0.2, harmonics: [[1, 0.5], [3, 0.12]] },
} satisfies Record<string, Instrument>;
type InstrumentId = keyof typeof INSTRUMENTS;

interface ChordType {
	name: string;
	offs: number[];
}
interface Level {
	root: number;
	chord: ChordType;
	instrument: InstrumentId;
	prefill: number[];
}
const LEVELS: Level[] = [
	{ root: 52, chord: { name: 'Majeur', offs: [0, 4, 7] }, instrument: 'piano', prefill: [0] },
	{ root: 57, chord: { name: 'Mineur', offs: [0, 3, 7] }, instrument: 'timbale', prefill: [0] },
	{ root: 50, chord: { name: 'sus4', offs: [0, 5, 7] }, instrument: 'orgue', prefill: [2] },
	{ root: 53, chord: { name: 'Majeur 7', offs: [0, 4, 7, 11] }, instrument: 'trompette', prefill: [0, 2] },
	{ root: 55, chord: { name: '7', offs: [0, 4, 7, 10] }, instrument: 'cordes', prefill: [0] },
	{ root: 48, chord: { name: 'Majeur 9', offs: [0, 4, 7, 11, 14] }, instrument: 'violon', prefill: [0, 4] },
	{ root: 52, chord: { name: 'Mineur 9', offs: [0, 3, 7, 10, 14] }, instrument: 'orgue', prefill: [0, 3] },
	{ root: 48, chord: { name: '7♭9', offs: [0, 4, 10, 13] }, instrument: 'trompette', prefill: [0] },
	{ root: 45, chord: { name: 'Majeur 7♯11', offs: [0, 4, 7, 11, 18] }, instrument: 'violon', prefill: [0, 1] },
];

interface Peak {
	target: number;
	midi: number; // current frequency (as fractional midi)
	locked: boolean;
}
type Status = 'intro' | 'tuning' | 'crossing' | 'levelclear' | 'won';
interface Cross {
	firstBad: number; // index in frequency order, -1 = all good
	order: number[]; // peak indices sorted by frequency
	startedAt: number;
	settled: boolean;
}

export default function AccordsGame() {
	const [status, setStatus] = useState<Status>('intro');
	const [level, setLevel] = useState(0);
	const [showNames, setShowNames] = useState(false);
	const [attempts, setAttempts] = useState(0);
	const [flash, setFlash] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 680, h: 380 });
	const peaksRef = useRef<Peak[]>([]);
	const rangeRef = useRef({ lo: 48, hi: 72 });
	const dragRef = useRef(-1);
	const crossRef = useRef<Cross | null>(null);
	const animRef = useRef(0);
	const rafRef = useRef(0);
	const statusRef = useRef<Status>('intro');
	const namesRef = useRef(false);
	const levelRef = useRef(0);

	const ctxRef = useRef<AudioContext | null>(null);
	const masterRef = useRef<GainNode | null>(null);
	const voicesRef = useRef(3);
	const liveRef = useRef<{ o: OscillatorNode; g: GainNode } | null>(null);

	const setStat = (s: Status): void => {
		statusRef.current = s;
		setStatus(s);
	};

	/* ---------- Audio ---------- */
	const ensureAudio = (): AudioContext | null => {
		if (!ctxRef.current) {
			const Ctor = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
			if (!Ctor) return null;
			const ctx = new Ctor();
			const master = ctx.createGain();
			master.gain.value = 0.9;
			master.connect(ctx.destination);
			ctxRef.current = ctx;
			masterRef.current = master;
		}
		if (ctxRef.current.state === 'suspended') void ctxRef.current.resume();
		return ctxRef.current;
	};
	const playTone = (ctx: AudioContext, freq: number, instr: Instrument, when: number, dur: number): void => {
		const g = ctx.createGain();
		g.connect(masterRef.current!);
		const peak = 0.24 / Math.max(3, voicesRef.current);
		const { attack: a, decay: d, sustain: s, release: rel } = instr;
		g.gain.setValueAtTime(0.0001, when);
		g.gain.exponentialRampToValueAtTime(peak, when + a);
		g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * s), when + a + d);
		g.gain.setValueAtTime(Math.max(0.0001, peak * s), when + dur);
		g.gain.exponentialRampToValueAtTime(0.0001, when + dur + rel);
		for (const [mult, amp] of instr.harmonics) {
			const o = ctx.createOscillator();
			o.type = instr.type;
			o.frequency.setValueAtTime(freq * mult, when);
			const hg = ctx.createGain();
			hg.gain.value = amp;
			o.connect(hg);
			hg.connect(g);
			o.start(when);
			o.stop(when + dur + rel + 0.05);
		}
	};
	const playChord = (freqs: number[], instr: Instrument, dur = 1.5): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		voicesRef.current = freqs.length;
		freqs.forEach((f, i) => playTone(ctx, f, instr, ctx.currentTime + i * 0.012, dur));
	};
	const startLive = (freq: number, instr: Instrument): void => {
		const ctx = ensureAudio();
		if (!ctx) return;
		stopLive();
		const g = ctx.createGain();
		g.gain.value = 0.0001;
		g.connect(masterRef.current!);
		const o = ctx.createOscillator();
		o.type = instr.type;
		o.frequency.value = freq;
		o.connect(g);
		o.start();
		g.gain.exponentialRampToValueAtTime(0.14, ctx.currentTime + 0.03);
		liveRef.current = { o, g };
	};
	const setLive = (freq: number): void => {
		const ctx = ctxRef.current;
		if (ctx && liveRef.current) liveRef.current.o.frequency.setTargetAtTime(freq, ctx.currentTime, 0.02);
	};
	const stopLive = (): void => {
		const ctx = ctxRef.current;
		const live = liveRef.current;
		if (ctx && live) {
			const t = ctx.currentTime;
			live.g.gain.cancelScheduledValues(t);
			live.g.gain.setValueAtTime(Math.max(0.0001, live.g.gain.value), t);
			live.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
			live.o.stop(t + 0.08);
		}
		liveRef.current = null;
	};

	/* ---------- Level ---------- */
	const curLevel = (): Level => LEVELS[Math.min(level, LEVELS.length - 1)];
	const targetsOf = (lv: Level): number[] => lv.chord.offs.map((o) => lv.root + o).sort((a, b) => a - b);

	const buildLevel = useCallback((idx: number): void => {
		const lv = LEVELS[idx];
		const targets = lv.chord.offs.map((o) => lv.root + o).sort((a, b) => a - b);
		const lo = Math.min(...targets) - 3;
		const hi = Math.max(...targets) + 3;
		rangeRef.current = { lo, hi };
		const peaks: Peak[] = targets.map((tm, i) => ({ target: tm, midi: tm, locked: lv.prefill.includes(i) }));
		// Spread the free peaks evenly across the band as a neutral (unsolved) start.
		const free = peaks.filter((p) => !p.locked);
		free.forEach((p, k) => (p.midi = lo + ((k + 1) / (free.length + 1)) * (hi - lo)));
		peaksRef.current = peaks;
		dragRef.current = -1;
		crossRef.current = null;
	}, []);

	/* ---------- Geometry (X = frequency) ---------- */
	const layout = () => {
		const { w, h } = dimRef.current;
		const base = h * 0.86;
		const peakTop = h * 0.4;
		const ledgeW = w * 0.11;
		const xLo = ledgeW + w * 0.04;
		const xHi = w - ledgeW - w * 0.04;
		return { w, h, base, peakTop, ledgeW, xLo, xHi };
	};
	const frac = (m: number): number => {
		const { lo, hi } = rangeRef.current;
		return clamp((m - lo) / (hi - lo), 0, 1);
	};
	const xForMidi = (m: number): number => {
		const L = layout();
		return L.xLo + frac(m) * (L.xHi - L.xLo);
	};
	const midiForX = (x: number): number => {
		const L = layout();
		const { lo, hi } = rangeRef.current;
		const f = clamp((x - L.xLo) / (L.xHi - L.xLo), 0, 1);
		return lo + f * (hi - lo);
	};

	/* ---------- Buttons ---------- */
	const hearChord = useCallback((): void => {
		const lv = curLevel();
		playChord(targetsOf(lv).map(midiToFreq), INSTRUMENTS[lv.instrument]);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [level]);
	const hearChordRef = useRef(hearChord);
	hearChordRef.current = hearChord;
	const hearMine = (): void => {
		const lv = curLevel();
		playChord(peaksRef.current.map((p) => midiToFreq(p.midi)), INSTRUMENTS[lv.instrument]);
	};
	const hearPlaced = (): void => {
		const lv = curLevel();
		const locked = peaksRef.current.filter((p) => p.locked).map((p) => midiToFreq(p.target));
		if (locked.length) playChord(locked, INSTRUMENTS[lv.instrument]);
	};
	const cross = (): void => {
		if (statusRef.current !== 'tuning') return;
		const targets = targetsOf(curLevel());
		const order = peaksRef.current.map((_, i) => i).sort((a, b) => peaksRef.current[a].midi - peaksRef.current[b].midi);
		let firstBad = -1;
		for (let k = 0; k < order.length; k++) {
			if (Math.abs(centsOff(peaksRef.current[order[k]].midi, targets[k])) > PASS) {
				firstBad = k;
				break;
			}
		}
		crossRef.current = { firstBad, order, startedAt: animRef.current, settled: false };
		setStat('crossing');
	};
	const nextLevel = (): void => {
		if (level + 1 >= LEVELS.length) {
			setStat('won');
			return;
		}
		const nx = level + 1;
		setLevel(nx);
		buildLevel(nx);
		setStat('tuning');
		setTimeout(() => hearChordRef.current(), 250);
	};
	const startGame = (): void => {
		ensureAudio();
		setLevel(0);
		setAttempts(0);
		buildLevel(0);
		setStat('tuning');
		setTimeout(() => hearChordRef.current(), 200);
	};
	const restart = (): void => {
		setLevel(0);
		setAttempts(0);
		buildLevel(0);
		setStat('tuning');
		setTimeout(() => hearChordRef.current(), 200);
	};

	/* ---------- Pointer ---------- */
	const posFrom = (e: React.PointerEvent): { x: number; y: number } => {
		const cv = canvasRef.current!;
		const rect = cv.getBoundingClientRect();
		return { x: (e.clientX - rect.left) * (dimRef.current.w / rect.width), y: (e.clientY - rect.top) * (dimRef.current.h / rect.height) };
	};
	const onDown = (e: React.PointerEvent): void => {
		if (statusRef.current !== 'tuning') return;
		const p = posFrom(e);
		let best = -1;
		let bestD = 34;
		peaksRef.current.forEach((pk, i) => {
			const d = Math.abs(p.x - xForMidi(pk.midi));
			if (d < bestD) {
				bestD = d;
				best = i;
			}
		});
		if (best < 0) return;
		const pk = peaksRef.current[best];
		if (pk.locked) {
			// Locked peak → not draggable, but tap it to hear the note already in place.
			playChord([midiToFreq(pk.target)], INSTRUMENTS[curLevel().instrument], 1.1);
			return;
		}
		dragRef.current = best;
		canvasRef.current?.setPointerCapture(e.pointerId);
		pk.midi = midiForX(p.x);
		startLive(midiToFreq(pk.midi), INSTRUMENTS[curLevel().instrument]);
	};
	const onMove = (e: React.PointerEvent): void => {
		const i = dragRef.current;
		if (i < 0) return;
		const m = midiForX(posFrom(e).x);
		peaksRef.current[i].midi = m;
		setLive(midiToFreq(m));
	};
	const onUp = (): void => {
		if (dragRef.current < 0) return;
		dragRef.current = -1;
		stopLive();
	};

	/* ---------- Loop ---------- */
	useEffect(() => {
		const resize = (): void => {
			const wrap = wrapRef.current;
			const cv = canvasRef.current;
			if (!wrap || !cv) return;
			const w = wrap.clientWidth;
			const h = Math.round(clamp(w * 0.5, 260, 400));
			const dpr = window.devicePixelRatio || 1;
			dimRef.current = { w, h };
			cv.style.height = `${h}px`;
			cv.width = Math.round(w * dpr);
			cv.height = Math.round(h * dpr);
			const ctx = cv.getContext('2d');
			if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		};
		resize();
		const ro = new ResizeObserver(resize);
		if (wrapRef.current) ro.observe(wrapRef.current);
		let last = performance.now();
		const frameLoop = (now: number): void => {
			animRef.current += Math.min(now - last, 100) / 1000;
			last = now;
			draw();
			rafRef.current = requestAnimationFrame(frameLoop);
		};
		rafRef.current = requestAnimationFrame(frameLoop);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(rafRef.current);
			stopLive();
			void ctxRef.current?.close();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);
	useEffect(() => {
		namesRef.current = showNames;
	}, [showNames]);
	useEffect(() => {
		levelRef.current = level;
	}, [level]);

	/* ---------- Draw ---------- */
	const spectrumColor = (s: number, bright: number): string => {
		const hue = clamp(248 - (s / (SEG - 1)) * 248, 0, 248); // bottom blue → top red
		return `hsl(${hue}, 92%, ${bright}%)`;
	};
	const drawAvatar = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void => {
		ctx.fillStyle = '#ffd54a';
		ctx.beginPath();
		ctx.arc(x, y, r, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#2a2118';
		ctx.beginPath();
		ctx.arc(x - r * 0.32, y - r * 0.18, r * 0.16, 0, Math.PI * 2);
		ctx.arc(x + r * 0.32, y - r * 0.18, r * 0.16, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#2a2118';
		ctx.lineWidth = r * 0.14;
		ctx.beginPath();
		ctx.arc(x, y + r * 0.1, r * 0.42, 0.15 * Math.PI, 0.85 * Math.PI);
		ctx.stroke();
	};

	const draw = (): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const L = layout();
		const anim = animRef.current;
		const st = statusRef.current;
		const names = namesRef.current;
		const peaks = peaksRef.current;

		ctx.fillStyle = '#0b0e14';
		ctx.fillRect(0, 0, L.w, L.h);

		// Decorative spectrum floor across the whole frequency axis.
		const binW = 5;
		for (let x = L.xLo; x < L.xHi; x += binW) {
			const nrm = 0.5 + 0.5 * Math.sin(anim * 3 + x * 0.25);
			const hh = 4 + nrm * 10;
			ctx.fillStyle = 'rgba(90,120,160,0.16)';
			ctx.fillRect(x, L.base - hh, binW - 1.5, hh);
		}
		// Baseline + faint frequency ticks (one per semitone: analyser bins, no labels).
		ctx.strokeStyle = 'rgba(255,255,255,0.06)';
		ctx.lineWidth = 1;
		const { lo, hi } = rangeRef.current;
		for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
			const x = xForMidi(m);
			ctx.beginPath();
			ctx.moveTo(x, L.peakTop);
			ctx.lineTo(x, L.base);
			ctx.stroke();
		}
		ctx.strokeStyle = 'rgba(120,150,190,0.4)';
		ctx.beginPath();
		ctx.moveTo(0, L.base);
		ctx.lineTo(L.w, L.base);
		ctx.stroke();

		// Avatar / crossing.
		let avX = L.ledgeW * 0.5;
		let avY = L.base - 12;
		if (st === 'crossing' && crossRef.current) {
			const c = crossRef.current;
			const positions: [number, number][] = [[L.ledgeW * 0.5, L.base - 12]];
			c.order.forEach((idx) => positions.push([xForMidi(peaks[idx].midi), L.peakTop - 12]));
			positions.push([L.w - L.ledgeW * 0.5, L.base - 12]);
			const targetIdx = c.firstBad >= 0 ? c.firstBad + 1 : positions.length - 1;
			const segDur = 0.34;
			const el = anim - c.startedAt;
			const seg = Math.floor(el / segDur);
			if (seg >= targetIdx) {
				avX = positions[targetIdx][0];
				avY = positions[targetIdx][1];
				if (c.firstBad >= 0) {
					const fall = clamp((el - targetIdx * segDur) / 0.5, 0, 1);
					avY += fall * (L.h - avY + 40);
				}
				if (!c.settled) {
					c.settled = true;
					if (c.firstBad >= 0) {
						setAttempts((a) => a + 1);
						setFlash({ kind: 'bad', text: 'Plaf ! Un pic sonne faux — la note cède.' });
						setTimeout(() => {
							setFlash(null);
							crossRef.current = null;
							setStat('tuning');
						}, 950);
					} else {
						setFlash({ kind: 'ok', text: 'Spectre juste — traversée !' });
						setTimeout(() => {
							setFlash(null);
							setStat(levelRef.current + 1 >= LEVELS.length ? 'won' : 'levelclear');
						}, 800);
					}
				}
			} else {
				const f2 = el / segDur - seg;
				const [ax, ay] = positions[Math.min(seg, targetIdx)];
				const [bx, by] = positions[Math.min(seg + 1, targetIdx)];
				avX = lerp(ax, bx, f2);
				avY = lerp(ay, by, f2) - Math.sin(f2 * Math.PI) * 30;
			}
		}

		// Ledges (start + goal).
		ctx.fillStyle = '#243447';
		ctx.fillRect(0, L.base, L.ledgeW, L.h - L.base);
		ctx.fillRect(L.w - L.ledgeW, L.base, L.ledgeW, L.h - L.base);
		ctx.fillStyle = '#4cc9a0';
		ctx.font = 'bold 12px system-ui, sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('But', L.w - L.ledgeW * 0.5, L.base - 22);

		// Peaks: bright vertical spikes at their current frequency (X).
		const segH = (L.base - L.peakTop) / SEG;
		const spikeW = 12;
		peaks.forEach((pk, i) => {
			const x = xForMidi(pk.midi);
			for (let s = 0; s < SEG; s++) {
				const y = L.base - (s + 1) * segH + 1.5;
				ctx.fillStyle = spectrumColor(s, 56);
				ctx.shadowColor = spectrumColor(s, 62);
				ctx.shadowBlur = 6;
				ctx.fillRect(x - spikeW / 2, y, spikeW, segH - 2.5);
			}
			ctx.shadowBlur = 0;
			// Cap (the stepping platform).
			ctx.fillStyle = pk.locked ? '#cfe3ff' : dragRef.current === i ? '#ffffff' : '#eaf2ff';
			ctx.fillRect(x - spikeW / 2 - 3, L.peakTop - 3, spikeW + 6, 4);
			if (pk.locked) {
				ctx.fillStyle = '#9db7d8';
				ctx.font = '10px system-ui, sans-serif';
				ctx.fillText('🔒', x, L.peakTop - 14);
			}
			if (names) {
				ctx.fillStyle = 'rgba(230,240,255,0.9)';
				ctx.font = 'bold 11px system-ui, sans-serif';
				ctx.fillText(noteFull(pk.midi), x, L.peakTop - (pk.locked ? 26 : 14));
			}
		});

		drawAvatar(ctx, avX, avY, 11 + (st === 'tuning' ? Math.sin(anim * 4) * 0.6 : 0));
	};

	const lv = curLevel();

	return (
		<div className="ac-root">
			<style>{CSS}</style>

			<div className="ac-hud">
				<span className="ac-pill">
					Niveau <strong>{Math.min(level + 1, LEVELS.length)}</strong>/{LEVELS.length}
				</span>
				<span className="ac-pill ac-chord">
					{pitchName(lv.root)} {lv.chord.name}
				</span>
				<span className="ac-pill">🎹 {INSTRUMENTS[lv.instrument].label}</span>
				{attempts > 0 && <span className="ac-pill">Chutes {attempts}</span>}
			</div>

			<div className="ac-controls">
				<button className="ac-btn primary" onClick={hearChord} disabled={status === 'intro' || status === 'won'}>
					▶ Écouter l'accord
				</button>
				<button className="ac-btn" onClick={hearMine} disabled={status !== 'tuning'}>
					🎧 Ma version
				</button>
				<button className="ac-btn" onClick={hearPlaced} disabled={status !== 'tuning' || lv.prefill.length === 0}>
					🔒 Notes posées
				</button>
				<button className="ac-btn go" onClick={cross} disabled={status !== 'tuning'}>
					🏃 Traverser
				</button>
				<label className="ac-toggle">
					<input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} />
					Noms des notes
				</label>
			</div>

			<div className="ac-playwrap" ref={wrapRef}>
				<canvas ref={canvasRef} className="ac-canvas" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />

				{flash && <div className={`ac-flash ${flash.kind}`}>{flash.text}</div>}

				{status === 'intro' && (
					<div className="ac-overlay">
						<div className="ac-card">
							<h3>🎼 Accords &amp; Gouffres</h3>
							<p>
								Écoute l'accord, puis <b>fais glisser chaque pic à sa fréquence</b> sur le spectre (graves à gauche, aigus à droite) — à l'oreille, rien ne te dira si c'est juste.
								Traverse&nbsp;: l'avatar saute de pic en pic, un pic mal placé le fait chuter&nbsp;!
							</p>
							<button className="ac-btn primary big" onClick={startGame}>
								▶ Commencer
							</button>
						</div>
					</div>
				)}
				{status === 'levelclear' && (
					<div className="ac-overlay">
						<div className="ac-card">
							<h3>✅ Gouffre franchi&nbsp;!</h3>
							<p>
								{pitchName(lv.root)} {lv.chord.name} reconstitué.
							</p>
							<button className="ac-btn primary big" onClick={nextLevel}>
								Niveau suivant →
							</button>
						</div>
					</div>
				)}
				{status === 'won' && (
					<div className="ac-overlay">
						<div className="ac-card">
							<h3>🏆 Bravo&nbsp;!</h3>
							<p>Tu as reconstitué tous les spectres, du simple triade à l'accord le plus tordu.</p>
							<button className="ac-btn primary big" onClick={restart}>
								↻ Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="ac-help">
				Prototype — sur un analyseur de spectre, chaque note est un <b>pic</b> à une fréquence. Glisse les pics <b>horizontalement</b> pour les poser aux bonnes fréquences. Aucun retour de justesse&nbsp;: fie-toi à l'oreille («&nbsp;Ma version&nbsp;» pour comparer). Les pics <b>🔒</b> sont des aides&nbsp;: «&nbsp;Notes posées&nbsp;» ou tape-les pour les entendre.
			</p>
		</div>
	);
}

const CSS = `
.ac-root { --ac: var(--accent-regular); width: 100%; max-width: 720px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
.ac-hud { display: flex; gap: 0.4rem; flex-wrap: wrap; justify-content: center; margin-bottom: 0.55rem; font-size: 13px; font-weight: 600; }
.ac-pill { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 12px; }
.ac-pill.ac-chord { background: var(--ac); color: var(--accent-text-over); }
.ac-pill strong { margin: 0 2px; }
.ac-controls { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; align-items: center; margin-bottom: 0.6rem; }
.ac-btn { border: 1.5px solid var(--gray-700); background: var(--gray-900); color: var(--gray-0); font: inherit; font-weight: 600; font-size: 13.5px; border-radius: 999px; padding: 8px 15px; cursor: pointer; }
.ac-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ac-btn.primary { background: var(--ac); color: var(--accent-text-over); border-color: var(--ac); }
.ac-btn.go { background: #2f9e6f; color: #fff; border-color: #2f9e6f; }
.ac-btn.big { font-size: 15px; padding: 11px 26px; margin-top: 4px; }
.ac-toggle { display: flex; align-items: center; gap: 5px; font-size: 13px; color: var(--gray-200); cursor: pointer; }
.ac-toggle input { width: 15px; height: 15px; accent-color: var(--ac); cursor: pointer; }
.ac-playwrap { width: 100%; position: relative; border-radius: 14px; overflow: hidden; box-shadow: var(--shadow-md); }
.ac-canvas { display: block; width: 100%; touch-action: none; user-select: none; -webkit-user-select: none; cursor: grab; }
.ac-canvas:active { cursor: grabbing; }
.ac-flash { position: absolute; top: 12px; left: 50%; transform: translateX(-50%); padding: 7px 16px; border-radius: 999px; font-weight: 700; font-size: 13px; z-index: 3; box-shadow: var(--shadow-md); }
.ac-flash.ok { background: #2f9e6f; color: #fff; }
.ac-flash.bad { background: #c0392b; color: #fff; }
.ac-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.55); backdrop-filter: blur(3px); padding: 1rem; }
.ac-card { background: var(--gray-999); border: 2px solid var(--ac); border-radius: 16px; padding: 20px 22px; max-width: 23rem; text-align: center; box-shadow: var(--shadow-lg); }
.ac-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-xl); }
.ac-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.55; margin: 0 0 0.9rem; }
.ac-help { max-width: 620px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
