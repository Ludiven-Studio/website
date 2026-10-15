import * as THREE from 'three';
import { buildEnv } from './world';
import { buildZones, type P3, type ClimbSpot } from './zones';
import { createTiger } from './tiger';
import { createSally, createOwl, createBeaver, createHedgehog, createRabbit, createFrog, type Npc, type Mood } from './critters';
import { createInput } from './input';
import { Player, RUN, type Command } from './player';
import { createFx } from './fx';
import { Audio } from './audio';
import { Hud, type Objective, type MapMarker } from './hud';
import { L, newState, loadState, saveState, clearState, jars, goldCount, GOLD_TOTAL, SOUVENIRS, COLORS, type Line, type State, type Who } from './story';
import { groundHeight, mountPolar, mountPoint, ringOf, riverX, regionName, ringLevel, R_OUT, START, OAK_GATE, MOUNT, ISLETS, BANK } from './terrain';
import { query, inside, type Solid } from './colliders';

type NpcKey = 'sally' | 'owl' | 'beaver' | 'pipa' | 'lila' | 'lou' | 'frog';

const CLIMB_TIME = 2.2;
const TALK_DIST = 2.4;
const NPC_NAMES: Record<NpcKey, Who> = { sally: 'Sally', owl: 'Hector', beaver: 'Barnabé', pipa: 'Pipa', lila: 'Lila', lou: 'Lou', frog: 'Gaston' };
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const V = (p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x, p.y, p.z);

function nutMesh(gold: boolean): THREE.Group {
	const g = new THREE.Group();
	const shellM = gold ? new THREE.MeshStandardMaterial({ color: '#f2c14e', emissive: '#c88a10', emissiveIntensity: 0.45, metalness: 0.5, roughness: 0.35, flatShading: true }) : new THREE.MeshStandardMaterial({ color: '#b7763a', roughness: 0.5, flatShading: true });
	const capM = gold ? new THREE.MeshStandardMaterial({ color: '#d99a1c', emissive: '#8a5a08', emissiveIntensity: 0.4, metalness: 0.5, roughness: 0.4, flatShading: true }) : new THREE.MeshStandardMaterial({ color: '#7a4b25', flatShading: true });
	const s = gold ? 1.5 : 1;
	const shell = new THREE.Mesh(new THREE.SphereGeometry(0.13 * s, 8, 6), shellM);
	shell.scale.set(1, 1.15, 1);
	const cap = new THREE.Mesh(new THREE.SphereGeometry(0.135 * s, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.2), capM);
	cap.position.y = 0.04 * s;
	const tip = new THREE.Mesh(new THREE.ConeGeometry(0.025 * s, 0.07 * s, 5), capM);
	tip.position.y = 0.18 * s;
	g.add(shell, cap, tip);
	g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
	return g;
}

function branchMesh(): THREE.Group {
	const b = new THREE.Group();
	const wood = new THREE.MeshStandardMaterial({ color: '#8a5a36', flatShading: true });
	b.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.07, 1.1, 5).rotateZ(Math.PI / 2), wood));
	const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.45, 4), wood);
	tw.position.set(0.2, 0.12, 0);
	tw.rotation.z = -0.8;
	b.add(tw);
	const leaf = new THREE.MeshStandardMaterial({ color: '#6dbb52', flatShading: true });
	for (const x of [-0.35, 0.3, 0.42]) {
		const lf = new THREE.Mesh(new THREE.IcosahedronGeometry(0.11, 0), leaf);
		lf.position.set(x, 0.07, 0.05);
		b.add(lf);
	}
	b.traverse((o) => ((o as THREE.Mesh).castShadow = true));
	return b;
}

function kiteMesh(): THREE.Group {
	const k = new THREE.Group();
	const cols = ['#ff6b6b', '#ffd23f', '#4ecdc4', '#a78bfa'];
	const pts = [[0, 0.55], [0.38, 0], [0, -0.75], [-0.38, 0]];
	for (let i = 0; i < 4; i++) {
		const a = pts[i], b = pts[(i + 1) % 4];
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, a[0], a[1], 0, b[0], b[1], 0], 3));
		geo.computeVertexNormals();
		k.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: cols[i], side: THREE.DoubleSide, flatShading: true })));
	}
	const tail = new THREE.Group();
	for (let i = 0; i < 5; i++) {
		const bow = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.06, 0.02), new THREE.MeshStandardMaterial({ color: cols[i % 4] }));
		bow.position.set(Math.sin(i) * 0.05, -0.85 - i * 0.2, 0);
		tail.add(bow);
	}
	k.add(tail);
	return k;
}

// Soft radial glow for additive sprites.
function glowTexture(): THREE.Texture {
	const c = document.createElement('canvas');
	c.width = c.height = 128;
	const g = c.getContext('2d')!;
	const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
	grad.addColorStop(0, 'rgba(255,255,255,1)');
	grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
	grad.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = grad;
	g.fillRect(0, 0, 128, 128);
	return new THREE.CanvasTexture(c);
}

function orbMesh(): THREE.Group {
	const g = new THREE.Group();
	const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: '#fff3a0' }));
	const halo = new THREE.Mesh(new THREE.IcosahedronGeometry(0.32, 1), new THREE.MeshBasicMaterial({ color: '#ffd84d', transparent: true, opacity: 0.3, depthWrite: false }));
	g.add(core, halo);
	for (let i = 0; i < 3; i++) {
		const f = new THREE.Mesh(new THREE.SphereGeometry(0.04, 5, 4), new THREE.MeshBasicMaterial({ color: '#fffbe0' }));
		f.userData.k = i;
		g.add(f);
	}
	return g;
}

