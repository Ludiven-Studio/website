import { useEffect, useRef, useState, useCallback } from 'react';

/* =====================================================
   ACCORDS & GOUFFRES — prototype (ear-training + platformer skin).
   Hear a chord, rebuild it by tuning vertical bars (bass left → treble
   right). Each note tuned within tolerance solidifies a bridge tile; when
   all tiles are solid the avatar crosses the chasm → next level. Wrong
   note = the avatar drops through the phantom tile. Web Audio, no assets.
   ===================================================== */

const NOTE_FR = ['Do', 'Do♯', 'Ré', 'Ré♯', 'Mi', 'Fa', 'Fa♯', 'Sol', 'Sol♯', 'La', 'La♯', 'Si'];
const midiToFreq = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
const pitchName = (m: number): string => NOTE_FR[((Math.round(m) % 12) + 12) % 12];
const noteFull = (m: number): string => `${pitchName(m)}${Math.floor(Math.round(m) / 12) - 1}`;
const centsOff = (midi: number, target: number): number => (midi - target) * 100;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

const PASS = 45; // cents tolerance to solidify a tile
const PERFECT = 15; // cents for a "parfait"

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
	prefill: number[]; // indices (into sorted notes) given for free
}
const LEVELS: Level[] = [
	{ root: 52, chord: { name: 'Majeur', offs: [0, 4, 7] }, instrument: 'piano', prefill: [0] },
	{ root: 57, chord: { name: 'Mineur', offs: [0, 3, 7] }, instrument: 'piano', prefill: [0] },
	{ root: 50, chord: { name: 'sus4', offs: [0, 5, 7] }, instrument: 'synthe', prefill: [2] },
	{ root: 53, chord: { name: 'Majeur 7', offs: [0, 4, 7, 11] }, instrument: 'orgue', prefill: [0, 2] },
	{ root: 55, chord: { name: '7 (dominante)', offs: [0, 4, 7, 10] }, instrument: 'cordes', prefill: [0] },
	{ root: 47, chord: { name: 'Majeur 9', offs: [0, 4, 7, 11, 14] }, instrument: 'cordes', prefill: [0, 4] },
	{ root: 52, chord: { name: 'Mineur 9', offs: [0, 3, 7, 10, 14] }, instrument: 'orgue', prefill: [0, 3] },
];

interface Bar {
	target: number; // exact midi to reach
	midi: number; // current player value (float)
	locked: boolean;
}
type Status = 'intro' | 'tuning' | 'crossing' | 'levelclear' | 'won';
interface Cross {
	firstBad: number; // -1 = all good
	startedAt: number;
	settled: boolean;
}

