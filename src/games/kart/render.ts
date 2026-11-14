// three.js view of a race: the floating road, space around it, ships, items and effects.
import * as THREE from 'three';
import { type Track, normalX, normalZ, locate, STEP } from './track';
import { type Race, type Kart, driftLevel } from './race';
import { buildShip, disposeShip, glowTexture, PIZZA_R, type ShipMesh } from './ships';
import { mulberry32 } from '../prng';

const DRIFT_COLORS = [0xffffff, 0x4cc9ff, 0xff9f1c, 0xd65bff];
const SPARKS = 420;

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	draw(c.getContext('2d')!);
	const t = new THREE.CanvasTexture(c);
	if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

function roadTexture() {
	return canvasTex(256, 256, (g) => {
		g.fillStyle = '#2a2550';
		g.fillRect(0, 0, 256, 256);
		// Panel seams and a faint grid: reads as speed when it scrolls.
		g.strokeStyle = 'rgba(140,130,255,0.18)';
		g.lineWidth = 2;
		for (let i = 0; i <= 256; i += 64) {
			g.beginPath();
			g.moveTo(i, 0);
			g.lineTo(i, 256);
			g.stroke();
			g.beginPath();
			g.moveTo(0, i);
			g.lineTo(256, i);
			g.stroke();
		}
		const rnd = mulberry32(7);
		for (let k = 0; k < 900; k++) {
			g.fillStyle = `rgba(${200 + rnd() * 55},${200 + rnd() * 55},255,${rnd() * 0.08})`;
			g.fillRect(rnd() * 256, rnd() * 256, 2, 2);
		}
		// Centre dashes.
		g.fillStyle = 'rgba(255,255,255,0.55)';
		g.fillRect(124, 0, 8, 120);
	});
}

function kerbTexture() {
	return canvasTex(32, 64, (g) => {
		g.fillStyle = '#ff3fa4';
		g.fillRect(0, 0, 32, 32);
		g.fillStyle = '#f5f2ff';
		g.fillRect(0, 32, 32, 32);
	});
}

function shoulderTexture() {
	return canvasTex(64, 64, (g) => {
		g.fillStyle = '#17142e';
		g.fillRect(0, 0, 64, 64);
		const rnd = mulberry32(3);
		for (let k = 0; k < 160; k++) {
			g.fillStyle = `rgba(120,110,200,${rnd() * 0.25})`;
			g.fillRect(rnd() * 64, rnd() * 64, 2, 2);
		}
	});
}

function checkerTexture() {
	return canvasTex(128, 32, (g) => {
		for (let x = 0; x < 16; x++)
			for (let y = 0; y < 4; y++) {
				g.fillStyle = (x + y) % 2 ? '#111' : '#fff';
				g.fillRect(x * 8, y * 8, 8, 8);
			}
	}, false);
}

function arrowTexture() {
	return canvasTex(64, 128, (g) => {
		g.fillStyle = 'rgba(255,140,0,0.25)';
		g.fillRect(0, 0, 64, 128);
		g.fillStyle = '#ffd23f';
		for (const y of [10, 74]) {
			g.beginPath();
			g.moveTo(32, y);
			g.lineTo(58, y + 36);
			g.lineTo(44, y + 36);
			g.lineTo(32, y + 20);
			g.lineTo(20, y + 36);
			g.lineTo(6, y + 36);
			g.closePath();
			g.fill();
		}
	});
}

function boxTexture() {
	return canvasTex(128, 128, (g) => {
		const grd = g.createLinearGradient(0, 0, 128, 128);
		grd.addColorStop(0, '#ff6ad5');
		grd.addColorStop(0.5, '#8c6bff');
		grd.addColorStop(1, '#3ee0ff');
		g.fillStyle = grd;
		g.fillRect(0, 0, 128, 128);
		g.strokeStyle = 'rgba(255,255,255,0.9)';
		g.lineWidth = 8;
		g.strokeRect(4, 4, 120, 120);
		g.fillStyle = '#fff';
		g.font = 'bold 92px system-ui, sans-serif';
		g.textAlign = 'center';
		g.textBaseline = 'middle';
		g.fillText('?', 64, 70);
	}, false);
}

