import { groundHeight, waterAt, distToPath, mountPolar, R_OUT, BOUNDS, WATER_Y } from './terrain';
import { COLORS, LABELS, SOUVENIRS, type Line } from './story';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export interface Objective {
	id: string;
	text: string;
	target: { x: number; y: number; z: number } | null;
	done?: boolean;
}

export interface BagItem {
	icon: string;
	name: string;
	count: string;
	note: string;
	empty?: boolean;
}

export interface MapMarker {
	x: number;
	z: number;
	color: string;
	label?: string;
	kind: 'player' | 'npc' | 'goal';
	yaw?: number;
	align?: 'above' | 'below' | 'left' | 'right';
}

export class Hud {
	readonly el = {
		objective: $('objective'),
		objText: $('obj-text'),
		objMore: $('obj-more'),
		jar: $('jar-count'),
		gold: $('gold-count'),
		arrow: $('arrow'),
		hint: $('hint'),
		toasts: $('toasts'),
		action: $('btn-action'),
		actionLabel: $('action-label'),
		dialog: $('dialog'),
		dlgName: $('dlg-name'),
		dlgText: $('dlg-text'),
		fade: $('fade'),
		intro: $('intro'),
		menu: $('menu'),
		end: $('end'),
		questList: $('quest-list'),
		memories: $('memories'),
		map: $<HTMLCanvasElement>('map'),
	};
	private mapBase: ImageData | null = null;
	private lastToast = '';

	constructor() {
		for (const tab of Array.from(document.querySelectorAll<HTMLButtonElement>('.tab'))) {
			tab.addEventListener('click', () => this.showTab(tab.dataset.tab!));
		}
	}

	showTab(name: string): void {
		for (const t of Array.from(document.querySelectorAll<HTMLElement>('.tab'))) t.classList.toggle('on', t.dataset.tab === name);
		for (const p of Array.from(document.querySelectorAll<HTMLElement>('.pane'))) p.hidden = p.dataset.pane !== name;
	}

	setObjective(o: Objective | null, count: number): void {
		this.el.objective.hidden = !o;
		if (!o) return;
		if (this.el.objText.textContent !== o.text) this.el.objText.textContent = o.text;
		const more = count > 1 ? `+${count - 1}` : '';
		if (this.el.objMore.textContent !== more) this.el.objMore.textContent = more;
	}

	setCounters(jars: number, gold: number, goldTotal: number): void {
		const j = `${jars}/4`, g = `${gold}/${goldTotal}`;
		if (this.el.jar.textContent !== j) this.el.jar.textContent = j;
		if (this.el.gold.textContent !== g) this.el.gold.textContent = g;
	}

	toast(text: string, big = false): void {
		if (text === this.lastToast && this.el.toasts.childElementCount) return;
		this.lastToast = text;
		const t = document.createElement('div');
		t.className = big ? 'toast big' : 'toast';
		t.textContent = text;
		this.el.toasts.appendChild(t);
		while (this.el.toasts.childElementCount > 3) this.el.toasts.firstElementChild?.remove();
		setTimeout(() => t.remove(), 3000);
	}

	setAction(label: string | null, keyHint: string): void {
		this.el.action.classList.toggle('on', !!label);
		const l = label ?? '';
		if (this.el.actionLabel.textContent !== l) this.el.actionLabel.textContent = l;
		this.el.hint.hidden = !label;
		if (label) this.el.hint.textContent = `${keyHint} · ${label}`;
	}

	// Edge arrow towards an off-screen goal; screen coords in px, null hides it.
	setArrow(p: { x: number; y: number; angle: number } | null): void {
		this.el.arrow.hidden = !p;
		if (!p) return;
		this.el.arrow.style.left = `${p.x}px`;
		this.el.arrow.style.top = `${p.y}px`;
		this.el.arrow.style.transform = `rotate(${p.angle}rad)`;
	}

	showLine(l: Line): void {
		this.el.dialog.hidden = false;
		this.el.dlgName.textContent = LABELS[l.who];
		this.el.dlgName.style.background = COLORS[l.who];
		this.el.dlgText.textContent = '';
	}

	typeLine(text: string): void {
		if (this.el.dlgText.textContent !== text) this.el.dlgText.textContent = text;
	}

	hideDialog(): void {
		this.el.dialog.hidden = true;
	}

	fade(on: boolean): void {
		this.el.fade.style.opacity = on ? '1' : '0';
	}

	fillBag(items: BagItem[]): void {
		$('bag').replaceChildren(
			...items.map((it) => {
				const li = document.createElement('li');
				if (it.empty) li.className = 'empty';
				const ico = document.createElement('span');
				ico.className = 'it-ico';
				if (it.icon === 'jar' || it.icon === 'gold') {
					const c = document.createElement('span');
					c.className = `ico ${it.icon}`;
					ico.append(c);
				} else ico.textContent = it.icon;
				const name = document.createElement('b');
				name.textContent = `${it.name} `;
				const count = document.createElement('span');
				count.className = 'count';
				count.textContent = it.count;
				name.append(count);
				const note = document.createElement('small');
				note.textContent = it.note;
				li.append(ico, name, note);
				return li;
			}),
		);
	}

