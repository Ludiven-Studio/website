import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	LUGE,
	SAMPLE_STEP,
	ensureSegments,
	segmentAt,
	poseAt,
	sepHalfAt,
	createLuge,
	stepLuge,
	type TrackSegment,
	type LugeState,
	type LugeEvent,
} from './engine';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun } from '../../lib/leaderboard';
import { formatScore } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';

/* =====================================================
   LUGE — endless 3D downhill sled run (three.js + rAF loop).
   Libre : graine aléatoire, record local.
   Défi du jour : même descente pour tous, 10 essais, meilleure distance classée.
   Engine is pure/tested; three.js only renders the streamed track state.
   ===================================================== */

type Status = 'ready' | 'playing' | 'over';
const BEST_KEY = 'ludiven-luge-best';
const STEP = 1000 / 60;
const MAX_TRIES = 10;
const SPRAY_COUNT = 150;
const fmtDist = (m: number) => formatScore(DAILY_LB.luge.fmt, m);

interface DailyState {
	best: number;
	tries: number;
}

interface SegMesh {
	group: THREE.Group;
	geoms: THREE.BufferGeometry[];
}

interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	sun: THREE.DirectionalLight;
	sled: THREE.Group;
	peaks: THREE.Group;
	sprayGeom: THREE.BufferGeometry;
	sprayPos: Float32Array;
	sprayVel: Float32Array;
	sprayLife: Float32Array;
	spray: THREE.Points;
	mats: {
		snow: THREE.MeshStandardMaterial;
		berm: THREE.MeshStandardMaterial;
		ice: THREE.MeshStandardMaterial;
		rock: THREE.MeshStandardMaterial;
		foliage: THREE.MeshStandardMaterial;
		trunk: THREE.MeshStandardMaterial;
		snowCap: THREE.MeshStandardMaterial;
		wedge: THREE.MeshStandardMaterial;
	};
	shared: {
		trunk: THREE.CylinderGeometry;
		cone1: THREE.ConeGeometry;
		cone2: THREE.ConeGeometry;
		cap: THREE.ConeGeometry;
		rock: THREE.IcosahedronGeometry;
		peak: THREE.ConeGeometry;
	};
	baseDisposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[];
}

/* ---------- Procedural fallback textures (replaced by AI JPGs when present) ---------- */

function makeCanvas(size: number, paint: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = c.height = size;
	const ctx = c.getContext('2d')!;
	paint(ctx, size);
	const t = new THREE.CanvasTexture(c);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

const makeSnowTex = () =>
	makeCanvas(256, (ctx, s) => {
		const g = ctx.createLinearGradient(0, 0, s, s);
		g.addColorStop(0, '#eef4fb');
		g.addColorStop(1, '#e2ebf6');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, s, s);
		const rng = mulberry32(7);
		for (let i = 0; i < 900; i++) {
			const a = rng();
			ctx.fillStyle = a < 0.5 ? 'rgba(255,255,255,0.5)' : 'rgba(160,185,215,0.25)';
			ctx.fillRect(rng() * s, rng() * s, 1.5, 1.5);
		}
		ctx.strokeStyle = 'rgba(170,195,225,0.35)';
		for (let i = 0; i < 6; i++) {
			ctx.beginPath();
			const x = rng() * s;
			ctx.moveTo(x, 0);
			ctx.bezierCurveTo(x + 10, s * 0.3, x - 10, s * 0.7, x + 4, s);
			ctx.stroke();
		}
	});

const makeIceTex = () =>
	makeCanvas(256, (ctx, s) => {
		const g = ctx.createLinearGradient(0, 0, 0, s);
		g.addColorStop(0, '#9cc8e8');
		g.addColorStop(0.5, '#bfe0f5');
		g.addColorStop(1, '#8ab8dd');
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, s, s);
		const rng = mulberry32(13);
		ctx.strokeStyle = 'rgba(255,255,255,0.4)';
		for (let i = 0; i < 26; i++) {
			ctx.beginPath();
			let x = rng() * s, y = rng() * s;
			ctx.moveTo(x, y);
			for (let j = 0; j < 4; j++) {
				x += (rng() - 0.5) * 60;
				y += (rng() - 0.5) * 60;
				ctx.lineTo(x, y);
			}
			ctx.stroke();
		}
	});

const makeRockTex = () =>
	makeCanvas(256, (ctx, s) => {
		ctx.fillStyle = '#6d7178';
		ctx.fillRect(0, 0, s, s);
		const rng = mulberry32(29);
		for (let i = 0; i < 320; i++) {
			const v = 90 + rng() * 50;
			ctx.fillStyle = `rgba(${v},${v + 4},${v + 10},0.5)`;
			const r = 4 + rng() * 22;
			ctx.beginPath();
			ctx.arc(rng() * s, rng() * s, r, 0, Math.PI * 2);
			ctx.fill();
		}
	});

/* ---------- Geometry builders (all coords local to the segment's first sample) ---------- */

const geomFrom = (pos: number[], uv: number[]): THREE.BufferGeometry => {
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
	g.computeVertexNormals();
	return g;
};

type Row = { x: number; y: number; z: number; u: number; v: number };

/** Triangulate parallel rows of points into a strip mesh. */
function stripFrom(rows: Row[][]): THREE.BufferGeometry {
	const pos: number[] = [];
	const uv: number[] = [];
	for (let i = 0; i < rows.length - 1; i++) {
		const a = rows[i];
		const b = rows[i + 1];
		for (let j = 0; j < a.length - 1; j++) {
			// Winding chosen so lateral × forward = up-facing normals (lit from above).
			const p00 = a[j], p01 = a[j + 1], p10 = b[j], p11 = b[j + 1];
			pos.push(p00.x, p00.y, p00.z, p01.x, p01.y, p01.z, p10.x, p10.y, p10.z);
			uv.push(p00.u, p00.v, p01.u, p01.v, p10.u, p10.v);
			pos.push(p01.x, p01.y, p01.z, p11.x, p11.y, p11.z, p10.x, p10.y, p10.z);
			uv.push(p01.u, p01.v, p11.u, p11.v, p10.u, p10.v);
		}
	}
	return geomFrom(pos, uv);
}

/** Point on the (banked) track cross-section at absolute s / lateral lat, minus the segment origin. */
function edgePt(segs: TrackSegment[], absS: number, lat: number, o: THREE.Vector3, dy = 0): Row {
	const p = poseAt(segs, absS, lat);
	return { x: p.x - o.x, y: p.y + dy - o.y, z: p.z - o.z, u: lat / 4, v: absS / 4 };
}