function planetTexture() {
	return canvasTex(512, 256, (g) => {
		const rnd = mulberry32(11);
		const bands = ['#f0b67f', '#e08e5a', '#f6d3a5', '#c96b4b', '#f2c08a', '#b65a48', '#f7dcb4'];
		let y = 0;
		while (y < 256) {
			const h = 8 + rnd() * 26;
			g.fillStyle = bands[Math.floor(rnd() * bands.length)];
			g.fillRect(0, y, 512, h + 1);
			y += h;
		}
		g.globalAlpha = 0.35;
		for (let k = 0; k < 60; k++) {
			g.fillStyle = bands[Math.floor(rnd() * bands.length)];
			g.beginPath();
			g.ellipse(rnd() * 512, rnd() * 256, 20 + rnd() * 60, 3 + rnd() * 6, 0, 0, Math.PI * 2);
			g.fill();
		}
		g.globalAlpha = 1;
		g.fillStyle = '#a3443a';
		g.beginPath();
		g.ellipse(330, 150, 34, 16, 0, 0, Math.PI * 2);
		g.fill();
	}, false);
}

/** A ribbon strip along the track between lateral offsets a and b, at height dy. */
function ribbon(t: Track, a: number, b: number, dy: number, vScale: number): THREE.BufferGeometry {
	const n = t.n;
	const pos = new Float32Array((n + 1) * 2 * 3);
	const uv = new Float32Array((n + 1) * 2 * 2);
	const idx: number[] = [];
	for (let k = 0; k <= n; k++) {
		const i = k % n;
		const nx = normalX(t, i), nz = normalZ(t, i);
		const v = (k * STEP) / vScale;
		for (let side = 0; side < 2; side++) {
			const l = side ? b : a;
			const o = (k * 2 + side) * 3;
			pos[o] = t.px[i] + nx * l;
			pos[o + 1] = t.py[i] + dy;
			pos[o + 2] = t.pz[i] + nz * l;
			uv[(k * 2 + side) * 2] = side;
			uv[(k * 2 + side) * 2 + 1] = v;
		}
		if (k < n) {
			const p = k * 2;
			idx.push(p, p + 2, p + 1, p + 1, p + 2, p + 3);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

/** A vertical strip at lateral offset l, from y0 to y1 above the road. */
function wallStrip(t: Track, l: number, y0: number, y1: number): THREE.BufferGeometry {
	const n = t.n;
	const pos = new Float32Array((n + 1) * 2 * 3);
	const uv = new Float32Array((n + 1) * 2 * 2);
	const idx: number[] = [];
	for (let k = 0; k <= n; k++) {
		const i = k % n;
		const x = t.px[i] + normalX(t, i) * l, z = t.pz[i] + normalZ(t, i) * l;
		for (let up = 0; up < 2; up++) {
			const o = (k * 2 + up) * 3;
			pos[o] = x;
			pos[o + 1] = t.py[i] + (up ? y1 : y0);
			pos[o + 2] = z;
			uv[(k * 2 + up) * 2] = (k * STEP) / 4;
			uv[(k * 2 + up) * 2 + 1] = up;
		}
		if (k < n) {
			const p = k * 2;
			idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2);
		}
	}
	const g = new THREE.BufferGeometry();
	g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	g.setIndex(idx);
	g.computeVertexNormals();
	return g;
}

interface KartView {
	ship: ShipMesh;
	id: string;
	spinAngle: number;
	ring: THREE.Mesh;
}

interface Spark { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; max: number; r: number; g: number; b: number }

export interface View {
	renderer: THREE.WebGLRenderer;
	camera: THREE.PerspectiveCamera;
	setRace(r: Race): void;
	refreshShip(k: Kart): void;
	render(r: Race, focus: number, dt: number, mode: 'menu' | 'race'): void;
	burst(x: number, y: number, z: number, color: number, n: number): void;
	resize(w: number, h: number): void;
	dispose(): void;
}

export function createView(canvas: HTMLCanvasElement, track: Track): View {
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
	renderer.outputColorSpace = THREE.SRGBColorSpace;
	const scene = new THREE.Scene();
	scene.background = new THREE.Color(0x070516);
	scene.fog = new THREE.Fog(0x0b0824, 160, 520);
	const camera = new THREE.PerspectiveCamera(72, 1, 0.3, 2500);
	const disposables: { dispose(): void }[] = [];
	const keep = <T extends { dispose(): void }>(x: T) => (disposables.push(x), x);

	scene.add(new THREE.HemisphereLight(0xc9d6ff, 0x3a2050, 1.35));
	const sun = new THREE.DirectionalLight(0xffe2c0, 1.6);
	sun.position.set(-300, 400, -200);
	scene.add(sun);

	// Space: stars, a ringed gas giant, two nebula clouds.
	{
		const rnd = mulberry32(21);
		const N = 2600;
		const pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
		for (let i = 0; i < N; i++) {
			const u = rnd() * 2 - 1, a = rnd() * Math.PI * 2, r = 1500;
			const s = Math.sqrt(1 - u * u);
			pos[i * 3] = Math.cos(a) * s * r;
			pos[i * 3 + 1] = u * r;
			pos[i * 3 + 2] = Math.sin(a) * s * r;
			const w = 0.6 + rnd() * 0.4, tint = rnd();
			col[i * 3] = w * (tint > 0.8 ? 1 : 0.85);
			col[i * 3 + 1] = w * 0.9;
			col[i * 3 + 2] = w * (tint < 0.3 ? 1 : 0.95);
		}
		const g = keep(new THREE.BufferGeometry());
		g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
		g.setAttribute('color', new THREE.BufferAttribute(col, 3));
		const stars = new THREE.Points(g, keep(new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false })));
		stars.renderOrder = -2;
		scene.add(stars);

		const planet = new THREE.Mesh(keep(new THREE.SphereGeometry(260, 48, 32)), keep(new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 1, fog: false })));
		planet.position.set(380, 120, 1050);
		planet.rotation.z = 0.25;
		scene.add(planet);
		const ringGeo = keep(new THREE.RingGeometry(330, 520, 96));
		const ringTex = canvasTex(256, 4, (gg) => {
			const grd = gg.createLinearGradient(0, 0, 256, 0);
			grd.addColorStop(0, 'rgba(255,220,180,0)');
			grd.addColorStop(0.2, 'rgba(255,220,180,0.55)');
			grd.addColorStop(0.45, 'rgba(210,160,120,0.2)');
			grd.addColorStop(0.6, 'rgba(255,230,200,0.6)');
			grd.addColorStop(1, 'rgba(255,220,180,0)');
			gg.fillStyle = grd;
			gg.fillRect(0, 0, 256, 4);
		}, false);
		// RingGeometry's uv runs across x; map radius instead.
		const p = ringGeo.attributes.position, uvA = ringGeo.attributes.uv;
		for (let i = 0; i < p.count; i++) {
			const r = Math.hypot(p.getX(i), p.getY(i));
			uvA.setXY(i, (r - 330) / 190, 0.5);
		}
		const ring = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, depthWrite: false, fog: false })));
		ring.position.copy(planet.position);
		ring.rotation.x = -Math.PI / 2 + 0.35;
		ring.rotation.y = 0.2;
		scene.add(ring);

		for (const [x, y, z, c, s] of [[-900, 200, -700, 0x7b3fe4, 1300], [900, -100, -900, 0x12b3c9, 1100], [-1000, -250, 600, 0xd23f8f, 1000]] as const) {
			const neb = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glowTexture(), color: c, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, fog: false })));
			neb.position.set(x, y, z);
			neb.scale.setScalar(s);
			neb.renderOrder = -1;
			scene.add(neb);
		}
	}

	// The road.
	const hw = track.halfWidth, wall = track.wall;
	const roadTex = roadTexture();
	roadTex.repeat.set(1, 1);
	const road = new THREE.Mesh(keep(ribbon(track, -hw, hw, 0, 16)), keep(new THREE.MeshStandardMaterial({ map: roadTex, roughness: 0.7, metalness: 0.2 })));
	scene.add(road);
	const shoulderMat = keep(new THREE.MeshStandardMaterial({ map: shoulderTexture(), roughness: 1 }));
	scene.add(new THREE.Mesh(keep(ribbon(track, hw + 1, wall, -0.02, 6)), shoulderMat));
	scene.add(new THREE.Mesh(keep(ribbon(track, -wall, -hw - 1, -0.02, 6)), shoulderMat));
	const kerbMat = keep(new THREE.MeshStandardMaterial({ map: kerbTexture(), roughness: 0.6, emissive: 0x401030 }));
	scene.add(new THREE.Mesh(keep(ribbon(track, hw, hw + 1, 0.01, 4)), kerbMat));
	scene.add(new THREE.Mesh(keep(ribbon(track, -hw - 1, -hw, 0.01, 4)), kerbMat));
	// Underside slab, so the road reads as floating.
	const slabMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a3560, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }));
	scene.add(new THREE.Mesh(keep(wallStrip(track, wall, -1.6, 0)), slabMat));
	scene.add(new THREE.Mesh(keep(wallStrip(track, -wall, -1.6, 0)), slabMat));
	scene.add(new THREE.Mesh(keep(ribbon(track, -wall, wall, -1.6, 20)), slabMat));
	// Energy barriers.
	const barrierMat = keep(new THREE.MeshBasicMaterial({ color: 0x38e1ff, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
	const railMat = keep(new THREE.MeshBasicMaterial({ color: 0x7ff0ff }));
	for (const l of [wall, -wall]) {
		scene.add(new THREE.Mesh(keep(wallStrip(track, l, 0, 1.3)), barrierMat));
		scene.add(new THREE.Mesh(keep(wallStrip(track, l, 1.22, 1.38)), railMat));
	}
	// Posts every 8 m.
	{
		const postGeo = keep(new THREE.BoxGeometry(0.25, 1.5, 0.25));
		const postMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a86b8, metalness: 0.6, roughness: 0.4 }));
		const count = Math.floor(track.n / 4) * 2;
		const posts = new THREE.InstancedMesh(postGeo, postMat, count);
		const m = new THREE.Matrix4();
		let c = 0;
		for (let i = 0; i < track.n && c < count; i += 4) {
			for (const l of [wall, -wall]) {
				m.makeTranslation(track.px[i] + normalX(track, i) * l, track.py[i] + 0.75, track.pz[i] + normalZ(track, i) * l);
				posts.setMatrixAt(c++, m);
			}
		}
		posts.count = c;
		scene.add(posts);
	}
	// Start line and its arch.
	{
		const g = keep(new THREE.PlaneGeometry(2.2, hw * 2).rotateX(-Math.PI / 2));
		const line = new THREE.Mesh(g, keep(new THREE.MeshBasicMaterial({ map: checkerTexture() })));
		const h = Math.atan2(track.tz[0], track.tx[0]);
		line.position.set(track.px[0], track.py[0] + 0.03, track.pz[0]);
		line.rotation.y = -h;
		scene.add(line);
		const archMat = keep(new THREE.MeshStandardMaterial({ color: 0x2e2a52, metalness: 0.6, roughness: 0.3, emissive: 0x1a1240 }));
		const arch = new THREE.Group();
		const pillar = keep(new THREE.BoxGeometry(0.8, 8, 0.8));
		for (const l of [wall + 0.6, -wall - 0.6]) {
			const m = new THREE.Mesh(pillar, archMat);
			m.position.set(0, 4, l);
			arch.add(m);
		}
		const banner = new THREE.Mesh(keep(new THREE.BoxGeometry(0.6, 1.6, wall * 2 + 2)), keep(new THREE.MeshBasicMaterial({ map: canvasTex(512, 64, (gg) => {
			gg.fillStyle = '#14102e';
			gg.fillRect(0, 0, 512, 64);
			gg.fillStyle = '#ff6ad5';
			gg.font = 'bold 40px system-ui, sans-serif';
			gg.textAlign = 'center';
			gg.textBaseline = 'middle';
			gg.fillText('KART GALACTIQUE', 256, 34);
		}, false) })));
		banner.position.y = 8;
		arch.add(banner);
		arch.position.set(track.px[0], track.py[0], track.pz[0]);
		arch.rotation.y = -h;
		scene.add(arch);
	}

	// Asteroids, kept clear of the road.
	const asteroids: { m: THREE.Mesh; sx: number; sy: number }[] = [];
	{
		const rnd = mulberry32(5);
		const mats = [0x6b5f7a, 0x7d6a5a, 0x5a6478].map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true })));
		let tries = 0;
		while (asteroids.length < 90 && tries++ < 3000) {
			const i = Math.floor(rnd() * track.n);
			const side = rnd() < 0.5 ? -1 : 1;
			const off = wall + 22 + rnd() * 120;
			const x = track.px[i] + normalX(track, i) * off * side, z = track.pz[i] + normalZ(track, i) * off * side;
			const q = locate(track, x, z);
			if (Math.abs(q.lat) < wall + 20) continue;
			const r = 1.5 + rnd() ** 2 * 9;
			const geo = keep(new THREE.IcosahedronGeometry(r, rnd() < 0.5 ? 0 : 1));
			const p = geo.attributes.position;
			for (let v = 0; v < p.count; v++) p.setXYZ(v, p.getX(v) * (0.8 + rnd() * 0.4), p.getY(v) * (0.7 + rnd() * 0.5), p.getZ(v) * (0.8 + rnd() * 0.4));
			geo.computeVertexNormals();
			const m = new THREE.Mesh(geo, mats[Math.floor(rnd() * mats.length)]);
			// Near the road, keep them above or below the driver's eye line.
			const dy = off < wall + 60 ? (rnd() < 0.5 ? -1 : 1) * (14 + rnd() * 26) : -25 + rnd() * 50;
			m.position.set(x, track.py[i] + dy, z);
			m.rotation.set(rnd() * 6, rnd() * 6, rnd() * 6);
			scene.add(m);
			asteroids.push({ m, sx: (rnd() - 0.5) * 0.4, sy: (rnd() - 0.5) * 0.4 });
		}
	}

	// Item boxes and boost pads.
	const boxGeo = keep(new THREE.BoxGeometry(1.5, 1.5, 1.5));
	const boxMat = keep(new THREE.MeshStandardMaterial({ map: boxTexture(), transparent: true, opacity: 0.88, emissive: 0x6040a0, emissiveIntensity: 0.5 }));
	let boxMeshes: THREE.Mesh[] = [];
	const padTex = arrowTexture();
	const padMat = keep(new THREE.MeshBasicMaterial({ map: padTex, transparent: true, depthWrite: false }));
	const padGeo = keep(new THREE.PlaneGeometry(5, 3.4).rotateX(-Math.PI / 2).rotateY(-Math.PI / 2));
	let padMeshes: THREE.Mesh[] = [];

	// Mines, bolts, beams: small pools.
	const mineGeo = keep(new THREE.IcosahedronGeometry(0.55, 0));
	const mineMat = keep(new THREE.MeshStandardMaterial({ color: 0xff5fa2, emissive: 0xff2a7a, emissiveIntensity: 0.6, flatShading: true, metalness: 0.4 }));
	const mines: THREE.Mesh[] = [];
	const boltGeo = keep(new THREE.CapsuleGeometry(0.22, 2.2, 4, 8).rotateZ(Math.PI / 2));
	const boltMat = keep(new THREE.MeshBasicMaterial({ color: 0xff3355 }));
	const bolts: THREE.Group[] = [];
	const beamGeo = keep(new THREE.CylinderGeometry(0.35, 0.35, 1, 8, 1, true).rotateX(Math.PI / 2));
	const beamMat = keep(new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
	const beams: THREE.Mesh[] = [];
	const ringGeo = keep(new THREE.TorusGeometry(2, 0.12, 6, 32).rotateX(Math.PI / 2));
	const ringMat = keep(new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending }));

	// Sparks.
	const sparkPos = new Float32Array(SPARKS * 3), sparkCol = new Float32Array(SPARKS * 3);
	const sparkGeo = keep(new THREE.BufferGeometry());
	sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
	sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
	const sparkPts = new THREE.Points(sparkGeo, keep(new THREE.PointsMaterial({ size: 0.35, vertexColors: true, map: glowTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
	sparkPts.frustumCulled = false;
	scene.add(sparkPts);
	const sparks: Spark[] = [];
	const emit = (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: number) => {
		if (sparks.length >= SPARKS) sparks.shift();
		sparks.push({ x, y, z, vx, vy, vz, life, max: life, r: ((color >> 16) & 255) / 255, g: ((color >> 8) & 255) / 255, b: (color & 255) / 255 });
	};

	let karts: KartView[] = [];
	let race: Race | null = null;
	const cam = { x: 0, y: 5, z: 0, h: 0, fov: 72, orbit: 0 };
	let clock = 0;

	const view: View = {
		renderer,
		camera,
		setRace(r) {
			race = r;
			for (const kv of karts) {
				scene.remove(kv.ship.root);
				disposeShip(kv.ship);
			}
			karts = r.karts.map((k) => {
				const ship = buildShip(k.ship.id, k.color);
				scene.add(ship.root);
				const ring = new THREE.Mesh(ringGeo, ringMat);
				ring.visible = false;
				ship.root.add(ring);
				return { ship, id: k.ship.id, spinAngle: 0, ring };
			});
			for (const m of boxMeshes) scene.remove(m);
			boxMeshes = r.boxes.map((b) => {
				const m = new THREE.Mesh(boxGeo, boxMat);
				m.position.set(b.x, b.y + 1.3, b.z);
				scene.add(m);
				return m;
			});
			for (const m of padMeshes) scene.remove(m);
			padMeshes = r.pads.map((p) => {
				const m = new THREE.Mesh(padGeo, padMat);
				m.position.set(p.x, p.y + 0.04, p.z);
				m.rotation.y = -p.heading;
				scene.add(m);
				return m;
			});
			const me = r.karts.find((k) => k.player) ?? r.karts[0];
			cam.h = me.heading;
		},
		refreshShip(k) {
			const kv = karts[k.idx];
			if (!kv || kv.id === k.ship.id) return;
			scene.remove(kv.ship.root);
			kv.ship.root.remove(kv.ring);
			disposeShip(kv.ship);
			kv.ship = buildShip(k.ship.id, k.color);
			kv.ship.root.add(kv.ring);
			kv.id = k.ship.id;
			scene.add(kv.ship.root);
		},
		burst(x, y, z, color, n) {
			for (let i = 0; i < n; i++) {
				const a = Math.random() * Math.PI * 2, u = Math.random();
				emit(x, y + 0.8, z, Math.cos(a) * 9 * u, 3 + Math.random() * 7, Math.sin(a) * 9 * u, 0.5 + Math.random() * 0.4, color);
			}
		},
		render(r, focus, dt, mode) {
			if (r !== race) view.setRace(r);
			clock += dt;
			// Ships.
			for (const k of r.karts) {
				const kv = karts[k.idx];
				const root = kv.ship.root;
				root.position.set(k.x, k.y, k.z);
				const visualYaw = k.heading + k.drift * 0.42 + k.steer * 0.08;
				root.rotation.y = -visualYaw;
				kv.spinAngle = k.spin > 0 ? kv.spinAngle + dt * 14 : 0;
				const body = kv.ship.body;
				body.rotation.y = kv.spinAngle;
				body.position.y = 0.35 + Math.sin(clock * 5 + k.idx) * 0.06 + (k.grounded ? 0 : 0.1);
				body.rotation.x = -k.steer * 0.12 - k.drift * 0.1; // lean into the turn
				body.rotation.z = k.grounded ? 0 : 0.06;
				const boosting = k.boost > 0;
				for (const f of kv.ship.flames) {
					const s = (boosting ? (k.hyper > 0 ? 2.6 : 1.9) : 0.8 + Math.min(1, Math.abs(k.speed) / 30) * 0.5) * (0.9 + Math.random() * 0.2);
					f.scale.setScalar(s);
					(f.material as THREE.SpriteMaterial).color.setHex(k.hyper > 0 ? 0xffffff : boosting ? 0xffa53c : 0x6fd0ff);
				}
				if (kv.ship.wheel) {
					kv.ship.wheel.rotation.z -= (k.speed * dt) / PIZZA_R;
					// The pizza rolls on the road: no hovering bob.
					body.position.y = k.grounded ? 0.02 : 0.12;
				}
				kv.ring.visible = k.slow > 0;
				if (kv.ring.visible) kv.ring.rotation.y = clock * 4;
				// Drift sparks from the rear corners.
				if (k.drift !== 0 && k.grounded) {
					const lvl = driftLevel(k.driftCharge);
					const c = DRIFT_COLORS[lvl];
					const fx = Math.cos(visualYaw), fz = Math.sin(visualYaw);
					for (const side of [-1, 1]) {
						const sx = k.x - fx * 1.4 + -fz * side * 0.9, sz = k.z - fz * 1.4 + fx * side * 0.9;
						for (let i = 0; i < (lvl ? 2 : 1); i++) emit(sx, k.y + 0.3, sz, -fx * 4 + (Math.random() - 0.5) * 3, 1 + Math.random() * 3, -fz * 4 + (Math.random() - 0.5) * 3, 0.25 + Math.random() * 0.2, c);
					}
				}
				if (k.hyper > 0) emit(k.x, k.y + 0.8, k.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0.5, [0xff6ad5, 0x3ee0ff, 0xffd23f][Math.floor(Math.random() * 3)]);
			}
			for (let i = 0; i < r.boxes.length; i++) {
				const b = r.boxes[i], m = boxMeshes[i];
				m.visible = b.respawn <= 0 || b.respawn < 0.4;
				m.scale.setScalar(b.respawn > 0 ? 1 - b.respawn / 0.4 : 1);
				m.rotation.set(clock * 0.7 + i, clock * 1.1 + i, 0);
				m.position.y = b.y + 1.3 + Math.sin(clock * 2 + i) * 0.2;
			}
			padTex.offset.y = -clock * 1.5;
			while (mines.length < r.mines.length) {
				const m = new THREE.Mesh(mineGeo, mineMat);
				scene.add(m);
				mines.push(m);
			}
			mines.forEach((m, i) => {
				const d = r.mines[i];
				m.visible = !!d;
				if (d) {
					m.position.set(d.x, d.y + 0.7 + Math.sin(clock * 4 + i) * 0.12, d.z);
					m.rotation.y = clock * 2;
				}
			});
			mineMat.emissiveIntensity = 0.4 + 0.4 * (Math.sin(clock * 10) * 0.5 + 0.5);
			while (bolts.length < r.bolts.length) {
				const g = new THREE.Group();
				g.add(new THREE.Mesh(boltGeo, boltMat));
				const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xff3355, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
				glow.scale.set(4, 2, 1);
				g.add(glow);
				scene.add(g);
				bolts.push(g);
			}
			bolts.forEach((g, i) => {
				const b = r.bolts[i];
				g.visible = !!b;
				if (b) {
					g.position.set(b.x, b.y, b.z);
					g.rotation.y = -b.heading;
				}
			});
			while (beams.length < r.beams.length) {
				const m = new THREE.Mesh(beamGeo, beamMat);
				scene.add(m);
				beams.push(m);
			}
			beams.forEach((m, i) => {
				const b = r.beams[i];
				m.visible = !!b;
				if (b) {
					const a = r.karts[b.from], c = r.karts[b.to];
					const A = new THREE.Vector3(a.x, a.y + 1.2, a.z), C = new THREE.Vector3(c.x, c.y + 1.2, c.z);
					m.position.copy(A).lerp(C, 0.5);
					m.scale.set(1 + Math.sin(clock * 20) * 0.2, 1 + Math.sin(clock * 20) * 0.2, A.distanceTo(C));
					m.lookAt(C);
				}
			});
			for (const a of asteroids) {
				a.m.rotation.x += a.sx * dt;
				a.m.rotation.y += a.sy * dt;
			}
			// Sparks.
			for (let i = sparks.length - 1; i >= 0; i--) {
				const s = sparks[i];
				s.life -= dt;
				if (s.life <= 0) {
					sparks.splice(i, 1);
					continue;
				}
				s.vy -= 12 * dt;
				s.x += s.vx * dt;
				s.y += s.vy * dt;
				s.z += s.vz * dt;
			}
			for (let i = 0; i < SPARKS; i++) {
				const s = sparks[i];
				if (s) {
					const f = s.life / s.max;
					sparkPos[i * 3] = s.x;
					sparkPos[i * 3 + 1] = s.y;
					sparkPos[i * 3 + 2] = s.z;
					sparkCol[i * 3] = s.r * f;
					sparkCol[i * 3 + 1] = s.g * f;
					sparkCol[i * 3 + 2] = s.b * f;
				} else {
					sparkPos[i * 3 + 1] = -9999;
				}
			}
			sparkGeo.attributes.position.needsUpdate = true;
			sparkGeo.attributes.color.needsUpdate = true;

			// Camera.
			const k = r.karts[focus];
			const portrait = camera.aspect < 1;
			if (mode === 'menu') {
				cam.orbit += dt * 0.35;
				const d = portrait ? 9.5 : 7.5;
				camera.position.set(k.x + Math.cos(cam.orbit) * d, k.y + 2.6, k.z + Math.sin(cam.orbit) * d);
				camera.fov = portrait ? 70 : 50;
				camera.lookAt(k.x, k.y + 1, k.z);
				// The menu card covers the left (landscape) or the bottom (portrait): move the ship clear of it.
				const w = renderer.domElement.clientWidth, h = renderer.domElement.clientHeight;
				if (portrait) camera.setViewOffset(w, h, 0, h * 0.24, w, h);
				else camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
				cam.x = camera.position.x;
				cam.y = camera.position.y;
				cam.z = camera.position.z;
				cam.h = k.heading;
			} else if (r.time < 0) {
				camera.clearViewOffset();
				// Countdown: swing from the ship's nose round to its tail.
				const u = Math.min(1, Math.max(0, (r.time + 3) / 2.6));
				const e = u * u * (3 - 2 * u);
				const a = k.heading + Math.PI * (1 - e) + 0.5 * (1 - e);
				const d = (portrait ? 8.5 : 6.6) + 3 * (1 - e);
				cam.x = k.x - Math.cos(a) * d;
				cam.z = k.z - Math.sin(a) * d;
				cam.y = k.y + (portrait ? 3.6 : 2.7) + (1 - e);
				cam.h = k.heading;
				camera.position.set(cam.x, cam.y, cam.z);
				camera.lookAt(k.x, k.y + 1.1, k.z);
				camera.fov = cam.fov = portrait ? 82 : 70;
			} else {
				camera.clearViewOffset();
				cam.h += Math.atan2(Math.sin(k.heading - cam.h), Math.cos(k.heading - cam.h)) * Math.min(1, dt * (k.spin > 0 ? 1.5 : 5));
				const fx = Math.cos(cam.h), fz = Math.sin(cam.h);
				const dist = portrait ? 8.5 : 6.6, hgt = portrait ? 3.6 : 2.7;
				const lag = Math.min(1, dt * 10);
				cam.x += (k.x - fx * dist - cam.x) * lag;
				cam.y += (k.y + hgt - cam.y) * Math.min(1, dt * 6);
				cam.z += (k.z - fz * dist - cam.z) * lag;
				camera.position.set(cam.x, cam.y, cam.z);
				camera.lookAt(k.x + fx * 5, k.y + 1.1, k.z + fz * 5);
				const want = (portrait ? 82 : 70) + (k.boost > 0 ? (k.hyper > 0 ? 16 : 9) : 0) + Math.min(1, Math.max(0, k.speed) / 32) * 4;
				cam.fov += (want - cam.fov) * Math.min(1, dt * 4);
				camera.fov = cam.fov;
			}
			camera.updateProjectionMatrix();
			renderer.render(scene, camera);
		},
		resize(w, h) {
			renderer.setSize(w, h, false);
			camera.aspect = w / Math.max(1, h);
			camera.updateProjectionMatrix();
		},
		dispose() {
			for (const kv of karts) disposeShip(kv.ship);
			for (const d of disposables) d.dispose();
			renderer.dispose();
		},
	};
	return view;
}
