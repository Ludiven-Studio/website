// Gestures: short, no-fail versions of the craft each restoration scene tells (docs/atelier-enigmes.md).
// Eight reusable shapes: slide, crank, hold, choose, coins, place, pins, fling (+ rub, in Puzzles.tsx).
// Touch input goes through usePointerDrag only: the one drag path that holds on a real iPhone.

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { usePointerDrag } from '../usePointerDrag';
import { RubGesture, RUBS } from './Puzzles';
import * as sfx from './sfx';

/** Drag in SVG units: start/move/end get the point in the svg's own coordinates. */
function useSvgDrag(
	ref: RefObject<SVGSVGElement | null>,
	start: (x: number, y: number, el: Element | null) => void,
	move: (x: number, y: number) => void,
	end: (x: number, y: number) => void,
) {
	const at = (cx: number, cy: number) => {
		const m = ref.current?.getScreenCTM();
		if (!m) return { x: 0, y: 0 };
		const p = new DOMPoint(cx, cy).matrixTransform(m.inverse());
		return { x: p.x, y: p.y };
	};
	return usePointerDrag(
		(cx, cy) => { const p = at(cx, cy); start(p.x, p.y, document.elementFromPoint(cx, cy)); },
		(cx, cy) => { const p = at(cx, cy); move(p.x, p.y); },
		(cx, cy) => { const p = at(cx, cy); end(p.x, p.y); },
	);
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

/** Once: play the restore sound, show `done`, then hand over to the scene. */
function useFinish(onSolve: () => void) {
	const [done, setDone] = useState(false);
	// A ref, not the state: handlers held by effects or document listeners may carry an old `done`.
	const once = useRef(false);
	const finish = () => {
		if (once.current) return;
		once.current = true;
		setDone(true);
		sfx.restore();
		setTimeout(onSolve, 1500);
	};
	return [done, finish] as const;
}

function Frame({ ask, done, doneText, hint, children }: { ask: string; done: boolean; doneText: string; hint: string; children: ReactNode }) {
	return (
		<div className="atg">
			<p>{ask}</p>
			{children}
			<p className="at-small">{done ? doneText : hint}</p>
		</div>
	);
}

// ---------- slide: a cursor along a track ----------
interface SlideCfg {
	ask: string; doneText: string; hint: string;
	/** Where the gesture succeeds: a band [a, b] (release inside it) or 'end' (pull it all the way). */
	target: [number, number] | 'end';
	art: (v: number) => ReactNode;
	/** Track in SVG units, inside a 260 x 170 view. */
	track: { x1: number; y1: number; x2: number; y2: number };
	start?: number;
}

function Slide({ cfg, onSolve }: { cfg: SlideCfg; onSolve: () => void }) {
	const ref = useRef<SVGSVGElement>(null);
	const [v, setVState] = useState(cfg.start ?? 0);
	// Moves render a frame late: the release reads this, always current.
	const live = useRef(v);
	const setV = (nv: number) => { live.current = nv; setVState(nv); };
	const [done, finish] = useFinish(onSolve);
	const grab = useRef(false);
	const { x1, y1, x2, y2 } = cfg.track;
	const along = (x: number, y: number) => {
		const dx = x2 - x1, dy = y2 - y1;
		return clamp(((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy));
	};
	const ok = (val: number) => (cfg.target === 'end' ? val > 0.93 : val >= cfg.target[0] && val <= cfg.target[1]);
	const { onPointerDown } = useSvgDrag(ref,
		(x, y) => { if (done) return; grab.current = true; setV(along(x, y)); },
		(x, y) => {
			if (!grab.current || done) return;
			const nv = along(x, y);
			setV(nv);
			if (cfg.target === 'end' && ok(nv)) { grab.current = false; setV(1); finish(); }
		},
		() => { if (!grab.current) return; grab.current = false; if (ok(live.current)) finish(); },
	);
	const hx = x1 + (x2 - x1) * v, hy = y1 + (y2 - y1) * v;
	return (
		<Frame ask={cfg.ask} done={done} doneText={cfg.doneText} hint={cfg.hint}>
			<svg ref={ref} viewBox="0 0 260 170" className="atg-board atx-board" onPointerDown={onPointerDown}>
				{cfg.art(v)}
				<line x1={x1} y1={y1} x2={x2} y2={y2} className="atx-track" />
				<circle cx={hx} cy={hy} r="11" className={`atx-handle ${done ? 'ok' : ''}`} />
			</svg>
		</Frame>
	);
}

// Deterministic "noise" so the static looks the same at each render.
const NOISE = Array.from({ length: 48 }, (_, k) => Math.sin(k * 12.9898) * 43758.5453 % 1);

const SLIDES: Record<string, SlideCfg> = {
	radio: {
		ask: 'Fais glisser l’aiguille sur le cadran jusqu’à ce que le grésillement devienne une voix.',
		doneText: '« … ici Mémoires du port. »', hint: 'Lâche l’aiguille quand la voix est nette.',
		target: [0.64, 0.72], track: { x1: 30, y1: 150, x2: 230, y2: 150 }, start: 0.15,
		art: (v) => {
			const noise = clamp(Math.abs(v - 0.68) * 5);
			const pts = NOISE.map((n, k) => `${20 + k * 4.6} ${78 + Math.sin(k * 0.55) * 12 * (1 - noise) + n * 26 * noise}`).join(' L');
			return (
				<>
					<rect x="10" y="10" width="240" height="122" rx="14" className="atx-wood" />
					<rect x="22" y="22" width="216" height="34" rx="6" className="atx-dial" />
					{Array.from({ length: 21 }, (_, k) => <line key={k} x1={30 + k * 10} y1="44" x2={30 + k * 10} y2={k % 5 ? 50 : 54} className="atx-tick" />)}
					<line x1={30 + 200 * v} y1="24" x2={30 + 200 * v} y2="56" className="atx-needle" />
					<path d={`M${pts}`} className={`atx-wave ${noise < 0.3 ? 'clear' : ''}`} />
					<rect x="22" y="106" width="216" height="18" rx="4" className="atx-grille" />
				</>
			);
		},
	},
	nettete: {
		ask: 'Fais coulisser le tube de la longue-vue jusqu’à ce que l’image soit nette.',
		doneText: 'Le port, net comme au premier jour.', hint: 'Lâche le tube quand l’image est nette.',
		target: [0.6, 0.72], track: { x1: 40, y1: 152, x2: 220, y2: 152 }, start: 0.1,
		art: (v) => (
			<>
				<defs><filter id="atx-blur"><feGaussianBlur stdDeviation={(Math.abs(v - 0.66) * 14).toFixed(2)} /></filter><clipPath id="atx-lens"><circle cx="130" cy="70" r="58" /></clipPath></defs>
				<g clipPath="url(#atx-lens)">
					<g filter="url(#atx-blur)">
						<rect x="60" y="0" width="140" height="80" fill="#bcd6e2" />
						<rect x="60" y="80" width="140" height="60" fill="#4f7f96" />
						<rect x="80" y="70" width="100" height="10" fill="#6b5a3a" />
						{[92, 104, 150, 162].map((x) => <path key={x} d={`M${x} 70 v-26 l9 9 h-9`} stroke="#3a2a1a" strokeWidth="1.5" fill="#f4ead4" />)}
						<rect x="118" y="44" width="22" height="26" fill="#d8c9a6" /><path d="M115 44 l14 -11 l14 11z" fill="#5a3a22" />
					</g>
				</g>
				<circle cx="130" cy="70" r="58" fill="none" stroke="#7a5a12" strokeWidth="6" />
			</>
		),
	},
	notice: {
		ask: 'Le petit tiroir de la travailleuse résiste. Tire-le doucement.',
		doneText: 'Au fond, une feuille pliée : la notice de famille.', hint: 'Tire le tiroir jusqu’au bout.',
		target: 'end', track: { x1: 60, y1: 150, x2: 210, y2: 150 },
		art: (v) => (
			<>
				<rect x="20" y="20" width="220" height="110" rx="6" className="atx-wood" />
				<rect x="50" y="62" width="120" height="44" className="atx-hole" />
				<g transform={`translate(${v * 80} 0)`}>
					<rect x="50" y="62" width="120" height="44" className="atx-drawer" />
					<circle cx="110" cy="84" r="4" className="atx-knob" />
					{v > 0.5 && <rect x="58" y="68" width={Math.min(60, v * 60)} height="30" className="atx-paper" transform="rotate(-4 80 80)" />}
				</g>
			</>
		),
	},
	rabat: {
		ask: 'Le rabat de la reliure est plus épais que l’autre. Soulève-le.',
		doneText: 'Un papier plié glisse du rabat.', hint: 'Soulève le rabat jusqu’au bout.',
		target: 'end', track: { x1: 70, y1: 150, x2: 210, y2: 150 },
		art: (v) => (
			<>
				<rect x="40" y="20" width="180" height="110" rx="4" className="atx-leather" />
				<rect x="50" y="28" width="160" height="94" className="atx-page" />
				{v > 0.3 && <rect x="70" y="50" width="90" height="50" className="atx-paper" transform={`translate(${(v - 0.3) * 60} 0) rotate(-3 115 75)`} />}
				<path d={`M50 28 L${50 + 160 * (1 - v * 0.85)} 28 L${50 + 160 * (1 - v * 0.85)} 122 L50 122z`} className="atx-flap" />
			</>
		),
	},
	etal: {
		ask: 'Les charnières tiennent. Ouvre la valise en grand.',
		doneText: 'Elle s’ouvre en éventail, et elle tient debout.', hint: 'Ouvre-la jusqu’au bout.',
		target: 'end', track: { x1: 60, y1: 155, x2: 210, y2: 155 },
		art: (v) => (
			<>
				<rect x="40" y="96" width="180" height="40" rx="5" className="atx-case" />
				<g style={{ transform: `rotate(${-v * 105}deg)`, transformOrigin: '40px 96px' }}>
					<rect x="40" y="56" width="180" height="40" rx="5" className="atx-case" />
					{v > 0.6 && [70, 110, 150, 190].map((x) => <circle key={x} cx={x} cy="76" r="3" className="atx-hole" />)}
				</g>
				{[70, 110, 150, 190].map((x) => <circle key={x} cx={x} cy="116" r="3" className="atx-hole" />)}
			</>
		),
	},
};

// ---------- crank: turn around a hub until enough turns ----------
function Crank({ kind, onSolve }: { kind: 'musique' | 'boussole'; onSolve: () => void }) {
	const ref = useRef<SVGSVGElement>(null);
	const [angle, setAngle] = useState(0);
	const total = useRef(0);
	const last = useRef<number | null>(null);
	const [done, finish] = useFinish(onSolve);
	const need = kind === 'musique' ? 720 : 360;
	const C = kind === 'musique' ? { x: 170, y: 90 } : { x: 130, y: 85 };
	const ang = (x: number, y: number) => (Math.atan2(y - C.y, x - C.x) * 180) / Math.PI;
	const { onPointerDown } = useSvgDrag(ref,
		(x, y) => { if (!done) last.current = ang(x, y); },
		(x, y) => {
			if (last.current === null || done) return;
			const a = ang(x, y);
			const d = ((a - last.current + 540) % 360) - 180;
			last.current = a;
			total.current += Math.abs(d);
			setAngle((v) => v + d);
			if (total.current >= need) { last.current = null; finish(); }
		},
		() => { last.current = null; },
	);
	const p = clamp(total.current / need);
	return (
		<Frame
			ask={kind === 'musique' ? 'Tourne la manivelle pour remonter le mécanisme.' : 'L’aiguille est coincée. Fais tourner le boîtier sur lui-même pour la libérer.'}
			done={done}
			doneText={kind === 'musique' ? 'Les premières notes montent, un peu hésitantes, puis la mélodie entière.' : 'L’aiguille frémit, puis se cale sur le nord.'}
			hint="Fais tourner du doigt, en rond."
		>
			<svg ref={ref} viewBox="0 0 260 170" className="atg-board atx-board" onPointerDown={onPointerDown}>
				{kind === 'musique' ? (
					<>
						<rect x="30" y="50" width="120" height="80" rx="8" className="atx-lacquer" />
						<rect x="44" y="64" width="92" height="30" rx="4" className="atx-comb" />
						<g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${C.x}px ${C.y}px` }}>
							<line x1={C.x} y1={C.y} x2={C.x + 34} y2={C.y} className="atx-crank" />
							<circle cx={C.x + 34} cy={C.y} r="8" className="atx-knob" />
						</g>
						<circle cx={C.x} cy={C.y} r="6" className="atx-knob" />
						{Array.from({ length: Math.floor(p * 5) }, (_, k) => <text key={k} x={50 + k * 22} y={40 - (k % 2) * 10} className="atx-note">♪</text>)}
					</>
				) : (
					<>
						<g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${C.x}px ${C.y}px` }}>
							<circle cx={C.x} cy={C.y} r="66" className="atx-brass" />
							<circle cx={C.x} cy={C.y} r="54" className="atx-face" />
							{['N', 'E', 'S', 'O'].map((t, k) => <text key={t} x={C.x + 44 * Math.sin((k * Math.PI) / 2)} y={C.y - 44 * Math.cos((k * Math.PI) / 2) + 5} textAnchor="middle" className="atx-cardinal">{t}</text>)}
							{/* Stuck: the needle turns with the case until it frees. */}
							{!done && <path d={`M${C.x} ${C.y - 40} L${C.x + 6} ${C.y} L${C.x} ${C.y + 40} L${C.x - 6} ${C.y}z`} className="atx-needle-c" transform={`rotate(120 ${C.x} ${C.y})`} />}
						</g>
						{done && <path d={`M${C.x} ${C.y - 40} L${C.x + 6} ${C.y} L${C.x} ${C.y + 40} L${C.x - 6} ${C.y}z`} className="atx-needle-c free" />}
					</>
				)}
				<rect x="20" y="158" width={220 * p} height="5" rx="2.5" className="atx-progress" />
			</svg>
		</Frame>
	);
}

