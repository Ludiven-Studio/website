// Kart Galactique: menus, controls, HUD and the game loop around the race engine and its view.
import { buildTrack, NEBULA_RING } from './track';
import { createRace, stepRace, SHIPS, COLORS, BOT_NAMES, LAPS, ITEM_NAMES, projectedTime, shipParams, type Race, type Controls, type ItemId, type Entrant } from './race';
import { createView } from './render';
import { Sfx } from './sfx';
import { isTypingTarget } from '../../lib/keyboard';

const STEP = 1 / 120;
const BOTS = 5;
const BEST_KEY = 'ludiven-kart-best';
const SHIP_KEY = 'ludiven-kart-ship';
// Test aids: ?auto lets a bot drive your ship, ?x=4 runs the race four times faster.
const params = new URLSearchParams(location.search);
const AUTO = params.has('auto');
const SCALE = Math.max(0.25, Math.min(8, Number(params.get('x')) || 1));
const $ = <T extends HTMLElement>(id: string) => document.getElementById(`kg-${id}`) as T;

const ICONS: Record<ItemId, string> = {
	laser: '<svg viewBox="0 0 48 48"><path d="M8 40 L36 12" stroke="#ff3355" stroke-width="7" stroke-linecap="round"/><path d="M8 40 L36 12" stroke="#ffd0d8" stroke-width="2.5" stroke-linecap="round"/><circle cx="38" cy="10" r="5" fill="#ff8899"/></svg>',
	mine: '<svg viewBox="0 0 48 48"><g stroke="#ff5fa2" stroke-width="4" stroke-linecap="round"><path d="M24 6v8M24 34v8M6 24h8M34 24h8M11 11l6 6M31 31l6 6M37 11l-6 6M17 31l-6 6"/></g><circle cx="24" cy="24" r="11" fill="#ff5fa2"/><circle cx="20" cy="20" r="3" fill="#fff"/></svg>',
	hyper: '<svg viewBox="0 0 48 48"><path d="M6 12l12 12-12 12M20 12l12 12-12 12M34 12l10 12-10 12" fill="none" stroke="#3ee0ff" stroke-width="5" stroke-linejoin="round"/></svg>',
	tractor: '<svg viewBox="0 0 48 48"><path d="M10 8v16a14 14 0 0 0 28 0V8h-8v16a6 6 0 0 1-12 0V8z" fill="#5ad1ff"/><path d="M10 8h8v6h-8zM30 8h8v6h-8z" fill="#fff"/></svg>',
};