	fillMenu(objs: Objective[], souvenirs: string[]): void {
		this.el.questList.replaceChildren(
			...objs.map((o) => {
				const li = document.createElement('li');
				li.textContent = o.text;
				if (o.done) li.className = 'done';
				return li;
			}),
		);
		this.el.memories.replaceChildren(
			...Object.entries(SOUVENIRS).map(([id, s]) => {
				const li = document.createElement('li');
				if (souvenirs.includes(id)) {
					const b = document.createElement('b');
					b.textContent = s.title;
					li.append(b, s.text);
				} else {
					li.className = 'locked';
					li.textContent = '??? — un ami de la vallée s’en souvient peut-être.';
				}
				return li;
			}),
		);
	}

	drawMap(markers: MapMarker[]): void {
		const c = this.el.map;
		const g = c.getContext('2d');
		if (!g) return;
		const W = c.width, H = c.height;
		const sx = (BOUNDS.x1 - BOUNDS.x0) / W, sz = (BOUNDS.z1 - BOUNDS.z0) / H;
		if (!this.mapBase) {
			const img = g.createImageData(W, H);
			for (let j = 0; j < H; j++)
				for (let i = 0; i < W; i++) {
					const x = BOUNDS.x0 + (i + 0.5) * sx, z = BOUNDS.z0 + (j + 0.5) * sz;
					const h = groundHeight(x, z);
					let col: [number, number, number];
					if (h < WATER_Y && waterAt(x, z)) col = [92, 176, 214];
					else if (mountPolar(x, z).d < R_OUT) col = [175 + h * 2.5, 160 + h * 2.5, 140 + h * 2.8].map((v) => Math.min(255, v)) as [number, number, number];
					else if (distToPath(x, z) < 1.2) col = [226, 196, 142];
					else if (x < -28) col = [95, 150, 70];
					else col = [140 + h * 6, 196 + h * 4, 98];
					const k = (j * W + i) * 4;
					const shade = 1 - Math.max(0, Math.min(0.35, (groundHeight(x + sx, z) - h) * 0.4));
					img.data[k] = col[0] * shade;
					img.data[k + 1] = col[1] * shade;
					img.data[k + 2] = col[2] * shade;
					img.data[k + 3] = 255;
				}
			this.mapBase = img;
		}
		g.putImageData(this.mapBase, 0, 0);
		const px = (x: number) => (x - BOUNDS.x0) / sx, pz = (z: number) => (z - BOUNDS.z0) / sz;
		g.font = 'bold 10px system-ui, sans-serif';
		g.textAlign = 'center';
		for (const m of markers) {
			const x = px(m.x), y = pz(m.z);
			if (m.kind === 'goal') {
				g.fillStyle = '#ffd23f';
				g.strokeStyle = '#3a2a1c';
				g.lineWidth = 1.5;
				g.beginPath();
				for (let i = 0; i < 10; i++) {
					const a = (i / 10) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? 3 : 7;
					g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
				}
				g.closePath();
				g.fill();
				g.stroke();
			} else if (m.kind === 'npc') {
				g.fillStyle = m.color;
				g.strokeStyle = '#fff';
				g.lineWidth = 1.5;
				g.beginPath();
				g.arc(x, y, 5, 0, Math.PI * 2);
				g.fill();
				g.stroke();
				if (m.label) {
					const a = m.align ?? 'above';
					g.textAlign = a === 'left' ? 'right' : a === 'right' ? 'left' : 'center';
					const lx = a === 'left' ? x - 8 : a === 'right' ? x + 8 : x;
					const ly = a === 'above' ? y - 8 : a === 'below' ? y + 16 : y + 3.5;
					// A light halo keeps the name readable over the terrain.
					g.lineWidth = 3;
					g.strokeStyle = 'rgba(255, 250, 240, 0.85)';
					g.strokeText(m.label, lx, ly);
					g.fillStyle = '#3a2a1c';
					g.fillText(m.label, lx, ly);
					g.textAlign = 'center';
				}
			} else {
				g.save();
				g.translate(x, y);
				g.rotate(-(m.yaw ?? 0) + Math.PI);
				g.fillStyle = '#ee8a2c';
				g.strokeStyle = '#fff';
				g.lineWidth = 2;
				g.beginPath();
				g.moveTo(0, -8);
				g.lineTo(6, 6);
				g.lineTo(0, 3);
				g.lineTo(-6, 6);
				g.closePath();
				g.stroke();
				g.fill();
				g.restore();
			}
		}
	}
}