/** Centerline frame (position + left normal), unbanked — for terrain beyond the berms. */
function frameAt(segs: TrackSegment[], absS: number): { x: number; y: number; z: number; nx: number; nz: number; hw: number } {
	const p = poseAt(segs, absS, 0);
	return { x: p.x, y: p.y, z: p.z, nx: -Math.sin(p.heading), nz: Math.cos(p.heading), hw: p.width / 2 };
}

/** Mountainside height above the track at a given lateral reach (smooth pseudo-noise, seamless in s). */
const terrainRise = (absS: number, off: number, side: number): number => {
	const n = Math.sin(absS * 0.021 + side * 2.1) * 0.5 + Math.sin(absS * 0.047 + off * 0.31 + side * 5.3) * 0.35;
	return off * 0.5 * (1 + 0.25 * n) + off * 0.12 * n;
};

const TERRAIN_OFF = [0, 5, 12, 24, 42, 64];
const TUNNEL_RADIAL = 12;

function buildSegmentMeshes(segs: TrackSegment[], seg: TrackSegment, g: Scene3D, seed: number): SegMesh {
	const group = new THREE.Group();
	const geoms: THREE.BufferGeometry[] = [];
	const first = seg.samples[0];
	const o = new THREE.Vector3(first.x, first.y, first.z);
	group.position.copy(o);
	const n = seg.samples.length - 1;
	const sAt = (k: number) => seg.startS + k * SAMPLE_STEP;
	const add = (geom: THREE.BufferGeometry, mat: THREE.Material) => {
		geoms.push(geom);
		const mesh = new THREE.Mesh(geom, mat);
		group.add(mesh);
		return mesh;
	};

	// Piste ribbon (banked) — UVs advance with s so the surface visibly streams.
	// Bob sections: dense cross-section spanning the icy walls (poseAt carries the pipe shape).
	{
		const ts = seg.bob ? [-1, -0.92, -0.82, -0.68, -0.45, 0, 0.45, 0.68, 0.82, 0.92, 1] : [-1, -0.5, 0, 0.5, 1];
		const ribbon: Row[][] = [];
		for (let k = 0; k <= n; k++) {
			const s = sAt(k);
			const half = seg.samples[k].width / 2 + (seg.bob ? LUGE.bobWallExtra : 0);
			const across: Row[] = [];
			for (const t of ts) across.push(edgePt(segs, s, t * half, o));
			ribbon.push(across);
		}
		add(stripFrom(ribbon), seg.bob ? g.mats.ice : g.mats.snow);
	}

	// Raised snow berms at both edges (bob walls replace them on bob sections).
	for (const side of seg.bob ? [] : [1, -1]) {
		const berm: Row[][] = [];
		for (let k = 0; k <= n; k++) {
			const s = sAt(k);
			const hw = seg.samples[k].width / 2;
			berm.push([edgePt(segs, s, side * hw, o), edgePt(segs, s, side * (hw + 1.6), o, 0.8), edgePt(segs, s, side * (hw + 3), o, 0.5)]);
		}
		add(stripFrom(berm), g.mats.berm);
	}

	// Terrain skirts: inner row rides the (banked) berm edge exactly, outer rows climb
	// the mountainside — the bank offset fades out so terrain and track never gap.
	// Every 2nd sample, but ALWAYS include the boundary row n (odd n would leave a 2 m gap).
	const skirtKs: number[] = [];
	for (let k = 0; k < n; k += 2) skirtKs.push(k);
	skirtKs.push(n);
	for (const side of [1, -1]) {
		const rows: Row[][] = [];
		for (const k of skirtKs) {
			const s = sAt(k);
			const f = frameAt(segs, s);
			const bank = seg.samples[k].bank;
			const across: Row[] = [];
			for (const off of TERRAIN_OFF) {
				const lat = side * (f.hw + 3 + off);
				// Bob sections: the inner row meets the ice-wall crest instead of the berm.
				const rise = off === 0 ? (seg.bob ? 3.4 : 0.5) : terrainRise(s, off, side);
				const bankDy = -Math.sin(bank) * lat * Math.max(0, 1 - off / 24);
				across.push({
					x: f.x + f.nx * lat - o.x,
					y: f.y + rise + bankDy - o.y,
					z: f.z + f.nz * lat - o.z,
					u: lat / 10,
					v: s / 10,
				});
			}
			rows.push(across);
		}
		add(stripFrom(rows), g.mats.snow);
	}

	// Ice tunnel: half-cylinder over the full track.
	if (seg.tunnel) {
		const rows: Row[][] = [];
		for (let k = 0; k <= n; k++) {
			const s = sAt(k);
			const f = frameAt(segs, s);
			const bank = seg.samples[k].bank;
			const R = f.hw + 1.6;
			const across: Row[] = [];
			for (let j = 0; j <= TUNNEL_RADIAL; j++) {
				const th = (j / TUNNEL_RADIAL) * Math.PI;
				const lat = Math.cos(th) * R;
				across.push({
					x: f.x + f.nx * lat - o.x,
					y: f.y + Math.sin(th) * R * 0.8 + 0.3 - Math.sin(bank) * lat - o.y,
					z: f.z + f.nz * lat - o.z,
					u: (th / Math.PI) * 3,
					v: s / 4,
				});
			}
			rows.push(across);
		}
		add(stripFrom(rows), g.mats.ice);
	}

	// Fork: separator wedge + danger-lane ice tunnel + danger outer wall.
	if (seg.fork) {
		const f = seg.fork;
		const sign = f.danger === 'left' ? 1 : -1;
		const k0 = Math.floor(f.noseS / SAMPLE_STEP);
		const k1 = Math.ceil(f.mergeS / SAMPLE_STEP);

		const wedgeRows: Row[][] = [];
		for (let k = k0; k <= Math.min(k1, n); k++) {
			const sLocal = k * SAMPLE_STEP;
			const s = sAt(k);
			const sep = sepHalfAt(f, sLocal);
			const h = Math.min(1.6, Math.max(0.05, (sLocal - f.noseS) * 0.35)) * Math.min(1, Math.max(0.05, (f.mergeS - sLocal) / 8));
			wedgeRows.push([
				edgePt(segs, s, -sep - 0.2, o),
				edgePt(segs, s, -sep * 0.7, o, h),
				edgePt(segs, s, sep * 0.7, o, h),
				edgePt(segs, s, sep + 0.2, o),
			]);
		}
		add(stripFrom(wedgeRows), g.mats.wedge);

		// Danger lane: narrow ice tunnel between the separator and its outer wall.
		const cLat = sign * ((f.sepHalfMax + f.outerDanger) / 2);
		const R = (f.outerDanger - f.sepHalfMax) / 2 + 0.8;
		const tRows: Row[][] = [];
		for (let k = k0 + 4; k <= Math.min(k1 - 3, n); k++) {
			const s = sAt(k);
			const fr = frameAt(segs, s);
			const across: Row[] = [];
			for (let j = 0; j <= TUNNEL_RADIAL; j++) {
				const th = (j / TUNNEL_RADIAL) * Math.PI;
				const lat = cLat + Math.cos(th) * R;
				across.push({
					x: fr.x + fr.nx * lat - o.x,
					y: fr.y + Math.sin(th) * R * 0.9 + 0.2 - o.y,
					z: fr.z + fr.nz * lat - o.z,
					u: (th / Math.PI) * 2,
					v: s / 4,
				});
			}
			tRows.push(across);
		}
		add(stripFrom(tRows), g.mats.ice);

		// Outer ice wall closing the danger lane (the safe side keeps the full width).
		const wallRows: Row[][] = [];
		for (let k = k0; k <= Math.min(k1, n); k++) {
			const s = sAt(k);
			wallRows.push([edgePt(segs, s, sign * f.outerDanger, o), edgePt(segs, s, sign * (f.outerDanger + 0.4), o, 1.8)]);
		}
		add(stripFrom(wallRows), g.mats.ice);
	}

	// Obstacles (shared geometries/materials — only transforms per instance).
	const rng = mulberry32((seed ^ Math.imul(seg.index + 7, 0x85ebca6b)) >>> 0);
	for (const obs of seg.obstacles) {
		const p = poseAt(segs, seg.startS + obs.s, obs.lat);
		const base = new THREE.Vector3(p.x - o.x, p.y - o.y, p.z - o.z);
		if (obs.type === 'tree') {
			const t = new THREE.Group();
			const trunk = new THREE.Mesh(g.shared.trunk, g.mats.trunk);
			trunk.position.y = 0.45;
			const c1 = new THREE.Mesh(g.shared.cone1, g.mats.foliage);
			c1.position.y = 1.7;
			const c2 = new THREE.Mesh(g.shared.cone2, g.mats.foliage);
			c2.position.y = 2.7;
			const cap = new THREE.Mesh(g.shared.cap, g.mats.snowCap);
			cap.position.y = 3.35;
			t.add(trunk, c1, c2, cap);
			const sc = obs.r / 0.9;
			t.scale.setScalar(sc);
			t.position.copy(base);
			t.rotation.y = rng() * Math.PI;
			group.add(t);
		} else {
			const r = new THREE.Mesh(g.shared.rock, g.mats.rock);
			r.scale.set(obs.r * (0.9 + rng() * 0.4), obs.r * (0.7 + rng() * 0.4), obs.r * (0.9 + rng() * 0.4));
			r.position.copy(base).setY(base.y + obs.r * 0.3);
			r.rotation.set(rng() * 3, rng() * 3, rng() * 3);
			group.add(r);
		}
	}

	// Decorative trees on the mountainside (cosmetic, deterministic).
	const decoCount = 3 + Math.floor(rng() * 4);
	for (let i = 0; i < decoCount; i++) {
		const s = seg.startS + 6 + rng() * (seg.length - 12);
		const side = rng() < 0.5 ? 1 : -1;
		const off = 6 + rng() * 26;
		const fr = frameAt(segs, s);
		const lat = side * (fr.hw + 3 + off);
		const bank = seg.samples[Math.min(Math.round((s - seg.startS) / SAMPLE_STEP), n)].bank;
		const y = fr.y + terrainRise(s, off, side) - Math.sin(bank) * lat * Math.max(0, 1 - off / 24);
		const t = new THREE.Group();
		const trunk = new THREE.Mesh(g.shared.trunk, g.mats.trunk);
		trunk.position.y = 0.45;
		const c1 = new THREE.Mesh(g.shared.cone1, g.mats.foliage);
		c1.position.y = 1.7;
		const cap = new THREE.Mesh(g.shared.cap, g.mats.snowCap);
		cap.position.y = 2.5;
		t.add(trunk, c1, cap);
		t.scale.setScalar(1.2 + rng() * 1.6);
		t.position.set(fr.x + fr.nx * lat - o.x, y - o.y, fr.z + fr.nz * lat - o.z);
		group.add(t);
	}

	return { group, geoms };
}

