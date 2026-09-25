/**
 * MÖLKKY — the game (prototype): you against the computer, on a lawn. Built on the pétanque's
 * pieces: the same sky and sun, the same launch pad (press height = loft, pull = power, slide =
 * aim) and the same aim sway. The physics is Rapier (physics.ts); the rules are rules.ts.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { addLights } from '../petanque/render3d';
import { swayAmp, swayAt } from '../petanque/sway';
import { usePointerDrag } from '../usePointerDrag';
import { loadPhysics, MolkkyWorld, PIN_H, PIN_R, STICK_L, STICK_R, PINS_Z, RELEASE_Y, DT, throwVelocity, type Throw } from './physics';
import { initMolkky, applyThrow, TARGET, MISSES_OUT, type MolkkyState } from './rules';
import { planAi, SKILLS, type MkLevel } from './ai';

type Status = 'loading' | 'aim' | 'flying' | 'result' | 'over';
type View = 'lancer' | 'quilles' | 'dessus';

const HUMAN = 0, AI = 1;
const LOFT_LO = 0.12, LOFT_HI = 0.95; // rad: a skimming throw .. a high "cloche"
/* A pull to the middle of the range (~0.4) gives ~6 m/s, what a "tendu" throw needs to reach the pins
   3.5 m away; the first range (3-12) sent a middle pull a few metres past them. */
const SPEED_LO = 2.5, SPEED_HI = 9.5; // m/s
const POWER_PX = 170; // pull above the pad for full power
const YAW_PER_PX = 0.0012;
const YAW_MAX = 0.7;
const AI_THINK_MS = 900;
const RESULT_MS = 1500; // the fallen pins stay down, lit, this long
const PLAYER_SWAY = swayAmp(0.62) * 1.6; // a stick is shorter than a boule's run: a bit more wobble
const MARKS = [{ t: 0.08, label: 'Rasant' }, { t: 0.5, label: 'Tendu' }, { t: 0.92, label: 'Cloche' }];
const LEVEL_LABEL: Record<MkLevel, string> = { facile: 'Facile', moyen: 'Moyen', difficile: 'Difficile' };

const speedOf = (p: number): number => Math.sqrt(SPEED_LO * SPEED_LO + (SPEED_HI * SPEED_HI - SPEED_LO * SPEED_LO) * p);

function grassTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 256;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	g.fillStyle = '#5f8f3e';
	g.fillRect(0, 0, 256, 256);
	// Deterministic blades: a small LCG, so every load draws the same lawn.
	let s = 12345;
	const rnd = (): number => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
	for (let i = 0; i < 2600; i++) {
		const l = 30 + rnd() * 25;
		g.fillStyle = `hsl(${95 + rnd() * 20}, ${35 + rnd() * 20}%, ${l}%)`;
		g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 1.5, 2 + rnd() * 4);
	}
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.repeat.set(40, 40);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
}

/** The pin's top: the number burnt into the end grain. */
function numberTexture(n: number): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d') as CanvasRenderingContext2D;
	g.fillStyle = '#cdb993';
	g.fillRect(0, 0, 128, 128);
	g.strokeStyle = 'rgba(120,80,40,0.35)';
	for (let r = 10; r < 64; r += 9) { g.beginPath(); g.arc(64, 64, r, 0, Math.PI * 2); g.stroke(); }
	g.fillStyle = '#3a2412';
	g.font = `bold ${n >= 10 ? 62 : 74}px system-ui, sans-serif`;
	g.textAlign = 'center';
	g.textBaseline = 'middle';
	g.fillText(String(n), 64, 68);
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	pins: Map<number, THREE.Mesh>;
	pinSide: Map<number, THREE.MeshStandardMaterial>;
	stick: THREE.Mesh;
	arc: THREE.Line;
	ring: THREE.Mesh;
	dispose: () => void;
}