export default function AccordsGame() {
	const [status, setStatus] = useState<Status>('intro');
	const [level, setLevel] = useState(0);
	const [assisted, setAssisted] = useState(true);
	const [tunedCount, setTunedCount] = useState(0);
	const [attempts, setAttempts] = useState(0);
	const [flash, setFlash] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const dimRef = useRef({ w: 640, h: 384 });
	const barsRef = useRef<Bar[]>([]);
	const rangeRef = useRef({ lo: 48, hi: 72 });
	const dragRef = useRef<number>(-1);
	const crossRef = useRef<Cross | null>(null);
	const animRef = useRef(0);
	const rafRef = useRef(0);
	const statusRef = useRef<Status>('intro');
	const assistedRef = useRef(true);
	const levelRef = useRef(0); // mirror for the rAF draw closure (captured once)

	// Audio
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

	/* ---------- Level setup ---------- */
	const curLevel = (): Level => LEVELS[Math.min(level, LEVELS.length - 1)];
	const targetsOf = (lv: Level): number[] => lv.chord.offs.map((o) => lv.root + o).sort((a, b) => a - b);

	const buildLevel = useCallback((idx: number): void => {
		const lv = LEVELS[idx];
		const targets = lv.chord.offs.map((o) => lv.root + o).sort((a, b) => a - b);
		const lo = Math.min(...targets) - 3;
		const hi = Math.max(...targets) + 3;
		rangeRef.current = { lo, hi };
		const mid = (lo + hi) / 2;
		barsRef.current = targets.map((tm, i) => ({
			target: tm,
			midi: lv.prefill.includes(i) ? tm : mid,
			locked: lv.prefill.includes(i),
		}));
		dragRef.current = -1;
		crossRef.current = null;
		setTunedCount(barsRef.current.filter((b) => Math.abs(centsOff(b.midi, b.target)) <= PASS).length);
	}, []);

	const tunedFlags = (): boolean[] => barsRef.current.map((b) => Math.abs(centsOff(b.midi, b.target)) <= PASS);

	/* ---------- Geometry ---------- */
	const layout = () => {
		const { w, h } = dimRef.current;
		const groundY = h * 0.72;
		const ledgeW = w * 0.15;
		const x0 = ledgeW;
		const x1 = w - ledgeW;
		const n = barsRef.current.length;
		const slot = (x1 - x0) / Math.max(1, n);
		const trackTop = h * 0.09;
		const trackBottom = groundY - 16;
		return { w, h, groundY, ledgeW, x0, x1, n, slot, trackTop, trackBottom };
	};
	const barX = (i: number): number => {
		const L = layout();
		return L.x0 + (i + 0.5) * L.slot;
	};
	const yForMidi = (m: number): number => {
		const L = layout();
		const { lo, hi } = rangeRef.current;
		return L.trackBottom - ((m - lo) / (hi - lo)) * (L.trackBottom - L.trackTop);
	};
	const midiForY = (y: number): number => {
		const L = layout();
		const { lo, hi } = rangeRef.current;
		const f = (L.trackBottom - y) / (L.trackBottom - L.trackTop);
		return clamp(lo + f * (hi - lo), lo, hi);
	};

	/* ---------- Buttons ---------- */
	const hearChord = (): void => {
		const lv = curLevel();
		playChord(targetsOf(lv).map(midiToFreq), INSTRUMENTS[lv.instrument]);
	};
	const hearMine = (): void => {
		const lv = curLevel();
		playChord(barsRef.current.map((b) => midiToFreq(b.midi)), INSTRUMENTS[lv.instrument]);
	};

	const cross = (): void => {
		if (statusRef.current !== 'tuning') return;
		const flags = tunedFlags();
		const firstBad = flags.findIndex((ok) => !ok);
		crossRef.current = { firstBad, startedAt: animRef.current, settled: false };
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
		setTimeout(hearChordRef.current, 250);
	};
	const hearChordRef = useRef(hearChord);
	hearChordRef.current = hearChord;

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
		return {
			x: (e.clientX - rect.left) * (dimRef.current.w / rect.width),
			y: (e.clientY - rect.top) * (dimRef.current.h / rect.height),
		};
	};
	const onDown = (e: React.PointerEvent): void => {
		if (statusRef.current !== 'tuning') return;
		const p = posFrom(e);
		const L = layout();
		let best = -1;
		let bestD = L.slot * 0.5;
		barsRef.current.forEach((b, i) => {
			const d = Math.abs(p.x - barX(i));
			if (d < bestD && !b.locked) {
				bestD = d;
				best = i;
			}
		});
		if (best < 0) return;
		dragRef.current = best;
		canvasRef.current?.setPointerCapture(e.pointerId);
		const m = midiForY(p.y);
		barsRef.current[best].midi = m;
		startLive(midiToFreq(m), INSTRUMENTS[curLevel().instrument]);
		syncTuned();
	};
	const onMove = (e: React.PointerEvent): void => {
		const i = dragRef.current;
		if (i < 0) return;
		const p = posFrom(e);
		const m = midiForY(p.y);
		barsRef.current[i].midi = m;
		setLive(midiToFreq(m));
		syncTuned();
	};
	const onUp = (): void => {
		if (dragRef.current < 0) return;
		dragRef.current = -1;
		stopLive();
		syncTuned();
	};
	const syncTuned = (): void => setTunedCount(tunedFlags().filter(Boolean).length);

	/* ---------- Loop ---------- */
	useEffect(() => {
		const resize = (): void => {
			const wrap = wrapRef.current;
			const cv = canvasRef.current;
			if (!wrap || !cv) return;
			const w = wrap.clientWidth;
			const h = Math.round(clamp(w * 0.6, 280, 460));
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
		const frame = (now: number): void => {
			animRef.current += Math.min(now - last, 100) / 1000;
			last = now;
			draw();
			rafRef.current = requestAnimationFrame(frame);
		};
		rafRef.current = requestAnimationFrame(frame);
		return () => {
			ro.disconnect();
			cancelAnimationFrame(rafRef.current);
			stopLive();
			void ctxRef.current?.close();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		assistedRef.current = assisted;
	}, [assisted]);
	useEffect(() => {
		levelRef.current = level;
	}, [level]);

	/* ---------- Draw ---------- */
	const draw = (): void => {
		const cv = canvasRef.current;
		if (!cv) return;
		const ctx = cv.getContext('2d');
		if (!ctx) return;
		const L = layout();
		const anim = animRef.current;
		const assist = assistedRef.current;
		const st = statusRef.current;

		// Sky
		const sky = ctx.createLinearGradient(0, 0, 0, L.h);
		sky.addColorStop(0, '#12263f');
		sky.addColorStop(1, '#24405f');
		ctx.fillStyle = sky;
		ctx.fillRect(0, 0, L.w, L.h);

		// Chasm depth
		ctx.fillStyle = 'rgba(0,0,0,0.35)';
		ctx.fillRect(L.x0, L.groundY, L.x1 - L.x0, L.h - L.groundY);

		const flags = tunedFlags();

		// Crossing avatar position
		let avX = L.ledgeW * 0.5;
		let avY = L.groundY - 16;
		if (st === 'crossing' && crossRef.current) {
			const c = crossRef.current;
			const positions = [L.ledgeW * 0.5, ...barsRef.current.map((_, i) => barX(i)), L.w - L.ledgeW * 0.5];
			const targetIdx = c.firstBad >= 0 ? c.firstBad + 1 : positions.length - 1;
			const segDur = 0.32;
			const el = anim - c.startedAt;
			const seg = Math.floor(el / segDur);
			if (seg >= targetIdx) {
				avX = positions[targetIdx];
				if (c.firstBad >= 0) {
					const fall = clamp((el - targetIdx * segDur) / 0.5, 0, 1);
					avY = L.groundY - 16 + fall * (L.h - L.groundY + 40);
				} else {
					avY = L.groundY - 16;
				}
				if (!c.settled) {
					c.settled = true;
					if (c.firstBad >= 0) {
						setAttempts((a) => a + 1);
						setFlash({ kind: 'bad', text: 'Plaf ! Note fausse — la dalle cède.' });
						setTimeout(() => {
							setFlash(null);
							crossRef.current = null;
							setStat('tuning');
						}, 900);
					} else {
						setFlash({ kind: 'ok', text: 'Accord juste — traversée !' });
						setTimeout(() => {
							setFlash(null);
							setStat(levelRef.current + 1 >= LEVELS.length ? 'won' : 'levelclear');
						}, 800);
					}
				}
			} else {
				const frac = el / segDur - seg;
				avX = lerp(positions[Math.min(seg, targetIdx)], positions[Math.min(seg + 1, targetIdx)], frac);
			}
		}

		// Ledges
		const drawLedge = (x: number, w: number): void => {
			ctx.fillStyle = '#3a6b3f';
			ctx.fillRect(x, L.groundY, w, 10);
			ctx.fillStyle = '#5b4636';
			ctx.fillRect(x, L.groundY + 10, w, L.h - L.groundY - 10);
		};
		drawLedge(0, L.ledgeW);
		drawLedge(L.w - L.ledgeW, L.ledgeW);

		// Tiles + bars
		barsRef.current.forEach((b, i) => {
			const x = barX(i);
			const solid = flags[i];
			const cents = centsOff(b.midi, b.target);
			// bridge tile
			const tw = L.slot * 0.74;
			const th = 14;
			ctx.save();
			if (solid) {
				ctx.fillStyle = '#e6b35a';
				ctx.fillRect(x - tw / 2, L.groundY, tw, th);
				ctx.fillStyle = 'rgba(0,0,0,0.18)';
				ctx.fillRect(x - tw / 2, L.groundY + th - 3, tw, 3);
			} else {
				ctx.setLineDash([5, 4]);
				ctx.strokeStyle = 'rgba(230,180,90,0.5)';
				ctx.lineWidth = 1.5;
				ctx.strokeRect(x - tw / 2, L.groundY, tw, th);
			}
			ctx.restore();
			// order number (obstacle: crossing order = left→right)
			ctx.fillStyle = solid ? '#3a2a12' : 'rgba(255,255,255,0.55)';
			ctx.font = 'bold 11px system-ui, sans-serif';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(String(i + 1), x, L.groundY + th / 2);

			// track
			ctx.fillStyle = 'rgba(255,255,255,0.07)';
			ctx.fillRect(x - 5, L.trackTop, 10, L.trackBottom - L.trackTop);
			const y = yForMidi(b.midi);
			// fill from bottom up to handle (visualizer bar)
			let col = '#8aa0b8';
			if (assist || b.locked) col = Math.abs(cents) <= PASS ? '#49d67f' : Math.abs(cents) <= 120 ? '#e8b53a' : '#8aa0b8';
			if (b.locked) col = '#7db2e6';
			ctx.fillStyle = col;
			ctx.globalAlpha = 0.55;
			ctx.fillRect(x - 5, y, 10, L.trackBottom - y);
			ctx.globalAlpha = 1;
			// handle
			ctx.beginPath();
			ctx.arc(x, y, b.locked ? 8 : 9, 0, Math.PI * 2);
			ctx.fillStyle = col;
			ctx.fill();
			if (dragRef.current === i) {
				ctx.strokeStyle = '#fff';
				ctx.lineWidth = 2;
				ctx.stroke();
			}
			if (b.locked) {
				ctx.fillStyle = '#123';
				ctx.font = '9px system-ui';
				ctx.fillText('🔒', x, y);
			}
			// note name (assisted or locked)
			if (assist || b.locked) {
				ctx.fillStyle = '#dfe8f2';
				ctx.font = 'bold 11px system-ui, sans-serif';
				ctx.fillText(noteFull(b.midi), x, y - 16);
			}
			// perfect star
			if ((assist || b.locked) && Math.abs(cents) <= PERFECT && !b.locked) {
				ctx.fillText('★', x + 16, y);
			}
		});

		// Avatar
		ctx.save();
		ctx.translate(avX, avY + Math.sin(anim * 4) * (st === 'tuning' ? 1.2 : 0));
		ctx.fillStyle = '#ffd97a';
		ctx.beginPath();
		ctx.arc(0, 0, 11, 0, Math.PI * 2);
		ctx.fill();
		ctx.fillStyle = '#2a2118';
		ctx.beginPath();
		ctx.arc(-3.5, -2, 1.8, 0, Math.PI * 2);
		ctx.arc(3.5, -2, 1.8, 0, Math.PI * 2);
		ctx.fill();
		ctx.strokeStyle = '#2a2118';
		ctx.lineWidth = 1.4;
		ctx.beginPath();
		ctx.arc(0, 2, 4, 0.15 * Math.PI, 0.85 * Math.PI);
		ctx.stroke();
		ctx.restore();
	};

	const lv = curLevel();
	const total = barsRef.current.length;

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
				<span className="ac-pill">
					Accordées <strong>{tunedCount}</strong>/{total}
				</span>
				{attempts > 0 && <span className="ac-pill">Chutes {attempts}</span>}
			</div>

			<div className="ac-controls">
				<button className="ac-btn primary" onClick={hearChord} disabled={status === 'intro' || status === 'won'}>
					▶ Écouter l'accord
				</button>
				<button className="ac-btn" onClick={hearMine} disabled={status !== 'tuning'}>
					🎧 Ma version
				</button>
				<button className="ac-btn go" onClick={cross} disabled={status !== 'tuning'}>
					🏃 Traverser
				</button>
				<label className="ac-toggle">
					<input type="checkbox" checked={assisted} onChange={(e) => setAssisted(e.target.checked)} />
					Aide oreille
				</label>
			</div>

			<div className="ac-playwrap" ref={wrapRef}>
				<canvas
					ref={canvasRef}
					className="ac-canvas"
					onPointerDown={onDown}
					onPointerMove={onMove}
					onPointerUp={onUp}
					onPointerLeave={onUp}
				/>

				{flash && <div className={`ac-flash ${flash.kind}`}>{flash.text}</div>}

				{status === 'intro' && (
					<div className="ac-overlay">
						<div className="ac-card">
							<h3>🎼 Accords &amp; Gouffres</h3>
							<p>
								Écoute l'accord, puis <b>accorde chaque barre</b> (graves à gauche, aigus à droite) pour retrouver ses notes.
								Chaque note juste solidifie une <b>dalle</b> du pont. Toutes justes&nbsp;? Tu traverses le gouffre&nbsp;!
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
							<p>Tu as franchi tous les gouffres. Oreille absolue en approche&nbsp;!</p>
							<button className="ac-btn primary big" onClick={restart}>
								↻ Rejouer
							</button>
						</div>
					</div>
				)}
			</div>

			<p className="ac-help">
				Prototype — glisse les poignées pour régler la hauteur de chaque note. Les barres <b>🔒 verrouillées</b> sont des aides.
				En mode « Aide oreille », les barres virent au vert quand elles sont justes ; décoche pour jouer à l'oreille pure.
			</p>
		</div>
	);
}

const CSS = `
.ac-root { --ac: var(--accent-regular); width: 100%; max-width: 680px; margin-inline: auto; color: var(--gray-0); font-family: var(--font-body); display: flex; flex-direction: column; align-items: center; }
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
.ac-overlay { position: absolute; inset: 0; z-index: 2; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.5); backdrop-filter: blur(3px); padding: 1rem; }
.ac-card { background: var(--gray-999); border: 2px solid var(--ac); border-radius: 16px; padding: 20px 22px; max-width: 22rem; text-align: center; box-shadow: var(--shadow-lg); }
.ac-card h3 { margin: 0 0 0.5rem; font-family: var(--font-brand); font-size: var(--text-xl); }
.ac-card p { color: var(--gray-200); font-size: 13.5px; line-height: 1.55; margin: 0 0 0.9rem; }
.ac-help { max-width: 560px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 0.9rem; }
`;
