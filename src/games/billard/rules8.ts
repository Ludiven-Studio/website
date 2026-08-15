/**
 * 8-BALL rules — pure state machine (no UI, no physics). The game accumulates a `Shot8` from the
 * engine over a whole shot, then feeds it here. `applyShot` returns a NEW `Match8` (no mutation),
 * so it is trivially unit-testable and doubles as the reducer for future multiplayer.
 *
 * Ball numbers live in `Ball.color`: 1-7 solids, 8 black, 9-15 stripes; cue is color -1.
 * Retained rulings (casual defaults): open table until the first legal pot assigns groups; ball-
 * in-hand anywhere on any foul; the break never assigns groups; 8 on the break = re-break;
 * potting the 8 legally after clearing your group = win; 8 early / scratch-on-8 / last-group-ball
 * + 8 same shot = loss.
 */

export type Group = 'solid' | 'stripe';
export type Player = 0 | 1;

export interface Match8 {
	turn: Player;
	groups: Record<Player, Group | null>; // null until the table is assigned (open)
	open: boolean;
	ballInHand: Player | null; // this player must place the cue before shooting
	broken: boolean; // has the opening break been taken
	winner: Player | null;
	lastFoul: string | null; // FR message for the HUD (null if the shot was clean)
	lastEvent: string | null;
}

/** Accumulated result of one shot (built from the engine's per-call StepResult). */
export interface Shot8 {
	firstHitNumber: number | null; // first object ball the cue touched (null = no contact)
	potted: number[]; // ball numbers pocketed this shot
	scratched: boolean; // cue potted (or driven off) this shot
	railAfterContact: boolean; // a ball reached a rail after the cue's first contact
}

export interface Board8 { remaining: number[]; } // numbers still on the table BEFORE the shot

export function groupOf(n: number): Group | 'eight' | null {
	if (n >= 1 && n <= 7) return 'solid';
	if (n === 8) return 'eight';
	if (n >= 9 && n <= 15) return 'stripe';
	return null;
}

const other = (p: Player): Player => (p === 0 ? 1 : 0);

export function initMatch8(firstBreak: Player = 0): Match8 {
	return { turn: firstBreak, groups: { 0: null, 1: null }, open: true, ballInHand: null, broken: false, winner: null, lastFoul: null, lastEvent: null };
}

export function applyShot(state: Match8, shot: Shot8, board: Board8): Match8 {
	const me = state.turn, opp = other(me);
	const myGroup = state.groups[me];
	const wasOpen = state.open;
	const wasBreak = !state.broken;

	const next: Match8 = {
		...state,
		groups: { 0: state.groups[0], 1: state.groups[1] },
		broken: true,
		lastFoul: null,
		lastEvent: null,
	};

	const potted = shot.potted;
	const eightPotted = potted.includes(8);
	const pottedSolids = potted.filter((n) => n >= 1 && n <= 7);
	const pottedStripes = potted.filter((n) => n >= 9 && n <= 15);

	// --- Fouls ---
	const fNoContact = shot.firstHitNumber === null;
	let fWrongFirst = false;
	if (!fNoContact) {
		const fg = groupOf(shot.firstHitNumber as number);
		if (wasOpen) {
			fWrongFirst = fg === 'eight'; // open table: hitting the 8 first is a foul
		} else {
			const groupCleared = myGroup != null && !board.remaining.some((n) => groupOf(n) === myGroup);
			fWrongFirst = groupCleared ? fg !== 'eight' : fg !== myGroup;
		}
	}
	const fNoRail = !fNoContact && potted.length === 0 && !shot.railAfterContact;
	const fScratch = shot.scratched;
	const foul = fNoContact || fWrongFirst || fNoRail || fScratch;

	// --- 8-ball terminal resolution (highest priority) ---
	if (eightPotted) {
		if (wasBreak) return { ...initMatch8(me), lastEvent: 'Noire au break — on rejoue le break' };
		const groupCleared = myGroup != null && !board.remaining.some((n) => n !== 8 && groupOf(n) === myGroup);
		const win = !foul && myGroup != null && groupCleared;
		next.winner = win ? me : opp;
		next.lastEvent = win ? 'Noire rentrée — gagné !' : 'Noire illégale — perdu';
		return next;
	}

	// --- Group assignment (clean legal pot while open, but NOT on the break) ---
	if (wasOpen && !wasBreak && !foul && (pottedSolids.length > 0 || pottedStripes.length > 0)) {
		if (pottedSolids.length > 0 && pottedStripes.length === 0) {
			next.groups[me] = 'solid'; next.groups[opp] = 'stripe'; next.open = false; next.lastEvent = 'Groupe : pleines';
		} else if (pottedStripes.length > 0 && pottedSolids.length === 0) {
			next.groups[me] = 'stripe'; next.groups[opp] = 'solid'; next.open = false; next.lastEvent = 'Groupe : rayées';
		}
		// both groups potted at once → stays open, no assignment
	}

	// --- Foul → opponent gets ball-in-hand ---
	if (foul) {
		next.turn = opp;
		next.ballInHand = opp;
		next.lastFoul = fScratch ? 'Faute : blanche rentrée — bille en main'
			: fNoContact ? 'Faute : aucune bille touchée — bille en main'
			: fWrongFirst ? 'Faute : mauvaise bille d’abord — bille en main'
			: 'Faute : aucune bande après contact — bille en main';
		return next;
	}

	// --- Clean shot: continue iff a ball that counts for me was pocketed ---
	const myPot = next.open
		? pottedSolids.length + pottedStripes.length > 0 // still open (break or double-group): any object pot continues
		: potted.some((n) => groupOf(n) === next.groups[me]);
	next.ballInHand = null;
	next.turn = myPot ? me : opp;
	if (myPot && !next.lastEvent) next.lastEvent = 'Bien joué — tu rejoues';
	return next;
}