function buildScene(canvas: HTMLCanvasElement, seed: number): Scene3D {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 400);
	const lights = addLights(scene);
	lights.setSun(seed);

	const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ map: grassTexture(), roughness: 1 }));
	grass.rotation.x = -Math.PI / 2;
	grass.receiveShadow = true;
	scene.add(grass);

	// The throwing line: a plank on the grass, where the hand is.
	const line = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.02, 0.07), new THREE.MeshStandardMaterial({ color: 0x9a6b3f, roughness: 0.8 }));
	line.position.set(0, 0.01, -0.12);
	line.receiveShadow = true;
	scene.add(line);

	const pins = new Map<number, THREE.Mesh>();
	const pinSide = new Map<number, THREE.MeshStandardMaterial>();
	const pinGeo = new THREE.CylinderGeometry(PIN_R, PIN_R, PIN_H, 28);
	const woodEnd = new THREE.MeshStandardMaterial({ color: 0xbba77f, roughness: 0.75 });
	for (let n = 1; n <= 12; n++) {
		// Mid-tone on paper: the pétanque's sun is strong and not tone mapped, a pale albedo clips.
		const side = new THREE.MeshStandardMaterial({ color: 0xc2b08e, roughness: 0.7 });
		const top = new THREE.MeshStandardMaterial({ map: numberTexture(n), roughness: 0.75 });
		const m = new THREE.Mesh(pinGeo, [side, top, woodEnd]);
		m.castShadow = true;
		m.receiveShadow = true;
		scene.add(m);
		pins.set(n, m);
		pinSide.set(n, side);
	}

	const stick = new THREE.Mesh(new THREE.CylinderGeometry(STICK_R, STICK_R, STICK_L, 28), new THREE.MeshStandardMaterial({ color: 0x8a5a33, roughness: 0.65 }));
	stick.castShadow = true;
	stick.visible = false;
	scene.add(stick);

	const arc = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x8ce99a, transparent: true, opacity: 0.9 }));
	arc.visible = false;
	scene.add(arc);
	const ring = new THREE.Mesh(new THREE.RingGeometry(0.07, 0.095, 40), new THREE.MeshBasicMaterial({ color: 0x8ce99a, transparent: true, opacity: 0.85, side: THREE.DoubleSide }));
	ring.rotation.x = -Math.PI / 2;
	ring.visible = false;
	scene.add(ring);

	return {
		renderer, scene, camera, pins, pinSide, stick, arc, ring,
		dispose: () => { lights.dispose(); renderer.dispose(); },
	};
}

/* The throwing eye sits a shoulder off the line, as in the pétanque: straight behind the hand, the
   flight projects onto one vertical stroke and the arc tells nothing. Narrow field, so twelve 6 cm
   pins 3.5 m away read as pins and not as a crate. */
const VIEWS: Record<View, { pos: [number, number, number]; look: [number, number, number]; fov: number }> = {
	lancer: { pos: [0.32, 1.25, -0.55], look: [0, 0.12, PINS_Z + 0.1], fov: 30 },
	quilles: { pos: [0.75, 0.9, PINS_Z - 1.05], look: [0, 0.05, PINS_Z + 0.2], fov: 42 },
	dessus: { pos: [0, 4.6, PINS_Z - 0.4], look: [0, 0, PINS_Z + 0.25], fov: 40 },
};