// ---------- hold: keep a finger down until it takes ----------
function Hold({ onSolve }: { onSolve: () => void }) {
	const [p, setP] = useState(0);
	const pRef = useRef(0);
	const holding = useRef(false);
	const [done, finish] = useFinish(onSolve);
	const finishRef = useRef(finish);
	finishRef.current = finish;
	useEffect(() => {
		let raf = 0, t = performance.now();
		const tick = (now: number) => {
			const dt = (now - t) / 1000;
			t = now;
			pRef.current = clamp(pRef.current + (holding.current ? dt / 1.6 : -dt / 1.2));
			if (pRef.current >= 1 && holding.current) { holding.current = false; finishRef.current(); }
			setP(pRef.current);
			raf = requestAnimationFrame(tick);
		};
		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, []);
	const { onPointerDown } = usePointerDrag(() => { if (!done) holding.current = true; }, () => {}, () => { holding.current = false; });
	const lit = done ? 1 : p;
	return (
		<Frame ask="Approche l’allumette de la mèche et garde le doigt dessus jusqu’à ce qu’elle prenne." done={done} doneText="La flamme reprend." hint={p > 0 ? 'Encore un peu…' : 'Appuie sur la mèche et garde le doigt.'}>
			<svg viewBox="0 0 260 170" className="atg-board atx-board" onPointerDown={onPointerDown}>
				<circle cx="130" cy="78" r={30 + 60 * lit} className="atx-glow" style={{ opacity: lit }} />
				<path d="M100 40 h60 l8 18 v66 l-8 18 h-60 l-8 -18 v-66z" className="atx-cage" />
				<rect x="112" y="100" width="36" height="28" rx="4" className="atx-brass" />
				<line x1="130" y1="100" x2="130" y2="88" className="atx-wick" />
				<path d={`M130 ${88 - 26 * lit} q-${8 * lit} ${14 * lit} 0 ${26 * lit} q${8 * lit} -${12 * lit} 0 -${26 * lit}z`} className="atx-flame" style={{ opacity: lit > 0.05 ? 1 : 0 }} />
				<rect x="20" y="158" width={220 * p} height="5" rx="2.5" className="atx-progress" />
			</svg>
		</Frame>
	);
}

// ---------- choose: tap the right one ----------
interface ChooseCfg { ask: string; doneText: string; hint: string; options: { id: string; art: ReactNode; wrong?: string }[]; right: string }
function Choose({ cfg, onSolve }: { cfg: ChooseCfg; onSolve: () => void }) {
	const [msg, setMsg] = useState<string | null>(null);
	const [shake, setShake] = useState<string | null>(null);
	const [done, finish] = useFinish(onSolve);
	const pick = (id: string) => {
		if (done) return;
		if (id === cfg.right) { setMsg(null); finish(); return; }
		setMsg(cfg.options.find((o) => o.id === id)?.wrong ?? 'Pas celui-là.');
		setShake(id);
		setTimeout(() => setShake(null), 400);
	};
	return (
		<Frame ask={cfg.ask} done={done} doneText={cfg.doneText} hint={msg ?? cfg.hint}>
			<div className="atx-choices">
				{cfg.options.map((o) => (
					<button key={o.id} className={`atx-choice ${shake === o.id ? 'shake' : ''} ${done && o.id === cfg.right ? 'ok' : ''}`} onClick={() => pick(o.id)}>
						<svg viewBox="0 0 80 80">{o.art}</svg>
					</button>
				))}
			</div>
		</Frame>
	);
}

const PIE = <path d="M40 30 q-6 -10 -18 -8 q8 4 10 10 q-14 2 -20 12 q12 -2 20 0 l-6 14 l10 -10 q10 6 22 4 q-8 -6 -10 -12 q12 -4 16 -14 q-12 2 -18 6 q-2 -8 -6 -2z" className="atx-pie" />;
const CHOOSES: Record<string, ChooseCfg> = {
	loquet: {
		ask: 'Le tiroir ne s’ouvre pas. Un des motifs de la marqueterie cache le loquet : appuie sur le bon.',
		doneText: 'Un déclic : le tiroir cède.', hint: 'Lequel Jeanne aurait-elle choisi ?', right: 'pie',
		options: [
			{ id: 'rose', art: <><rect width="80" height="80" className="atx-inlay" /><circle cx="40" cy="40" r="16" className="atx-inlay-dark" /><circle cx="40" cy="40" r="6" className="atx-inlay" /></>, wrong: 'Une rosace, bien collée.' },
			{ id: 'pie', art: <><rect width="80" height="80" className="atx-inlay" />{PIE}</> },
			{ id: 'star', art: <><rect width="80" height="80" className="atx-inlay" /><path d="M40 16 l7 16 h17 l-14 10 l6 18 l-16 -11 l-16 11 l6 -18 l-14 -10 h17z" className="atx-inlay-dark" /></>, wrong: 'Une étoile, bien collée.' },
			{ id: 'leaf', art: <><rect width="80" height="80" className="atx-inlay" /><path d="M20 60 q0 -40 40 -40 q0 40 -40 40z" className="atx-inlay-dark" /></>, wrong: 'Une feuille, bien collée.' },
		],
	},
	marque: {
		ask: 'Sous le tissu, trois marques gravées dans le bois du cadre. Laquelle répond à la fiche du bureau, « Chercher la pie » ?',
		doneText: 'La pie, ailes ouvertes. La même que sur la boîte de Lucile.', hint: 'Touche la bonne marque.', right: 'pie',
		options: [
			{ id: 'tampon', art: <><rect width="80" height="80" className="atx-wood-l" /><circle cx="40" cy="40" r="22" className="atx-stamp" /><text x="40" y="45" textAnchor="middle" className="atx-stamp-t">A.M.</text></>, wrong: 'Le tampon du fabricant.' },
			{ id: 'pie', art: <><rect width="80" height="80" className="atx-wood-l" />{PIE}</> },
			{ id: 'compas', art: <><rect width="80" height="80" className="atx-wood-l" /><path d="M40 18 L26 62 M40 18 L54 62 M30 50 h20" className="atx-cut" /></>, wrong: 'Une marque de menuisier.' },
		],
	},
	cale: {
		ask: 'Le tabouret boite : il manque un peu de bois sous un pied. Choisis la cale qui comble l’écart.',
		doneText: 'Il tient droit.', hint: 'Regarde l’écart sous le pied.', right: 'b',
		options: [
			{ id: 'a', art: <><rect x="10" y="44" width="60" height="6" className="atx-wedge" /><text x="40" y="70" textAnchor="middle" className="atx-label">mince</text></>, wrong: 'Trop mince : il boite encore.' },
			{ id: 'b', art: <><rect x="10" y="38" width="60" height="12" className="atx-wedge" /><text x="40" y="70" textAnchor="middle" className="atx-label">moyenne</text></> },
			{ id: 'c', art: <><rect x="10" y="26" width="60" height="24" className="atx-wedge" /><text x="40" y="70" textAnchor="middle" className="atx-label">épaisse</text></>, wrong: 'Trop épaisse : il penche de l’autre côté.' },
		],
	},
};

/** The stool, with the gap the right wedge fills (12 units, the "moyenne" one). */
function StoolGap() {
	return (
		<svg viewBox="0 0 200 110" className="atx-stool" aria-hidden="true">
			<rect x="40" y="18" width="120" height="12" rx="4" className="atx-case" />
			<path d="M56 30 L48 92 M144 30 L152 80" className="atx-leg" />
			<line x1="20" y1="92" x2="180" y2="92" className="atx-floor" />
			<path d="M144 80 h16 M144 92 h16 M168 80 v12" className="atx-gapline" />
			<text x="172" y="90" className="atx-label">?</text>
		</svg>
	);
}

// ---------- coins: make the exact change ----------
const PRICE = 350; // centimes: 3 F 50, a 1960s market price
const PURSE = [200, 100, 100, 50, 20, 20, 10];
function Coins({ onSolve }: { onSolve: () => void }) {
	const [inBox, setInBox] = useState<boolean[]>(PURSE.map(() => false));
	const [done, finish] = useFinish(onSolve);
	const sum = PURSE.reduce((a, c, k) => a + (inBox[k] ? c : 0), 0);
	const fmt = (c: number) => (c >= 100 ? `${Math.floor(c / 100)} F${c % 100 ? ` ${c % 100}` : ''}` : `${c} c`);
	const toggle = (k: number) => {
		if (done) return;
		const next = inBox.map((v, i) => (i === k ? !v : v));
		setInBox(next);
		if (PURSE.reduce((a, c, i) => a + (next[i] ? c : 0), 0) === PRICE) finish();
	};
	return (
		<Frame
			ask={`On essaie la caissette : une cliente doit ${fmt(PRICE)}. Touche les pièces pour faire l’appoint.`}
			done={done} doneText="Le compte est bon. La caissette se referme avec un joli clic."
			hint={sum > PRICE ? `${fmt(sum)} : c’est trop, reprends une pièce.` : `Dans la caissette : ${fmt(sum)}.`}
		>
			<div className="atx-coins">
				{PURSE.map((c, k) => (
					<button key={k} className={`atx-coin ${inBox[k] ? 'in' : ''} ${c >= 100 ? 'big' : ''}`} onClick={() => toggle(k)}>{fmt(c)}</button>
				))}
			</div>
		</Frame>
	);
}

// ---------- place: drag each thing onto its spot ----------
interface PlaceItem { id: string; label: string; slot: string | null; x: number; y: number; w: number; h: number; tone: string }
interface PlaceSlot { id: string; label: string; x: number; y: number; w: number; h: number }
interface PlaceCfg { ask: string; doneText: string; hint: string; items: PlaceItem[]; slots: PlaceSlot[]; wrong: string; orphan?: string; frame: ReactNode }
function Place({ cfg, onSolve }: { cfg: PlaceCfg; onSolve: () => void }) {
	const ref = useRef<SVGSVGElement>(null);
	const [pos, setPosState] = useState(() => Object.fromEntries(cfg.items.map((i) => [i.id, { x: i.x, y: i.y, at: null as string | null }])));
	const live = useRef(pos);
	const setPos = (p: typeof pos) => { live.current = p; setPosState(p); };
	const drag = useRef<{ id: string; ox: number; oy: number } | null>(null);
	const [msg, setMsg] = useState<string | null>(null);
	const [done, finish] = useFinish(onSolve);
	const { onPointerDown } = useSvgDrag(ref,
		(x, y, el) => {
			const id = el?.closest('[data-item]')?.getAttribute('data-item');
			if (!id || done || live.current[id].at) return;
			drag.current = { id, ox: x - live.current[id].x, oy: y - live.current[id].y };
		},
		(x, y) => {
			const d = drag.current;
			if (!d) return;
			setPos({ ...live.current, [d.id]: { ...live.current[d.id], x: x - d.ox, y: y - d.oy } });
		},
		(x, y) => {
			const d = drag.current;
			drag.current = null;
			if (!d) return;
			const item = cfg.items.find((i) => i.id === d.id)!;
			const slot = cfg.slots.find((s) => x >= s.x && x <= s.x + s.w && y >= s.y && y <= s.y + s.h);
			const home = { x: item.x, y: item.y, at: null };
			if (!slot) { setPos({ ...live.current, [d.id]: home }); return; }
			const taken = Object.values(live.current).some((p) => p.at === slot.id);
			if (item.slot === slot.id && !taken) {
				const next = { ...live.current, [d.id]: { x: slot.x + (slot.w - item.w) / 2, y: slot.y + (slot.h - item.h) / 2, at: slot.id } };
				setPos(next);
				setMsg(null);
				if (cfg.items.every((i) => !i.slot || next[i.id].at)) finish();
			} else {
				setMsg(item.slot === null ? cfg.orphan ?? cfg.wrong : cfg.wrong);
				setPos({ ...live.current, [d.id]: home });
			}
		},
	);
	return (
		<Frame ask={cfg.ask} done={done} doneText={cfg.doneText} hint={msg ?? cfg.hint}>
			<svg ref={ref} viewBox="0 0 260 216" className="atg-board atx-board tall" onPointerDown={onPointerDown}>
				{cfg.frame}
				{cfg.slots.map((s) => (
					<g key={s.id}>
						<rect x={s.x} y={s.y} width={s.w} height={s.h} rx="4" className="atx-slot" />
						<text x={s.x + s.w / 2} y={s.y + s.h + 9} textAnchor="middle" className="atx-label">{s.label}</text>
					</g>
				))}
				{cfg.items.map((i) => (
					<g key={i.id} data-item={i.id} className={`atx-item ${pos[i.id].at ? 'set' : ''}`} transform={`translate(${pos[i.id].x} ${pos[i.id].y})`}>
						<rect width={i.w} height={i.h} rx="4" fill={i.tone} />
						<text x={i.w / 2} y={i.h / 2 + 3} textAnchor="middle" className="atx-item-t">{i.label}</text>
					</g>
				))}
			</svg>
		</Frame>
	);
}

const PLACES: Record<string, PlaceCfg> = {
	valise: {
		ask: 'Aide Mme Garnier à faire sa valise : chaque chose a sa place. La boîte pour Lucile va au milieu, bien calée.',
		doneText: 'Les fermoirs claquent. Le taxi attend.', hint: 'Glisse chaque affaire à sa place.',
		wrong: 'Pas là : regarde la forme de la place.',
		frame: <rect x="20" y="10" width="220" height="110" rx="10" className="atx-case open" />,
		// Items start in two tray rows that never overlap: a finger must pick up the thing it touches.
		slots: [
			{ id: 'linge', label: 'linge', x: 30, y: 18, w: 100, h: 40 },
			{ id: 'ouvrage', label: 'ouvrage', x: 30, y: 68, w: 100, h: 34 },
			{ id: 'boite', label: 'au milieu', x: 150, y: 16, w: 50, h: 46 },
			{ id: 'trousse', label: 'trousse', x: 140, y: 74, w: 88, h: 28 },
		],
		items: [
			{ id: 'linge', label: 'linge', slot: 'linge', x: 10, y: 128, w: 100, h: 40, tone: '#c9b8e0' },
			{ id: 'boite', label: 'boîte', slot: 'boite', x: 130, y: 124, w: 50, h: 46, tone: '#9c6a3a' },
			{ id: 'ouvrage', label: 'ouvrage', slot: 'ouvrage', x: 10, y: 176, w: 100, h: 34, tone: '#7fb8a2' },
			{ id: 'trousse', label: 'trousse', slot: 'trousse', x: 130, y: 180, w: 88, h: 28, tone: '#a0461a' },
		],
	},
	presentoir: {
		ask: 'Les tasseaux de la valise attendent quelque chose. Glisse les deux montants du présentoir à leur place.',
		doneText: 'Tout s’emboîte : la valise devient un étal.', hint: 'Glisse chaque montant dans ses tasseaux.',
		wrong: 'Ce montant-là n’entre pas ici.',
		frame: <><rect x="20" y="10" width="220" height="110" rx="8" className="atx-case open" />{[40, 120, 160, 220].map((x) => <rect key={x} x={x - 4} y="14" width="8" height="102" className="atx-tasseau" />)}</>,
		slots: [
			{ id: 'g', label: 'tasseaux de gauche', x: 40, y: 16, w: 80, h: 98 },
			{ id: 'd', label: 'tasseaux de droite', x: 160, y: 16, w: 60, h: 98 },
		],
		items: [
			{ id: 'd', label: 'petit montant', slot: 'd', x: 30, y: 132, w: 60, h: 64, tone: '#c78a4a' },
			{ id: 'g', label: 'grand montant', slot: 'g', x: 120, y: 128, w: 80, h: 70, tone: '#a8742a' },
		],
	},
	casier: {
		ask: 'Range les réparations « J. » dans les tiroirs de la tournée, d’après leurs étiquettes.',
		doneText: 'Trois tiroirs pleins. La quatrième réparation reste sur l’établi.', hint: 'Lis l’étiquette, puis glisse dans le bon tiroir.',
		wrong: 'L’étiquette dit un autre jour.', orphan: 'Celle-ci n’a ni nom ni adresse : « toupie, pointe changée ».',
		frame: <rect x="10" y="10" width="240" height="90" rx="6" className="atx-wood" />,
		slots: [
			{ id: 'mardi', label: 'mardi · le bourg', x: 20, y: 20, w: 70, h: 64 },
			{ id: 'jeudi', label: 'jeudi · ici', x: 95, y: 20, w: 70, h: 64 },
			{ id: 'samedi', label: 'samedi · la côte', x: 170, y: 20, w: 70, h: 64 },
		],
		items: [
			{ id: 'cote', label: 'J. · la côte', slot: 'samedi', x: 10, y: 120, w: 58, h: 30, tone: '#e9dcb8' },
			{ id: 'bourg', label: 'J. · le bourg', slot: 'mardi', x: 72, y: 120, w: 58, h: 30, tone: '#e9dcb8' },
			{ id: 'ici', label: 'J. · ici', slot: 'jeudi', x: 134, y: 120, w: 58, h: 30, tone: '#e9dcb8' },
			{ id: 'toupie', label: 'J. · ?', slot: null, x: 196, y: 120, w: 58, h: 30, tone: '#e9dcb8' },
		],
	},
};

// ---------- pins: lift each pin to the shear line ----------
const PIN_X = [80, 130, 180], LINE_Y = 70, PIN_START = [104, 96, 110];
function Pins({ onSolve }: { onSolve: () => void }) {
	const ref = useRef<SVGSVGElement>(null);
	const [ys, setYs] = useState(PIN_START);
	const [set, setSet] = useState([false, false, false]);
	const drag = useRef<number | null>(null);
	// Where on the pin the finger took hold, so the pin follows the finger instead of jumping to it.
	const grabDy = useRef(0);
	const [done, finish] = useFinish(onSolve);
	const { onPointerDown } = useSvgDrag(ref,
		(x, y) => {
			const k = PIN_X.findIndex((px) => Math.abs(px - x) < 20);
			drag.current = k >= 0 && !set[k] && !done ? k : null;
			if (drag.current !== null) grabDy.current = y - ys[k];
		},
		(_x, y) => {
			const k = drag.current;
			if (k === null) return;
			const ny = clamp(y - grabDy.current, 50, 120);
			setYs((v) => v.map((yy, i) => (i === k ? ny : yy)));
			if (Math.abs(ny - LINE_Y) < 4) {
				drag.current = null;
				const ns = set.map((s, i) => (i === k ? true : s));
				setSet(ns);
				setYs((v) => v.map((yy, i) => (i === k ? LINE_Y : yy)));
				sfx.merge(2);
				if (ns.every(Boolean)) finish();
			}
		},
		() => {
			const k = drag.current;
			drag.current = null;
			// A pin let go short of the line drops back.
			if (k !== null) setYs((v) => v.map((yy, i) => (i === k ? PIN_START[k] : yy)));
		},
	);
	return (
		<Frame ask="Pour ne rien forcer : soulève chaque goupille jusqu’à la ligne, une à une." done={done} doneText="Clic, clic, clic : la serrure cède." hint={`${set.filter(Boolean).length} goupille${set.filter(Boolean).length > 1 ? 's' : ''} sur 3.`}>
			<svg ref={ref} viewBox="0 0 260 170" className="atg-board atx-board" onPointerDown={onPointerDown}>
				<rect x="40" y="30" width="180" height="110" rx="10" className="atx-brass" />
				<line x1="50" y1={LINE_Y} x2="210" y2={LINE_Y} className="atx-shear" />
				{PIN_X.map((x, k) => (
					<g key={x}>
						<rect x={x - 9} y="40" width="18" height="90" rx="4" className="atx-hole" />
						<rect x={x - 7} y={ys[k]} width="14" height={130 - ys[k]} rx="3" className={`atx-pin ${set[k] ? 'set' : ''}`} />
					</g>
				))}
			</svg>
		</Frame>
	);
}

// ---------- fling: a quick flick spins the top ----------
function Fling({ onSolve }: { onSolve: () => void }) {
	const trail = useRef<{ x: number; t: number }[]>([]);
	const [spin, setSpin] = useState<'still' | 'wobble' | 'spin'>('still');
	const [done, finish] = useFinish(onSolve);
	const { onPointerDown } = usePointerDrag(
		(cx) => { trail.current = [{ x: cx, t: performance.now() }]; },
		(cx) => { trail.current.push({ x: cx, t: performance.now() }); if (trail.current.length > 8) trail.current.shift(); },
		(cx) => {
			if (done) return;
			const now = performance.now();
			const first = trail.current[0];
			if (!first) return;
			const speed = Math.abs(cx - first.x) / Math.max(16, now - first.t);
			if (speed > 0.6) { setSpin('spin'); finish(); } else { setSpin('wobble'); setTimeout(() => setSpin('still'), 900); }
		},
	);
	return (
		<Frame ask="Lance la toupie d’un geste vif du doigt, de côté." done={done} doneText="Elle tourne, longtemps. La bande bleue passe et repasse." hint={spin === 'wobble' ? 'Plus vif ! Elle a à peine tourné.' : 'Un geste rapide, comme pour faire claquer des doigts.'}>
			<svg viewBox="0 0 260 170" className="atg-board atx-board" onPointerDown={onPointerDown}>
				<ellipse cx="130" cy="150" rx="70" ry="8" className="atx-floor" />
				<g className={`atx-top ${spin}`}>
					<path d="M130 148 L96 96 Q130 70 164 96z" className="atx-top-body" />
					<path d="M101 104 Q130 90 159 104 L156 112 Q130 99 104 112z" className="atx-top-band" />
					<rect x="126" y="66" width="8" height="16" rx="3" className="atx-knob" />
				</g>
			</svg>
		</Frame>
	);
}

/** Every gesture id, as used by `scene.puzzle` in data.ts. */
export const GESTURES = new Set([...RUBS, ...Object.keys(SLIDES), 'musique', 'boussole', 'fanal', ...Object.keys(CHOOSES), 'caissette', ...Object.keys(PLACES), 'coffre', 'toupie']);

export function Gesture({ id, onSolve }: { id: string; onSolve: () => void }) {
	if (RUBS.includes(id)) return <RubGesture id={id} onSolve={onSolve} />;
	if (SLIDES[id]) return <Slide cfg={SLIDES[id]} onSolve={onSolve} />;
	if (id === 'musique' || id === 'boussole') return <Crank kind={id} onSolve={onSolve} />;
	if (id === 'fanal') return <Hold onSolve={onSolve} />;
	if (CHOOSES[id]) return <>{id === 'cale' && <StoolGap />}<Choose cfg={CHOOSES[id]} onSolve={onSolve} /></>;
	if (id === 'caissette') return <Coins onSolve={onSolve} />;
	if (PLACES[id]) return <Place cfg={PLACES[id]} onSolve={onSolve} />;
	if (id === 'coffre') return <Pins onSolve={onSolve} />;
	if (id === 'toupie') return <Fling onSolve={onSolve} />;
	return null;
}

export const GESTURE_CSS = `
.atx-board { width: min(84vw, 330px); touch-action: none; -webkit-user-select: none; user-select: none; }
.atx-board.tall { max-height: 44vh; }
.atx-board * { touch-action: none; }
.atx-track { stroke: #c9b48a; stroke-width: 6; stroke-linecap: round; }
.atx-handle { fill: #f2c45a; stroke: #7a5a12; stroke-width: 2; cursor: grab; }
.atx-handle.ok { fill: #3f9a5a; }
.atx-wood { fill: #8a5a2a; stroke: #5a3a14; stroke-width: 2; }
.atx-wood-l { fill: #c9a774; }
.atx-dial { fill: #f4e6c0; stroke: #7a5a12; }
.atx-tick { stroke: #7a5a12; stroke-width: 1; }
.atx-needle { stroke: #b8321a; stroke-width: 2.5; }
.atx-wave { fill: none; stroke: #f2c45a; stroke-width: 2; opacity: 0.8; }
.atx-wave.clear { stroke: #fff4d6; }
.atx-grille { fill: #5a3a14; opacity: 0.6; }
.atx-hole { fill: #2a1a0a; }
.atx-drawer { fill: #b07a42; stroke: #5a3a14; stroke-width: 2; }
.atx-knob { fill: #d9a441; stroke: #6b4a12; stroke-width: 1.2; }
.atx-paper { fill: #f4ead4; stroke: #b39a6a; }
.atx-leather { fill: #6b3a1a; }
.atx-page { fill: #efe2c0; }
.atx-flap { fill: #8a4a22; stroke: #4a2208; stroke-width: 1.5; }
.atx-case { fill: #b5803a; stroke: #6b4a12; stroke-width: 2; }
.atx-case.open { fill: #7a5232; }
.atx-lacquer { fill: #8a2a22; stroke: #4a1208; stroke-width: 2; }
.atx-comb { fill: #d9c27a; }
.atx-crank { stroke: #d9a441; stroke-width: 5; stroke-linecap: round; }
.atx-note { font-size: 18px; fill: #9c2a1a; }
.atx-brass { fill: #d9a441; stroke: #7a5a12; stroke-width: 2; }
.atx-face { fill: #f4ead4; stroke: #7a5a12; }
.atx-cardinal { font: 700 12px Georgia, serif; fill: #5a3410; }
.atx-needle-c { fill: #b8321a; stroke: #4a1208; stroke-width: 1; }
.atx-needle-c.free { animation: atx-settle 1s ease; }
@keyframes atx-settle { 0% { transform: rotate(60deg); } 50% { transform: rotate(-15deg); } 100% { transform: none; } }
.atx-needle-c.free { transform-box: fill-box; transform-origin: center; }
.atx-progress { fill: #f2c45a; }
.atx-glow { fill: rgba(255, 200, 100, 0.35); }
.atx-cage { fill: none; stroke: #4a3a2a; stroke-width: 5; }
.atx-wick { stroke: #2a1a0a; stroke-width: 3; }
.atx-flame { fill: #ffb43a; stroke: #ff7a1a; stroke-width: 1; }
.atx-choices { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.atx-choice { width: 74px; height: 74px; padding: 0; border: 2px solid #b39a6a; border-radius: 10px; background: #f4ead4; cursor: pointer; overflow: hidden; }
.atx-choice svg { width: 100%; height: 100%; display: block; }
.atx-choice.ok { border-color: #3f9a5a; box-shadow: 0 0 0 3px rgba(63, 154, 90, 0.35); }
.atx-choice.shake { animation: atx-shake 0.35s; }
@keyframes atx-shake { 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
.atx-inlay { fill: #e2c48a; }
.atx-inlay-dark { fill: #6b3a14; }
.atx-pie { fill: #2a1a0a; }
.atx-stamp { fill: none; stroke: #6b3a14; stroke-width: 2; }
.atx-stamp-t { font: 700 11px Georgia, serif; fill: #6b3a14; }
.atx-cut { stroke: #6b3a14; stroke-width: 3; fill: none; }
.atx-wedge { fill: #c78a4a; stroke: #6b3a14; }
.atx-label { font-size: 8px; fill: #6b4a12; font-style: italic; }
.atx-stool { width: min(60vw, 220px); }
.atx-leg { stroke: #8a5a2a; stroke-width: 7; stroke-linecap: round; }
.atx-floor { stroke: #b39a6a; stroke-width: 2; fill: rgba(107, 74, 42, 0.12); }
.atx-gapline { stroke: #b8321a; stroke-width: 1.2; stroke-dasharray: 2 2; fill: none; }
.atx-coins { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 320px; }
.atx-coin { width: 54px; height: 54px; border-radius: 50%; border: 2px solid #7a5a12; background: radial-gradient(circle at 35% 30%, #f8e2a0, #c9922f); font: 800 12px Georgia, serif; color: #4a2a08; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; }
.atx-coin.big { width: 62px; height: 62px; }
.atx-coin.in { transform: translateY(-6px); box-shadow: 0 0 0 3px #3f9a5a; }
.atx-slot { fill: rgba(255, 244, 214, 0.18); stroke: #f4ead4; stroke-width: 1.5; stroke-dasharray: 4 3; }
.atx-tasseau { fill: #5a3a14; }
.atx-item { cursor: grab; filter: drop-shadow(0 2px 2px rgba(0,0,0,0.3)); }
.atx-item rect { stroke: #4a2a08; stroke-width: 1.2; }
.atx-item.set { cursor: default; filter: none; }
.atx-item-t { font-size: 8px; font-weight: 800; fill: #2a1a0a; pointer-events: none; }
.atx-shear { stroke: #b8321a; stroke-width: 1.5; stroke-dasharray: 5 3; }
.atx-pin { fill: #e8c25a; stroke: #6b4a12; stroke-width: 1.2; cursor: grab; }
.atx-pin.set { fill: #3f9a5a; }
.atx-top { transform-box: fill-box; transform-origin: 50% 100%; }
.atx-top.wobble { animation: atx-wobble 0.9s ease; }
.atx-top.spin .atx-top-band { animation: atx-band 0.18s linear infinite; }
.atx-top.spin { animation: atx-sway 1.6s ease-in-out infinite; }
@keyframes atx-wobble { 30% { transform: rotate(-12deg); } 70% { transform: rotate(9deg); } }
@keyframes atx-sway { 50% { transform: rotate(3deg); } }
@keyframes atx-band { 50% { opacity: 0.35; } }
.atx-top-body { fill: #d9b07a; stroke: #6b4a12; stroke-width: 2; }
.atx-top-band { fill: #3a6fb0; }
`;
