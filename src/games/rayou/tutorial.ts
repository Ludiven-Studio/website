// Step-by-step controls tutorial: each step waits until the player has actually done the move.
interface Step {
	id: 'move' | 'cam' | 'jump' | 'roll' | 'longjump' | 'act';
	title: string;
	desk: string;
	mob: string;
	// Touch buttons to highlight.
	btn: string[];
	need: number;
}

export const TUTO_STEPS: Step[] = [
	{
		id: 'move',
		title: 'Se déplacer',
		desk: '<kbd>Z</kbd><kbd>Q</kbd><kbd>S</kbd><kbd>D</kbd> ou les flèches pour courir.',
		mob: 'Pose le pouce sur la moitié gauche de l’écran et fais-le glisser : Rayou court dans cette direction.',
		btn: [],
		need: 5,
	},
	{
		id: 'cam',
		title: 'Regarder autour',
		desk: 'Clique et fais glisser la souris pour tourner la caméra.',
		mob: 'Fais glisser un doigt sur la moitié droite de l’écran pour tourner la caméra.',
		btn: [],
		need: 220,
	},
	{
		id: 'jump',
		title: 'Sauter',
		desk: '<kbd>Espace</kbd> pour sauter. Garde-la enfoncée pour sauter plus haut.',
		mob: 'Bouton <b class="ry-ico-btn">⤒</b> pour sauter.',
		btn: ['btn-jump'],
		need: 2,
	},
	{
		id: 'roll',
		title: 'Rouler en boule',
		desk: '<kbd>Maj</kbd> (ou <kbd>C</kbd>) : Rayou se roule en boule et fonce. En boule, il passe sous les obstacles bas et casse ce qui est fendu.',
		mob: 'Bouton <b class="ry-ico-btn">⟳</b> : Rayou se roule en boule et fonce. En boule, il passe sous les obstacles bas et casse ce qui est fendu.',
		btn: ['btn-roll'],
		need: 2,
	},
	{
		id: 'longjump',
		title: 'Saut roulé',
		desk: 'Roule avec <kbd>Maj</kbd>, puis saute avec <kbd>Espace</kbd> pendant la roulade : tu iras bien plus loin !',
		mob: 'Appuie sur <b class="ry-ico-btn">⟳</b> puis tout de suite sur <b class="ry-ico-btn">⤒</b>, ou glisse le pouce de l’un à l’autre : le saut roulé va bien plus loin !',
		btn: ['btn-roll', 'btn-jump'],
		need: 1,
	},
	{
		id: 'act',
		title: 'Parler et agir',
		desk: 'Approche-toi de Feuille l’écureuil, devant la maison, et appuie sur <kbd>E</kbd>. La même touche sert à ramasser et à grimper.',
		mob: 'Approche-toi de Feuille l’écureuil, devant la maison : le bouton jaune s’allume, appuie dessus. Il sert aussi à ramasser et à grimper.',
		btn: ['btn-action'],
		need: 1,
	},
];

const $ = (id: string) => document.getElementById(`ry-${id}`) as HTMLElement;

export class Tutorial {
	private count = 0;
	private doneT = -1;
	private shown = -1;
	private readonly el = { box: $('tuto'), step: $('tuto-step'), title: $('tuto-title'), text: $('tuto-text'), bar: $('tuto-bar'), skip: $('tuto-skip') };

	constructor(
		private readonly coarse: boolean,
		private readonly get: () => number,
		private readonly set: (step: number) => void,
		private readonly onStepDone: (last: boolean) => void,
	) {
		this.el.skip.addEventListener('click', () => this.skip());
		this.el.skip.addEventListener('touchstart', (e) => {
			e.preventDefault();
			this.skip();
		}, { passive: false });
	}

	get active(): boolean {
		return this.get() < TUTO_STEPS.length;
	}

	restart(): void {
		this.set(0);
		this.count = 0;
		this.doneT = -1;
		this.shown = -1;
	}

	skip(): void {
		this.set(TUTO_STEPS.length);
		this.render(false);
	}

	// Credits progress to the current step only, so a move learnt early does not skip its card.
	bump(id: Step['id'], amount = 1): void {
		const s = TUTO_STEPS[this.get()];
		if (!s || s.id !== id || this.doneT >= 0) return;
		this.count += amount;
		if (this.count >= s.need) {
			this.doneT = 0;
			this.onStepDone(this.get() === TUTO_STEPS.length - 1);
		}
	}

	update(dt: number, visible: boolean): void {
		if (this.doneT >= 0) {
			this.doneT += dt;
			if (this.doneT > 1.1) {
				this.doneT = -1;
				this.count = 0;
				this.set(this.get() + 1);
			}
		}
		this.render(visible);
	}

	private render(visible: boolean): void {
		const i = this.get();
		const s = TUTO_STEPS[i];
		const show = !!s && visible;
		this.el.box.hidden = !show;
		for (const id of ['btn-jump', 'btn-roll', 'btn-action']) $(id).classList.toggle('ry-pulse', show && s.btn.includes(id) && this.doneT < 0);
		if (!show) return;
		if (this.shown !== i) {
			this.shown = i;
			this.el.step.textContent = `${i + 1}/${TUTO_STEPS.length}`;
			this.el.title.textContent = s.title;
			this.el.text.innerHTML = this.coarse ? s.mob : s.desk;
		}
		const done = this.doneT >= 0;
		this.el.box.classList.toggle('ry-done', done);
		(this.el.bar.firstElementChild as HTMLElement).style.width = `${Math.min(100, (done ? 1 : this.count / s.need) * 100)}%`;
	}
}