export default function MolkkyGame() {
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const padRef = useRef<HTMLDivElement | null>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const worldRef = useRef<MolkkyWorld | null>(null);

	const [status, setStatus] = useState<Status>('loading');
	const statusRef = useRef<Status>('loading');
	const [match, setMatch] = useState<MolkkyState>(() => initMolkky(['Toi', 'Ordi']));
	const matchRef = useRef(match);
	const [level, setLevel] = useState<MkLevel>('moyen');
	const levelRef = useRef(level);
	levelRef.current = level;
	const [view, setView] = useState<View>('lancer');
	const viewRef = useRef<View>('lancer');
	viewRef.current = view;
	const [power, setPower] = useState(0);
	const [board, setBoard] = useState(0.5);
	const [announce, setAnnounce] = useState<{ text: string; tone: 'good' | 'bad' | 'plain'; key: number } | null>(null);
	const [lit, setLit] = useState<number[]>([]);

	const aimRef = useRef<{ x0: number; top: number; loft: number; power: number; yaw: number; t0: number; phase: number; turn0: number } | null>(null);
	const aiAtRef = useRef(0);
	const seedRef = useRef(1);
	const accRef = useRef(0);
	const resultAtRef = useRef(0);

	const setStatusBoth = (s: Status): void => { statusRef.current = s; setStatus(s); };
	const setMatchBoth = (m: MolkkyState): void => { matchRef.current = m; setMatch(m); };
	const say = (text: string, tone: 'good' | 'bad' | 'plain'): void => setAnnounce({ text, tone, key: performance.now() });

	/* ---------- a throw, by whoever ---------- */

	const doThrow = useCallback((th: Throw) => {
		const w = worldRef.current;
		if (!w || statusRef.current !== 'aim') return;
		w.throwStick(th);
		accRef.current = 0;
		setStatusBoth('flying');
	}, []);

	const newGame = useCallback((lv: MkLevel = levelRef.current) => {
		const w = worldRef.current;
		if (!w) return;
		w.free();
		worldRef.current = MolkkyWorld.create();
		setMatchBoth(initMolkky(['Toi', `Ordi · ${LEVEL_LABEL[lv]}`]));
		setLit([]);
		setAnnounce(null);
		setStatusBoth('aim');
	}, []);

	/* When the throw has come to rest: score it, show it, then stand the pins up. */
	const onRest = useCallback(() => {
		const w = worldRef.current;
		if (!w) return;
		const fallen = w.fallen();
		const next = applyThrow(matchRef.current, fallen);
		const who = next.last?.player === HUMAN ? 'Toi' : 'Ordi';
		const pts = next.last?.points ?? 0;
		if (pts === 0) say(next.last?.out ? `${who} : 3 ratés, éliminé !` : `Raté (${next.players[next.last?.player ?? 0].misses}/${MISSES_OUT})`, 'bad');
		else if (next.last?.bust) say(`${pts} points… plus de ${TARGET} ! Retour à 25`, 'bad');
		else if (next.winner !== null) say(`${next.winner === HUMAN ? 'Gagné' : 'L’ordi gagne'} : ${TARGET} pile !`, next.winner === HUMAN ? 'good' : 'bad');
		else say(fallen.length === 1 ? `Quille ${fallen[0]} : ${pts} point${pts > 1 ? 's' : ''}` : `${fallen.length} quilles : ${pts} points`, next.last?.player === HUMAN ? 'good' : 'plain');
		setLit(fallen);
		setMatchBoth(next);
		resultAtRef.current = performance.now() + RESULT_MS;
		setStatusBoth('result');
	}, []);

	const afterResult = useCallback(() => {
		const w = worldRef.current;
		if (!w) return;
		w.raise();
		setLit([]);
		if (matchRef.current.winner !== null) { setStatusBoth('over'); return; }
		setStatusBoth('aim');
		if (matchRef.current.turn === AI) aiAtRef.current = performance.now() + AI_THINK_MS;
	}, []);

	/* ---------- the launch pad ---------- */

	const padStart = useCallback((x: number, y: number) => {
		const pad = padRef.current;
		if (!pad || statusRef.current !== 'aim' || matchRef.current.turn !== HUMAN) return;
		const r = pad.getBoundingClientRect();
		if (x < r.left || x > r.right || y < r.top || y > r.bottom) return;
		const t = Math.max(0, Math.min(1, (y - r.top) / r.height));
		aimRef.current = {
			x0: x, top: r.top, loft: LOFT_LO + (LOFT_HI - LOFT_LO) * t, power: 0, yaw: 0,
			t0: performance.now(), phase: Math.random() * Math.PI * 2, turn0: Math.random() * Math.PI * 2,
		};
		setBoard(t);
		setPower(0);
	}, []);

	const padMove = useCallback((x: number, y: number) => {
		const a = aimRef.current;
		if (!a) return;
		a.power = Math.max(0, Math.min(1, (a.top - y) / POWER_PX));
		a.yaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, -(x - a.x0) * YAW_PER_PX));
		setPower(a.power);
	}, []);

	/** The throw the pad would make now, sway included. */
	const aimThrow = (a: NonNullable<typeof aimRef.current>): Throw => {
		const sw = swayAt((performance.now() - a.t0) / 1000, PLAYER_SWAY, a.phase, a.turn0);
		return { yaw: a.yaw + sw.yaw, speed: speedOf(a.power) * (1 + sw.speed), loft: a.loft };
	};

	const padEnd = useCallback(() => {
		const a = aimRef.current;
		aimRef.current = null;
		setPower(0);
		if (!a || a.power < 0.06) return; // back onto the pad: no throw
		doThrow(aimThrow(a));
	}, [doThrow]);

	const { onPointerDown } = usePointerDrag(padStart, padMove, padEnd);

	/* ---------- boot, loop ---------- */

	useEffect(() => {
		let alive = true;
		let raf = 0;
		(async () => {
			await loadPhysics();
			if (!alive || !canvasRef.current) return;
			worldRef.current = MolkkyWorld.create();
			// Sun seed 19: 42 deg, neutral white, behind the thrower's left. A forced elevation keeps the
			// seed's colour, and seed 7's was a sunset that turned the birch red.
			g3Ref.current = buildScene(canvasRef.current, 19);
			setStatusBoth('aim');
			let last = performance.now();
			const camPos = new THREE.Vector3(...VIEWS.lancer.pos), camLook = new THREE.Vector3(...VIEWS.lancer.look);
			const tick = (now: number): void => {
				raf = requestAnimationFrame(tick);
				const g = g3Ref.current, w = worldRef.current, wrap = wrapRef.current;
				if (!g || !w || !wrap) return;
				const dt = Math.min(0.05, (now - last) / 1000);
				last = now;

				// Size.
				const cw = wrap.clientWidth, ch = wrap.clientHeight;
				if (g.renderer.domElement.width !== Math.round(cw * g.renderer.getPixelRatio()) || g.renderer.domElement.height !== Math.round(ch * g.renderer.getPixelRatio())) {
					g.renderer.setSize(cw, ch, false);
					g.camera.aspect = cw / Math.max(1, ch);
					g.camera.updateProjectionMatrix();
				}

				// Physics, fixed steps.
				if (statusRef.current === 'flying') {
					accRef.current += dt;
					let n = 0;
					while (accRef.current >= DT && n++ < 16) {
						w.step();
						accRef.current -= DT;
						if (w.atRest()) { onRest(); break; }
					}
				}
				if (statusRef.current === 'result' && now >= resultAtRef.current) afterResult();

				// The computer's turn.
				if (statusRef.current === 'aim' && matchRef.current.turn === AI && aiAtRef.current > 0 && now >= aiAtRef.current) {
					aiAtRef.current = 0;
					doThrow(planAi(w, matchRef.current.players[AI], SKILLS[levelRef.current], seedRef.current++));
				}

				// Meshes.
				for (const p of w.pinViews()) {
					const m = g.pins.get(p.n);
					if (!m) continue;
					m.position.set(p.x, p.y, p.z);
					m.quaternion.set(p.q.x, p.q.y, p.q.z, p.q.w);
				}
				if (w.stick) {
					const t = w.stick.translation(), q = w.stick.rotation();
					g.stick.position.set(t.x, t.y, t.z);
					g.stick.quaternion.set(q.x, q.y, q.z, q.w);
					g.stick.visible = true;
				} else g.stick.visible = false;

				// Aim preview: the flight until it comes down to pin height.
				const a = aimRef.current;
				if (a && a.power >= 0.06 && statusRef.current === 'aim') {
					const v = throwVelocity(aimThrow(a));
					const pts: THREE.Vector3[] = [];
					let x = 0, y = RELEASE_Y, z = 0;
					for (let i = 0; i < 400; i++) {
						pts.push(new THREE.Vector3(x, y, z));
						const h = 1 / 120;
						x += v.vx * h; z += v.vz * h; y += (v.vy - 9.81 * i * h) * h;
						if (y <= 0) break;
					}
					g.arc.geometry.dispose();
					g.arc.geometry = new THREE.BufferGeometry().setFromPoints(pts);
					g.arc.visible = true;
					const end = pts[pts.length - 1];
					g.ring.position.set(end.x, 0.005, end.z);
					g.ring.visible = true;
				} else { g.arc.visible = false; g.ring.visible = false; }

				// Camera: eased to the chosen view. From the throwing eye, the flight and the count are
				// watched from beside the pins, then it comes back for the next throw.
				const busy = statusRef.current === 'flying' || statusRef.current === 'result';
				const v = VIEWS[busy && viewRef.current === 'lancer' ? 'quilles' : viewRef.current];
				// Portrait: the same horizontal field, so a phone upright still sees the whole pack.
				const fov = g.camera.aspect < 1 ? Math.min(75, (2 * Math.atan(Math.tan((v.fov * Math.PI) / 360) / g.camera.aspect) * 180) / Math.PI) : v.fov;
				if (Math.abs(g.camera.fov - fov) > 0.01) { g.camera.fov += (fov - g.camera.fov) * (1 - Math.exp(-dt * 5)); g.camera.updateProjectionMatrix(); }
				const k = 1 - Math.exp(-dt * 5);
				camPos.lerp(new THREE.Vector3(...v.pos), k);
				camLook.lerp(new THREE.Vector3(...v.look), k);
				g.camera.position.copy(camPos);
				g.camera.lookAt(camLook);
				g.renderer.render(g.scene, g.camera);
			};
			raf = requestAnimationFrame(tick);
		})();
		return () => {
			alive = false;
			cancelAnimationFrame(raf);
			g3Ref.current?.dispose();
			worldRef.current?.free();
			worldRef.current = null;
		};
	}, [afterResult, doThrow, onRest]);

	// Fallen pins glow red while the result is on.
	useEffect(() => {
		const g = g3Ref.current;
		if (!g) return;
		for (const [n, mat] of g.pinSide) mat.emissive.setHex(lit.includes(n) ? 0x7a1a12 : 0x000000);
	}, [lit]);

	// Test hook, in the pétanque's spirit: state out, a throw in.
	useEffect(() => {
		(window as unknown as { __molkky?: unknown }).__molkky = () => ({
			status: statusRef.current,
			match: matchRef.current,
			pins: worldRef.current?.pinViews() ?? [],
			throw: (th: Throw) => doThrow(th),
		});
		return () => { delete (window as unknown as { __molkky?: unknown }).__molkky; };
	}, [doThrow]);

	/* ---------- HUD ---------- */

	const myTurn = match.turn === HUMAN;
	const me = match.players[HUMAN], foe = match.players[AI];
	const need = TARGET - me.score;
	const band = MARKS.reduce((b, m) => (Math.abs(m.t - board) < Math.abs(b.t - board) ? m : b)).label;
	const label = status === 'loading' ? 'Chargement…'
		: status === 'flying' ? 'Le mölkky vole…'
		: status === 'result' ? '…'
		: status === 'over' ? ''
		: !myTurn ? 'L’ordi réfléchit…'
		: power > 0 ? '◀ ▶ vise · lâche pour lancer'
		: '▲ Pose le doigt sur la planche, puis remonte';
	const dots = (n: number): string => '●'.repeat(n) + '○'.repeat(MISSES_OUT - n);

	return (
		<div className="mk-root">
			<div className="mk-wrap" ref={wrapRef}>
				<canvas ref={canvasRef} className="mk-canvas" />

				<div className="mk-top">
					<div className={`mk-player${myTurn && status !== 'over' ? ' on' : ''}`}>
						<span className="mk-name">{me.name}</span>
						<strong className="mk-score">{me.score}</strong>
						<span className="mk-miss" title="Ratés d’affilée">{dots(me.misses)}</span>
					</div>
					<div className="mk-need">{status === 'over' ? 'Fin' : need <= 12 ? `Il te faut la ${need}` : `Encore ${need}`}</div>
					<div className={`mk-player foe${!myTurn && status !== 'over' ? ' on' : ''}`}>
						<span className="mk-name">{foe.name}</span>
						<strong className="mk-score">{foe.score}</strong>
						<span className="mk-miss">{dots(foe.misses)}</span>
					</div>
				</div>

				<div className="mk-levels">
					{(Object.keys(SKILLS) as MkLevel[]).map((lv) => (
						<button key={lv} className={lv === level ? 'on' : ''} onClick={() => { setLevel(lv); newGame(lv); }}>{LEVEL_LABEL[lv]}</button>
					))}
				</div>
				<div className="mk-views">
					{(['lancer', 'quilles', 'dessus'] as View[]).map((v) => (
						<button key={v} className={v === view ? 'on' : ''} onClick={() => setView(v)}>{v === 'lancer' ? 'Lancer' : v === 'quilles' ? 'Quilles' : 'Dessus'}</button>
					))}
				</div>

				{announce && <div key={announce.key} className={`mk-announce ${announce.tone}`}>{announce.text}</div>}

				{status !== 'over' && <span className={`mk-label${myTurn ? '' : ' foe'}`}>{label}</span>}
				<div className={`mk-power${status === 'over' ? ' gone' : ''}`}><div style={{ width: `${Math.round(power * 100)}%` }} /></div>
				<div
					ref={padRef}
					className={`mk-pad${status === 'over' ? ' gone' : ''}${status === 'aim' ? (myTurn ? ' mine' : ' foe') : ''}`}
					onPointerDown={onPointerDown}
				>
					<div className="mk-pad-fill" style={{ height: `${Math.round(power * 100)}%` }} />
					<span className={`mk-pad-who${myTurn ? '' : ' foe'}`}>{myTurn ? 'À toi' : 'Ordi'}</span>
					{MARKS.map((m) => (
						<span key={m.label} className={`mk-mark${myTurn && m.label === band && aimRef.current ? ' on' : ''}`} style={{ top: `calc(8px + ${m.t} * (100% - 16px))` }}>{m.label}</span>
					))}
				</div>

				{status === 'over' && (
					<div className="mk-over">
						<strong>{match.winner === HUMAN ? 'Gagné !' : 'Perdu'}</strong>
						<span>{me.score} — {foe.score}</span>
						<button onClick={() => newGame()}>Rejouer</button>
					</div>
				)}
			</div>
			<style>{CSS}</style>
		</div>
	);
}

