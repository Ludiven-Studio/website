import { isTypingTarget } from '../../lib/keyboard';

export interface Input {
	move: { x: number; y: number };
	walk: boolean;
	camDrag: { x: number; y: number };
	camTouchedAt: number;
	consumeAction(): boolean;
	consumeJump(): boolean;
}

const KEYS: Record<string, [number, number]> = {
	KeyW: [0, 1], KeyZ: [0, 1], ArrowUp: [0, 1],
	KeyS: [0, -1], ArrowDown: [0, -1],
	KeyA: [-1, 0], KeyQ: [-1, 0], ArrowLeft: [-1, 0],
	KeyD: [1, 0], ArrowRight: [1, 0],
};
const JOY_R = 56;

export function createInput(stage: HTMLElement, joyBase: HTMLElement, joyKnob: HTMLElement, actionBtn: HTMLElement, jumpBtn: HTMLElement): Input {
	const held = new Set<string>();
	let action = false;
	let jump = false;
	let joyId: number | null = null;
	let camId: number | null = null;
	const joyOrigin = { x: 0, y: 0 };
	const joy = { x: 0, y: 0 };
	const camLast = { x: 0, y: 0 };
	let mouseDown = false;

	const input: Input = {
		move: { x: 0, y: 0 },
		walk: false,
		camDrag: { x: 0, y: 0 },
		camTouchedAt: -1e9,
		consumeAction() {
			const a = action;
			action = false;
			return a;
		},
		consumeJump() {
			const j = jump;
			jump = false;
			return j;
		},
	};

	const refresh = () => {
		let x = joy.x, y = joy.y;
		for (const k of held) {
			const v = KEYS[k];
			if (v) {
				x += v[0];
				y += v[1];
			}
		}
		const m = Math.hypot(x, y);
		if (m > 1) {
			x /= m;
			y /= m;
		}
		input.move.x = x;
		input.move.y = y;
		input.walk = held.has('ShiftLeft') || held.has('ShiftRight');
	};

	window.addEventListener('keydown', (e) => {
		if (isTypingTarget(e.target)) return;
		if (e.code === 'Space') {
			if (!e.repeat) jump = true;
			e.preventDefault();
		} else if (e.code === 'KeyE' || e.code === 'Enter') {
			if (!e.repeat) action = true;
			e.preventDefault();
		} else if (KEYS[e.code] || e.code.startsWith('Shift')) {
			held.add(e.code);
			e.preventDefault();
		}
		refresh();
	});
	window.addEventListener('keyup', (e) => {
		if (isTypingTarget(e.target)) return;
		held.delete(e.code);
		refresh();
	});
	window.addEventListener('blur', () => {
		held.clear();
		refresh();
	});

	const showJoy = (on: boolean) => {
		joyBase.style.opacity = on ? '1' : '0';
		if (on) {
			joyBase.style.left = `${joyOrigin.x}px`;
			joyBase.style.top = `${joyOrigin.y}px`;
		}
		joyKnob.style.transform = `translate(${joy.x * JOY_R}px, ${-joy.y * JOY_R}px)`;
	};

	stage.addEventListener(
		'touchstart',
		(e) => {
			e.preventDefault();
			for (const t of Array.from(e.changedTouches)) {
				if (t.clientX < window.innerWidth * 0.5 && joyId === null) {
					joyId = t.identifier;
					joyOrigin.x = t.clientX;
					joyOrigin.y = t.clientY;
					joy.x = joy.y = 0;
					showJoy(true);
				} else if (camId === null) {
					camId = t.identifier;
					camLast.x = t.clientX;
					camLast.y = t.clientY;
				}
			}
			refresh();
		},
		{ passive: false },
	);
	stage.addEventListener(
		'touchmove',
		(e) => {
			e.preventDefault();
			for (const t of Array.from(e.changedTouches)) {
				if (t.identifier === joyId) {
					let dx = (t.clientX - joyOrigin.x) / JOY_R;
					let dy = -(t.clientY - joyOrigin.y) / JOY_R;
					const m = Math.hypot(dx, dy);
					if (m > 1) {
						dx /= m;
						dy /= m;
					}
					joy.x = dx;
					joy.y = dy;
					showJoy(true);
				} else if (t.identifier === camId) {
					input.camDrag.x += t.clientX - camLast.x;
					input.camDrag.y += t.clientY - camLast.y;
					input.camTouchedAt = performance.now();
					camLast.x = t.clientX;
					camLast.y = t.clientY;
				}
			}
			refresh();
		},
		{ passive: false },
	);
	const end = (e: TouchEvent) => {
		for (const t of Array.from(e.changedTouches)) {
			if (t.identifier === joyId) {
				joyId = null;
				joy.x = joy.y = 0;
				showJoy(false);
			} else if (t.identifier === camId) camId = null;
		}
		refresh();
	};
	stage.addEventListener('touchend', end);
	stage.addEventListener('touchcancel', end);

	stage.addEventListener('mousedown', (e) => {
		mouseDown = true;
		camLast.x = e.clientX;
		camLast.y = e.clientY;
	});
	window.addEventListener('mouseup', () => (mouseDown = false));
	window.addEventListener('mousemove', (e) => {
		if (!mouseDown) return;
		input.camDrag.x += e.clientX - camLast.x;
		input.camDrag.y += e.clientY - camLast.y;
		input.camTouchedAt = performance.now();
		camLast.x = e.clientX;
		camLast.y = e.clientY;
	});

	const bindButton = (el: HTMLElement, fire: () => void) => {
		el.addEventListener(
			'touchstart',
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				fire();
			},
			{ passive: false },
		);
		el.addEventListener('mousedown', (e) => {
			e.stopPropagation();
			fire();
		});
	};
	bindButton(actionBtn, () => (action = true));
	bindButton(jumpBtn, () => (jump = true));

	return input;
}
