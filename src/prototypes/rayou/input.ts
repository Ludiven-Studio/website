import { isTypingTarget } from '../../lib/keyboard';

export interface Input {
	move: { x: number; y: number };
	camDrag: { x: number; y: number };
	camTouchedAt: number;
	jumpHeld: boolean;
	consumeAction(): boolean;
	consumeJump(): boolean;
	consumeRoll(): boolean;
	consumeMenu(): boolean;
	consumeTrack(): boolean;
	consumeBag(): boolean;
	clear(): void;
}

const KEYS: Record<string, [number, number]> = {
	KeyW: [0, 1], KeyZ: [0, 1], ArrowUp: [0, 1],
	KeyS: [0, -1], ArrowDown: [0, -1],
	KeyA: [-1, 0], KeyQ: [-1, 0], ArrowLeft: [-1, 0],
	KeyD: [1, 0], ArrowRight: [1, 0],
};
const JOY_R = 56;

export interface Buttons {
	action: HTMLElement;
	jump: HTMLElement;
	roll: HTMLElement;
	menu: HTMLElement;
}

export function createInput(stage: HTMLElement, joyBase: HTMLElement, joyKnob: HTMLElement, btn: Buttons): Input {
	const held = new Set<string>();
	const latch = { action: false, jump: false, roll: false, menu: false, track: false, bag: false };
	let touchJump = false;
	let joyId: number | null = null;
	let camId: number | null = null;
	const joyOrigin = { x: 0, y: 0 };
	const joy = { x: 0, y: 0 };
	const camLast = { x: 0, y: 0 };
	let mouseDown = false;

	const take = (k: keyof typeof latch) => () => {
		const v = latch[k];
		latch[k] = false;
		return v;
	};
	const input: Input = {
		move: { x: 0, y: 0 },
		camDrag: { x: 0, y: 0 },
		camTouchedAt: -1e9,
		jumpHeld: false,
		consumeAction: take('action'),
		consumeJump: take('jump'),
		consumeRoll: take('roll'),
		consumeMenu: take('menu'),
		consumeTrack: take('track'),
		consumeBag: take('bag'),
		clear() {
			held.clear();
			joy.x = joy.y = 0;
			joyId = camId = null;
			touchJump = false;
			for (const k of Object.keys(latch) as (keyof typeof latch)[]) latch[k] = false;
			showJoy(false);
			refresh();
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
		input.jumpHeld = held.has('Space') || touchJump;
	};

	window.addEventListener('keydown', (e) => {
		if (isTypingTarget(e.target)) return;
		const c = e.code;
		if (c === 'Space') {
			if (!e.repeat) latch.jump = true;
			held.add(c);
		} else if (c === 'KeyE' || c === 'Enter') {
			if (!e.repeat) latch.action = true;
		} else if (c === 'ShiftLeft' || c === 'ShiftRight' || c === 'KeyC') {
			if (!e.repeat) latch.roll = true;
		} else if (c === 'Escape' || c === 'KeyP') {
			if (!e.repeat) latch.menu = true;
		} else if (c === 'Tab') {
			if (!e.repeat) latch.track = true;
		} else if (c === 'KeyI') {
			if (!e.repeat) latch.bag = true;
		} else if (KEYS[c]) held.add(c);
		else return;
		e.preventDefault();
		refresh();
	});
	window.addEventListener('keyup', (e) => {
		if (isTypingTarget(e.target)) return;
		held.delete(e.code);
		refresh();
	});
	window.addEventListener('blur', () => input.clear());

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
				if (t.clientX < window.innerWidth * 0.45 && joyId === null) {
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
					// Drag the base along when the thumb overshoots, so it never sticks at the rim.
					if (m > 1.3) {
						joyOrigin.x = t.clientX - (dx / m) * 1.3 * JOY_R;
						joyOrigin.y = t.clientY + (dy / m) * 1.3 * JOY_R;
					}
					if (m > 1) {
						dx /= m;
						dy /= m;
					}
					joy.x = dx;
					joy.y = dy;
					showJoy(true);
				} else if (t.identifier === camId) {
					input.camDrag.x += (t.clientX - camLast.x) * 1.3;
					input.camDrag.y += (t.clientY - camLast.y) * 1.3;
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

	const bind = (el: HTMLElement, down: () => void, up?: () => void) => {
		el.addEventListener(
			'touchstart',
			(e) => {
				e.preventDefault();
				e.stopPropagation();
				el.classList.add('down');
				down();
				refresh();
			},
			{ passive: false },
		);
		const release = (e: Event) => {
			e.preventDefault();
			el.classList.remove('down');
			up?.();
			refresh();
		};
		el.addEventListener('touchend', release);
		el.addEventListener('touchcancel', release);
		el.addEventListener('mousedown', (e) => {
			// No focus, or Space (jump) would click the button again.
			e.preventDefault();
			e.stopPropagation();
			down();
			refresh();
		});
		el.addEventListener('mouseup', () => {
			up?.();
			refresh();
		});
	};
	bind(btn.action, () => (latch.action = true));
	bind(
		btn.jump,
		() => {
			latch.jump = true;
			touchJump = true;
		},
		() => (touchJump = false),
	);
	bind(btn.roll, () => (latch.roll = true));
	bind(btn.menu, () => (latch.menu = true));

	return input;
}