const CSS = `
.mk-root { width: 100%; max-width: 980px; margin: 0 auto; display: flex; flex-direction: column; }
.mk-wrap { position: relative; width: 100%; aspect-ratio: 16 / 10; overflow: hidden; border-radius: 14px; box-shadow: var(--shadow-lg); background: #9cc8e8; }
.mk-canvas { display: block; width: 100%; height: 100%; touch-action: none; }
.game-page.gf-full:has(.mk-root) { padding: 0; }
.game-page.gf-full .mk-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .mk-wrap { flex: 1; aspect-ratio: auto; border-radius: 0; box-shadow: none; }

.mk-top { position: absolute; top: max(8px, env(safe-area-inset-top)); left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 10px; z-index: 3; pointer-events: none; }
.mk-player { display: flex; align-items: center; gap: 8px; padding: 5px 12px; border-radius: 999px; background: rgba(28,20,12,0.62); color: #f4ece2; border: 1.5px solid transparent; backdrop-filter: blur(4px); }
.mk-player.on { border-color: #ffd166; box-shadow: 0 0 0 3px rgba(255,209,102,0.2); }
.mk-player.foe.on { border-color: #ff8a80; box-shadow: 0 0 0 3px rgba(255,95,86,0.2); }
.mk-name { font-weight: 700; font-size: 12.5px; white-space: nowrap; }
.mk-score { font-size: 22px; font-variant-numeric: tabular-nums; min-width: 1.6em; text-align: center; }
.mk-miss { font-size: 10px; letter-spacing: 1px; color: #ff8a80; }
.mk-need { padding: 4px 10px; border-radius: 999px; background: rgba(255,209,102,0.9); color: #2a1c0c; font-weight: 800; font-size: 12px; white-space: nowrap; }

.mk-levels, .mk-views { position: absolute; top: calc(max(8px, env(safe-area-inset-top)) + 44px); display: flex; flex-direction: column; gap: 5px; z-index: 3; }
.mk-levels { left: max(8px, env(safe-area-inset-left)); }
.mk-views { right: max(8px, env(safe-area-inset-right)); }
.mk-levels button, .mk-views button { border: 0; border-radius: 999px; padding: 4px 11px; font-size: 12px; font-weight: 700; background: rgba(28,20,12,0.55); color: #f4ece2; cursor: pointer; }
.mk-levels button.on { background: #7a2cd1; }
.mk-views button.on { background: rgba(255,209,102,0.92); color: #2a1c0c; }

.mk-announce { position: absolute; left: 50%; top: 42%; transform: translate(-50%, -50%); z-index: 4; pointer-events: none; font-weight: 900; font-size: clamp(20px, 4.2vw, 34px); color: #fff; text-shadow: 0 2px 10px rgba(0,0,0,0.6); white-space: nowrap; animation: mk-pop 1.6s ease-out forwards; }
.mk-announce.good { color: #b4f5bd; }
.mk-announce.bad { color: #ffb3ab; }
@keyframes mk-pop { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.6); } 12% { opacity: 1; transform: translate(-50%, -50%) scale(1.06); } 20% { transform: translate(-50%, -50%) scale(1); } 80% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1.15); } }

.mk-pad { --h: clamp(104px, 34%, 150px); position: absolute; left: 50%; transform: translateX(-50%); bottom: max(14px, env(safe-area-inset-bottom)); width: min(220px, calc(100% - 24px)); height: var(--h); z-index: 3; border: 2px solid rgba(255,255,255,0.3); border-radius: 14px; overflow: hidden; background: linear-gradient(180deg, rgba(20,14,9,0.12), rgba(20,14,9,0.45)); touch-action: none; cursor: grab; user-select: none; -webkit-user-select: none; }
.mk-pad.mine { border-color: rgba(255,209,102,0.9); box-shadow: 0 0 0 3px rgba(255,209,102,0.22), 0 0 18px rgba(255,209,102,0.25); }
.mk-pad.foe { border-color: rgba(255,95,86,0.9); background: linear-gradient(180deg, rgba(70,14,12,0.14), rgba(90,18,14,0.5)); }
.mk-pad.gone, .mk-power.gone { visibility: hidden; }
.mk-pad-fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(180deg, rgba(140,233,154,0.1), rgba(255,107,107,0.3)); }
.mk-pad-who { position: absolute; right: 8px; top: 7px; font-size: 11px; font-weight: 800; text-transform: uppercase; color: #ffd166; }
.mk-pad-who.foe { color: #ff8a80; }
.mk-mark { position: absolute; left: 10px; transform: translateY(-50%); font-size: 11px; font-weight: 700; color: rgba(255,255,255,0.7); }
.mk-mark.on { color: #ffd166; }
.mk-power { position: absolute; left: 50%; transform: translateX(-50%); width: min(220px, calc(100% - 24px)); bottom: calc(max(14px, env(safe-area-inset-bottom)) + clamp(104px, 34%, 150px) + 3px); height: 4px; border-radius: 999px; background: rgba(28,20,12,0.45); overflow: hidden; z-index: 3; }
.mk-power > div { height: 100%; background: #ffd166; }
.mk-label { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(max(14px, env(safe-area-inset-bottom)) + clamp(104px, 34%, 150px) + 12px); z-index: 3; padding: 4px 13px; border-radius: 999px; background: rgba(28,20,12,0.6); color: #f4ece2; font-weight: 600; font-size: 12.5px; white-space: nowrap; pointer-events: none; }
.mk-label.foe { background: rgba(90,18,14,0.72); color: #ffd9d4; }

.mk-over { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 5; display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 18px 28px; border-radius: 16px; background: rgba(250,246,240,0.96); color: #2a1c0c; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
.mk-over strong { font-size: 26px; }
.mk-over span { font-size: 18px; font-variant-numeric: tabular-nums; }
.mk-over button { margin-top: 6px; border: 0; border-radius: 999px; padding: 8px 20px; font-weight: 800; background: #7a2cd1; color: #fff; cursor: pointer; }
`;
