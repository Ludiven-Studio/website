/* Rayou teaser: the edit, shared by the music and the edit scripts.
   Each cut takes `dur` seconds of a source from `from` seconds into it: a recorded shot
   (scripts/promo-rayou.mjs) or the user's own capture (`user`). Cuts land on bar lines
   (104 bpm, ~2.31 s a bar): 7 bars of play, 2 for the lantern, 2 for the end card.
   Captions run over a cut: `at` and `to` are times in the final video. */
export const BPM = 104;
export const BAR = (60 / BPM) * 4;

export const CUTS = [
	{ src: 'user', from: 0.4, dur: BAR, cap: 'Voici Rayou,\nle petit tigre' },
	{ src: 'feuille', from: 0.15, dur: BAR, cap: 'Aide ses amis\nde la vallée' },
	{ src: 'roll', from: 0.35, dur: BAR, cap: 'Roule en boule…' },
	{ src: 'bounce', from: 0.05, dur: BAR, cap: 'Rebondis sur\nles champignons' },
	{ src: 'pads', from: 0.1, dur: BAR, cap: 'Saute de feuille\nen feuille' },
	{ src: 'user', from: 4.2, dur: BAR, cap: 'Explore une grande\nvallée en 3D' },
	{ src: 'user', from: 12.2, dur: BAR, cap: '…jusqu’au\nPic aux Étoiles' },
	{ src: 'lantern', from: 0.4, dur: 2 * BAR, cap: 'Et allume la lanterne\nde la Fête des Lumières' },
];
export const CUTS_END = CUTS.reduce((a, c) => a + c.dur, 0);
export const END_CARD = 2 * BAR;
export const TOTAL = CUTS_END + END_CARD;

let t = 0;
export const CAPTIONS = CUTS.map((c) => {
	const cap = { at: t + 0.12, to: t + c.dur - 0.08, text: c.cap };
	t += c.dur;
	return cap;
});