export function start(): void {
	const coarse = matchMedia('(pointer: coarse)').matches;
	const stageEl = $('stage');
	const canvas = $<HTMLCanvasElement>('view');
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: !coarse });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, coarse ? 1.5 : 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

	const env = buildEnv(coarse);
	const scene = env.scene;
	const zones = buildZones(scene, coarse);
	const fx = createFx();
	scene.add(fx.group);
	const audio = new Audio();
	const hud = new Hud();
	const input = createInput(stageEl, $('joy'), $('joy-knob'), { action: $('btn-action'), jump: $('btn-jump'), roll: $('btn-roll'), menu: $('btn-menu') });

	// — Characters —
	const tiger = createTiger();
	scene.add(tiger.root);
	const npcs: Record<NpcKey, Npc> = {
		sally: createSally(),
		owl: createOwl(),
		beaver: createBeaver(),
		pipa: createHedgehog(1),
		lila: createRabbit('#f4efe8', '#ff8fb5', false),
		lou: createRabbit('#b9b2a8', '#4f7fc0', true),
		frog: createFrog(),
	};
	const home: Record<NpcKey, THREE.Vector3> = {} as Record<NpcKey, THREE.Vector3>;
	for (const k of Object.keys(npcs) as NpcKey[]) {
		const s = zones.npcSpots[k];
		npcs[k].root.position.set(s.x, s.y, s.z);
		npcs[k].root.rotation.y = s.yaw;
		home[k] = npcs[k].root.position.clone();
		scene.add(npcs[k].root);
	}
	const babies = zones.babies.map((s) => {
		const n = createHedgehog(0.5);
		n.root.position.set(s.x, s.y, s.z);
		scene.add(n.root);
		return { spot: s, npc: n, state: 'hidden' as 'hidden' | 'follow' | 'home' | 'gone', homeT: 0 };
	});

	// — Items —
	const questNut = nutMesh(false);
	scene.add(questNut);
	const branches = zones.branches.map((s) => {
		const m = branchMesh();
		m.position.set(s.x, s.y, s.z);
		m.rotation.y = s.x;
		scene.add(m);
		return { spot: s, mesh: m };
	});
	const golds = zones.goldNuts.map((s) => {
		const m = nutMesh(true);
		m.position.set(s.x, s.y, s.z);
		scene.add(m);
		return { spot: s, mesh: m };
	});
	const orbs = zones.orbs.map((s) => {
		const m = orbMesh();
		m.position.set(s.x, s.y, s.z);
		scene.add(m);
		return { spot: s, mesh: m };
	});
	const kite = kiteMesh();
	scene.add(kite);
	const kiteString = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: '#ffffff' }));
	kiteString.visible = false;
	scene.add(kiteString);

	const marker = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 0), new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.6, flatShading: true }));
	marker.scale.y = 1.5;
	scene.add(marker);

	// A far light behind the mountains, for the ending.
	const farLight = new THREE.Mesh(new THREE.SphereGeometry(2.2, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe6a0', fog: false, transparent: true, opacity: 0 }));
	farLight.position.set(MOUNT.x + 150, 30, MOUNT.z - 150);
	scene.add(farLight);
	const glowTex = glowTexture();
	const haloMat = new THREE.SpriteMaterial({ map: glowTex, color: '#ffcf6a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
	const halo = new THREE.Sprite(haloMat);
	halo.position.set(zones.lantern.x, zones.lantern.y, zones.lantern.z);
	halo.visible = false;
	scene.add(halo);
	const farHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffd27a', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
	farHalo.position.copy(farLight.position);
	farHalo.scale.setScalar(40);
	scene.add(farHalo);

	// Chimney smoke and butterflies near the house.
	const smoke = Array.from({ length: 7 }, (_, i) => {
		const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: '#f4f1ec', transparent: true, opacity: 0.7, flatShading: true }));
		scene.add(m);
		return { m, t: i / 7 };
	});
	const butterflies = Array.from({ length: 10 }, (_, i) => {
		const g = new THREE.Group();
		const wm = new THREE.MeshBasicMaterial({ color: ['#ffffff', '#ffd23f', '#ff9fc4', '#9fd3ff'][i % 4], side: THREE.DoubleSide });
		const wings = [-1, 1].map((s) => {
			const w = new THREE.Mesh(new THREE.CircleGeometry(0.09, 6).translate(s * 0.09, 0, 0), wm);
			w.rotation.x = -Math.PI / 2;
			const pivot = new THREE.Group();
			pivot.add(w);
			g.add(pivot);
			return pivot;
		});
		scene.add(g);
		const spots = [[1, 2], [-8, -12], [-20, 10], [-34, 26], [3, 26], [20, 4], [-2, -40], [44, -6], [-14, -20], [12, 18]];
		return { g, wings, cx: spots[i][0], cz: spots[i][1], seed: i * 1.7, flee: new THREE.Vector3() };
	});
	// Night fireflies drifting over the valley.
	const nightFlies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 5, 4), new THREE.MeshBasicMaterial({ color: '#fff3a0', fog: false }), 160);
	const flySeeds = Array.from({ length: 160 }, (_, i) => ({ a: i * 2.39, r: 3 + (i % 23) * 1.7, h: 0.6 + (i % 5) * 0.5 }));
	nightFlies.visible = false;
	scene.add(nightFlies);

	// — Game state —
	const saved = loadState();
	let S: State = newState();
	const player = new Player();
	player.teleport(START.x, START.z, Math.PI);
	const has = (id: string) => S.taken.includes(id);

	let playing = false;
	let paused = false;
	let time = 0;
	let dayT = 0.05;
	let dialog: { lines: Line[]; i: number; shown: number; done: () => void; npc: NpcKey | null; blip: number } | null = null;
	let climb: { spot: ClimbSpot; t: number } | null = null;
	let cine: { pos: THREE.Vector3; look: THREE.Vector3 } | null = null;
	let party = 0;
	let finale: { t: number; step: number } | null = null;
	let tracked: string | null = null;
	let lastRegion = '';
	let regionT = 0;
	let splash = { n: 0, at: -1e9 };
	let saveT = 0;
	let kiteFly = false;
	let drive: { yaw: number; speed: number } | null = null;
	const pressed = { jump: false, roll: false, action: false };
	const trail: THREE.Vector3[] = [];

	// — Helpers —
	const tip = (id: string, text: string) => {
		if (S.seen.includes(id)) return;
		S.seen.push(id);
		hud.toast(text);
	};
	const persist = () => {
		S.pos = { ...player.lastSafe };
		saveState(S);
	};
	const tygoPos = () => new THREE.Vector3(player.pos.x, player.pos.y, player.pos.z);
	const flat = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

	const say = (lines: Line[], done: () => void = () => {}, npc: NpcKey | null = null) => {
		dialog = { lines, i: 0, shown: 0, done, npc, blip: 0 };
		hud.showLine(lines[0]);
		input.consumeAction();
		input.consumeJump();
	};
	const advance = () => {
		if (!dialog) return;
		const l = dialog.lines[dialog.i];
		if (dialog.shown < l.text.length) {
			dialog.shown = l.text.length;
			hud.typeLine(l.text);
			return;
		}
		audio.play('click');
		dialog.i++;
		if (dialog.i >= dialog.lines.length) {
			const done = dialog.done;
			dialog = null;
			hud.hideDialog();
			done();
		} else {
			dialog.shown = 0;
			hud.showLine(dialog.lines[dialog.i]);
		}
	};
	hud.el.dialog.addEventListener('touchstart', (e) => {
		e.preventDefault();
		advance();
	}, { passive: false });
	hud.el.dialog.addEventListener('mousedown', advance);

	const giveJar = (souvenir: string) => {
		audio.play('jar');
		fx.sparkle(tygoPos().add(new THREE.Vector3(0, 1, 0)), '#ffe066', 40);
		hud.toast(`Bocal de lucioles ! (${jars(S)}/4)`, true);
		if (!S.souvenirs.includes(souvenir)) {
			S.souvenirs.push(souvenir);
			setTimeout(() => hud.toast(`Nouveau souvenir : ${SOUVENIRS[souvenir].title}`), 900);
		}
		if (jars(S) === 4) setTimeout(() => hud.toast('Les quatre bocaux ! Retourne voir Hector.', true), 2200);
		persist();
	};

	const attach = (obj: THREE.Object3D, kind: 'nut' | 'branch' | 'kite') => {
		tiger.mouth.add(obj);
		obj.position.set(0, kind === 'kite' ? 0.35 : 0, kind === 'kite' ? -0.1 : 0);
		obj.rotation.set(kind === 'kite' ? -1.1 : 0, 0, kind === 'nut' ? Math.PI / 2 : 0);
		obj.scale.setScalar(kind === 'kite' ? 0.8 : 1);
	};
	const drop = (obj: THREE.Object3D) => {
		obj.removeFromParent();
		scene.add(obj);
	};

	// — Applying a state to a pristine world —
	const applyState = () => {
		questNut.position.set(zones.questNut.x, zones.questNut.y, zones.questNut.z);
		if (S.carry === 'nut') attach(questNut, 'nut');
		if (S.nut >= 3) questNut.visible = false;
		for (const b of branches) {
			b.mesh.visible = !has(b.spot.id);
			if (S.carry === b.spot.id) {
				b.mesh.visible = true;
				attach(b.mesh, 'branch');
			}
		}
		for (const g of golds) g.mesh.visible = !has(g.spot.id);
		for (const o of orbs) o.mesh.visible = !has(o.spot.id);
		for (const b of babies) if (has(`home:${b.spot.id}`)) {
			b.state = 'gone';
			b.npc.root.visible = false;
		}
		if (S.rabbit === 2) kiteFly = true;
		else if (S.carry === 'kite') attach(kite, 'kite');
		else kite.position.set(zones.kite.x, zones.kite.y + 0.4, zones.kite.z);
		if (S.beaver === 2) {
			zones.dam.build();
			for (let i = 0; i < 40; i++) zones.dam.update(0.2);
		}
		for (const id of S.broken) {
			const s = zones.breakables.find((b) => b.id === id);
			if (s) {
				s.alive = false;
				if (s.mesh) s.mesh.visible = false;
			}
		}
		tiger.scarf.visible = S.scarf;
		if (S.owl >= 3) lightLantern(1);
		if (S.pos) player.teleport(S.pos.x, S.pos.z, S.pos.yaw, S.pos.y);
		dayT = targetDay();
	};

	function lightLantern(k: number) {
		zones.lanternLight.intensity = 14 * k;
		const gm = zones.lanternGlow.material as THREE.MeshStandardMaterial;
		gm.emissiveIntensity = 0.05 + k * 3;
		zones.festival.traverse((o) => {
			const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
			if (m && m.emissive && m.emissive.getHex() === 0xffb347) m.emissiveIntensity = 0.15 + k * 2.2;
		});
		nightFlies.visible = k > 0.3;
		haloK = k;
		halo.visible = k > 0;
	}

	let haloK = 0;
	const targetDay = () => (S.owl >= 3 ? 1 : 0.05 + jars(S) * 0.17 + (S.owl >= 2 ? 0.05 : 0));

	// — Quests: objectives —
	const nearestOf = <T extends { x: number; y: number; z: number }>(list: T[]) => {
		let best: T | null = null, bd = Infinity;
		for (const p of list) {
			const d = flat(p, player.pos);
			if (d < bd) {
				bd = d;
				best = p;
			}
		}
		return best;
	};
	const npcTarget = (k: NpcKey) => ({ x: home[k].x, y: home[k].y + 1.4, z: home[k].z });
	const onPlateau = () => player.pos.y > 1.6 && Math.hypot(player.pos.x - 12, player.pos.z + 10) < 6;

	function peakGuide(): { text: string; target: P3 } {
		const m = mountPolar(player.pos.x, player.pos.z);
		const onMount = m.d < R_OUT && player.pos.y > 1;
		const k = onMount ? ringOf(m.d) : -1;
		const at = (r: number, a: number, lvl: number) => ({ ...mountPoint(r, a), y: lvl + 1.2 });
		const boulder = zones.breakables.find((b) => b.id === 'boulder');
		const guides: P3[] = [
			at(24.5, 2.6, 0.5),
			at(24.6, -1.6, ringLevel(0)),
			{ ...zones.climbs.find((c) => c.id === 'peak')!.base, y: ringLevel(1) + 1.2 },
			at(18.6, 2.4, ringLevel(2) + 0.9),
			at(15.5, -2.3, ringLevel(3)),
			at(11.85, 0.2, ringLevel(4)),
			boulder?.alive ? at(9.5, 1.5, ringLevel(5)) : at(9.5, 2.3, ringLevel(5) + 2),
			at(6.5, -2.2, 20.8),
			{ ...zones.lantern, y: zones.lantern.y + 0.8 },
		];
		if (!onMount && player.pos.x < riverX(player.pos.z)) return { text: 'Allume la lanterne du Pic (traverse le barrage)', target: { ...zones.dam.center, y: 1.2 } };
		if (!onMount) return { text: 'Rejoins le pied du Pic aux Étoiles', target: guides[0] };
		return { text: k >= 7 ? 'Allume la lanterne !' : `Allume la lanterne du Pic (terrasse ${Math.max(0, k + 1)}/7)`, target: guides[Math.min(8, k + 1)] };
	}

	function objectives(): Objective[] {
		const o: Objective[] = [];
		const followers = babies.filter((b) => b.state === 'follow').length;
		if (S.nut === 0) o.push({ id: 'nut', text: 'Va voir Sally, près de la maison', target: npcTarget('sally') });
		else if (S.nut === 1)
			o.push(
				onPlateau()
					? { id: 'nut', text: 'Trouve la noisette près du noisetier', target: { ...zones.questNut, y: zones.questNut.y + 0.6 } }
					: { id: 'nut', text: 'Grimpe sur le rocher (traces de pattes)', target: { ...zones.climbs[0].base, y: zones.climbs[0].base.y + 1.2 } },
			);
		else if (S.nut === 2) o.push({ id: 'nut', text: 'Rapporte la noisette à Sally', target: npcTarget('sally') });
		else o.push({ id: 'nut', text: 'La noisette de Sally', target: null, done: true });
		if (S.nut < 3) return o;

		if (S.owl === 0) {
			o.push({ id: 'owl', text: 'Va voir Hector au Grand Chêne (nord)', target: npcTarget('owl') });
			return o;
		}
		if (S.owl === 1) {
			const quests: Objective[] = [];
			if (S.beaver === 0) quests.push({ id: 'beaver', text: 'Rivière : Barnabé le castor a besoin d’aide', target: npcTarget('beaver') });
			else if (S.beaver === 1) {
				const left = branches.filter((b) => !has(b.spot.id)).map((b) => ({ ...b.spot, y: b.spot.y + 0.7 }));
				quests.push(
					S.carry.startsWith('branch')
						? { id: 'beaver', text: `Apporte la branche à Barnabé (${S.branches}/3)`, target: npcTarget('beaver') }
						: { id: 'beaver', text: `Rapporte les branches des îlots (${S.branches}/3)`, target: nearestOf(left) },
				);
			} else quests.push({ id: 'beaver', text: 'Le barrage de Barnabé', target: null, done: true });
			if (S.hedge === 0) quests.push({ id: 'hedge', text: 'Bois : Pipa la hérissonne te cherche', target: npcTarget('pipa') });
			else if (S.hedge === 1) {
				const hidden = babies.filter((b) => b.state === 'hidden').map((b) => ({ ...b.spot, y: b.spot.y + 0.8 }));
				const found = S.babiesHome + followers;
				quests.push(
					followers && !hidden.length
						? { id: 'hedge', text: `Ramène les petits à Pipa (${found}/5)`, target: npcTarget('pipa') }
						: { id: 'hedge', text: `Retrouve les petits hérissons (${found}/5)`, target: nearestOf(hidden) },
				);
			} else quests.push({ id: 'hedge', text: 'Les petits de Pipa', target: null, done: true });
			if (S.rabbit === 0) quests.push({ id: 'rabbit', text: 'Moulin : Lila et Lou ont un souci', target: npcTarget('lila') });
			else if (S.rabbit === 1)
				quests.push(
					S.carry === 'kite'
						? { id: 'rabbit', text: 'Rapporte le cerf-volant à Lila et Lou', target: npcTarget('lila') }
						: { id: 'rabbit', text: 'Récupère le cerf-volant en haut du moulin', target: { ...zones.kite, y: zones.kite.y + 1.2 } },
				);
			else quests.push({ id: 'rabbit', text: 'Le cerf-volant des lapins', target: null, done: true });
			const orbN = orbs.filter((x) => has(x.spot.id)).length;
			if (S.frog === 0) quests.push({ id: 'frog', text: 'Lac : Gaston la grenouille t’appelle', target: npcTarget('frog') });
			else if (S.frog === 1)
				quests.push(
					orbN >= 6
						? { id: 'frog', text: 'Retourne voir Gaston sur le ponton', target: npcTarget('frog') }
						: { id: 'frog', text: `Attrape les lucioles sur les nénuphars (${orbN}/6)`, target: nearestOf(orbs.filter((x) => !has(x.spot.id)).map((x) => ({ ...x.spot, y: x.spot.y + 0.6 }))) },
				);
			else quests.push({ id: 'frog', text: 'Les lucioles du lac', target: null, done: true });
			if (jars(S) === 4) o.push({ id: 'owl', text: 'Retourne voir Hector au Grand Chêne', target: npcTarget('owl') });
			o.push(...quests);
			return o;
		}
		if (S.owl === 2) {
			const g = peakGuide();
			o.push({ id: 'peak', text: g.text, target: g.target });
		}
		if (S.owl >= 3) o.push({ id: 'peak', text: 'La lanterne brille sur le Pic', target: null, done: true });
		if (goldCount(S) < GOLD_TOTAL && S.nut >= 3) o.push({ id: 'gold', text: `Noisettes dorées (${goldCount(S)}/${GOLD_TOTAL})`, target: null });
		return o;
	}

	const activeObjectives = () => objectives().filter((o) => !o.done && o.target);
	function currentObjective(list: Objective[]): Objective | null {
		if (!list.length) return null;
		const chosen = list.find((o) => o.id === tracked);
		if (chosen) return chosen;
		let best = list[0], bd = Infinity;
		for (const o of list) {
			const d = flat(o.target!, player.pos);
			// The main thread wins ties.
			const w = o.id === 'owl' || o.id === 'peak' || o.id === 'nut' ? d * 0.5 : d;
			if (w < bd) {
				bd = w;
				best = o;
			}
		}
		return best;
	}
	const cycleTracked = () => {
		const list = activeObjectives();
		if (list.length < 2) return;
		const cur = currentObjective(list);
		const i = list.findIndex((o) => o.id === cur?.id);
		tracked = list[(i + 1) % list.length].id;
		audio.play('click');
	};
	hud.el.objective.addEventListener('click', cycleTracked);

	// — Quests: talking —
	function talk(k: NpcKey) {
		const who = NPC_NAMES[k];
		const teaser = (): Line[] => [{ who, text: 'Bonjour Tygo ! Hector te cherche, tu sais. Il t’attend au Grand Chêne.' }];
		switch (k) {
			case 'sally':
				if (S.nut === 0) return say(L.sallyAsk, () => ((S.nut = 1), persist()), k);
				if (S.nut === 1) return say(L.sallyRemind, () => {}, k);
				if (S.nut === 2) {
					S.carry = '';
					npcs.sally.hand.add(questNut);
					questNut.position.set(0, 0, 0);
					questNut.rotation.set(0, 0, 0);
					audio.play('pickup');
					return say(L.sallyThanks, () => {
						S.nut = 3;
						party = 3.5;
						fx.confetti(home.sally.clone().add(new THREE.Vector3(0, 1, 0)));
						audio.play('jar');
						setTimeout(() => (questNut.visible = false), 3500);
						tip('roll', coarse ? 'Bouton ⟳ : rouler en boule' : 'Maj : rouler en boule');
						persist();
					}, k);
				}
				if (goldCount(S) >= 10 && !S.scarf)
					return say(L.sallyScarf, () => {
						S.scarf = true;
						tiger.scarf.visible = true;
						fx.sparkle(tygoPos().add(new THREE.Vector3(0, 0.9, 0.3)), '#ff6b6b', 30);
						audio.play('magic');
						persist();
					}, k);
				if (goldCount(S) >= GOLD_TOTAL && !S.allGold) return say(L.sallyAllGold, () => ((S.allGold = true), persist()), k);
				return say(S.owl >= 3 ? L.sallyLate : L.sallyIdle, () => {}, k);
			case 'owl':
				if (S.nut < 3) return say(L.owlEarly, () => {}, k);
				if (S.owl === 0)
					return say(L.owlMeet, () => {
						S.owl = 1;
						hud.toast('Quatre amis ont besoin de toi !', true);
						persist();
					}, k);
				if (S.owl === 1) {
					if (jars(S) === 4)
						return say(L.owlLantern, () => {
							S.owl = 2;
							persist();
						}, k);
					return say([{ who: 'Hector', text: `${jars(S)} ${jars(S) > 1 ? 'bocaux' : 'bocal'} sur 4. ${L.owlRemind[0].text}` }], () => {}, k);
				}
				return say(L.owlGo, () => {}, k);
			case 'beaver':
				if (S.owl === 0) return say(teaser(), () => {}, k);
				if (S.beaver === 0) return say(L.beaverAsk, () => ((S.beaver = 1), persist()), k);
				if (S.beaver === 1) {
					if (S.carry.startsWith('branch')) {
						const b = branches.find((x) => x.spot.id === S.carry)!;
						S.taken.push(b.spot.id);
						S.carry = '';
						S.branches++;
						drop(b.mesh);
						b.mesh.visible = false;
						audio.play('pickup');
						if (S.branches < 3) return say([{ who: 'Barnabé', text: `${L.beaverOne[0].text} (${S.branches}/3)` }], persist, k);
						zones.dam.build();
						cine = { pos: V(zones.dam.center).add(new THREE.Vector3(-7, 5, 8)), look: V(zones.dam.center) };
						return say(L.beaverDone.slice(0, 1), () => {
							cine = null;
							S.beaver = 2;
							giveJar('boat');
							say(L.beaverDone.slice(1), () => {}, k);
						}, k);
					}
					return say(L.beaverRemind, () => {}, k);
				}
				return say(L.beaverIdle, () => {}, k);
			case 'pipa':
				if (S.owl === 0) return say(teaser(), () => {}, k);
				if (S.hedge === 0) return say(L.pipaAsk, () => ((S.hedge = 1), persist()), k);
				if (S.hedge === 1) return say(L.pipaRemind, () => {}, k);
				return say(L.pipaIdle, () => {}, k);
			case 'lila':
			case 'lou':
				if (S.owl === 0) return say(teaser(), () => {}, k);
				if (S.rabbit === 0) return say(L.rabbitAsk, () => ((S.rabbit = 1), persist()), k);
				if (S.rabbit === 1) {
					if (S.carry === 'kite') {
						S.carry = '';
						drop(kite);
						kiteFly = true;
						audio.play('pickup');
						return say(L.rabbitDone.slice(0, 2), () => {
							S.rabbit = 2;
							giveJar('tracks');
							say(L.rabbitDone.slice(2), () => {}, k);
						}, k);
					}
					return say(L.rabbitRemind, () => {}, k);
				}
				return say(L.rabbitIdle, () => {}, k);
			case 'frog':
				if (S.owl === 0) return say(teaser(), () => {}, k);
				if (S.frog === 0) return say(L.frogAsk, () => ((S.frog = 1), persist()), k);
				if (S.frog === 1) {
					const n = orbs.filter((x) => has(x.spot.id)).length;
					if (n >= 6)
						return say(L.frogDone.slice(0, 2), () => {
							S.frog = 2;
							giveJar('signal');
							say(L.frogDone.slice(2), () => {}, k);
						}, k);
					return say([{ who: 'Gaston', text: `${n}/6. ${L.frogRemind[0].text}` }], () => {}, k);
				}
				return say(L.frogIdle, () => {}, k);
		}
	}

	// — Quests: actions —
	interface Action { label: string; run: () => void }
	function availableAction(): Action | null {
		if (dialog || climb || finale || !playing || player.respawnT > 0) return null;
		const p = player.pos;
		let bestNpc: NpcKey | null = null, bd = TALK_DIST;
		for (const k of Object.keys(npcs) as NpcKey[]) {
			const n = npcs[k].root.position;
			const d = flat(n, p);
			if (d < bd && Math.abs(n.y - p.y) < 2.2) {
				bd = d;
				bestNpc = k;
			}
		}
		if (bestNpc) {
			const k = bestNpc;
			const give = (k === 'sally' && S.nut === 2) || (k === 'beaver' && S.carry.startsWith('branch')) || ((k === 'lila' || k === 'lou') && S.carry === 'kite');
			return { label: give ? 'Donner' : 'Parler', run: () => talk(k) };
		}
		if (player.grounded && !player.low)
			for (const c of zones.climbs)
				if (flat(c.base, p) < 1.6 && Math.abs(p.y - c.base.y) < 0.6) return { label: 'Grimper', run: () => startClimb(c) };
		const near = (o: THREE.Object3D, r = 1.5) => o.visible && o.parent === scene && o.position.distanceTo(tygoPos().add(new THREE.Vector3(0, 0.3, 0))) < r;
		const pick = (fn: () => void): Action => ({
			label: 'Ramasser',
			run: () => {
				if (S.carry) return say(L.carrying);
				fn();
				audio.play('pickup');
				fx.sparkle(tygoPos().add(new THREE.Vector3(0, 0.6, 0)), '#ffffff', 10);
			},
		});
		if (S.nut === 1 && near(questNut))
			return pick(() => {
				S.carry = 'nut';
				S.nut = 2;
				attach(questNut, 'nut');
				persist();
			});
		if (S.beaver === 1) for (const b of branches) if (!has(b.spot.id) && near(b.mesh)) return pick(() => {
			S.carry = b.spot.id;
			attach(b.mesh, 'branch');
			persist();
		});
		if (S.rabbit === 1 && near(kite, 1.8))
			return pick(() => {
				S.carry = 'kite';
				attach(kite, 'kite');
				hud.toast('Redescends sans crainte : si tu tombes, tu roules !');
				persist();
			});
		if (S.owl >= 2 && S.owl < 3 && flat(zones.lantern, p) < 2.6 && p.y > zones.lantern.y - 4) return { label: 'Allumer', run: startFinale };
		if (S.owl === 1 && flat(zones.lantern, p) < 2.6 && p.y > zones.lantern.y - 4) return { label: 'Regarder', run: () => say(L.lanternNotYet) };
		return null;
	}

	function startClimb(c: ClimbSpot) {
		climb = { spot: c, t: 0 };
		player.frozen = true;
		audio.play('climb');
	}
	function updateClimb(dt: number) {
		if (!climb) return;
		const { spot } = climb;
		climb.t += dt / CLIMB_TIME;
		const t = climb.t;
		const p = player.pos;
		const want = Math.atan2(spot.top.x - spot.base.x, spot.top.z - spot.base.z);
		player.yaw += Math.atan2(Math.sin(want - player.yaw), Math.cos(want - player.yaw)) * Math.min(1, dt * 10);
		if (t < 0.15) {
			const u = t / 0.15;
			p.x += (spot.base.x - p.x) * u;
			p.z += (spot.base.z - p.z) * u;
			p.y = spot.base.y;
		} else if (t < 0.85) {
			const u = (t - 0.15) / 0.7;
			p.x = spot.base.x + (spot.edge.x - spot.base.x) * u;
			p.z = spot.base.z + (spot.edge.z - spot.base.z) * u;
			p.y = spot.base.y + (spot.edge.y - spot.base.y) * Math.sin((u * Math.PI) / 2);
			if (Math.floor(t * 10) !== Math.floor((t - dt / CLIMB_TIME) * 10)) audio.play('climb');
		} else {
			const u = (t - 0.85) / 0.15;
			p.x = spot.edge.x + (spot.top.x - spot.edge.x) * u;
			p.z = spot.edge.z + (spot.top.z - spot.edge.z) * u;
			p.y = spot.edge.y + (spot.top.y - spot.edge.y) * u;
		}
		if (t >= 1) {
			climb = null;
			player.frozen = false;
			player.teleport(spot.top.x, spot.top.z, player.yaw);
			tiger.land(0.5);
			fx.dust(tygoPos(), 5, 0.5);
		}
	}

	// — Finale —
	function startFinale() {
		finale = { t: 0, step: 0 };
		player.teleport(MOUNT.x + Math.cos(farA) * 3.9, MOUNT.z + Math.sin(farA) * 3.9, Math.atan2(Math.cos(farA), Math.sin(farA)));
		player.frozen = true;
		audio.play('magic');
		hud.setArrow(null);
	}
	// Friends sit in an arc on both sides of Tygo, all facing the far light.
	const farA = Math.atan2(-150, 150);
	const summitSeats: [NpcKey, number][] = [['sally', farA - 0.55], ['owl', farA - 0.95], ['pipa', farA + 0.75], ['beaver', farA - 1.35], ['lila', farA + 1.1], ['lou', farA + 1.4], ['frog', farA + 1.75]];
	function updateFinale(dt: number) {
		if (!finale) return;
		finale.t += dt;
		const L0 = V(zones.lantern);
		const ang = 0.6 + finale.t * 0.08;
		const farLines = dialog && dialog.lines === L.lantern && dialog.i >= 2 && dialog.i <= 4;
		if (farLines) {
			// Over Tygo's shoulder, towards the answering light.
			const away = farLight.position.clone().sub(L0).setY(0).normalize();
			const side = new THREE.Vector3(-away.z, 0, away.x);
			cine = { pos: tygoPos().addScaledVector(away, -4).addScaledVector(side, 1.3).add(new THREE.Vector3(0, 0.9, 0)), look: tygoPos().addScaledVector(away, 30).add(new THREE.Vector3(0, 1.5, 0)) };
		} else cine = { pos: L0.clone().add(new THREE.Vector3(Math.cos(ang) * 9, 2.5, Math.sin(ang) * 9)), look: L0.clone().add(new THREE.Vector3(0, -1.2, 0)) };
		if (finale.step === 0) {
			if (Math.random() < dt * 30) fx.sparkle(tygoPos().add(new THREE.Vector3((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 2)), '#ffe066', 3);
			lightLantern(Math.min(1, finale.t / 3));
			dayT = Math.min(1, dayT + dt * 0.08);
			if (finale.t > 3.2) {
				finale.step = 1;
				for (const [k, a] of summitSeats) {
					const pos = new THREE.Vector3(MOUNT.x + Math.cos(a) * 3.8, ringLevel(7), MOUNT.z + Math.sin(a) * 3.8);
					npcs[k].root.position.copy(pos);
					fx.sparkle(pos.clone().add(new THREE.Vector3(0, 0.5, 0)), '#ffffff', 12);
				}
				fx.confetti(L0.clone().add(new THREE.Vector3(0, 1, 0)));
				audio.play('jar');
			}
		} else if (finale.step === 1) {
			dayT = Math.min(1, dayT + dt * 0.15);
			if (finale.t > 5) {
				finale.step = 2;
				say(L.lantern, () => {
					finale = null;
					cine = null;
					S.owl = 3;
					player.frozen = false;
					persist();
					showEnd();
				});
			}
		}
		// The far light blinks three times while Gaston speaks.
		if (dialog && dialog.lines === L.lantern && dialog.i >= 2 && dialog.i <= 4) {
			const b = Math.floor((finale.t * 2.2) % 4);
			const on = b < 3 && (finale.t * 2.2) % 1 < 0.55;
			(farLight.material as THREE.MeshBasicMaterial).opacity = on ? 1 : 0.15;
			(farHalo.material as THREE.SpriteMaterial).opacity = on ? 0.9 : 0.08;
		} else {
			(farLight.material as THREE.MeshBasicMaterial).opacity = S.owl >= 3 || (finale && finale.step >= 2) ? 0.35 : 0;
			(farHalo.material as THREE.SpriteMaterial).opacity = 0;
		}
	}

	function showEnd() {
		const s = Math.round(S.played);
		$('end-time').textContent = `${Math.floor(s / 3600) ? `${Math.floor(s / 3600)} h ` : ''}${Math.floor((s % 3600) / 60)} min`;
		$('end-gold').textContent = `${goldCount(S)} / ${GOLD_TOTAL}`;
		$('end-mem').textContent = `${S.souvenirs.length} / 4`;
		hud.el.end.hidden = false;
		paused = true;
	}
	$('end-explore').addEventListener('click', () => {
		hud.el.end.hidden = true;
		paused = false;
		for (const k of Object.keys(npcs) as NpcKey[]) npcs[k].root.position.copy(home[k]);
	});

	// — Player events —
	player.onEvent = (e, data) => {
		const p = tygoPos();
		switch (e) {
			case 'jump':
				audio.play('jump');
				fx.dust(p, 3, 0.3);
				if (data) tip('longjump', 'Saut roulé ! Bien plus loin qu’un saut normal.');
				break;
			case 'land':
				if ((data as number) > 6) {
					fx.dust(p, (data as number) > 10 ? 8 : 4, 0.6);
					audio.play('land');
				}
				tiger.land((data as number) / 12);
				break;
			case 'tumble':
				fx.dust(p, 10, 0.8);
				audio.play('land');
				audio.play('roll');
				tip('tumble', 'Pas de bobo : Tygo roule pour amortir ses chutes !');
				break;
			case 'roll':
				audio.play('roll');
				fx.dust(p, 4, 0.4);
				break;
			case 'bounce': {
				audio.play('bounce');
				const b = zones.bouncers.find((x) => x.solid === data);
				if (b) b.squash = 1;
				fx.ring(p, '#ffffff');
				break;
			}
			case 'break': {
				const s = data as Solid;
				audio.play('break');
				fx.debris(new THREE.Vector3(s.x, s.y0 + 0.8, s.z), s.id === 'bramble' ? '#4e7a35' : '#8f8070', 30);
				if (s.mesh) s.mesh.visible = false;
				if (!S.broken.includes(s.id)) S.broken.push(s.id);
				persist();
				break;
			}
			case 'splash': {
				const at = data as { x: number; y: number; z: number };
				fx.splash(new THREE.Vector3(at.x, -0.35, at.z));
				audio.play('splash');
				hud.fade(true);
				setTimeout(() => hud.fade(false), 450);
				const now = performance.now();
				splash = now - splash.at < 25000 ? { n: splash.n + 1, at: now } : { n: 1, at: now };
				if (splash.n >= 3) {
					// After a few misses, put Tygo back on the shore instead of the last islet.
					let best = zones.rescue[0], bd = Infinity;
					for (const r of zones.rescue) {
						const d = flat(r, at);
						if (d < bd) {
							bd = d;
							best = r;
						}
					}
					if (bd < 30) {
						player.redirectRespawn({ ...best, yaw: player.yaw });
						splash.n = 0;
					}
				}
				tip('splash', 'Plouf ! Tygo s’ébroue et revient au bord.');
				break;
			}
			case 'respawn':
				hud.fade(true);
				setTimeout(() => hud.fade(false), 450);
				break;
		}
	};

	// — Per-frame quest logic —
	function updateQuests(dt: number) {
		const p = tygoPos();
		const c = p.clone().add(new THREE.Vector3(0, 0.4, 0));
		for (const g of golds) {
			if (!g.mesh.visible) continue;
			g.mesh.rotation.y = time * 2;
			if (g.mesh.position.distanceTo(c) < 0.95) {
				g.mesh.visible = false;
				S.taken.push(g.spot.id);
				audio.play('gold');
				fx.sparkle(g.mesh.position, '#ffd84d', 24);
				const n = goldCount(S);
				hud.toast(`Noisette dorée ! ${n}/${GOLD_TOTAL}`);
				if (n === 10 && S.nut >= 3) setTimeout(() => hud.toast('Sally a une surprise pour toi…', true), 1200);
				persist();
			}
		}
		for (const o of orbs) {
			if (!o.mesh.visible) continue;
			o.mesh.position.y = o.spot.y + Math.sin(time * 2 + o.spot.x) * 0.12;
			o.mesh.children.forEach((ch) => {
				const k = ch.userData.k;
				if (k !== undefined) ch.position.set(Math.cos(time * 3 + k * 2.1) * 0.35, Math.sin(time * 4 + k) * 0.15, Math.sin(time * 3 + k * 2.1) * 0.35);
			});
			if (S.frog === 1 && o.mesh.position.distanceTo(c) < 1.0) {
				o.mesh.visible = false;
				S.taken.push(o.spot.id);
				audio.play('gold');
				fx.sparkle(o.mesh.position, '#fff3a0', 26);
				const n = orbs.filter((x) => has(x.spot.id)).length;
				hud.toast(n < 6 ? `Luciole ${n}/6` : 'Toutes les lucioles ! Retourne voir Gaston.', n === 6);
				persist();
			}
		}
		if (S.hedge === 1)
			for (const b of babies) {
				if (b.state !== 'hidden') continue;
				const bp = b.npc.root.position;
				if (flat(bp, p) < 1.1 && Math.abs(bp.y - p.y) < 1.3) {
					b.state = 'follow';
					audio.play('follow');
					fx.sparkle(bp.clone().add(new THREE.Vector3(0, 0.3, 0)), '#ffffff', 12);
					const n = S.babiesHome + babies.filter((x) => x.state === 'follow').length;
					hud.toast(`Petit hérisson retrouvé ! ${n}/5`);
					if (n === 1) say(L.baby);
				}
			}

		// Trail for the followers.
		if (!trail.length || trail[0].distanceTo(p) > 0.3) {
			trail.unshift(p.clone());
			if (trail.length > 60) trail.pop();
		}
		let idx = 0;
		for (const b of babies) {
			const r = b.npc.root;
			if (b.state === 'follow') {
				idx++;
				const target = trail[Math.min(trail.length - 1, idx * 2 + 1)] ?? p;
				if (r.position.distanceTo(target) > 8) r.position.copy(target);
				else r.position.lerp(target, Math.min(1, dt * 6));
				b.npc.update(dt, 'idle', p);
			} else if (b.state === 'home') {
				b.homeT += dt;
				const burrow = new THREE.Vector3(-30.4, groundHeight(-30.4, -4.1), -4.1);
				r.position.lerp(burrow, Math.min(1, dt * 2.5));
				b.npc.update(dt, 'happy', burrow);
				if (b.homeT > 1.6) {
					b.state = 'gone';
					r.visible = false;
				}
			} else if (b.state === 'hidden') b.npc.update(dt, flat(r.position, p) < 4 ? 'idle' : 'curl', p);
		}
		const followers = babies.filter((b) => b.state === 'follow');
		if (followers.length && !dialog && flat(home.pipa, p) < 3.2) {
			for (const b of followers) {
				b.state = 'home';
				b.homeT = 0;
				S.taken.push(`home:${b.spot.id}`);
			}
			S.babiesHome += followers.length;
			audio.play('pickup');
			if (S.babiesHome >= 5)
				say(L.pipaDone.slice(0, 2), () => {
					S.hedge = 2;
					giveJar('bell');
					say(L.pipaDone.slice(2), () => {}, 'pipa');
				}, 'pipa');
			else say([{ who: 'Pipa', text: `${L.pipaSome[0].text} (${S.babiesHome}/5)` }], persist, 'pipa');
		}

		// Contextual tips.
		const gate = OAK_GATE;
		if (S.nut >= 3 && !S.seen.includes('trunk') && Math.abs(p.x - gate.x) < 5 && p.z > gate.z && p.z < gate.z + 4) {
			S.seen.push('trunk');
			say(L.trunk, () => hud.toast(coarse ? 'Bouton ⟳ pour rouler sous le tronc' : 'Maj pour rouler sous le tronc'));
		}
		if (player.crawl) tip('crawl', 'Tygo rampe sous l’obstacle…');
		const near = (x: number, z: number, r: number) => flat({ x, z }, p) < r;
		for (const b of zones.bouncers) if (near(b.solid.x, b.solid.z, 4)) tip('bounce', 'Saute sur le champignon pour rebondir très haut !');
		const bramble = zones.breakables.find((b) => b.id === 'bramble');
		if (bramble?.alive && near(bramble.x, bramble.z, 4)) tip('bramble', 'Fonce dans les ronces en roulant pour les casser !');
		const boulder = zones.breakables.find((b) => b.id === 'boulder');
		if (boulder?.alive && near(boulder.x, boulder.z, 5) && Math.abs(p.y - boulder.y0) < 2) tip('boulder', 'Ce rocher est fendu… Une roulade devrait le briser !');
		const c2 = ISLETS[2];
		if (S.beaver === 1 && near(riverX(c2.z) - BANK - 1, c2.z, 4)) tip('jetty', 'Roule, puis saute pendant la roulade : saut roulé !');
		const piston = mountPoint(11.85, 0.2);
		if (near(piston.x, piston.z, 4) && p.y > 13) tip('piston', 'La colonne de pierre monte et descend : grimpe dessus !');

		// Region names.
		const reg = regionName(p.x, p.z);
		if (reg !== lastRegion) {
			regionT += dt;
			if (regionT > 1.2) {
				if (lastRegion) hud.toast(reg);
				lastRegion = reg;
				regionT = 0;
			}
		} else regionT = 0;

		if (party > 0) {
			party -= dt;
			if (party > 2.9 && party - dt <= 2.9) fx.confetti(home.sally.clone().add(new THREE.Vector3(0, 1.2, 0)));
		}
	}

	// — Camera —
	let camYaw = Math.PI * 2;
	let camPitch = 0.36;
	const camPos = new THREE.Vector3();
	const camTarget = new THREE.Vector3();
	const camLook = new THREE.Vector3();
	let camInit = false;

	function blocked(p: THREE.Vector3): boolean {
		if (groundHeight(p.x, p.z) > p.y - 0.25) return true;
		for (const s of query(p.x, p.z)) if (p.y > s.y0 - 0.15 && p.y < s.y1 + 0.15 && inside(s, p.x, p.z, 0.15)) return true;
		for (const c of zones.crowns) if (p.y > c.y0 && p.y < c.y1 && Math.hypot(p.x - c.x, p.z - c.z) < c.r) return true;
		return false;
	}
	function pullIn(from: THREE.Vector3, want: THREE.Vector3) {
		const dir = want.clone().sub(from);
		const len = dir.length();
		const q = new THREE.Vector3();
		for (let d = 0.9; d < len; d += 0.25) {
			q.copy(from).addScaledVector(dir, d / len);
			if (blocked(q)) {
				want.copy(from).addScaledVector(dir, Math.max(0.9, d - 0.35) / len);
				return;
			}
		}
	}

	function updateCamera(dt: number, now: number) {
		const drag = input.camDrag;
		camYaw -= drag.x * 0.006;
		camPitch = THREE.MathUtils.clamp(camPitch + drag.y * 0.004, -0.05, 1.1);
		drag.x = drag.y = 0;
		const moving = player.speed > 0.6 && !climb;
		if (!playing) camYaw += dt * 0.1;
		else if (now - input.camTouchedAt > 1600 && moving) {
			const d = Math.atan2(Math.sin(player.yaw + Math.PI - camYaw), Math.cos(player.yaw + Math.PI - camYaw));
			camYaw += d * Math.min(1, dt * 1.3 * Math.min(1, player.speed / RUN));
		}
		const onPeak = mountPolar(player.pos.x, player.pos.z).d < R_OUT + 2;
		const dist = !playing ? 9 : onPeak ? 6.6 : 5.6;
		const pitch = !playing ? 0.42 : camPitch + (onPeak ? 0.08 : 0);
		const target = new THREE.Vector3(player.pos.x, player.pos.y + 0.9, player.pos.z);
		let want = new THREE.Vector3(
			target.x + Math.sin(camYaw) * Math.cos(pitch) * dist,
			target.y + Math.sin(pitch) * dist,
			target.z + Math.cos(camYaw) * Math.cos(pitch) * dist,
		);
		let look = target.clone();
		const talkNpc = dialog?.npc ? npcs[dialog.npc].root.position : null;
		if (cine) {
			want = cine.pos.clone();
			look = cine.look.clone();
		} else if (talkNpc && flat(talkNpc, player.pos) < 4) {
			const s = talkNpc;
			const mid = new THREE.Vector3((player.pos.x + s.x) / 2, Math.max(player.pos.y, s.y) + 0.7, (player.pos.z + s.z) / 2);
			const side = new THREE.Vector3(s.z - player.pos.z, 0, player.pos.x - s.x).normalize();
			if (side.dot(new THREE.Vector3(camPos.x - mid.x, 0, camPos.z - mid.z)) < 0) side.negate();
			// Prefer the side with a clear view of both.
			const clearance = (dir: THREE.Vector3) => {
				let d = 0.9;
				const q = new THREE.Vector3();
				for (; d < 3.8; d += 0.3) if (blocked(q.copy(mid).addScaledVector(dir, d).add(new THREE.Vector3(0, d * 0.26, 0)))) break;
				return d;
			};
			if (clearance(side) < 3.5 && clearance(side.clone().negate()) > clearance(side)) side.negate();
			want = mid.clone().addScaledVector(side, 3.8).add(new THREE.Vector3(0, 1.0, 0));
			look = mid;
			camYaw = Math.atan2(side.x, side.z);
		}
		if (!cine) pullIn(look, want);
		if (!camInit) {
			camPos.copy(want);
			camLook.copy(look);
			camInit = true;
		}
		const k = 1 - Math.exp(-(cine ? 3 : 9) * dt);
		camPos.lerp(want, k);
		camLook.lerp(look, 1 - Math.exp(-14 * dt));
		camTarget.copy(target);
		camera.position.copy(camPos);
		camera.lookAt(camLook);
	}

	// — HUD —
	const proj = new THREE.Vector3();
	function updateHud() {
		const list = activeObjectives();
		const cur = playing && !finale ? currentObjective(list) : null;
		hud.setObjective(cur, list.length);
		hud.setCounters(jars(S), goldCount(S), GOLD_TOTAL);
		const act = availableAction();
		hud.setAction(act?.label ?? null, 'E');
		let target: THREE.Vector3 | null = cur?.target ? V(cur.target) : null;
		if (dialog || climb) target = null;
		marker.visible = !!target;
		if (target) {
			marker.position.copy(target).setY(target.y + Math.sin(time * 3) * 0.12);
			marker.rotation.y = time * 2;
			proj.copy(target).project(camera);
			const w = window.innerWidth, h = window.innerHeight;
			const behind = proj.z > 1;
			const onScreen = !behind && Math.abs(proj.x) < 0.92 && Math.abs(proj.y) < 0.88;
			if (onScreen) hud.setArrow(null);
			else {
				let x = proj.x, y = proj.y;
				if (behind) {
					x = -x;
					y = -y;
				}
				const a = Math.atan2(x, y);
				const m = Math.max(Math.abs(x) / 0.88, Math.abs(y) / 0.78, 1e-3);
				x /= m;
				y /= m;
				hud.setArrow({ x: ((x + 1) / 2) * w, y: ((1 - y) / 2) * h, angle: a });
			}
		} else hud.setArrow(null);
		return act;
	}

	// — Menu —
	const openMenu = (on: boolean) => {
		hud.el.menu.hidden = !on;
		paused = on;
		input.clear();
		if (on) {
			hud.fillMenu(objectives(), S.souvenirs);
			drawMap();
		}
		audio.play('click');
	};
	const drawMap = () => {
		const markers: MapMarker[] = [];
		for (const o of activeObjectives()) markers.push({ x: o.target!.x, z: o.target!.z, color: '#ffd23f', kind: 'goal' });
		for (const k of Object.keys(npcs) as NpcKey[]) if (k !== 'lou') markers.push({ x: home[k].x, z: home[k].z, color: COLORS[NPC_NAMES[k]], label: k === 'lila' ? 'Lila & Lou' : NPC_NAMES[k], kind: 'npc' });
		markers.push({ x: player.pos.x, z: player.pos.z, color: '#ee8a2c', kind: 'player', yaw: player.yaw });
		hud.drawMap(markers);
	};
	$('resume').addEventListener('click', () => openMenu(false));
	$('opt-unstuck').addEventListener('click', () => {
		openMenu(false);
		if (climb) return;
		player.frozen = false;
		player.respawn();
	});
	$('opt-full').addEventListener('click', () => goFullscreen());
	const sfxBtn = $('opt-sfx'), musicBtn = $('opt-music');
	sfxBtn.addEventListener('click', () => {
		audio.sfxOn = !audio.sfxOn;
		sfxBtn.textContent = `Sons : ${audio.sfxOn ? 'oui' : 'non'}`;
	});
	musicBtn.addEventListener('click', () => {
		audio.setMusic(!audio.musicOn);
		musicBtn.textContent = `Musique : ${audio.musicOn ? 'oui' : 'non'}`;
	});
	$('opt-reset').addEventListener('click', () => {
		if (!confirm('Effacer la partie et recommencer depuis le début ?')) return;
		clearState();
		location.reload();
	});

	function goFullscreen() {
		const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void };
		const req = el.requestFullscreen?.bind(el) ?? el.webkitRequestFullscreen?.bind(el);
		if (!req || document.fullscreenElement) return;
		Promise.resolve(req({ navigationUI: 'hide' } as FullscreenOptions))
			.then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.('landscape'))
			.catch(() => {});
	}

	// — Intro —
	const begin = (fresh: boolean) => {
		if (fresh) {
			clearState();
			S = newState();
		} else S = saved ?? newState();
		applyState();
		hud.el.intro.hidden = true;
		document.body.classList.add('playing');
		playing = true;
		audio.start();
		if (coarse) goFullscreen();
		lastRegion = regionName(player.pos.x, player.pos.z);
		if (fresh || !saved) setTimeout(() => tip('move', coarse ? 'Pouce gauche pour bouger, glisse à droite pour la caméra' : 'ZQSD pour bouger, Espace pour sauter'), 600);
		persist();
	};
	if (saved && saved.nut + saved.owl > 0) $('continue').hidden = false;
	$('continue').addEventListener('click', () => begin(false));
	$('play').addEventListener('click', () => begin(true));
	window.addEventListener('pagehide', () => playing && persist());
	document.addEventListener('visibilitychange', () => {
		audio.suspend(document.hidden);
		if (document.hidden && playing) persist();
	});

	const resize = () => {
		const w = window.innerWidth, h = window.innerHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.fov = w < h ? 70 : 55;
		camera.updateProjectionMatrix();
	};
	window.addEventListener('resize', resize);
	resize();

	// — Loop —
	const portrait = () => coarse && window.innerHeight > window.innerWidth;
	let last = performance.now();
	const frame = (now: number) => {
		requestAnimationFrame(frame);
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		if (input.consumeMenu() && playing && !finale && hud.el.end.hidden) openMenu(hud.el.menu.hidden);
		if (halo.visible) {
			halo.scale.setScalar(7 + Math.sin(now * 0.004) * 0.6);
			// Fade out when the camera comes inside the glow, or it washes the whole frame.
			haloMat.opacity = 0.9 * haloK * THREE.MathUtils.clamp((camera.position.distanceTo(halo.position) - 3) / 4, 0, 1);
		}
		if (paused || (playing && portrait())) {
			renderer.render(scene, camera);
			return;
		}
		time += dt;
		if (playing) S.played += dt;
		if (input.consumeTrack()) cycleTracked();

		// Dialog typing and advancing.
		if (dialog) {
			const l = dialog.lines[dialog.i];
			if (dialog.shown < l.text.length) {
				const before = Math.floor(dialog.shown);
				dialog.shown = Math.min(l.text.length, dialog.shown + dt * 48);
				hud.typeLine(l.text.slice(0, Math.floor(dialog.shown)));
				if (Math.floor(dialog.shown / 3) !== Math.floor(before / 3) && l.text[before] !== ' ') audio.voice(l.who);
			}
			if (input.consumeAction() || input.consumeJump() || pressed.action || pressed.jump) advance();
			pressed.action = pressed.jump = false;
		}

		zones.update(dt, time, player.grounded ? player.support : null);
		const locked = !playing || !!dialog || !!finale;
		let cmd: Command = { dirX: 0, dirZ: 0, jump: false, jumpHeld: false, roll: false };
		if (!locked) {
			const mx = input.move.x, my = input.move.y;
			cmd = {
				dirX: -Math.sin(camYaw) * my + Math.cos(camYaw) * mx,
				dirZ: -Math.cos(camYaw) * my - Math.sin(camYaw) * mx,
				jump: input.consumeJump() || pressed.jump,
				jumpHeld: input.jumpHeld || pressed.jump,
				roll: input.consumeRoll() || pressed.roll,
			};
			if (drive) {
				cmd.dirX = Math.sin(drive.yaw) * (drive.speed / RUN);
				cmd.dirZ = Math.cos(drive.yaw) * (drive.speed / RUN);
			}
			pressed.jump = pressed.roll = false;
		} else input.consumeRoll();
		if (climb) updateClimb(dt);
		else player.update(dt, cmd);
		updateFinale(dt);

		if (playing) updateQuests(dt);
		const act = updateHud();
		if (act && !dialog && (input.consumeAction() || pressed.action)) act.run();
		else if (!dialog) input.consumeAction();
		pressed.action = false;

		// Tiger pose.
		tiger.root.position.set(player.pos.x, player.pos.y, player.pos.z);
		tiger.root.rotation.y = player.yaw;
		let lookAt: THREE.Vector3 | null = null;
		let bd = 4.5;
		for (const k of Object.keys(npcs) as NpcKey[]) {
			const d = flat(npcs[k].root.position, player.pos);
			if (d < bd) {
				bd = d;
				lookAt = npcs[k].root.position.clone().add(new THREE.Vector3(0, 0.6, 0));
			}
		}
		tiger.update(dt, {
			speed: player.speed,
			turn: player.turnRate * 0.1,
			grounded: player.grounded,
			vy: player.vy,
			climb: climb && climb.t > 0.15 && climb.t < 0.9 ? 1 : 0,
			roll: player.rollT > 0 ? player.rollSpin : NaN,
			crawl: player.crawl,
			happy: party > 0 || (finale?.step ?? 0) >= 1,
			lookAt,
		});
		for (const k of Object.keys(npcs) as NpcKey[]) {
			const n = npcs[k];
			const talking = dialog && dialog.lines[dialog.i].who === NPC_NAMES[k];
			const happy = (k === 'sally' && party > 0) || (!!finale && finale.step >= 1);
			const sad = (k === 'beaver' && S.beaver < 2) || (k === 'pipa' && S.hedge < 2) || ((k === 'lila' || k === 'lou') && S.rabbit < 2);
			const mood: Mood = happy ? 'happy' : talking ? 'talk' : sad && S.owl >= 1 ? 'sad' : 'idle';
			const gazeFar = !!finale && !!dialog && dialog.lines === L.lantern && dialog.i >= 2 && dialog.i <= 4;
			n.update(dt, mood, gazeFar ? farLight.position : flat(n.root.position, player.pos) < 7 ? player.pos : null);
		}

		// Items and ambience.
		if (questNut.parent === scene && S.nut === 1) {
			questNut.position.y = zones.questNut.y + Math.sin(time * 2.5) * 0.04;
			questNut.rotation.y = time * 1.5;
		}
		for (const b of branches) if (b.mesh.parent === scene && b.mesh.visible) b.mesh.position.y = b.spot.y + Math.sin(time * 2 + b.spot.x) * 0.03;
		if (kiteFly) {
			const anchor = home.lila.clone().add(new THREE.Vector3(0.6, 0.5, 0.6));
			kite.position.set(anchor.x + 4 + Math.sin(time * 0.7) * 1.2, anchor.y + 7 + Math.sin(time * 1.1) * 0.6, anchor.z - 3 + Math.cos(time * 0.5));
			kite.rotation.set(0, 0.6, Math.sin(time * 1.3) * 0.25);
			kite.scale.setScalar(1.3);
			kiteString.visible = true;
			const pos = kiteString.geometry.attributes.position as THREE.BufferAttribute;
			pos.setXYZ(0, anchor.x, anchor.y, anchor.z);
			pos.setXYZ(1, kite.position.x, kite.position.y - 0.3, kite.position.z);
			pos.needsUpdate = true;
		} else if (kite.parent === scene) kite.rotation.z = Math.sin(time * 2) * 0.15;
		for (const s of smoke) {
			s.t = (s.t + dt * 0.18) % 1;
			s.m.position.set(zones.chimney.x + Math.sin(s.t * 6 + time * 0.5) * 0.3 + s.t * 1.2, zones.chimney.y + s.t * 3, zones.chimney.z + s.t * 0.6);
			s.m.scale.setScalar(0.4 + s.t * 1.4);
			(s.m.material as THREE.MeshStandardMaterial).opacity = 0.65 * (1 - s.t) * Math.min(1, s.t * 6);
		}
		const pv = tygoPos();
		for (const b of butterflies) {
			b.g.visible = dayT < 0.85 && flat({ x: b.cx, z: b.cz }, pv) < 45;
			if (!b.g.visible) continue;
			const t = time * 0.35 + b.seed;
			const q = new THREE.Vector3(b.cx + Math.sin(t * 1.3) * 2.2, 0.8 + Math.sin(t * 2.7) * 0.3, b.cz + Math.cos(t * 0.9) * 2.2);
			q.y += groundHeight(q.x, q.z);
			const away = q.clone().sub(pv);
			if (away.length() < 2) b.flee.lerp(away.setY(1).normalize().multiplyScalar(2), dt * 3);
			else b.flee.multiplyScalar(1 - dt * 0.5);
			q.add(b.flee);
			b.g.lookAt(q);
			b.g.position.copy(q);
			const flap = Math.sin(time * 22 + b.seed) * 1.1;
			b.wings[0].rotation.z = flap;
			b.wings[1].rotation.z = -flap;
		}
		if (nightFlies.visible) {
			const o = new THREE.Object3D();
			flySeeds.forEach((f, i) => {
				const a = f.a + time * 0.1 * (i % 2 ? 1 : -1);
				const cx = i % 3 === 0 ? MOUNT.x : i % 3 === 1 ? 0 : -20;
				const cz = i % 3 === 0 ? MOUNT.z : i % 3 === 1 ? 0 : 10;
				const x = cx + Math.cos(a) * f.r, z = cz + Math.sin(a) * f.r;
				o.position.set(x, groundHeight(x, z) + f.h + Math.sin(time * 1.5 + i) * 0.3, z);
				o.scale.setScalar(0.6 + 0.4 * Math.sin(time * 3 + i));
				o.updateMatrix();
				nightFlies.setMatrixAt(i, o.matrix);
			});
			nightFlies.instanceMatrix.needsUpdate = true;
		}
		fx.update(dt);

		if (!finale) dayT += (targetDay() - dayT) * Math.min(1, dt * 0.25);
		env.sky.set(dayT);
		audio.night = dayT > 0.85 ? 1 : 0;
		audio.tick();
		updateCamera(dt, now);
		env.sun.position.set(player.pos.x - 10 + dayT * 14, player.pos.y + 18 - dayT * 6, player.pos.z + 8);
		env.sun.target.position.set(player.pos.x, player.pos.y, player.pos.z);

		saveT += dt;
		if (playing && saveT > 10) {
			saveT = 0;
			persist();
		}
		renderer.render(scene, camera);
	};
	requestAnimationFrame(frame);

	// Test hook for the capture and check scripts.
	(window as unknown as { __tygo: unknown }).__tygo = {
		get state() {
			return {
				pos: [player.pos.x, player.pos.y, player.pos.z],
				yaw: player.yaw,
				grounded: player.grounded,
				low: player.low,
				crawl: player.crawl,
				speed: player.speed,
				dialog: !!dialog,
				action: availableAction()?.label ?? null,
				objective: currentObjective(activeObjectives())?.text ?? null,
				jars: jars(S),
				gold: goldCount(S),
				S: JSON.parse(JSON.stringify(S)),
				region: regionName(player.pos.x, player.pos.z),
				finale: !!finale,
				busy: !!climb || player.respawnT > 0 || !!finale,
			};
		},
		teleport(x: number, z: number, yaw?: number, y?: number) {
			player.teleport(x, z, yaw ?? player.yaw, y);
			if (yaw !== undefined) camYaw = yaw + Math.PI;
			camInit = false;
		},
		drive(yaw: number | null, speed = RUN) {
			drive = yaw === null ? null : { yaw, speed };
		},
		press(k: 'jump' | 'roll' | 'action') {
			pressed[k] = true;
		},
		setCam(y: number, p: number) {
			camYaw = y;
			camPitch = p;
			input.camTouchedAt = performance.now() + 1e9;
		},
		set(patch: Partial<State>) {
			Object.assign(S, patch);
		},
		advance,
		perf: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures }),
		talk: (k: NpcKey) => talk(k),
		spots: {
			npcs: zones.npcSpots,
			climbs: zones.climbs.map((c) => ({ id: c.id, base: c.base, top: c.top })),
			branches: zones.branches,
			babies: zones.babies,
			orbs: zones.orbs,
			gold: zones.goldNuts,
			kite: zones.kite,
			lantern: zones.lantern,
			questNut: zones.questNut,
			dam: zones.dam.center,
			mount: MOUNT,
		},
	};
}
