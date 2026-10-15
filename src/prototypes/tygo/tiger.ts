import * as THREE from 'three';

export interface TigerPose {
	speed: number;
	turn: number;
	grounded: boolean;
	vy: number;
	climb: number; // 0 = not climbing, otherwise the climb progress
	happy: boolean;
	lookAt: THREE.Vector3 | null;
}

export interface Tiger {
	root: THREE.Group;
	mouth: THREE.Object3D;
	land(impact: number): void;
	update(dt: number, pose: TigerPose): void;
}

const ORANGE = '#ee8a2c';
const WHITE = '#fff4e6';
const BLACK = '#2a2119';

// Legs are LF, RF, LH, RH. Walk = lateral sequence, gallop = bound (front pair, then hind pair).
const WALK_OFF = [0.25, 0.75, 0, 0.5];
const GALLOP_OFF = [0, 0.1, 0.5, 0.6];
const LEG_LEN = 0.5;

function stripeTexture(): THREE.CanvasTexture {
	const c = document.createElement('canvas');
	c.width = 256;
	c.height = 256;
	const g = c.getContext('2d')!;
	g.fillStyle = ORANGE;
	g.fillRect(0, 0, 256, 256);
	g.fillStyle = BLACK;
	for (let i = 0; i < 9; i++) {
		const y = 22 + i * 26;
		for (let half = 0; half < 2; half++) {
			// Each band is a tapered chevron wrapping around the body, broken under the belly.
			const x0 = half ? 136 : 8;
			g.beginPath();
			g.moveTo(x0, y);
			g.quadraticCurveTo(x0 + 56, y - 9 + (i % 2) * 6, x0 + 112, y + 2);
			g.quadraticCurveTo(x0 + 56, y + 10, x0, y + 7);
			g.closePath();
			g.fill();
		}
	}
	const t = new THREE.CanvasTexture(c);
	t.colorSpace = THREE.SRGBColorSpace;
	return t;
}

const mat = (color: THREE.ColorRepresentation, map?: THREE.Texture) =>
	new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : color, map, flatShading: true, roughness: 0.85 });

function part(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
	const mesh = new THREE.Mesh(geo, m);
	mesh.position.set(x, y, z);
	mesh.castShadow = true;
	return mesh;
}

interface Leg {
	hip: THREE.Group;
	knee: THREE.Group;
	front: boolean;
}