/** Sled + rider, nose toward +x (yawed via rotation.y = -heading). */
function buildSled(accent: string): { sled: THREE.Group; disposables: (THREE.BufferGeometry | THREE.Material)[] } {
	const sled = new THREE.Group();
	const d: (THREE.BufferGeometry | THREE.Material)[] = [];
	const mk = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number) => {
		d.push(geo);
		const m = new THREE.Mesh(geo, mat);
		m.position.set(x, y, z);
		sled.add(m);
		return m;
	};
	const wood = new THREE.MeshStandardMaterial({ color: 0xa9743f, roughness: 0.7 });
	const metal = new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.8, roughness: 0.3 });
	const suit = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent), roughness: 0.6 });
	const skin = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.8 });
	const helmet = new THREE.MeshStandardMaterial({ color: 0xd83a3a, roughness: 0.35 });
	d.push(wood, metal, suit, skin, helmet);

	mk(new THREE.BoxGeometry(1.5, 0.08, 0.7), wood, 0, 0.26, 0); // deck
	for (const z of [-0.3, 0.3]) {
		mk(new THREE.BoxGeometry(1.7, 0.07, 0.09), metal, 0, 0.08, z); // runners
		const tip = mk(new THREE.BoxGeometry(0.34, 0.07, 0.09), metal, 0.9, 0.19, z);
		tip.rotation.z = 0.7;
	}
	mk(new THREE.BoxGeometry(0.85, 0.3, 0.5), suit, -0.1, 0.48, 0); // lying rider body
	mk(new THREE.BoxGeometry(0.35, 0.22, 0.44), suit, -0.55, 0.44, 0); // legs
	const head = mk(new THREE.SphereGeometry(0.19, 14, 12), skin, 0.42, 0.55, 0);
	void head;
	mk(new THREE.SphereGeometry(0.22, 14, 12), helmet, 0.44, 0.58, 0);
	return { sled, disposables: d };
}