const fmt = (t: number) => {
	const m = Math.floor(t / 60);
	const s = t - m * 60;
	return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
const ord = (n: number) => (n === 1 ? 'er' : 'e');

function readNum(key: string): number | null {
	try {
		const v = Number(localStorage.getItem(key));
		return Number.isFinite(v) && v > 0 ? v : null;
	} catch {
		return null;
	}
}
function writeNum(key: string, v: number) {
	try {
		localStorage.setItem(key, String(v));
	} catch {
		/* storage blocked */
	}
}

export function start() {
	const root = $('root');
	const canvas = $<HTMLCanvasElement>('view');
	const track = buildTrack(NEBULA_RING);
	const view = createView(canvas, track);
	const sfx = new Sfx();

	let shipIdx = Math.max(0, Math.min(SHIPS.length - 1, Math.round(readNum(SHIP_KEY) ?? 1) - 1));
	let mode: 'menu' | 'race' | 'paused' | 'results' = 'menu';
	let race: Race = newRace();
	let player = race.karts.length - 1;
	let finishedAt = -1;
	let lastCount = 99;
	let msgUntil = 0;

	function newRace(): Race {
		const rnd = Math.random;
		const entrants: Entrant[] = [];
		const names = [...BOT_NAMES].sort(() => rnd() - 0.5);
		const others = SHIPS.filter((_, i) => i !== shipIdx);
		const skills = [0.985, 0.97, 0.955, 0.94, 0.925];
		for (let b = 0; b < BOTS; b++) entrants.push({ ship: others[b % others.length], name: names[b], color: COLORS[(b + 1) % COLORS.length], player: false, skill: skills[b] });
		entrants.push({ ship: SHIPS[shipIdx], name: 'Toi', color: COLORS[0], player: true });
		return createRace(track, entrants, rnd, 3);
	}

	// ---------- Input ----------
	const held = { left: false, right: false, brake: false, drift: false, item: false };
	const keys = new Set<string>();
	const pad = { left: false, right: false, brake: false, drift: false, item: false };
	const readControls = (): Controls => {
		const left = keys.has('ArrowLeft') || keys.has('KeyA') || keys.has('KeyQ') || pad.left;
		const right = keys.has('ArrowRight') || keys.has('KeyD') || pad.right;
		held.brake = keys.has('ArrowDown') || keys.has('KeyS') || pad.brake;
		held.drift = keys.has('Space') || keys.has('ShiftLeft') || keys.has('ShiftRight') || pad.drift;
		held.item = keys.has('KeyE') || keys.has('KeyX') || keys.has('ControlLeft') || keys.has('ControlRight') || pad.item;
		return { steer: (right ? 1 : 0) - (left ? 1 : 0), throttle: held.brake ? 0 : 1, brake: held.brake, drift: held.drift, item: held.item };
	};
	const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyQ', 'KeyD', 'KeyS', 'KeyW', 'KeyZ', 'Space', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyX', 'ControlLeft', 'ControlRight']);
	window.addEventListener('keydown', (e) => {
		if (isTypingTarget(e.target)) return;
		if (mode === 'menu') {
			if (e.code === 'ArrowLeft') pickShip(-1);
			else if (e.code === 'ArrowRight') pickShip(1);
			else if (e.code === 'Enter' || e.code === 'Space') go();
			else return;
			e.preventDefault();
			return;
		}
		if (e.code === 'Escape' || e.code === 'KeyP') {
			if (!e.repeat) togglePause();
			e.preventDefault();
			return;
		}
		if (!GAME_KEYS.has(e.code)) return;
		keys.add(e.code);
		e.preventDefault();
	});
	window.addEventListener('keyup', (e) => {
		if (isTypingTarget(e.target)) return;
		keys.delete(e.code);
	});
	window.addEventListener('blur', () => {
		keys.clear();
		for (const k of Object.keys(pad) as (keyof typeof pad)[]) pad[k] = false;
	});

	// Touch buttons: native touch events (iOS), pointer events for mouse and test drivers.
	const touchUi = $('touch');
	const bindPad = (id: string, key: keyof typeof pad) => {
		const el = $(id);
		const on = (e: Event) => {
			e.preventDefault();
			pad[key] = true;
			el.classList.add('kg-down');
		};
		const off = (e: Event) => {
			e.preventDefault();
			pad[key] = false;
			el.classList.remove('kg-down');
		};
		el.addEventListener('touchstart', on, { passive: false });
		el.addEventListener('touchend', off, { passive: false });
		el.addEventListener('touchcancel', off, { passive: false });
		el.addEventListener('pointerdown', on);
		el.addEventListener('pointerup', off);
		el.addEventListener('pointerleave', off);
		el.addEventListener('pointercancel', off);
		el.addEventListener('contextmenu', (e) => e.preventDefault());
	};
	bindPad('left', 'left');
	bindPad('right', 'right');
	bindPad('brake', 'brake');
	bindPad('drift', 'drift');
	bindPad('use', 'item');
	const coarse = window.matchMedia('(pointer: coarse)');
	let touchSeen = coarse.matches;
	window.addEventListener('touchstart', () => {
		if (!touchSeen) {
			touchSeen = true;
			syncScreens();
		}
	}, { passive: true });

	// ---------- Screens ----------
	const menu = $('menu'), pauseMenu = $('pausemenu'), results = $('results'), hud = $('hud');
	const syncScreens = () => {
		menu.hidden = mode !== 'menu';
		pauseMenu.hidden = mode !== 'paused';
		results.hidden = mode !== 'results';
		hud.hidden = mode === 'menu';
		touchUi.hidden = !(touchSeen && (mode === 'race'));
		root.classList.toggle('kg-racing', mode === 'race');
	};

	const renderShipCard = () => {
		const s = SHIPS[shipIdx];
		$('ship-name').textContent = s.name;
		$('ship-pitch').textContent = s.pitch;
		const bars: [string, number][] = [['Vitesse', s.stats.speed], ['Accélération', s.stats.accel], ['Maniabilité', s.stats.handling], ['Poids', s.stats.weight]];
		$('ship-stats').innerHTML = bars.map(([l, v]) => `<li><span>${l}</span><i style="--v:${v / 5}"></i></li>`).join('');
		$('ship-count').textContent = `${shipIdx + 1} / ${SHIPS.length}`;
		const best = readNum(BEST_KEY);
		$('best').textContent = best ? `Ton record : ${fmt(best)}` : '';
	};
	const pickShip = (d: number) => {
		shipIdx = (shipIdx + d + SHIPS.length) % SHIPS.length;
		writeNum(SHIP_KEY, shipIdx + 1);
		const k = race.karts[player];
		k.ship = SHIPS[shipIdx];
		k.p = shipParams(k.ship);
		view.refreshShip(k);
		renderShipCard();
	};
	$('prev').addEventListener('click', () => pickShip(-1));
	$('next').addEventListener('click', () => pickShip(1));

	const go = () => {
		sfx.unlock();
		race = newRace();
		player = race.karts.findIndex((k) => k.player);
		finishedAt = -1;
		lastCount = 99;
		msgUntil = 0;
		keys.clear();
		mode = 'race';
		syncScreens();
		view.setRace(race);
	};
	$('go').addEventListener('click', go);
	$('again').addEventListener('click', go);
	$('restart').addEventListener('click', go);
	const toMenu = () => {
		mode = 'menu';
		race = newRace();
		player = race.karts.findIndex((k) => k.player);
		sfx.stop();
		renderShipCard();
		syncScreens();
	};
	$('change').addEventListener('click', toMenu);
	$('change2').addEventListener('click', toMenu);
	const togglePause = () => {
		if (mode === 'race') mode = 'paused';
		else if (mode === 'paused') mode = 'race';
		else return;
		keys.clear();
		if (mode === 'paused') sfx.stop();
		syncScreens();
	};
	$('pause').addEventListener('click', togglePause);
	$('resume').addEventListener('click', togglePause);
	const soundBtn = $('sound');
	const syncSound = () => (soundBtn.textContent = sfx.muted ? 'Son : coupé' : 'Son : activé');
	soundBtn.addEventListener('click', () => {
		sfx.unlock();
		sfx.setMuted(!sfx.muted);
		syncSound();
	});
	syncSound();
	document.addEventListener('visibilitychange', () => {
		if (document.hidden && mode === 'race') togglePause();
	});
	const fsBtn = $('fs');
	if (!document.fullscreenEnabled) fsBtn.hidden = true;
	fsBtn.addEventListener('click', async () => {
		try {
			if (document.fullscreenElement) await document.exitFullscreen();
			else {
				await root.requestFullscreen();
				const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
				await o.lock?.('landscape').catch(() => {});
			}
		} catch {
			/* refused */
		}
	});

	// ---------- HUD ----------
	const rankEl = $('rank'), rankSuf = $('rank-suf'), lapEl = $('lap'), timeEl = $('time'), itemEl = $('item'), msgEl = $('msg');
	$('rank-of').textContent = `/${BOTS + 1}`;
	const map = $<HTMLCanvasElement>('map');
	const mctx = map.getContext('2d')!;
	let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
	for (let i = 0; i < track.n; i++) {
		minX = Math.min(minX, track.px[i]);
		maxX = Math.max(maxX, track.px[i]);
		minZ = Math.min(minZ, track.pz[i]);
		maxZ = Math.max(maxZ, track.pz[i]);
	}
	const MAP = map.width, pad0 = 12;
	const ms = (MAP - pad0 * 2) / Math.max(maxX - minX, maxZ - minZ);
	const mx = (x: number) => pad0 + (x - minX) * ms + ((MAP - pad0 * 2) - (maxX - minX) * ms) / 2;
	const mz = (z: number) => pad0 + (z - minZ) * ms + ((MAP - pad0 * 2) - (maxZ - minZ) * ms) / 2;
	const drawMap = () => {
		mctx.clearRect(0, 0, MAP, MAP);
		mctx.lineJoin = 'round';
		mctx.strokeStyle = 'rgba(20,16,46,0.75)';
		mctx.lineWidth = 9;
		mctx.beginPath();
		for (let i = 0; i <= track.n; i++) {
			const j = i % track.n;
			if (i) mctx.lineTo(mx(track.px[j]), mz(track.pz[j]));
			else mctx.moveTo(mx(track.px[j]), mz(track.pz[j]));
		}
		mctx.stroke();
		mctx.strokeStyle = 'rgba(200,220,255,0.9)';
		mctx.lineWidth = 3;
		mctx.stroke();
		for (const k of race.karts) {
			if (k.idx === player) continue;
			mctx.fillStyle = `#${k.color.toString(16).padStart(6, '0')}`;
			mctx.beginPath();
			mctx.arc(mx(k.x), mz(k.z), 3.5, 0, Math.PI * 2);
			mctx.fill();
		}
		const me = race.karts[player];
		mctx.fillStyle = '#fff';
		mctx.strokeStyle = '#ff4d6d';
		mctx.lineWidth = 2.5;
		mctx.beginPath();
		mctx.arc(mx(me.x), mz(me.z), 5, 0, Math.PI * 2);
		mctx.fill();
		mctx.stroke();
	};

	let rouletteTick = 0;
	let shownItem = '';
	const showMsg = (text: string, secs: number, cls = '') => {
		msgEl.textContent = text;
		msgEl.className = cls;
		msgEl.classList.add('kg-pop');
		msgUntil = performance.now() + secs * 1000;
	};
	const updateHud = (dt: number) => {
		const me = race.karts[player];
		rankEl.textContent = String(me.rank);
		rankSuf.textContent = ord(me.rank);
		const lap = Math.max(1, Math.min(LAPS, me.lap));
		lapEl.textContent = `Tour ${lap}/${LAPS}`;
		timeEl.textContent = fmt(Math.max(0, me.finished ? me.finishTime : race.time));
		let html = '';
		if (me.roulette > 0) {
			rouletteTick += dt;
			const ids = Object.keys(ICONS) as ItemId[];
			html = ICONS[ids[Math.floor(rouletteTick * 14) % ids.length]];
		} else if (me.item) html = ICONS[me.item];
		const key = me.roulette > 0 ? `r${Math.floor(rouletteTick * 14)}` : me.item ?? '';
		if (key !== shownItem) {
			shownItem = key;
			itemEl.innerHTML = html;
			itemEl.title = me.item ? ITEM_NAMES[me.item] : '';
			itemEl.classList.toggle('kg-full', !!me.item);
		}
		$('use').classList.toggle('kg-ready', !!me.item);
		// Countdown.
		if (race.time < 0) {
			const c = Math.ceil(-race.time);
			if (c !== lastCount && c <= 3) {
				lastCount = c;
				showMsg(String(c), 0.9, 'kg-count');
				sfx.play('count');
			}
		} else if (lastCount !== 0) {
			lastCount = 0;
			showMsg('Partez !', 0.9, 'kg-count');
			sfx.play('go');
		}
		if (msgUntil && performance.now() > msgUntil) {
			msgUntil = 0;
			msgEl.className = '';
			msgEl.textContent = '';
		}
		drawMap();
	};

	const handleEvents = () => {
		for (const k of race.karts) {
			for (const ev of k.events) {
				const mine = k.idx === player;
				if (ev.startsWith('hit:')) {
					view.burst(k.x, k.y, k.z, ev === 'hit:tractor' ? 0x5ad1ff : 0xffd23f, 26);
					if (mine) {
						sfx.play('hit');
						if (ev === 'hit:tractor') showMsg('Rayon tracteur !', 1.2, 'kg-warn');
					}
				} else if (ev.startsWith('turbo:')) {
					const lvl = Number(ev.slice(6));
					view.burst(k.x, k.y, k.z, [0, 0x4cc9ff, 0xff9f1c, 0xd65bff][lvl], 10 + lvl * 6);
					if (mine) sfx.play('turbo');
				} else if (!mine) continue;
				else if (ev === 'lap') sfx.play('lap');
				else if (ev === 'lap:final') {
					sfx.play('final');
					showMsg('Tour final !', 1.6, 'kg-final');
				} else if (ev === 'finish') {
					sfx.play('finish');
					showMsg(`Arrivée : ${k.rank}${ord(k.rank)} !`, 2.5, 'kg-final');
					finishedAt = performance.now();
					const best = readNum(BEST_KEY);
					if (!AUTO && (!best || k.finishTime < best)) writeNum(BEST_KEY, k.finishTime);
				} else if (ev === 'box') {
					sfx.play('box');
					rouletteTick = 0;
				} else if (ev.startsWith('got:')) sfx.play('got');
				else if (ev.startsWith('use:')) sfx.play(ev);
				else if (ev.startsWith('charge:')) sfx.play('charge');
				else if (ev === 'pad' || ev === 'wall' || ev === 'bump' || ev === 'hop') sfx.play(ev);
			}
			k.events.length = 0;
		}
	};

	const showResults = () => {
		const rows = [...race.karts]
			.map((k) => ({ k, t: projectedTime(race, k) }))
			.sort((a, b) => (a.k.finished !== b.k.finished ? (a.k.finished ? -1 : 1) : a.t - b.t));
		$('table').innerHTML = rows
			.map(({ k, t }, i) => `<tr class="${k.player ? 'kg-me' : ''}"><td>${i + 1}${ord(i + 1)}</td><td><i style="background:#${k.color.toString(16).padStart(6, '0')}"></i>${k.name}</td><td>${k.ship.name}</td><td>${k.finished ? fmt(t) : `~${fmt(t)}`}</td></tr>`)
			.join('');
		const me = race.karts[player];
		$('result-title').textContent = me.rank === 1 ? 'Victoire !' : me.rank <= 3 ? `Sur le podium : ${me.rank}${ord(me.rank)} !` : `${me.rank}${ord(me.rank)} place`;
		const best = readNum(BEST_KEY);
		$('result-best').textContent = best ? `Ton record : ${fmt(best)}` : '';
		mode = 'results';
		syncScreens();
	};

	// ---------- Loop ----------
	const resize = () => view.resize(root.clientWidth, root.clientHeight);
	new ResizeObserver(resize).observe(root);
	resize();
	renderShipCard();
	syncScreens();
	view.setRace(race);

	let last = performance.now();
	let acc = 0;
	const frame = (now: number) => {
		const dt = Math.min(0.1, (now - last) / 1000) * SCALE;
		last = now;
		if (mode === 'race' || mode === 'results') {
			acc += dt;
			const c = readControls();
			while (acc >= STEP) {
				stepRace(race, mode === 'race' && !AUTO ? c : null, STEP);
				acc -= STEP;
			}
			handleEvents();
			if (mode === 'race') updateHud(dt);
			const me = race.karts[player];
			sfx.engineAt(Math.min(1, Math.abs(me.speed) / 34), me.boost > 0, mode === 'race' && race.time > -3);
			if (finishedAt > 0 && mode === 'race' && (now - finishedAt) * SCALE > 2600) showResults();
			root.classList.toggle('kg-hyper', me.hyper > 0);
		} else acc = 0;
		view.render(race, player, mode === 'paused' ? 0 : dt, mode === 'menu' ? 'menu' : 'race');
		requestAnimationFrame(frame);
	};
	requestAnimationFrame(frame);
}
