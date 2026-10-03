/* Atelier promo: the edit, shared by the music and the edit scripts.
   Each cut takes `dur` seconds of a recorded shot (scripts/promo-atelier.mjs), from `from` seconds into it.
   Sections land on bar lines (96 bpm, 2.5 s a bar): intro 1 bar, gameplay 6, story 4, end card 2.
   Captions sit over a run of cuts: `at` and `to` are times in the final video. */
export const BPM = 96;
export const BAR = (60 / BPM) * 4;

export const CUTS = [
	{ shot: 'intro', from: 0.2, dur: 2.5 },
	{ shot: 'merge', from: 0.1, dur: 5.7 },
	// The delivery now opens on a second of confetti before the restoration scene.
	{ shot: 'deliver', from: 0.15, dur: 3.2 },
	{ shot: 'etabli', from: 0.15, dur: 2.2 },
	{ shot: 'lampe', from: 0.15, dur: 1.7 },
	{ shot: 'photo-up', from: 0.15, dur: 2.2 },
	{ shot: 'photo', from: 0.2, dur: 2.6 },
	{ shot: 'postcard', from: 0.2, dur: 2.9 },
	{ shot: 'office', from: 0.15, dur: 1.7 },
	{ shot: 'map', from: 0.2, dur: 2.8 },
];
export const CUTS_END = CUTS.reduce((a, c) => a + c.dur, 0);
export const END_CARD = 2 * BAR;
export const TOTAL = CUTS_END + END_CARD;

const at = (shot) => CUTS.slice(0, CUTS.findIndex((c) => c.shot === shot)).reduce((a, c) => a + c.dur, 0);
const end = (shot) => at(shot) + CUTS.find((c) => c.shot === shot).dur;

export const CAPTIONS = [
	{ at: 0.15, to: end('intro'), text: 'Ta grand-mère t’a laissé\nson vieil atelier' },
	{ at: at('merge') + 0.1, to: end('merge'), text: 'Fusionne les outils…' },
	{ at: at('deliver') + 0.05, to: end('deliver'), text: '…et répare les souvenirs\ndu quartier' },
	{ at: at('etabli') + 0.05, to: end('photo-up'), text: 'Rouvre l’atelier,\npièce par pièce' },
	{ at: at('photo') + 0.05, to: end('photo'), text: 'Mais qui était\nvraiment Jeanne ?' },
	{ at: at('postcard') + 0.05, to: end('postcard'), text: 'Pourquoi a-t-elle fermé\nson bureau ?' },
	{ at: at('office') + 0.05, to: end('map'), text: '…et que cache\ncette carte ?' },
];