export default function LugeGame({ gameId }: { gameId: string }) {
	const [status, setStatus] = useState<Status>('ready');
	const [score, setScore] = useState(0);
	const [best, setBest] = useState(0);
	const [lives, setLives] = useState(LUGE.lives);
	const [kmh, setKmh] = useState(0);
	const [boosting, setBoosting] = useState(false);
	const [bonusFlash, setBonusFlash] = useState<string | null>(null);
	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [alreadyPlayed, setAlreadyPlayed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const [tries, setTries] = useState(0);
	const [webglError, setWebglError] = useState(false);

	const canvasRef = useRef<HTMLCanvasElement>(null);
	const vignetteRef = useRef<HTMLDivElement>(null);
	const flashRef = useRef<HTMLDivElement>(null);
	const g3Ref = useRef<Scene3D | null>(null);
	const segMeshesRef = useRef<Map<number, SegMesh>>(new Map());
	const segsRef = useRef<TrackSegment[]>([]);
	const stateRef = useRef<LugeState>(createLuge());
	const prevRef = useRef<{ s: number; lat: number }>({ s: 0, lat: 0 });
	const seedRef = useRef(1);
	const rafRef = useRef(0);
	const lastRef = useRef(0);
	const accRef = useRef(0);
	const clockRef = useRef(0);
	const hudAccRef = useRef(0);
	const runningRef = useRef(false);
	const statusRef = useRef<Status>('ready');
	const startRef = useRef(0);
	const dailyRef = useRef(false);
	const triesRef = useRef(0);
	const keysRef = useRef({ left: false, right: false });
	const camLatRef = useRef(0);
	const camHRef = useRef(4); // eased camera height — ducks under tunnel arches
	const flashOpRef = useRef(0);
	const bonusTimerRef = useRef(0);

	/* ---- three.js scene (built once) ---- */
	const initScene = useCallback((): boolean => {
		if (g3Ref.current) return true;
		if (!canvasRef.current) return false;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
		} catch {
			setWebglError(true);
			return false;
		}
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.toneMapping = THREE.ACESFilmicToneMapping;
		renderer.toneMappingExposure = 1.05;

		const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent-regular').trim() || '#7c5cff';
		const baseDisposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

		const scene = new THREE.Scene();
		const fogCol = new THREE.Color('#cfe0f0');
		scene.fog = new THREE.FogExp2(fogCol, 0.0032);
		scene.background = fogCol;

		// Sky: inward gradient sphere (fog-free) — pale zenith to white horizon.
		const skyTex = makeCanvas(64, (ctx, s) => {
			const g = ctx.createLinearGradient(0, 0, 0, s);
			g.addColorStop(0, '#7fb2e8');
			g.addColorStop(0.55, '#bcd6ee');
			g.addColorStop(1, '#eef4fb');
			ctx.fillStyle = g;
			ctx.fillRect(0, 0, s, s);
		});
		const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, toneMapped: false });
		const skyGeo = new THREE.SphereGeometry(820, 24, 16);
		const sky = new THREE.Mesh(skyGeo, skyMat);
		scene.add(sky);
		baseDisposables.push(skyTex, skyMat, skyGeo);

		const camera = new THREE.PerspectiveCamera(74, 16 / 10, 0.1, 900);
		camera.position.set(-10, 4, 0);
		scene.add(camera);
		sky.onBeforeRender = () => sky.position.copy(camera.position); // sky follows the camera

		scene.add(new THREE.HemisphereLight(0xbfd4ee, 0x93a8c4, 1.05));
		const sun = new THREE.DirectionalLight(0xfff0dd, 1.7);
		scene.add(sun);
		scene.add(sun.target);

		// Materials — procedural canvas textures first; AI JPGs swap in when they exist.
		const snowTex = makeSnowTex();
		const iceTex = makeIceTex();
		const rockTex = makeRockTex();
		baseDisposables.push(snowTex, iceTex, rockTex);
		// Strips are DoubleSide: banking/terrain rows can face either way locally.
		const mats: Scene3D['mats'] = {
			snow: new THREE.MeshStandardMaterial({ map: snowTex, color: 0xffffff, roughness: 0.92, side: THREE.DoubleSide }),
			berm: new THREE.MeshStandardMaterial({ map: snowTex, color: 0xf4f8ff, roughness: 0.95, side: THREE.DoubleSide }),
			ice: new THREE.MeshStandardMaterial({
				map: iceTex,
				color: 0xcfe6f8,
				roughness: 0.25,
				metalness: 0.05,
				emissive: 0x224466,
				emissiveIntensity: 0.35,
				side: THREE.DoubleSide,
			}),
			rock: new THREE.MeshStandardMaterial({ map: rockTex, color: 0xb9bec6, roughness: 0.9, flatShading: true }),
			foliage: new THREE.MeshStandardMaterial({ color: 0x2f6b46, roughness: 0.9, flatShading: true }),
			trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2e, roughness: 0.9 }),
			snowCap: new THREE.MeshStandardMaterial({ color: 0xf4f8ff, roughness: 0.95, flatShading: true }),
			wedge: new THREE.MeshStandardMaterial({ map: rockTex, color: 0xd6dde6, roughness: 0.85, flatShading: true, side: THREE.DoubleSide }),
		};
		Object.values(mats).forEach((m) => baseDisposables.push(m));
		const swapTex = (file: string, targets: THREE.MeshStandardMaterial[], repeat: number) => {
			new THREE.TextureLoader().load(`/assets/jeux/luge/${file}`, (t) => {
				t.wrapS = t.wrapT = THREE.RepeatWrapping;
				t.colorSpace = THREE.SRGBColorSpace;
				t.repeat.set(repeat, repeat);
				baseDisposables.push(t);
				for (const m of targets) {
					m.map = t;
					m.needsUpdate = true;
				}
			});
		};
		swapTex('snow.jpg', [mats.snow, mats.berm], 1);
		swapTex('ice.jpg', [mats.ice], 1);
		swapTex('rock.jpg', [mats.rock, mats.wedge], 1);

		// Shared obstacle geometries.
		const shared: Scene3D['shared'] = {
			trunk: new THREE.CylinderGeometry(0.14, 0.2, 0.9, 6),
			cone1: new THREE.ConeGeometry(0.95, 2.0, 8),
			cone2: new THREE.ConeGeometry(0.7, 1.5, 8),
			cap: new THREE.ConeGeometry(0.45, 0.7, 8),
			rock: new THREE.IcosahedronGeometry(1, 1),
			peak: new THREE.ConeGeometry(1, 1, 7),
		};
		Object.values(shared).forEach((g0) => baseDisposables.push(g0));

		// Distant skyline: a fixed ring of big peaks glued to the camera (never approached).
		const peaks = new THREE.Group();
		const peakMat = new THREE.MeshStandardMaterial({ color: 0xdde8f4, roughness: 1, flatShading: true });
		baseDisposables.push(peakMat);
		const prng = mulberry32(0xa11ce);
		for (let i = 0; i < 11; i++) {
			const ang = (i / 11) * Math.PI * 2 + prng() * 0.4;
			const dist = 380 + prng() * 220;
			const h = 90 + prng() * 150;
			const m = new THREE.Mesh(shared.peak, peakMat);
			m.scale.set(90 + prng() * 120, h, 90 + prng() * 120);
			m.position.set(Math.cos(ang) * dist, h * 0.28 - 40, Math.sin(ang) * dist);
			peaks.add(m);
		}
		scene.add(peaks);

		const { sled, disposables: sledDisp } = buildSled(accent);
		scene.add(sled);
		baseDisposables.push(...sledDisp);

		// Snow spray behind the runners.
		const sprayPos = new Float32Array(SPRAY_COUNT * 3);
		const sprayVel = new Float32Array(SPRAY_COUNT * 3);
		const sprayLife = new Float32Array(SPRAY_COUNT);
		const sprayGeom = new THREE.BufferGeometry();
		sprayGeom.setAttribute('position', new THREE.BufferAttribute(sprayPos, 3));
		const sprayMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, sizeAttenuation: true, transparent: true, opacity: 0.85 });
		baseDisposables.push(sprayGeom, sprayMat);
		const spray = new THREE.Points(sprayGeom, sprayMat);
		spray.frustumCulled = false;
		scene.add(spray);

		g3Ref.current = {
			renderer, scene, camera, sun, sled, peaks,
			sprayGeom, sprayPos, sprayVel, sprayLife, spray,
			mats, shared, baseDisposables,
		};
		return true;
	}, []);

	/* ---- Segment mesh streaming ---- */
	const syncSegMeshes = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		const live = new Set<number>();
		for (const seg of segsRef.current) {
			live.add(seg.index);
			if (!segMeshesRef.current.has(seg.index)) {
				const sm = buildSegmentMeshes(segsRef.current, seg, g, seedRef.current);
				segMeshesRef.current.set(seg.index, sm);
				g.scene.add(sm.group);
			}
		}
		for (const [idx, sm] of segMeshesRef.current) {
			if (!live.has(idx)) {
				g.scene.remove(sm.group);
				sm.geoms.forEach((geo) => geo.dispose());
				segMeshesRef.current.delete(idx);
			}
		}
	}, []);

	const clearSegMeshes = useCallback(() => {
		const g = g3Ref.current;
		for (const [, sm] of segMeshesRef.current) {
			g?.scene.remove(sm.group);
			sm.geoms.forEach((geo) => geo.dispose());
		}
		segMeshesRef.current.clear();
	}, []);

	/* ---- Render ---- */
	const draw = useCallback((dtSec: number, sI: number, latI: number) => {
		const g = g3Ref.current;
		if (!g) return;
		const st = stateRef.current;
		const segs = segsRef.current;
		if (!segs.length) return;

		const pose = poseAt(segs, sI, latI);
		const ahead = poseAt(segs, sI + 2, latI);
		const pitch = Math.atan2(ahead.y - pose.y, 2);
		const steer = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);

		// Drift yaw: sliding sideways visibly swings the nose against the slide (oversteer look).
		const driftYaw = Math.atan2(st.latVel, Math.max(8, st.speed)) * 1.2;
		g.sled.position.set(pose.x, pose.y + 0.05, pose.z);
		g.sled.rotation.set(0, 0, 0);
		g.sled.rotateY(-pose.heading + driftYaw);
		g.sled.rotateZ(pitch);
		g.sled.rotateX(pose.bank + steer * 0.22 + st.latVel * 0.02);
		// Invulnerability blink at ~8 Hz.
		g.sled.visible = st.invulnMs <= 0 || Math.floor(clockRef.current / 125) % 2 === 0;

		// Chase camera: behind + above, looking through the sled far ahead.
		// Under an arch (full tunnel / narrow danger-lane tunnel) it ducks low and
		// hugs the sled laterally so the view stays inside the tube.
		const seg = segmentAt(segs, sI);
		const sLoc = sI - seg.startS;
		const inDanger = Boolean(seg.fork && st.lane === seg.fork.danger && sLoc >= seg.fork.noseS && sLoc < seg.fork.mergeS);
		const wantH = inDanger ? 1.4 : seg.tunnel ? 2.4 : 4;
		camHRef.current += (wantH - camHRef.current) * Math.min(1, dtSec * 4);
		const latK = inDanger ? 0.9 : 0.5;
		camLatRef.current += (latI * latK - camLatRef.current) * Math.min(1, dtSec * 5);
		const camPose = poseAt(segs, Math.max(0, sI - 8), camLatRef.current);
		const lookPose = poseAt(segs, sI + 16, latI * 0.7);
		const spd = Math.min(1, st.speed / 60);
		const shake = st.speed > 20 ? (st.speed - 20) * 0.004 : 0;
		g.camera.position.set(
			camPose.x + (Math.random() - 0.5) * shake,
			camPose.y + camHRef.current + (Math.random() - 0.5) * shake,
			camPose.z + (Math.random() - 0.5) * shake,
		);
		g.camera.lookAt(lookPose.x, lookPose.y + 0.4 + camHRef.current * 0.2, lookPose.z);
		const fov = 74 + 16 * spd + (st.boostMs > 0 ? 5 : 0);
		if (Math.abs(g.camera.fov - fov) > 0.1) {
			g.camera.fov = fov;
			g.camera.updateProjectionMatrix();
		}

		// Sun + skyline follow the descent (keeps light direction and horizon stable).
		g.sun.position.set(pose.x + 60, pose.y + 90, pose.z + 30);
		g.sun.target.position.set(pose.x, pose.y, pose.z);
		g.peaks.position.set(g.camera.position.x, g.camera.position.y - 60, g.camera.position.z);

		// Snow spray: emit behind the runners while moving, more when steering/sliding.
		const emit =
			runningRef.current && st.speed > 8
				? Math.min(10, 1 + Math.floor(st.speed / 12) + Math.abs(steer) * 2 + Math.abs(st.latVel) * 0.6)
				: 0;
		const back = { x: -Math.cos(pose.heading), z: -Math.sin(pose.heading) };
		let emitted = 0;
		for (let i = 0; i < SPRAY_COUNT; i++) {
			if (g.sprayLife[i] > 0) {
				g.sprayLife[i] -= dtSec;
				g.sprayPos[i * 3] += g.sprayVel[i * 3] * dtSec;
				g.sprayPos[i * 3 + 1] += g.sprayVel[i * 3 + 1] * dtSec;
				g.sprayPos[i * 3 + 2] += g.sprayVel[i * 3 + 2] * dtSec;
				g.sprayVel[i * 3 + 1] -= 12 * dtSec;
				if (g.sprayLife[i] <= 0) g.sprayPos[i * 3 + 1] = -9999;
			} else if (emitted < emit) {
				emitted++;
				g.sprayLife[i] = 0.35 + Math.random() * 0.3;
				g.sprayPos[i * 3] = pose.x + back.x * 0.9;
				g.sprayPos[i * 3 + 1] = pose.y + 0.15;
				g.sprayPos[i * 3 + 2] = pose.z + back.z * 0.9;
				const side = (Math.random() - 0.5) * 3 - steer * 2 - st.latVel * 0.5;
				g.sprayVel[i * 3] = back.x * st.speed * 0.25 - Math.sin(pose.heading) * side;
				g.sprayVel[i * 3 + 1] = 1.5 + Math.random() * 2.5;
				g.sprayVel[i * 3 + 2] = back.z * st.speed * 0.25 + Math.cos(pose.heading) * side;
			}
		}
		g.sprayGeom.attributes.position.needsUpdate = true;

		// DOM FX: speed vignette + crash flash (refs only, no re-render).
		if (vignetteRef.current) vignetteRef.current.style.opacity = String(0.25 + spd * 0.5);
		if (flashRef.current) {
			flashOpRef.current = Math.max(0, flashOpRef.current - dtSec * 2.2);
			flashRef.current.style.opacity = String(flashOpRef.current);
		}

		g.renderer.render(g.scene, g.camera);
		if (import.meta.env.DEV) (window as unknown as { __lugeTris?: number }).__lugeTris = g.renderer.info.render.triangles;
	}, []);

	const resize = useCallback(() => {
		const g = g3Ref.current;
		const canvas = canvasRef.current;
		if (!g || !canvas) return;
		const w = canvas.clientWidth;
		const h = canvas.clientHeight || Math.round(w * 0.625);
		g.renderer.setSize(w, h, false);
		g.camera.aspect = w / h;
		g.camera.updateProjectionMatrix();
		const st = stateRef.current;
		draw(0, st.s, st.lat);
	}, [draw]);

	/* ---- Loop ---- */
	const stop = useCallback(() => {
		runningRef.current = false;
		if (rafRef.current) cancelAnimationFrame(rafRef.current);
		rafRef.current = 0;
	}, []);

	const onGameOver = useCallback(() => {
		stop();
		const sc = stateRef.current.score;
		statusRef.current = 'over';
		setStatus('over');
		setBest((prev) => {
			const nb = Math.max(prev, sc);
			if (dailyRef.current) {
				if (triesRef.current >= MAX_TRIES) setAlreadyPlayed(true);
				saveDailyRun(gameId, {
					startedAt: startRef.current,
					done: true,
					seed: seedRef.current,
					state: { best: nb, tries: triesRef.current } satisfies DailyState,
				});
			} else {
				try {
					localStorage.setItem(BEST_KEY, String(nb));
				} catch {
					/* ignore */
				}
			}
			return nb;
		});
		trackGame(gameId, 'game_over', { score: sc });
	}, [gameId, stop]);

	const handleEvents = useCallback((events: LugeEvent[]) => {
		for (const ev of events) {
			if (ev === 'crash') flashOpRef.current = 0.55;
			else if (ev === 'forkBonus') {
				setBonusFlash('Tunnel de glace ! +50 · BOOST');
				window.clearTimeout(bonusTimerRef.current);
				bonusTimerRef.current = window.setTimeout(() => setBonusFlash(null), 2200);
			}
		}
	}, []);

	const frame = useCallback(
		(now: number) => {
			if (!runningRef.current) return;
			const dt = Math.min(now - lastRef.current, 200);
			lastRef.current = now;
			accRef.current += dt;
			hudAccRef.current += dt;
			clockRef.current += dt;

			const steer = (keysRef.current.right ? 1 : 0) - (keysRef.current.left ? 1 : 0);
			let st = stateRef.current;
			let over = false;
			while (runningRef.current && accRef.current >= STEP) {
				accRef.current -= STEP;
				prevRef.current = { s: st.s, lat: st.lat };
				// +lat = screen-right for the chase camera, so keys map directly.
				const r = stepLuge(st, { steer }, STEP / 1000, segsRef.current);
				st = r.state;
				stateRef.current = st;
				if (r.events.length) handleEvents(r.events);
				if (st.status === 'over') {
					over = true;
					break;
				}
			}
			segsRef.current = ensureSegments(segsRef.current, seedRef.current, st.s);
			syncSegMeshes();

			// Interpolated render between the previous and current physics states.
			const alpha = Math.min(1, accRef.current / STEP);
			const sI = prevRef.current.s + (st.s - prevRef.current.s) * alpha;
			const latI = prevRef.current.lat + (st.lat - prevRef.current.lat) * alpha;
			draw(dt / 1000, sI, latI);

			if (hudAccRef.current >= 100) {
				hudAccRef.current = 0;
				setScore(st.score);
				setKmh(Math.round(st.speed * 3.6));
				setLives(st.lives);
				setBoosting(st.boostMs > 0);
			}

			if (over) {
				setScore(st.score);
				setLives(st.lives);
				onGameOver();
				return;
			}
			rafRef.current = requestAnimationFrame(frame);
		},
		[draw, handleEvents, onGameOver, syncSegMeshes],
	);

	/* ---- Run control ---- */
	const armWorld = useCallback(
		(seed: number) => {
			seedRef.current = seed;
			clearSegMeshes();
			segsRef.current = ensureSegments([], seed, 0);
			stateRef.current = createLuge();
			prevRef.current = { s: 0, lat: 0 };
			camLatRef.current = 0;
			syncSegMeshes();
			setScore(0);
			setKmh(0);
			setLives(LUGE.lives);
			setBoosting(false);
			draw(0, 0, 0);
		},
		[clearSegMeshes, syncSegMeshes, draw],
	);

	const start = useCallback(() => {
		if (webglError || dailyLoading) return;
		if (dailyRef.current && triesRef.current >= MAX_TRIES) return;
		armWorld(seedRef.current);
		accRef.current = 0;
		clockRef.current = 0;
		lastRef.current = performance.now();
		startRef.current = Date.now();
		runningRef.current = true;
		statusRef.current = 'playing';
		keysRef.current = { left: false, right: false };
		setStatus('playing');
		setAttempt((a) => a + 1);
		trackGame(gameId, 'game_started');
		if (dailyRef.current) {
			triesRef.current += 1;
			setTries(triesRef.current);
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: false,
				seed: seedRef.current,
				state: { best, tries: triesRef.current } satisfies DailyState,
			});
		}
		rafRef.current = requestAnimationFrame(frame);
	}, [webglError, dailyLoading, gameId, best, frame, armWorld]);

	/* ---- Modes ---- */
	const armFree = useCallback(() => {
		stop();
		dailyRef.current = false;
		setDaily(false);
		setAlreadyPlayed(false);
		triesRef.current = 0;
		setTries(0);
		statusRef.current = 'ready';
		setStatus('ready');
		try {
			setBest(Number(localStorage.getItem(BEST_KEY) ?? '0') || 0);
		} catch {
			setBest(0);
		}
		armWorld((Math.random() * 2 ** 32) >>> 0);
	}, [stop, armWorld]);

	const startDaily = useCallback(async () => {
		stop();
		dailyRef.current = true;
		setDaily(true);
		statusRef.current = 'ready';
		setStatus('ready');
		const run = loadDailyRun(gameId);
		if (run && run.seed != null) {
			const st = (run.state as DailyState | undefined) ?? { best: 0, tries: 0 };
			triesRef.current = st.tries ?? 0;
			setTries(triesRef.current);
			setBest(st.best ?? 0);
			const exhausted = triesRef.current >= MAX_TRIES;
			setAlreadyPlayed(exhausted);
			armWorld(run.seed);
			if (exhausted) {
				setScore(st.best ?? 0);
				statusRef.current = 'over';
				setStatus('over');
			}
			setDailyLoading(false);
			return;
		}
		setDailyLoading(true);
		setAlreadyPlayed(false);
		triesRef.current = 0;
		setTries(0);
		const { seed } = await getDaily(gameId);
		setBest(0);
		armWorld(seed);
		setDailyLoading(false);
	}, [gameId, stop, armWorld]);

	/* ---- Input ---- */
	useEffect(() => {
		const setKey = (k: string, down: boolean): boolean => {
			const r = keysRef.current;
			if (k === 'ArrowLeft' || k === 'a' || k === 'q') return ((r.left = down), true);
			if (k === 'ArrowRight' || k === 'd') return ((r.right = down), true);
			return false;
		};
		const onKeyDown = (e: KeyboardEvent) => {
			if (setKey(e.key, true)) {
				e.preventDefault();
				if (statusRef.current === 'ready') start();
			}
		};
		const onKeyUp = (e: KeyboardEvent) => setKey(e.key, false);
		window.addEventListener('keydown', onKeyDown, { passive: false });
		window.addEventListener('keyup', onKeyUp);
		return () => {
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
		};
	}, [start]);

	useEffect(() => {
		const onVis = () => {
			if (document.hidden) {
				if (runningRef.current) {
					runningRef.current = false;
					if (rafRef.current) cancelAnimationFrame(rafRef.current);
					rafRef.current = 0;
				}
			} else if (statusRef.current === 'playing' && !runningRef.current) {
				lastRef.current = performance.now();
				runningRef.current = true;
				rafRef.current = requestAnimationFrame(frame);
			}
		};
		document.addEventListener('visibilitychange', onVis);
		return () => document.removeEventListener('visibilitychange', onVis);
	}, [frame]);

	useEffect(() => {
		if (!initScene()) return;
		resize();
		armFree();
		const onResize = () => resize();
		const onFs = () => requestAnimationFrame(resize);
		window.addEventListener('resize', onResize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
			window.removeEventListener('resize', onResize);
			stop();
			window.clearTimeout(bonusTimerRef.current);
			clearSegMeshes();
			const g = g3Ref.current;
			if (g) {
				g.baseDisposables.forEach((d) => d.dispose());
				g.renderer.dispose();
				g3Ref.current = null;
			}
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const touch = (which: 'left' | 'right', down: boolean) => (e: React.PointerEvent) => {
		e.preventDefault();
		keysRef.current[which] = down;
		if (down && statusRef.current === 'ready') start();
	};

	const remaining = MAX_TRIES - tries;

	return (
		<div className="lg-root">
			<style>{CSS}</style>

			<ModeToggle daily={daily} onFree={armFree} onDaily={startDaily} />

			{daily ? (
				<div className="lg-daily-tag">
					{dailyLoading
						? 'Préparation de la descente…'
						: `Défi du jour · ${dailyWeekdayLabel()} · Essai ${Math.min(tries, MAX_TRIES)}/${MAX_TRIES}`}
				</div>
			) : (
				<div className="lg-daily-tag">Descente libre — graine aléatoire</div>
			)}

			<div className="lg-bar">
				<span className="lg-score">{fmtDist(score)}</span>
				<span className="lg-kmh">{kmh} km/h</span>
				<span className="lg-lives" aria-label={`${lives} vies`}>
					{Array.from({ length: LUGE.lives }, (_, i) => (
						<span key={i} className={i < lives ? '' : 'lost'}>♥</span>
					))}
				</span>
				<span className="lg-best">Record {fmtDist(best)}</span>
			</div>

			<div className="lg-boardwrap">
				<canvas ref={canvasRef} className="lg-canvas" role="img" aria-label={`Luge — ${fmtDist(score)}`} />
				<div ref={vignetteRef} className="lg-vignette" aria-hidden="true" />
				<div ref={flashRef} className="lg-flash" aria-hidden="true" />
				{boosting && <div className="lg-boost">BOOST</div>}
				{bonusFlash && <div className="lg-bonus">{bonusFlash}</div>}

				{status === 'playing' && (
					<div className="lg-touch">
						<button className="lg-tbtn" onPointerDown={touch('left', true)} onPointerUp={touch('left', false)} onPointerLeave={touch('left', false)} onPointerCancel={touch('left', false)} aria-label="Gauche">◀</button>
						<button className="lg-tbtn" onPointerDown={touch('right', true)} onPointerUp={touch('right', false)} onPointerLeave={touch('right', false)} onPointerCancel={touch('right', false)} aria-label="Droite">▶</button>
					</div>
				)}

				{webglError && (
					<div className="lg-overlay">
						<div className="lg-overlay-card">
							<p className="lg-go-title">3D indisponible</p>
							<p className="lg-overlay-note">Ton navigateur ne supporte pas WebGL.</p>
						</div>
					</div>
				)}
				{!webglError && status === 'ready' && !dailyLoading && !(daily && alreadyPlayed) && (
					<div className="lg-overlay">
						<button className="lg-startbtn" onClick={start}>▶ {daily ? 'Commencer' : 'Jouer'}</button>
					</div>
				)}
				{dailyLoading && <div className="lg-overlay"><div className="lg-overlay-card">Préparation…</div></div>}
				{!webglError && status === 'over' && (
					<div className="lg-overlay">
						<div className="lg-overlay-card">
							<p className="lg-go-title">{daily && alreadyPlayed && tries >= MAX_TRIES ? 'Défi du jour terminé' : '💥 Dans le décor !'}</p>
							<p className="lg-go-score">
								Distance {fmtDist(score)} · {daily ? 'Meilleure' : 'Record'} {fmtDist(best)}
							</p>
							{daily && alreadyPlayed ? (
								<p className="lg-overlay-note">Reviens demain&nbsp;!</p>
							) : (
								<button className="lg-startbtn sm" onClick={start}>
									↻ Rejouer{daily ? ` (${remaining} restant${remaining > 1 ? 's' : ''})` : ''}
								</button>
							)}
						</div>
					</div>
				)}
			</div>

			<p className="lg-help">
				Dévale la montagne en luge le plus loin possible ! Dirige avec <strong>◀ ▶</strong> (flèches / Q·D) ou les
				boutons tactiles. Évite <strong>sapins et rochers</strong> — 3 vies. Aux <strong>bifurcations</strong>, le
				tunnel de glace étroit rapporte un <strong>bonus et un boost</strong>… si tu en sors entier. Dans les
				<strong> pistes de bobsleigh</strong> gelées, plus rapides, grimpe sur les parois dans les virages. Au défi
				du jour, la descente est la même pour tout le monde ({MAX_TRIES} essais, meilleure distance classée).
			</p>

			{daily && <Leaderboard key={`lb-${gameId}-${attempt}`} game={gameId} metric="score" submitValue={status === 'over' ? best : undefined} format={fmtDist} />}
			{!daily && <LeaderboardCorner game={gameId} metric="score" />}
		</div>
	);
}

/* ---------- Styles (Ludiven charte + dark mode) ---------- */

const CSS = `
.lg-root {
  --lg-accent: var(--accent-regular);
  width: 100%; max-width: 760px; margin-inline: auto;
  color: var(--gray-0); font-family: var(--font-body);
  display: flex; flex-direction: column; align-items: center;
}
.lg-daily-tag { text-align: center; color: var(--gray-300); font-size: 12.5px; font-weight: 500; margin-bottom: 0.75rem; }
.lg-bar { width: 100%; display: flex; justify-content: center; align-items: center; gap: 0.5rem; font-weight: 700; font-size: 13px; margin-bottom: 0.85rem; flex-wrap: wrap; }
.lg-score { background: var(--lg-accent); color: var(--accent-text-over); border-radius: 999px; padding: 5px 14px; font-variant-numeric: tabular-nums; }
.lg-kmh { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 14px; font-variant-numeric: tabular-nums; min-width: 84px; text-align: center; }
.lg-lives { display: inline-flex; gap: 3px; font-size: 16px; color: #e34d5b; }
.lg-lives .lost { opacity: 0.22; }
.lg-best { background: var(--gray-900); color: var(--gray-0); border-radius: 999px; padding: 5px 14px; font-variant-numeric: tabular-nums; }

.lg-boardwrap { position: relative; width: 100%; }
.lg-canvas {
  width: 100%; aspect-ratio: 16 / 10; display: block;
  background: #cfe0f0; border: 1px solid var(--gray-800); border-radius: 12px;
  touch-action: none;
  -webkit-tap-highlight-color: transparent; -webkit-touch-callout: none; user-select: none;
}
.lg-vignette {
  position: absolute; inset: 0; border-radius: 12px; pointer-events: none; opacity: 0.25;
  background: radial-gradient(ellipse at center, transparent 52%, rgba(20,30,50,0.55) 100%);
}
.lg-flash { position: absolute; inset: 0; border-radius: 12px; pointer-events: none; background: rgba(220,40,40,0.5); opacity: 0; }
.lg-boost {
  position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
  background: rgba(40,140,255,0.85); color: #fff; font-weight: 800; font-size: 13px; letter-spacing: 0.12em;
  border-radius: 999px; padding: 4px 14px; pointer-events: none;
  animation: lg-pulse 0.6s ease-in-out infinite alternate;
}
.lg-bonus {
  position: absolute; top: 44px; left: 50%; transform: translateX(-50%);
  background: rgba(255,255,255,0.92); color: #1a2a44; font-weight: 700; font-size: 14px;
  border-radius: 10px; padding: 6px 14px; pointer-events: none; box-shadow: var(--shadow-md);
}
@keyframes lg-pulse { from { opacity: 0.75; } to { opacity: 1; } }

.lg-touch { position: absolute; bottom: 12px; left: 12px; right: 12px; display: flex; justify-content: space-between; pointer-events: none; }
.lg-tbtn { pointer-events: auto; width: 96px; height: 96px; border-radius: 24px; border: none; background: rgba(255,255,255,0.25); color: #12233d; font-weight: 800; font-size: 34px; cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none; touch-action: none; }
.lg-tbtn:active { background: rgba(255,255,255,0.5); }
@media (hover: hover) and (pointer: fine) { .lg-touch { display: none; } }

.lg-overlay {
  position: absolute; inset: 0; z-index: 2;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 0.6rem;
  background: rgba(20,30,52,0.4); backdrop-filter: blur(2px); border-radius: 12px;
}
.lg-overlay-card {
  background: var(--gray-999); border: 2px solid var(--lg-accent); border-radius: 16px;
  padding: 18px 26px; text-align: center; box-shadow: var(--shadow-lg); color: var(--gray-0);
}
.lg-overlay-note { color: var(--gray-300); font-size: 13px; margin: 0; }
.lg-go-title { font-family: var(--font-brand); font-weight: 600; font-size: 20px; margin: 0 0 4px; }
.lg-go-score { color: var(--gray-300); font-size: 14px; margin: 0 0 12px; font-variant-numeric: tabular-nums; }
.lg-startbtn {
  border: none; background: var(--lg-accent); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 18px; border-radius: 999px; padding: 14px 40px; cursor: pointer; box-shadow: var(--shadow-lg);
}
.lg-startbtn.sm { font-size: 15px; padding: 10px 26px; }

.lg-help { max-width: 640px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.5; margin-top: 1.1rem; }

/* Site global fullscreen → the run fills the remaining space. */
.game-page:fullscreen .lg-root { max-width: none; width: 100%; height: 100%; display: flex; flex-direction: column; }
.game-page:-webkit-full-screen .lg-root { max-width: none; width: 100%; height: 100%; display: flex; flex-direction: column; }
.game-page:fullscreen .lg-boardwrap { flex: 1; min-height: 0; display: flex; }
.game-page:-webkit-full-screen .lg-boardwrap { flex: 1; min-height: 0; display: flex; }
.game-page:fullscreen .lg-canvas { width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0; border: none; }
.game-page:-webkit-full-screen .lg-canvas { width: 100%; height: 100%; aspect-ratio: auto; border-radius: 0; border: none; }
.game-page:fullscreen .lg-help { display: none; }
.game-page:-webkit-full-screen .lg-help { display: none; }
`;
