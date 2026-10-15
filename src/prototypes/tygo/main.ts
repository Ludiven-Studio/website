import * as THREE from 'three';
import {
	buildWorld,
	buildNut,
	groundHeight,
	circles,
	crowns,
	boxes,
	BOUNDS,
	START,
	SALLY_SPOT,
	CLIMB_BASE,
	CLIMB_TOP,
	NUT_SPOT,
	PLATEAU,
	CHIMNEY_TOP,
	HOUSE,
} from './world';
import { createTiger } from './tiger';
import { createSally, type SallyMood } from './sally';
import { createInput } from './input';

type Stage = 'intro' | 'toSally' | 'toNut' | 'carry' | 'party' | 'end';
interface Line { who: 'Sally' | 'Tygo'; text: string }

const RUN = 4.6;
const WALK = 2;
const RADIUS = 0.38;
const GRAVITY = 25;
const STEP_UP = 0.45;
const CLIMB_TIME = 2.2;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export function start(): void {
	const stageEl = $('stage');
	const canvas = $<HTMLCanvasElement>('view');
	const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.shadowMap.enabled = true;
	renderer.shadowMap.type = THREE.PCFSoftShadowMap;
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;
	const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);

	const world = buildWorld();
	const scene = world.scene;
	const tiger = createTiger();
	scene.add(tiger.root);
	const sally = createSally();
	sally.root.position.set(SALLY_SPOT.x, 0.45, SALLY_SPOT.z);
	scene.add(sally.root);
	const nut = buildNut();
	nut.position.set(NUT_SPOT.x, groundHeight(NUT_SPOT.x, NUT_SPOT.z) + 0.16, NUT_SPOT.z);
	scene.add(nut);

	const marker = new THREE.Mesh(
		new THREE.OctahedronGeometry(0.22, 0),
		new THREE.MeshStandardMaterial({ color: '#ffd23f', emissive: '#ffb000', emissiveIntensity: 0.6, flatShading: true }),
	);
	marker.scale.y = 1.5;
	scene.add(marker);

	const input = createInput(stageEl, $('joy'), $('joy-knob'), $('btn-action'), $('btn-jump'));
	const ui = {
		intro: $('intro'),
		objective: $('objective'),
		dialog: $('dialog'),
		dlgName: $('dlg-name'),
		dlgText: $('dlg-text'),
		action: $('btn-action'),
		actionLabel: $('action-label'),
		hint: $('hint'),
		end: $('end'),
		endTime: $('end-time'),
	};

	// — Effects —
	const dustMat = new THREE.MeshBasicMaterial({ color: '#f3e3c8', transparent: true, opacity: 0.8, depthWrite: false });
	const dust = Array.from({ length: 48 }, () => {
		const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 0), dustMat.clone());
		m.visible = false;
		scene.add(m);
		return { m, life: 0, vel: new THREE.Vector3() };
	});
	let dustIdx = 0;
	const puff = (p: THREE.Vector3, n: number, spread: number) => {
		for (let i = 0; i < n; i++) {
			const d = dust[dustIdx++ % dust.length];
			d.m.position.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * spread, 0.05, (Math.random() - 0.5) * spread));
			d.vel.set((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2);
			d.life = 1;
			d.m.visible = true;
		}
	};

	const smoke = Array.from({ length: 7 }, (_, i) => {
		const m = new THREE.Mesh(new THREE.IcosahedronGeometry(0.25, 0), new THREE.MeshStandardMaterial({ color: '#f4f1ec', transparent: true, opacity: 0.7, flatShading: true }));
		scene.add(m);
		return { m, t: i / 7 };
	});

	const confettiColors = ['#ff6b6b', '#ffd23f', '#4ecdc4', '#a78bfa', '#ff9fc4', '#7bd389'];
	const confetti = Array.from({ length: 90 }, (_, i) => {
		const m = new THREE.Mesh(
			i % 3 ? new THREE.PlaneGeometry(0.1, 0.06) : new THREE.CircleGeometry(0.07, 5),
			new THREE.MeshBasicMaterial({ color: confettiColors[i % confettiColors.length], side: THREE.DoubleSide }),
		);
		m.visible = false;
		scene.add(m);
		return { m, vel: new THREE.Vector3(), spin: new THREE.Vector3() };
	});
	const burst = (p: THREE.Vector3) => {
		for (const c of confetti) {
			c.m.position.copy(p);
			c.vel.set((Math.random() - 0.5) * 4, 4 + Math.random() * 4, (Math.random() - 0.5) * 4);
			c.spin.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
			c.m.visible = true;
		}
	};

	const butterflies = Array.from({ length: 7 }, (_, i) => {
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
		const a = (i / 7) * Math.PI * 2;
		return { g, wings, cx: Math.cos(a) * 9 + 1, cz: Math.sin(a) * 9 + 2, seed: i * 1.7, flee: new THREE.Vector3() };
	});

	// — Player —
	const pos = START.clone();
	pos.y = groundHeight(pos.x, pos.z);
	let yaw = Math.PI * 0.85;
	let speed = 0;
	let vy = 0;
	let grounded = true;
	let turnRate = 0;
	let climbT = -1;
	let dustTimer = 0;
	let carrying = false;
	let drive: { yaw: number; speed: number } | null = null;

	// — Camera —
	let camYaw = yaw + Math.PI;
	let camPitch = 0.38;
	const camPos = new THREE.Vector3();
	const camTarget = new THREE.Vector3();
	let camInit = false;

	// — Quest —
	let stage: Stage = 'intro';
	let startedAt = 0;
	let partyT = 0;
	let dialog: { lines: Line[]; i: number; shown: number; done: () => void } | null = null;

	const setObjective = (text: string) => {
		ui.objective.textContent = text;
		ui.objective.hidden = !text;
	};

	const showLine = () => {
		if (!dialog) return;
		const l = dialog.lines[dialog.i];
		ui.dlgName.textContent = l.who;
		ui.dlgName.dataset.who = l.who;
		dialog.shown = 0;
		ui.dlgText.textContent = '';
	};
	const say = (lines: Line[], done: () => void) => {
		dialog = { lines, i: 0, shown: 0, done };
		ui.dialog.hidden = false;
		showLine();
	};
	const advance = () => {
		if (!dialog) return;
		const l = dialog.lines[dialog.i];
		if (dialog.shown < l.text.length) {
			dialog.shown = l.text.length;
			return;
		}
		dialog.i++;
		if (dialog.i >= dialog.lines.length) {
			const done = dialog.done;
			dialog = null;
			ui.dialog.hidden = true;
			done();
		} else showLine();
	};
	ui.dialog.addEventListener('touchstart', (e) => {
		e.preventDefault();
		advance();
	}, { passive: false });
	ui.dialog.addEventListener('mousedown', advance);

	$('play').addEventListener('click', () => {
		ui.intro.hidden = true;
		stage = 'toSally';
		startedAt = performance.now();
		setObjective('Va voir Sally, près de la maison');
	});
	$('replay').addEventListener('click', () => location.reload());

	const nearSally = () => Math.hypot(pos.x - SALLY_SPOT.x, pos.z - SALLY_SPOT.z) < 2.1;
	const nearClimb = () => climbT < 0 && grounded && pos.y < 1 && Math.hypot(pos.x - CLIMB_BASE.x, pos.z - CLIMB_BASE.z) < 1.7;
	const onPlateau = () => pos.y > PLATEAU.h * 0.6;
	const nearNut = () => !carrying && pos.distanceTo(nut.position) < 1.4;

	function availableAction(): { label: string; run: () => void } | null {
		if (dialog || climbT >= 0 || (stage !== 'toSally' && stage !== 'toNut' && stage !== 'carry')) return null;
		if (nearSally()) {
			if (stage === 'toSally')
				return {
					label: 'Parler',
					run: () =>
						say(
							[
								{ who: 'Sally', text: 'Oh, Tygo ! Tu tombes bien…' },
								{ who: 'Sally', text: 'Ma plus belle noisette est restée là-haut, sur le grand rocher, près du noisetier.' },
								{ who: 'Sally', text: 'Mes petites pattes ne grimpent pas si haut… Tu veux bien me la rapporter ?' },
								{ who: 'Tygo', text: 'Compte sur moi !' },
							],
							() => {
								stage = 'toNut';
								setObjective('Grimpe sur le rocher (traces de pattes)');
							},
						),
				};
			if (stage === 'toNut')
				return { label: 'Parler', run: () => say([{ who: 'Sally', text: 'Le passage pour grimper est marqué de traces de pattes, au pied du rocher !' }], () => {}) };
			if (stage === 'carry')
				return {
					label: 'Donner',
					run: () => {
						carrying = false;
						sally.hand.add(nut);
						nut.position.set(0, 0, 0);
						say(
							[
								{ who: 'Sally', text: 'Ma noisette ! Merci Tygo, tu es le meilleur des voisins !' },
								{ who: 'Sally', text: 'Viens, on va la partager devant la maison.' },
							],
							() => {
								stage = 'party';
								partyT = 0;
								setObjective('');
								burst(sally.root.position.clone().add(new THREE.Vector3(0, 1, 0)));
							},
						);
					},
				};
		}
		if (stage === 'toNut' && nearClimb()) return { label: 'Grimper', run: () => (climbT = 0) };
		if (stage === 'toNut' && nearNut())
			return {
				label: 'Ramasser',
				run: () => {
					carrying = true;
					tiger.mouth.add(nut);
					nut.position.set(0, 0, 0);
					nut.rotation.set(0, 0, Math.PI / 2);
					stage = 'carry';
					setObjective('Rapporte la noisette à Sally');
					puff(pos.clone(), 4, 0.4);
				},
			};
		return null;
	}

	function resolveCollisions(p: THREE.Vector3) {
		for (const c of circles) {
			const dx = p.x - c.x, dz = p.z - c.z;
			const d = Math.hypot(dx, dz);
			const min = c.r + RADIUS;
			if (d < min && d > 1e-5) {
				p.x = c.x + (dx / d) * min;
				p.z = c.z + (dz / d) * min;
			}
		}
		for (const b of boxes) {
			const cx = THREE.MathUtils.clamp(p.x, b.x - b.hw, b.x + b.hw);
			const cz = THREE.MathUtils.clamp(p.z, b.z - b.hd, b.z + b.hd);
			const dx = p.x - cx, dz = p.z - cz;
			const d = Math.hypot(dx, dz);
			if (d < RADIUS) {
				if (d > 1e-5) {
					p.x = cx + (dx / d) * RADIUS;
					p.z = cz + (dz / d) * RADIUS;
				} else p.z = b.z + b.hd + RADIUS;
			}
		}
		const r = Math.hypot(p.x, p.z);
		if (r > BOUNDS - 1) {
			p.x *= (BOUNDS - 1) / r;
			p.z *= (BOUNDS - 1) / r;
		}
	}

	function tryMove(dx: number, dz: number) {
		const blocked = (x: number, z: number) => groundHeight(x, z) > pos.y + STEP_UP;
		if (!blocked(pos.x + dx, pos.z + dz)) {
			pos.x += dx;
			pos.z += dz;
		} else if (!blocked(pos.x + dx, pos.z)) pos.x += dx;
		else if (!blocked(pos.x, pos.z + dz)) pos.z += dz;
		else speed *= 0.5;
		resolveCollisions(pos);
	}

	function updateClimb(dt: number) {
		climbT += dt / CLIMB_TIME;
		const toCenter = Math.atan2(PLATEAU.x - CLIMB_BASE.x, PLATEAU.z - CLIMB_BASE.z);
		const edge = new THREE.Vector3(PLATEAU.x, 0, PLATEAU.z).lerp(CLIMB_BASE, (PLATEAU.r - 0.1) / (PLATEAU.r + 0.9));
		const topY = groundHeight(CLIMB_TOP.x, CLIMB_TOP.z);
		const baseY = groundHeight(CLIMB_BASE.x, CLIMB_BASE.z);
		let d = toCenter - yaw;
		d = Math.atan2(Math.sin(d), Math.cos(d));
		yaw += d * Math.min(1, dt * 10);
		if (climbT < 0.15) {
			const u = climbT / 0.15;
			pos.x = THREE.MathUtils.lerp(pos.x, CLIMB_BASE.x, u);
			pos.z = THREE.MathUtils.lerp(pos.z, CLIMB_BASE.z, u);
			pos.y = baseY;
		} else if (climbT < 0.85) {
			const u = (climbT - 0.15) / 0.7;
			pos.x = THREE.MathUtils.lerp(CLIMB_BASE.x, edge.x, u);
			pos.z = THREE.MathUtils.lerp(CLIMB_BASE.z, edge.z, u);
			pos.y = THREE.MathUtils.lerp(baseY, topY + 0.1, Math.sin((u * Math.PI) / 2));
		} else {
			const u = (climbT - 0.85) / 0.15;
			pos.x = THREE.MathUtils.lerp(edge.x, CLIMB_TOP.x, u);
			pos.z = THREE.MathUtils.lerp(edge.z, CLIMB_TOP.z, u);
			pos.y = THREE.MathUtils.lerp(topY + 0.1, topY, u);
		}
		speed = 0;
		if (climbT >= 1) {
			climbT = -1;
			grounded = true;
			pos.y = groundHeight(pos.x, pos.z);
			tiger.land(0.5);
			puff(pos.clone(), 5, 0.5);
			setObjective('Trouve la noisette près du noisetier');
		}
	}

	function updatePlayer(dt: number) {
		const locked = stage === 'intro' || stage === 'party' || stage === 'end' || !!dialog;
		if (climbT >= 0) {
			updateClimb(dt);
			return;
		}
		const fwd = new THREE.Vector2(-Math.sin(camYaw), -Math.cos(camYaw));
		const mx = locked ? 0 : input.move.x;
		const my = locked ? 0 : input.move.y;
		const dir = new THREE.Vector2(fwd.x * my - fwd.y * mx, fwd.y * my + fwd.x * mx);
		if (drive) dir.set(Math.sin(drive.yaw), Math.cos(drive.yaw));
		const mag = Math.min(1, dir.length());
		const target = drive ? drive.speed : mag * (input.walk ? WALK : RUN);
		speed = THREE.MathUtils.damp(speed, target, target > speed ? 6 : 9, dt);
		let turn = 0;
		if (mag > 0.05) {
			const want = Math.atan2(dir.x, dir.y);
			let d = want - yaw;
			d = Math.atan2(Math.sin(d), Math.cos(d));
			const rate = THREE.MathUtils.lerp(10, 5.5, Math.min(1, speed / RUN));
			turn = THREE.MathUtils.clamp(d * rate, -rate, rate) * dt;
			yaw += turn;
			// Turning on the spot should not shoot forward.
			speed *= 1 - Math.min(1, Math.abs(d) / Math.PI) * dt * 6;
		}
		turnRate = THREE.MathUtils.damp(turnRate, turn / Math.max(dt, 1e-4), 10, dt);
		tryMove(Math.sin(yaw) * speed * dt, Math.cos(yaw) * speed * dt);

		const ground = groundHeight(pos.x, pos.z);
		if (grounded) {
			if (pos.y - ground > 0.3) {
				grounded = false;
				vy = 0;
			} else pos.y = ground;
			if (!locked && input.consumeJump()) {
				grounded = false;
				vy = 7.2;
				puff(pos.clone(), 3, 0.3);
			}
		}
		if (!grounded) {
			input.consumeJump();
			vy -= GRAVITY * dt;
			pos.y += vy * dt;
			if (pos.y <= ground) {
				const impact = -vy;
				pos.y = ground;
				grounded = true;
				vy = 0;
				tiger.land(impact / 12);
				if (impact > 5) puff(pos.clone(), impact > 9 ? 8 : 4, 0.6);
			}
		}
		if (grounded && speed > 3.4) {
			dustTimer -= dt;
			if (dustTimer < 0) {
				dustTimer = 0.14;
				puff(pos.clone().add(new THREE.Vector3(-Math.sin(yaw) * 0.4, 0, -Math.cos(yaw) * 0.4)), 1, 0.3);
			}
		}
	}

	function updateCamera(dt: number, now: number) {
		const drag = input.camDrag;
		camYaw -= drag.x * 0.006;
		camPitch = THREE.MathUtils.clamp(camPitch + drag.y * 0.004, 0.08, 0.95);
		drag.x = drag.y = 0;
		if (stage === 'intro') camYaw += dt * 0.12;
		else if (now - input.camTouchedAt > 1500 && speed > 0.6 && climbT < 0) {
			let d = yaw + Math.PI - camYaw;
			d = Math.atan2(Math.sin(d), Math.cos(d));
			camYaw += d * Math.min(1, dt * 1.4 * Math.min(1, speed / RUN));
		}
		const dist = stage === 'intro' ? 9 : 5.4;
		const pitch = stage === 'intro' ? 0.45 : camPitch;
		camTarget.set(pos.x, pos.y + 0.9, pos.z);
		let want = new THREE.Vector3(
			camTarget.x + Math.sin(camYaw) * Math.cos(pitch) * dist,
			camTarget.y + Math.sin(pitch) * dist,
			camTarget.z + Math.cos(camYaw) * Math.cos(pitch) * dist,
		);
		// Talking to Sally: frame both from the side instead of over Tygo's shoulder.
		if ((dialog && nearSally()) || stage === 'party' || stage === 'end') {
			const s = sally.root.position;
			const mid = new THREE.Vector3((pos.x + s.x) / 2, pos.y + 0.75, (pos.z + s.z) / 2);
			const side = new THREE.Vector3(s.z - pos.z, 0, pos.x - s.x).normalize();
			if (side.dot(new THREE.Vector3(camPos.x - mid.x, 0, camPos.z - mid.z)) < 0) side.negate();
			want = mid.clone().addScaledVector(side, 3.6).add(new THREE.Vector3(0, 1.1, 0));
			camTarget.copy(mid);
			camYaw = Math.atan2(side.x, side.z);
		}
		pullInFrontOfTrees(want);
		want.y = Math.max(want.y, groundHeight(want.x, want.z) + 0.6);
		if (!camInit) {
			camPos.copy(want);
			camInit = true;
		}
		camPos.x = THREE.MathUtils.damp(camPos.x, want.x, 8, dt);
		camPos.y = THREE.MathUtils.damp(camPos.y, want.y, 8, dt);
		camPos.z = THREE.MathUtils.damp(camPos.z, want.z, 8, dt);
		camera.position.copy(camPos);
		camera.lookAt(camTarget);
	}

	function pullInFrontOfTrees(want: THREE.Vector3) {
		const dir = want.clone().sub(camTarget);
		const len = dir.length();
		const p = new THREE.Vector3();
		for (let d = 1.4; d < len; d += 0.25) {
			p.copy(camTarget).addScaledVector(dir, d / len);
			if (crowns.some((c) => Math.hypot(p.x - c.x, p.z - c.z) < c.r)) {
				want.copy(camTarget).addScaledVector(dir, Math.max(1.4, d - 0.4) / len);
				return;
			}
		}
	}

	function updateMarker(time: number) {
		let target: THREE.Vector3 | null = null;
		if (!dialog) {
			if (stage === 'toSally' || stage === 'carry') target = sally.root.position.clone().add(new THREE.Vector3(0, 1.5, 0));
			else if (stage === 'toNut') target = onPlateau() ? nut.position.clone().add(new THREE.Vector3(0, 0.8, 0)) : CLIMB_BASE.clone().setY(groundHeight(CLIMB_BASE.x, CLIMB_BASE.z) + 1.3);
		}
		marker.visible = !!target && climbT < 0;
		if (target) {
			marker.position.copy(target).setY(target.y + Math.sin(time * 3) * 0.12);
			marker.rotation.y = time * 2;
		}
		const glow = stage === 'toNut' && !onPlateau() ? 0.45 + Math.sin(time * 4) * 0.3 : 0.4;
		world.pawPrints.traverse((o) => {
			const m = (o as THREE.Mesh).material as THREE.MeshBasicMaterial | undefined;
			if (m) {
				m.opacity = glow;
				m.color.set(stage === 'toNut' && !onPlateau() ? '#ff9a3c' : '#5a3d2b');
			}
		});
	}

	function updateEffects(dt: number, time: number) {
		for (const d of dust) {
			if (d.life <= 0) continue;
			d.life -= dt * 1.6;
			d.m.position.addScaledVector(d.vel, dt);
			d.vel.multiplyScalar(1 - dt * 2);
			d.m.scale.setScalar(0.6 + (1 - d.life) * 1.4);
			(d.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, d.life) * 0.7;
			if (d.life <= 0) d.m.visible = false;
		}
		for (const s of smoke) {
			s.t = (s.t + dt * 0.18) % 1;
			s.m.position.set(CHIMNEY_TOP.x + Math.sin(s.t * 6 + time * 0.5) * 0.3 + s.t * 1.2, CHIMNEY_TOP.y + s.t * 3, CHIMNEY_TOP.z + s.t * 0.6);
			s.m.scale.setScalar(0.4 + s.t * 1.4);
			(s.m.material as THREE.MeshStandardMaterial).opacity = 0.65 * (1 - s.t) * Math.min(1, s.t * 6);
		}
		for (const c of confetti) {
			if (!c.m.visible) continue;
			c.vel.y -= 6 * dt;
			c.vel.multiplyScalar(1 - dt * 0.8);
			c.m.position.addScaledVector(c.vel, dt);
			c.m.rotation.x += c.spin.x * dt;
			c.m.rotation.y += c.spin.y * dt;
			if (c.m.position.y < groundHeight(c.m.position.x, c.m.position.z)) c.m.visible = false;
		}
		for (const b of butterflies) {
			const t = time * 0.35 + b.seed;
			const p = new THREE.Vector3(b.cx + Math.sin(t * 1.3) * 2.2, 0.8 + Math.sin(t * 2.7) * 0.3, b.cz + Math.cos(t * 0.9) * 2.2);
			p.y += groundHeight(p.x, p.z);
			const away = p.clone().sub(pos);
			if (away.length() < 2) b.flee.lerp(away.setY(1).normalize().multiplyScalar(2), dt * 3);
			else b.flee.multiplyScalar(1 - dt * 0.5);
			p.add(b.flee);
			b.g.lookAt(p);
			b.g.position.copy(p);
			const flap = Math.sin(time * 22 + b.seed) * 1.1;
			b.wings[0].rotation.z = flap;
			b.wings[1].rotation.z = -flap;
		}
		const sway = Math.sin(time * 0.8) * 0.01;
		world.canopies.rotation.z = sway * 0.1;
		if (!carrying && stage !== 'party' && stage !== 'end' && nut.parent === scene) {
			nut.position.y = groundHeight(NUT_SPOT.x, NUT_SPOT.z) + 0.18 + Math.sin(time * 2.5) * 0.04;
			nut.rotation.y = time * 1.5;
		}
	}

	function updateQuest(dt: number) {
		if (dialog) {
			const l = dialog.lines[dialog.i];
			if (dialog.shown < l.text.length) {
				dialog.shown = Math.min(l.text.length, dialog.shown + dt * 45);
				ui.dlgText.textContent = l.text.slice(0, Math.floor(dialog.shown));
			}
			if (input.consumeAction() || input.consumeJump()) advance();
		}
		const act = availableAction();
		ui.action.classList.toggle('on', !!act);
		ui.actionLabel.textContent = act ? act.label : '';
		ui.hint.hidden = !act;
		if (act) ui.hint.textContent = `E · ${act.label}`;
		if (act && !dialog && input.consumeAction()) act.run();
		if (!act && !dialog) input.consumeAction();
		if (stage === 'party') {
			partyT += dt;
			if (partyT > 0.4 && partyT - dt <= 0.4) burst(sally.root.position.clone().add(new THREE.Vector3(0, 1.2, 0)));
			if (partyT > 3.8) {
				stage = 'end';
				const s = Math.round((performance.now() - startedAt) / 1000);
				ui.endTime.textContent = `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
				ui.end.hidden = false;
			}
		}
	}

	const resize = () => {
		const w = window.innerWidth, h = window.innerHeight;
		renderer.setSize(w, h, false);
		camera.aspect = w / h;
		camera.fov = w < h ? 68 : 55;
		camera.updateProjectionMatrix();
	};
	window.addEventListener('resize', resize);
	resize();

	let last = performance.now();
	let time = 0;
	const frame = (now: number) => {
		const dt = Math.min(0.05, (now - last) / 1000);
		last = now;
		time += dt;
		updatePlayer(dt);
		updateQuest(dt);

		tiger.root.position.copy(pos);
		tiger.root.rotation.y = yaw;
		const lookAt =
			stage === 'party' || nearSally() || Math.hypot(pos.x - SALLY_SPOT.x, pos.z - SALLY_SPOT.z) < 4.5
				? sally.root.position.clone().add(new THREE.Vector3(0, 0.6, 0))
				: stage === 'toNut' && pos.distanceTo(nut.position) < 4
					? nut.position
					: null;
		tiger.update(dt, { speed, turn: turnRate * 0.1, grounded, vy, climb: climbT >= 0 && climbT > 0.15 && climbT < 0.9 ? 1 : 0, happy: stage === 'party' || stage === 'end', lookAt });
		const talking = dialog && dialog.lines[dialog.i].who === 'Sally';
		const mood: SallyMood = stage === 'party' || stage === 'end' ? 'happy' : talking ? 'talk' : 'idle';
		sally.update(dt, mood, Math.hypot(pos.x - SALLY_SPOT.x, pos.z - SALLY_SPOT.z) < 7 ? pos : new THREE.Vector3(HOUSE.x + 1, 0, HOUSE.z + 6));

		updateEffects(dt, time);
		updateMarker(time);
		updateCamera(dt, now);
		world.sun.position.set(pos.x - 10, pos.y + 18, pos.z + 8);
		world.sun.target.position.copy(pos);
		renderer.render(scene, camera);
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);

	// Test hook for the capture script.
	(window as unknown as { __tygo: unknown }).__tygo = {
		get state() {
			return { stage, pos: pos.toArray(), yaw, speed, grounded, carrying, climbing: climbT >= 0, dialog: !!dialog, action: availableAction()?.label ?? null };
		},
		teleport(x: number, z: number, faceYaw?: number) {
			pos.set(x, groundHeight(x, z), z);
			grounded = true;
			vy = 0;
			if (faceYaw !== undefined) {
				yaw = faceYaw;
				camYaw = yaw + Math.PI;
			}
		},
		spots: { climb: [CLIMB_BASE.x, CLIMB_BASE.z], nut: [NUT_SPOT.x, NUT_SPOT.z], sally: [SALLY_SPOT.x, SALLY_SPOT.z] },
		drive(yaw: number | null, speed = RUN) {
			drive = yaw === null ? null : { yaw, speed };
		},
		setCam(y: number, p: number) {
			camYaw = y;
			camPitch = p;
			input.camTouchedAt = performance.now() + 1e6;
		},
	};
}