export function createTiger(): Tiger {
	const stripes = stripeTexture();
	const orange = mat(ORANGE);
	const striped = mat(ORANGE, stripes);
	const white = mat(WHITE);
	const black = mat(BLACK);
	const pink = mat('#f29aa0');

	const root = new THREE.Group();
	const body = new THREE.Group();
	body.position.y = 0.52;
	root.add(body);

	const torsoGeo = new THREE.CapsuleGeometry(0.29, 0.5, 4, 10).rotateX(Math.PI / 2);
	const torso = part(torsoGeo, striped);
	body.add(torso);
	const belly = part(new THREE.SphereGeometry(0.25, 10, 6), white, 0, -0.1, 0.02);
	belly.scale.set(0.95, 0.65, 1.55);
	body.add(belly);
	const chest = part(new THREE.SphereGeometry(0.2, 8, 6), white, 0, 0.0, 0.38);
	chest.scale.set(1, 1.1, 0.7);
	body.add(chest);

	// Head on a neck pivot, so it can look around and stabilise against the gait.
	const neck = new THREE.Group();
	neck.position.set(0, 0.2, 0.42);
	body.add(neck);
	const head = new THREE.Group();
	head.position.set(0, 0.16, 0.12);
	neck.add(head);
	head.add(part(new THREE.IcosahedronGeometry(0.27, 1), orange));
	for (const [x, ry] of [[-0.08, 0.25], [0, 0], [0.08, -0.25]] as const) {
		const s = part(new THREE.BoxGeometry(0.035, 0.012, 0.16), black, x, 0.255, 0.02);
		s.rotation.y = ry;
		head.add(s);
	}
	for (const side of [-1, 1]) {
		const cheekStripe = part(new THREE.BoxGeometry(0.012, 0.03, 0.12), black, side * 0.26, 0.0, -0.02);
		cheekStripe.rotation.z = side * 0.3;
		head.add(cheekStripe);
		const cheek = part(new THREE.SphereGeometry(0.11, 7, 5), white, side * 0.15, -0.09, 0.14);
		cheek.scale.set(1.1, 0.8, 0.9);
		head.add(cheek);
	}
	const muzzle = part(new THREE.SphereGeometry(0.12, 8, 6), white, 0, -0.08, 0.22);
	muzzle.scale.set(1.25, 0.8, 0.85);
	head.add(muzzle);
	head.add(part(new THREE.SphereGeometry(0.045, 6, 4).scale(1.3, 0.8, 1), pink, 0, -0.02, 0.32));
	const eyes: THREE.Mesh[] = [];
	for (const side of [-1, 1]) {
		const eye = part(new THREE.SphereGeometry(0.048, 8, 6), black, side * 0.105, 0.05, 0.225);
		eye.add(part(new THREE.SphereGeometry(0.015, 5, 4), mat('#ffffff'), 0.012, 0.018, 0.04));
		head.add(eye);
		eyes.push(eye);
		const ear = new THREE.Group();
		ear.position.set(side * 0.17, 0.21, -0.03);
		ear.rotation.z = -side * 0.35;
		const outer = part(new THREE.SphereGeometry(0.095, 7, 5), orange);
		outer.scale.set(1, 1, 0.45);
		const inner = part(new THREE.SphereGeometry(0.06, 6, 4), white, 0, -0.01, 0.03);
		inner.scale.set(1, 1, 0.4);
		const back = part(new THREE.SphereGeometry(0.06, 6, 4), black, 0, 0.02, -0.035);
		back.scale.set(1, 0.8, 0.3);
		ear.add(outer, inner, back);
		head.add(ear);
	}
	const mouth = new THREE.Object3D();
	mouth.position.set(0, -0.17, 0.3);
	head.add(mouth);

	const legs: Leg[] = [];
	for (const [x, z, front] of [[-0.17, 0.3, true], [0.17, 0.3, true], [-0.17, -0.3, false], [0.17, -0.3, false]] as const) {
		const hip = new THREE.Group();
		hip.position.set(x, -0.04, z);
		const upperR = front ? 0.08 : 0.105;
		hip.add(part(new THREE.CapsuleGeometry(upperR, 0.16, 3, 7), front ? orange : striped, 0, -0.12, 0));
		const knee = new THREE.Group();
		knee.position.y = -0.25;
		knee.add(part(new THREE.CapsuleGeometry(0.068, 0.14, 3, 7), orange, 0, -0.1, 0));
		const paw = part(new THREE.SphereGeometry(0.085, 8, 5), white, 0, -0.22, 0.03);
		paw.scale.set(1, 0.6, 1.3);
		knee.add(paw);
		hip.add(knee);
		body.add(hip);
		legs.push({ hip, knee, front });
	}

	const tail: THREE.Group[] = [];
	let parent: THREE.Object3D = body;
	for (let i = 0; i < 7; i++) {
		const seg = new THREE.Group();
		seg.position.set(0, i ? 0 : 0.1, i ? -0.12 : -0.52);
		const r = 0.055 - i * 0.003;
		seg.add(part(new THREE.CapsuleGeometry(r, 0.08, 2, 6).rotateX(Math.PI / 2), i === 6 || i % 2 ? black : orange, 0, 0, -0.06));
		parent.add(seg);
		tail.push(seg);
		parent = seg;
	}

	let phase = 0;
	let time = 0;
	let sit = 0;
	let idle = 0;
	let squash = 0;
	let blink = 2;
	let lookYaw = 0;
	let lookPitch = 0;
	const tmp = new THREE.Vector3();

	function legAngles(p: number, stanceFrac: number, amp: number, lift: number): [number, number] {
		if (p < stanceFrac) return [-amp + (2 * amp * p) / stanceFrac, 0];
		const u = (p - stanceFrac) / (1 - stanceFrac);
		const e = u * u * (3 - 2 * u);
		return [amp - 2 * amp * e, Math.sin(Math.PI * u) * lift];
	}

	return {
		root,
		mouth,
		land(impact: number) {
			squash = Math.min(1, impact);
		},
		update(dt: number, pose: TigerPose) {
			time += dt;
			const speed = pose.speed;
			const g = THREE.MathUtils.smoothstep(speed, 2.6, 4.2);
			const stride = THREE.MathUtils.lerp(0.95, 1.9, g);
			const stanceFrac = THREE.MathUtils.lerp(0.62, 0.42, g);
			const moving = THREE.MathUtils.smoothstep(speed, 0.05, 0.7);
			phase = (phase + (speed * dt) / stride + (pose.climb ? dt * 2.6 : 0)) % 1;

			idle = speed < 0.1 && pose.grounded && !pose.climb ? idle + dt : 0;
			sit = THREE.MathUtils.damp(sit, idle > 4 || pose.happy ? 1 : 0, idle > 4 || pose.happy ? 3 : 10, dt);

			// Feet do not skate: the stance sweep covers exactly stanceFrac of the stride.
			const amp = Math.asin(Math.min(0.95, (stanceFrac * stride) / (2 * LEG_LEN))) * Math.max(moving, pose.climb ? 1 : 0);
			const lift = THREE.MathUtils.lerp(0.9, 1.4, g) * Math.max(moving, pose.climb ? 1 : 0);

			let bodyPitch = Math.sin(phase * Math.PI * 2) * 0.13 * g;
			let bodyY = 0.52 + Math.abs(Math.sin(phase * Math.PI * 4)) * 0.025 * moving * (1 - g) + Math.sin(phase * Math.PI * 2 + 1) * 0.06 * g;
			bodyPitch -= sit * 0.5;
			bodyY -= sit * 0.12;
			if (pose.climb) bodyPitch = -0.95 + Math.sin(phase * Math.PI * 4) * 0.06;
			if (!pose.grounded && !pose.climb) bodyPitch = THREE.MathUtils.clamp(-pose.vy * 0.05, -0.35, 0.4);
			squash = Math.max(0, squash - dt * 4);
			const breathe = 1 + Math.sin(time * 2.2) * 0.012;
			body.position.y = bodyY - squash * 0.08;
			body.rotation.x = THREE.MathUtils.damp(body.rotation.x, bodyPitch, 14, dt);
			body.rotation.z = THREE.MathUtils.damp(body.rotation.z, -pose.turn * Math.min(speed, 4) * 0.04, 8, dt);
			body.scale.set(1 + squash * 0.1, breathe - squash * 0.12, 1 + squash * 0.05);

			const offs = WALK_OFF.map((w, i) => THREE.MathUtils.lerp(w, GALLOP_OFF[i], g));
			legs.forEach((leg, i) => {
				let [hip, knee] = legAngles((phase + offs[i]) % 1, stanceFrac, amp, lift);
				if (!pose.grounded && !pose.climb) {
					const tuck = pose.vy > 0 ? 1 : -0.6;
					hip = leg.front ? -0.7 * tuck : 0.7 * tuck;
					knee = 0.5;
				}
				// Sitting: hind legs fold forward under the body, front legs stay upright.
				const sitHip = leg.front ? 0.5 : -1.25;
				const sitKnee = leg.front ? 0 : 1.9;
				hip = THREE.MathUtils.lerp(hip, sitHip, sit);
				knee = THREE.MathUtils.lerp(knee, sitKnee, sit);
				// Keep the legs reaching for the ground when the body pitches.
				hip -= body.rotation.x * (1 - sit);
				leg.hip.rotation.x = THREE.MathUtils.damp(leg.hip.rotation.x, hip, 30, dt);
				leg.knee.rotation.x = THREE.MathUtils.damp(leg.knee.rotation.x, knee, 30, dt);
			});

			let wantYaw = 0;
			let wantPitch = -body.rotation.x * 0.7;
			if (pose.lookAt && !pose.climb) {
				neck.getWorldPosition(tmp);
				const local = root.worldToLocal(pose.lookAt.clone());
				const neckLocal = root.worldToLocal(tmp.clone());
				const d = local.sub(neckLocal);
				wantYaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -0.9, 0.9);
				wantPitch += THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -0.5, 0.4);
			}
			wantYaw += pose.turn * 0.12;
			lookYaw = THREE.MathUtils.damp(lookYaw, wantYaw, 6, dt);
			lookPitch = THREE.MathUtils.damp(lookPitch, wantPitch + (pose.happy ? Math.sin(time * 9) * 0.1 : 0), 8, dt);
			neck.rotation.set(lookPitch, lookYaw, pose.happy ? Math.sin(time * 4.5) * 0.15 : 0);

			blink -= dt;
			const closed = blink < 0.12 || pose.happy;
			if (blink < 0) blink = 2.5 + Math.random() * 3;
			for (const e of eyes) e.scale.y = THREE.MathUtils.damp(e.scale.y, closed ? 0.15 : 1, 30, dt);

			tail.forEach((seg, i) => {
				// Per segment: the chain sums seven of these.
				const swish = Math.sin(time * (pose.happy ? 8 : 2.1) - i * 0.6) * (0.04 + 0.06 * (1 - moving)) * (pose.happy ? 2 : 1);
				const up = i === 0 ? THREE.MathUtils.lerp(0.75, 0.15, g) + sit * -0.6 : THREE.MathUtils.lerp(-0.22, -0.03, g) + (i > 4 ? 0.35 : 0) * (1 - g);
				seg.rotation.x = THREE.MathUtils.damp(seg.rotation.x, up + Math.sin(time * 3 - i) * 0.05 * g, 8, dt);
				seg.rotation.y = THREE.MathUtils.damp(seg.rotation.y, swish - pose.turn * 0.12, 8, dt);
			});
		},
	};
}
