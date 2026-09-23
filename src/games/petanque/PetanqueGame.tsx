import { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import {
	makeTerrain, SURFACES, SURFACE_IDS, heightAt, PITCH_W, PITCH_L, type SurfaceId, type Terrain,
} from './terrain';
import {
	makeBoule, makeJack, place, stepSim, isSettled, throwVelocity, G,
	type Sim, type Boule, type Impact,
} from './engine';
import {
	initMatch13, applyJack, applyPlacedJack, applySettled, finishEnd, jackCheck, pointHolder, endScore, other,
	MIN_JACK, MAX_JACK, EDGE, BOULES_PER_SIDE, type Match13, type Side, type Played,
} from './rules13';
import { planThrow, planJack, jackThrow, JACK_SPREAD_PLAYER, launch } from './ai';
import {
	buildPitch3D, makeBouleMesh, groundRing, makeMarker, makeHalo, arcMesh, aimRay, predictThrow,
	aimCamera, headCamera, topCamera, laneFrame, verticalFov, haloRadius, haloFloorFor, zoomWalk,
	elevationForBoard, boardForElevation, addLights, makeFx, wx, wz, makeContactShadow, layFlat,
	HEAD_DIST_MIN, HEAD_DIST_MAX, HEAD_PITCH_MIN, HEAD_PITCH_MAX,
	BOULE_R, CIRCLE_R, WALK_MAX, EYE_H, ZOOM_EYE, ZOOM_VFOV, type Pitch3D, type Fx, type Lights,
} from './render3d';
import { petanqueLevels } from './levels';
import {
	makeCourse, stationBodies, gradeShot, encodeDaily, COURSE_CIRCLE, STATIONS, MAX_DAILY_SCORE,
	GRADE_LABEL, KIND_LABEL, type DailyCourse, type Grade,
} from './daily';
import {
	joinRandom, joinByCode, makeCode, seedFromRoom, multiplayerAvailable,
	type PetanqueMatchNet, type AimMsg, type SyncMsg,
} from './net';
import * as sfx from './sfx';
import { usePointerDrag } from '../usePointerDrag';
import { isTypingTarget } from '../../lib/keyboard';
import { trackGame } from '../../lib/analytics';
import { withExpert } from '../../lib/difficulty';
import { useLevels } from '../../lib/useLevels';
import { usePlayClock } from '../../lib/usePlayClock';
import { formatScore, fmtCentis } from '../../lib/scoreFormat';
import { DAILY_LB } from '../../data/dailyLb';
import { getDaily, dailyWeekdayLabel, loadDailyRun, saveDailyRun, playerName } from '../../lib/leaderboard';
import Leaderboard from '../../components/Leaderboard';
import LeaderboardCorner from '../../components/LeaderboardCorner';
import ModeToggle from '../../components/ModeToggle';
import Celebration, { useCelebration } from '../../components/Celebration';
import LevelSelect from '../../components/LevelSelect';
import LevelOutcome from '../../components/LevelOutcome';

/* =====================================================
   PETANQUE — React island, 3D pitch (three.js).
   Le point de pose du doigt sur la planche d'envol — un pavé fixe posé en bas au centre — décide de
   l'angle : plus on part d'en bas, plus on plombe ; le haut de la planche est rasant. Puis glisser
   vers le haut = puissance, latéral = direction.
   La caméra est libre et ne touche plus au tir. Tête-à-tête en 13, 3 boules,
   règle officielle (celui qui n'a pas le point rejoue).
   Moteur pur et testé dans ./engine + ./rules13 ; ce fichier ne fait que le piloter.
   ===================================================== */

type Status = 'aim' | 'rolling' | 'placing' | 'end' | 'over';

const HUMAN: Side = 0;
const AI: Side = 1;
const STEP = 1000 / 60;

const DIFF_ORDER = ['facile', 'moyen', 'difficile'] as const;
type DiffKey = (typeof DIFF_ORDER)[number] | 'expert';
const DIFFS: Record<DiffKey, { label: string; skill: number; surface: SurfaceId; amp: number }> = {
	facile: { label: 'Facile', skill: 0.34, surface: 'terre-battue', amp: 0.018 },
	moyen: { label: 'Moyen', skill: 0.62, surface: 'gravier-fin', amp: 0.032 },
	difficile: { label: 'Difficile', skill: 0.86, surface: 'gravier-gros', amp: 0.050 },
	expert: { label: 'Expert', skill: 0.95, surface: 'gravier-gros', amp: 0.070 },
};

/* The ground, chosen by hand. FREE PLAY ONLY: the levels ladder, the daily course and the online
   seat keep the surface and the relief they were measured on, or their targets would not mean the
   same thing. 'auto' hands the choice back to the difficulty. */
const RELIEF_ORDER = ['plat', 'vallonne', 'accidente'] as const;
type ReliefKey = (typeof RELIEF_ORDER)[number];
const RELIEFS: Record<ReliefKey, { label: string; hint: string; amp: number; slope: number }> = {
	plat: { label: 'Plat', hint: 'ratissé, la boule va droit', amp: 0.010, slope: 0.002 },
	vallonne: { label: 'Vallonné', hint: 'des bosses et des creux', amp: 0.038, slope: 0.009 },
	accidente: { label: 'Accidenté', hint: 'faux plat marqué', amp: 0.075, slope: 0.022 },
};

/** What each surface does to a boule, in the words a joueur would use. */
const SURFACE_HINT: Record<SurfaceId, string> = {
	'terre-battue': 'roule loin, dévie peu',
	'gravier-fin': 'accroche un peu',
	'gravier-gros': 'freine sec, part de travers',
	sable: 's’arrête net, aucun rebond',
};

const GROUND_KEY = 'petanque-ground';
type GroundPick = { surface: SurfaceId | 'auto'; relief: ReliefKey | 'auto' };
const GROUND_0: GroundPick = { surface: 'auto', relief: 'auto' };

function loadGround(): GroundPick {
	try {
		const raw = localStorage.getItem(GROUND_KEY);
		if (!raw) return GROUND_0;
		const v = JSON.parse(raw) as GroundPick;
		return {
			surface: v.surface === 'auto' || SURFACE_IDS.includes(v.surface) ? v.surface : 'auto',
			relief: v.relief === 'auto' || RELIEF_ORDER.includes(v.relief) ? v.relief : 'auto',
		};
	} catch {
		return GROUND_0;
	}
}

/* Where the launch pad sits along the bottom edge, 0 = left, 1 = right, one value per screen
   orientation: 30 % of a 390 px phone and of a 1000 px desktop are not the same reach. Portrait
   starts right, under a right thumb, so the finger that pulls climbs the edge and not the lane. */
const PAD_KEY = 'petanque-pad-x';
const PAD_GRIP_KEY = 'petanque-pad-grip'; // the grip pulses until it has been shown once
type PadOrient = 'portrait' | 'landscape';
type PadX = Record<PadOrient, number>;
const PAD_X_0: PadX = { portrait: 1, landscape: 0.5 };
const PAD_SNAPS = [0, 0.5, 1];
const PAD_SNAP_R = 0.08;
const PAD_EDGE = 12; // px, same margin the pad's width clamp leaves
const PAD_GAP = 8; // px kept clear of a side gauge
const PAD_HEAD = 40; // px above the pad: power bar then state line
const PAD_GRIP_W = 22;

function loadPadX(): PadX {
	try {
		const v = JSON.parse(localStorage.getItem(PAD_KEY) ?? 'null') as Partial<PadX> | null;
		const ok = (n: unknown): n is number => typeof n === 'number' && n >= 0 && n <= 1;
		return {
			portrait: ok(v?.portrait) ? v.portrait : PAD_X_0.portrait,
			landscape: ok(v?.landscape) ? v.landscape : PAD_X_0.landscape,
		};
	} catch {
		return PAD_X_0;
	}
}

const padOrient = (): PadOrient => (window.innerHeight > window.innerWidth ? 'portrait' : 'landscape');

const MIN_SPEED = 3.0;
const MAX_SPEED = 10.5;
const POWER_PX = 190; // vertical drag for full power
const YAW_PER_PX = 0.0021;
/* Derived, not chosen: the circle and the jack may sit against opposite touchlines, so the widest
   legal throw is the full pitch width across the shortest legal jack distance. The old hand-picked
   0.42 rad was under that — some legal jacks were simply not aimable, which is what "des fois on
   n'arrive pas à viser le cochonnet" was. */
const YAW_MAX = Math.atan2(PITCH_W, MIN_JACK); // 0.588 rad, 34 deg
const PITCH_PER_PX = 0.0042;
/* The camera is free; the AIM is what is bounded. Wide enough to look back over the shoulder — the
   loft no longer rides on the pitch, so nothing about the throw is lost by turning around. */
const CAM_YAW_MAX = 2.8;
const CAM_PITCH_LOW = 0.02;
const CAM_PITCH_HIGH = 1.35;
/* The game view stands the eye up and aims it with lookAt, so `pitch` never reached the pose. This
   is what makes the tilt move the picture: a fraction of the pitch, as a height on the look target.
   Full tilt is about +-25 degrees, enough to read as looking up or down without ever putting the
   target behind the eye. */
const LOOK_TILT_K = 0.45;
const PITCH_NEUTRAL = 0.55;
const CAM_DIST = 2.7;
const ROLL_PITCH = 0.40; // the view lifts while the boules run, whatever loft was chosen
const LOOK_TAU = 0.18;
const PITCH_TAU = 0.25;
const ZOOM_TAU = 0.30;
const ZOOM_DRAG_TAU = 0.08; // under a thumb, the slow ease reads as lag
const ZOOM_STEP = 0.2; // per press, so five taps cross the whole range
const LOOK_FAR = 7.5; // m ahead when there is no jack yet to look at
const LOOK_MIN = 2.2; // m the look target keeps in front of the eye, however far you walked
const AI_THINK_MS = 700;
const END_CARD_MS = 2800;
const END_TABLE_MS = 6000; // the end-of-end card carries a table of six rows — reading it takes longer
const STATION_CARD_MS = 1500; // the daily has 12 of these, so it holds the card half as long
const ROLL_CAP = 24; // s of simulated roll before we call it settled anyway
const AIM_SEND_MS = 80; // ~12 aim frames a second, same rate billard settled on
const AIM_STALE_MS = 2500; // stop drawing their arc if the stream dries up (tab hidden, drop)
const ONLINE_SURFACE: SurfaceId = 'gravier-fin'; // neutral ground, so neither seat is favoured
const TOUCH_M = 0.01; // the target counts as touched once it has actually shifted
const LB_ID = (gameId: string): string => `${gameId}-t`;

const DUST: Record<SurfaceId, number> = {
	'terre-battue': 0xc08a52,
	'gravier-fin': 0xa8a49a,
	'gravier-gros': 0x807a70,
	sable: 0xe8d2a0,
};

const LOFT_0 = 0.55; // rad — where the loft sits before the first throw, mid-board

/* Aim sway: the arm is never perfectly still, so the throw drifts while the pad is held and the
   player times the release. Two sines per axis at unrelated frequencies, so it never repeats
   exactly, from a random phase per press (a phase of 0 would make an instant release perfect).
   Applied to the throw before the velocity is computed: only velocities travel online, so the
   random phase never has to match on the other screen. The AI does not sway; its skill noise is
   its own. Amplitude follows the AI's skill for the mode: 0.3 deg (Facile) to 1.2 deg (Expert)
   of heading, 1 deg being ~12 cm at 7 m. The loft gets half, because near 30 deg one degree of
   loft moves the landing about as much as one of heading, and a roulette three to four times more. */
const SWAY_MIN_DEG = 0.3;
const SWAY_MAX_DEG = 1.2;
const SWAY_LOFT_SHARE = 0.5;
const SWAY_YAW_HZ = [0.71, 1.13] as const;
const SWAY_LOFT_HZ = [0.53, 0.89] as const;
// Fatigue: steady for 2 s, then the arm tires up to 2.2x the sway at 5 s. Waiting pays, not forever.
const SWAY_REST_S = 2;
const SWAY_TIRE_PER_S = 0.4;
const SWAY_TIRE_MAX = 1.2;

/** Sway amplitude in radians of heading for an AI skill (0.34 Facile .. 0.95 Expert). */
const swayAmp = (skill: number): number => {
	const k = Math.max(0, Math.min(1, (skill - 0.34) / (0.95 - 0.34)));
	return ((SWAY_MIN_DEG + (SWAY_MAX_DEG - SWAY_MIN_DEG) * k) * Math.PI) / 180;
};

/** Heading and loft offsets `sec` seconds into a press, for amplitude `amp` and phases `ph`. */
function swayAt(sec: number, amp: number, ph: readonly number[]): { yaw: number; loft: number } {
	const tire = 1 + Math.min(SWAY_TIRE_MAX, Math.max(0, sec - SWAY_REST_S) * SWAY_TIRE_PER_S);
	const w = (hz: number, p: number): number => Math.sin(2 * Math.PI * hz * sec + p);
	const a = amp * tire;
	return {
		yaw: a * (0.65 * w(SWAY_YAW_HZ[0], ph[0]) + 0.35 * w(SWAY_YAW_HZ[1], ph[1])),
		loft: a * SWAY_LOFT_SHARE * (0.6 * w(SWAY_LOFT_HZ[0], ph[2]) + 0.4 * w(SWAY_LOFT_HZ[1], ph[3])),
	};
}

const LOFT_LABEL = (e: number): string =>
	e > 1.0 ? 'Plomb' : e > 0.7 ? 'Portée' : e > 0.42 ? 'Demi-portée' : 'Roulette';

/* The graduations drawn on the launch board. Four, not a continuous ruler: what the thumb has to
   find is a band, and a band is what the labels name.
   `t` is the LOFT parameter (0 grazing, 1 plomb), which is not the same as its place on screen: the
   board is drawn upside down on purpose, so t = 1 is at the BOTTOM. Starting the gesture low and
   swinging all the way up is the lob; starting near the seam is the flat roll. */
const BOARD_MARKS: readonly { t: number; label: string }[] = [
	{ t: 0.04, label: 'Roulette' },
	{ t: 0.32, label: 'Demi' },
	{ t: 0.62, label: 'Portée' },
	{ t: 0.93, label: 'Plomb' },
];

/* Three views, and only the first one throws: the launch board is drawn over it, and a view that
   does not stand behind the circle has no direction to give. */
const VIEW_ORDER = ['jeu', 'tete', 'dessus'] as const;
type ViewKey = (typeof VIEW_ORDER)[number];
const VIEWS: Record<ViewKey, { icon: string; label: string }> = {
	jeu: { icon: '👁', label: 'Vue de jeu' },
	tete: { icon: '🔍', label: 'Zoom sur les boules' },
	dessus: { icon: '🛩', label: 'Vue de dessus' },
};
/* Horizontal intent, converted to three's vertical fov per aspect. A boule 13 m out measured 4 px
   across at the stock 58 deg, which is what "on ne voit pas les boules au loin" was. */
const VIEW_HFOV: Record<ViewKey, number> = { jeu: 62, tete: 44, dessus: 74 };
const FOV_TAU = 0.22;

const JACK_AIM_R = 0.45; // m — the target ring for the jack throw, a bullseye on the lane

/* The ring may only offer spots the throw can actually hit. Hand placing keeps 0.15 m of margin
   because the spot is exact; a THROWN jack carries JACK_SPREAD_PLAYER, and the two ends are not
   symmetric — a speed error stretches outwards. Measured over 2160 deals per distance (every
   surface x 3 reliefs x 40 seeds), share landing outside the 6-10 m window:
     6.15 m 13.5 %   6.30 m 2.9 %   6.40 m 1.9 %   6.50 m 1.5 %
     8.80 m  1.0 %   9.00 m 1.9 %   9.15 m 3.5 %   9.60 m 18.1 %   9.85 m 47.5 %
   So the ring stops at ~2 % either side. Missing still happens, and hand placing is still the
   official answer to it — it is just no longer the coin flip the far edge used to be. */
const AIM_LO = MIN_JACK + 0.5, AIM_HI = MAX_JACK - 1.0;

const AIM_DEAD_PX = 8; // sideways slack before a power pull counts as a direction change
/* The launch board: a FIXED pad, centred on the bottom edge, where a full-width band used to take
   30 % of the canvas. The band was the largest object on screen and almost all of it was empty.
   The height is the one number that may not shrink freely — at 90 px a thumb crossed two
   graduations by landing 25 px off, which is what sized the old board and still holds. The values
   live in the CSS below; the hit test reads the element, so there is one source of truth. */
const BOARD_PAD_PX = 10; // the top and bottom bands reach the ends of the board, not a hair short

const HEAD_DIST_0 = 4.2; // m — where the orbit starts when you open the head view
const HEAD_PITCH_0 = 0.62;

/* The end-of-end review. `finishEnd` advances the match in the same beat it scores it, so by the
   time the card is up the circle has already jumped to where the jack was and the game view is
   sitting at the NEXT end with its back to the boules just counted — measured as 7 live bodies
   with every one of them projected off-frame. The verdict has to be shown ON the layout it judges,
   so the end seats the head orbit on it and the card docks aside instead of covering it. */
const END_PITCH = 0.9; // rad — looking down on the layout, near a plan without being straight down
const END_FIT = 1.3; // margin on the fitted distance, so nothing sits on the frame edge

const ARC_NEAR = 1.5; // m — arc points nearer than this are in the hand, not in the flight

const sumGrades = (g: Grade[]): number => g.reduce<number>((a, b) => a + b, 0);

const dist2 = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
	Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);

interface Scene3D {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: THREE.PerspectiveCamera;
	pitch: Pitch3D;
	lights: Lights;
	fx: Fx;
	bodies: THREE.Group; // boules + jack
	meshes: THREE.Mesh[]; // index-aligned with sim.bs
	marker: THREE.Mesh;
	circle: THREE.Group; // the throwing circle, re-laid on the terrain whenever it moves
	rings: THREE.Group; // legal jack window, shown while throwing or placing it
	laidAt: { x: number; y: number } | null; // circle both groups were built for
	ray: THREE.Group; // the opponent's aim, online only
	rayAt: number; // `seen` of the aim message the ray was built from
	jackAim: THREE.Group; // where the jack is being aimed, from the top view
	jackAimAt: { x: number; y: number } | null; // the spot that ring was sampled on the terrain for
	dists: THREE.Group; // one see-through ring per boule, centred on the jack — who holds the point
	distsKey: string; // the head those rings were sampled for; they are rebuilt when it changes
	halos: THREE.Mesh[]; // index-aligned with sim.bs — see makeHalo
	shades: THREE.Mesh[]; // index-aligned too — the contact shadow under each body
	arcAir: THREE.Mesh | null;
	arcRoll: THREE.Mesh | null;
}

/* Halo colours are the HUD's, not the boules': a steel boule and a bronze one are the same grey
   dot at 10 m, and the player has to know whose is whose to read the point. */
const HALO = [0x30d158, 0xff5f56, 0xffc107]; // you · opponent · jack
const HALO_PER_M = 0.016; // ring radius per metre of camera distance — ~20 px on a 700 px canvas
const HALO_MIN_R = 0.09; // m, so it never shrinks inside a boule up close
const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`;

/* One ring per boule, centred on the jack: the smallest one holds the point, and every ring inside
   the opponent's first is a point. Six of them cross, so they are thin and see-through — the head
   they explain has to stay readable through them. */
const DIST_TUBE = 0.014;
const DIST_ALPHA = 0.45;

/* One pointer, three surfaces: the bottom strip is the arm, the rest of the image turns the camera,
   and while the jack is being aimed or placed by hand the whole canvas points at the ground. */
type DragMode = 'arm' | 'look' | 'place' | 'jackaim';
interface Drag { mode: DragMode; x0: number; y0: number; a0: number; b0: number }

/* The walk-up before a throw. Only a timer: the existing walk easing does the whole move. */
const INTRO_OUT = 0.9; // s zooming out to the head
const INTRO_HOLD = 0.8; // s held on it
const INTRO_BACK = 0.7; // s coming back
const INTRO_STOP = 1.8; // m — a head closer than this is already readable, so no walk-up
const INTRO_ZOOM = 0.85; // not quite the stop: the walk-up shows the head, it does not inspect it
/* The look after a boule has come to rest — "va voir ce que ça a donné". Same machinery, shorter
   and closer: this one is a verdict, not a walk-up, so it goes all the way in. The AI waits it out
   (see `aiAtRef`), otherwise its next throw lands while the eye is still up the lane. */
const REVIEW_OUT = 0.55;
const REVIEW_HOLD = 0.7;
const REVIEW_BACK = 0.55;
const REVIEW_MS = (REVIEW_OUT + REVIEW_HOLD + REVIEW_BACK) * 1000;
type IntroStage = 'out' | 'hold' | 'back';
/** `hold` and `back` are carried, in ms: the walk-up and the review run the same three stages on
 *  different clocks. */
interface Intro { stage: IntroStage; until: number; hold: number; back: number }

/** One boule in the end-of-end table: how far from the jack, and whether it scored. */
interface BouleRow { side: Side; d: number; counts: boolean }
interface EndCard { text: string; mine: boolean; rows: BouleRow[] }

/**
 * The end-of-end table, in the umpire's order. Which boules count is asked of `endScore` rather
 * than re-derived here: a table that disagreed with the score it sits next to would be worse than
 * no table at all. Sorted ascending, the winner's first `points` boules ARE the scoring ones.
 */
function bouleTable(bs: readonly Played[], jack: Played): BouleRow[] {
	if (!jack.live) return [];
	const rows = bs
		.filter((b) => b.live && (b.side === 0 || b.side === 1))
		.map((b) => ({ side: b.side as Side, d: dist2(b, jack), counts: false }))
		.sort((a, b) => a.d - b.d);
	const res = endScore(bs as Played[], jack);
	let left = res.points;
	for (const r of rows) r.counts = res.side !== null && r.side === res.side && left-- > 0;
	return rows;
}

/* The daily is a shooting course, not a match: one boule per station, graded 5/3/1/0. `target` and
   `targetAt` are the boule to knock out and where it stood before the shot — the grade is the
   difference between the two, so it has to be captured when the station is laid. */
interface DailyState {
	course: DailyCourse;
	grades: Grade[];
	target: Boule | null;
	targetAt: { x: number; y: number } | null;
}

/** The end-of-end table: everything on the ground, nearest first, scoring boules marked. */
function BouleTable({ rows, mySide }: { rows: readonly BouleRow[]; mySide: Side }) {
	return (
		<div className="pe-table">
			<span className="pe-table-cap">Distances au bouchon</span>
			<ol>
				{rows.map((r, i) => (
					<li key={i} className={r.counts ? 'won' : ''}>
						<span style={{ color: hex(HALO[r.side]) }}>●</span>
						<span>{r.side === mySide ? 'Toi' : 'Adv'}</span>
						<span className="pe-table-d">{r.d < 1 ? `${Math.round(r.d * 100)} cm` : `${r.d.toFixed(2)} m`}</span>
						<span className="pe-table-pt">{r.counts ? '★' : ''}</span>
					</li>
				))}
			</ol>
		</div>
	);
}

const killMesh = (m: THREE.Mesh | null): void => {
	if (!m) return;
	m.geometry.dispose();
	(m.material as THREE.Material).dispose();
	m.parent?.remove(m);
};

const killGroup = (g: THREE.Group): void => {
	for (const c of [...g.children]) {
		g.remove(c);
		const m = c as THREE.Mesh;
		m.geometry?.dispose();
		(m.material as THREE.Material | undefined)?.dispose();
	}
};

export default function PetanqueGame({ gameId }: { gameId: string }) {
	const wrapRef = useRef<HTMLDivElement | null>(null);
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const armElRef = useRef<HTMLDivElement | null>(null); // the launch pad, read back for the hit test
	const padXRef = useRef<PadX>(PAD_X_0);
	const padRangeRef = useRef({ lo: 0, hi: 0, c: 0 }); // px the pad's left edge may travel, c = centred
	const padGripRef = useRef<{ x0: number; left0: number } | null>(null);
	/* The eye steps to the side AWAY from the pad. The arc's near end bows towards the shoulder's
	   opposite side of the screen, so a pad on the right needs the eye on the right, or the finger
	   pulling power covers the very arc it is shaping. */
	const shoulderRef = useRef<1 | -1>(1);
	const g3Ref = useRef<Scene3D | null>(null);
	const arcPtsRef = useRef<THREE.Vector3[]>([]);
	const sunForceRef = useRef<{ el: number; az: number; seed?: number } | null>(null); // measurement hook only

	const simRef = useRef<Sim | null>(null);
	const matchRef = useRef<Match13>(initMatch13(13, HUMAN));
	const jackRef = useRef<Boule | null>(null);
	const prevRef = useRef<{ x: number; y: number; z: number }[]>([]);
	const impactsRef = useRef<Impact[]>([]);
	const accRef = useRef(0);
	const alphaRef = useRef(1);
	const rollTimeRef = useRef(0);

	const statusRef = useRef<Status>('aim');
	const diffRef = useRef<DiffKey>('moyen');
	const groundRef = useRef<GroundPick>(GROUND_0); // read by newGame, never by the loop
	const levelSkillRef = useRef(0.25); // the ladder's skill, read by the rAF loop
	const targetRef = useRef(13);
	const aiPendingRef = useRef(false);
	const aiAtRef = useRef(0);
	const endAtRef = useRef(0);
	const rngRef = useRef(1); // AI plan counter — one per throw, so two plans never coincide

	/* Camera and aim are two different things, and used to be one. The camera is free and reaches
	   nothing: look wherever you like, whenever you like.
	   The yaw is sampled off the camera the instant a drag starts on the board; from there the drag
	   owns it and the camera cannot take it back.
	   `aimLoftRef` is the elevation in radians, set by WHERE the finger landed on the board and then
	   frozen for the whole drag — the vertical axis of that gesture is already power.
	   Writers: `syncAim` (yaw only), the sample in `aimStart`, and the yaw steer in `aimMove`. */
	const dragRef = useRef<Drag | null>(null);
	const powerRef = useRef(0);
	const camYawRef = useRef(0);
	const camPitchRef = useRef(0.55);
	const aimYawRef = useRef(0);
	const aimLoftRef = useRef(LOFT_0);
	const aimDirtyRef = useRef(false);
	const swayRef = useRef<{ t0: number; amp: number; ph: number[] } | null>(null); // set while the pad is held
	const viewPitchRef = useRef(0.55);
	const pinchRef = useRef(false); // a second finger voids the gesture, it never aims
	/* Where the eye stands. `zoom` is a 0-1 dial, not metres: at 1 the eye has walked to ZOOM_DIST
	   of the head AND the field has narrowed to ZOOM_VFOV. Both halves together, because either
	   alone falls far short of making a boule readable. Inspection only. */
	const viewRef = useRef<ViewKey>('jeu');
	const zoomRef = useRef(0);
	const zoomViewRef = useRef(0);
	const zoomDragRef = useRef(false);
	const magRef = useRef(1); // what the zoom is worth, for the slider label
	const magShownRef = useRef(1); // ...and the last value pushed to state, so tick never reads it
	const lookRef = useRef(new THREE.Vector3());
	const wantLook = useRef(new THREE.Vector3());
	const placeRef = useRef<{ x: number; y: number } | null>(null);
	// The head view orbits on its own angles, so inspecting the boules can never move the throw.
	const headYawRef = useRef(0);
	const headPitchRef = useRef(HEAD_PITCH_0);
	const headDistRef = useRef(HEAD_DIST_0);
	const fovRef = useRef(0); // 0 means "snap on the next frame" — no zoom-in on load or mode change
	// Camera-space slide, in metres, so the verdict card can own a band of the screen without the
	// layout moving. Zero except during the end-of-end review; cleared by any view change.
	const headPanRef = useRef({ x: 0, y: 0 });
	const introRef = useRef<Intro | null>(null);
	// The view the end-of-end review borrowed, handed back when the next end starts. Null once it has
	// been given back, so a player who picks a view DURING the review keeps it.
	const viewBeforeEndRef = useRef<ViewKey | null>(null);
	const reviewUntilRef = useRef(0); // the AI holds off until the look at the last boule is over
	const distsRef = useRef(true); // the distance rings, mirrored to state for the button
	const turnKeyRef = useRef('');
	// Both jack phases borrow the top view and give it back: aiming the throw, then hand-placing if
	// the throw missed the window. One ref, because the two never overlap.
	const viewBeforeJackRef = useRef<ViewKey | null>(null);
	const jackAimRef = useRef<{ x: number; y: number } | null>(null);

	// Daily. `dailyRef` is null in every other mode, which is what the settle branch tests on.
	const dailyRef = useRef<DailyState | null>(null);
	const startRef = useRef(0);

	// Online. `mySideRef` is the seat this device plays; offline it is always HUMAN, so every
	// "is it mine" test can read it unconditionally.
	const netRef = useRef<PetanqueMatchNet | null>(null);
	const onlineRef = useRef(false);
	const startedOnlineRef = useRef(false);
	const mySideRef = useRef<Side>(HUMAN);
	const aimSentRef = useRef(0);
	const remoteAimRef = useRef<(AimMsg & { seen: number }) | null>(null);
	// The host settles before us, so its ruling can land while our own boules are still running.
	// Queued here and drained in onSettled, so a correction never interrupts a roll.
	const pendingSyncRef = useRef<SyncMsg | null>(null);

	const [match, setMatch] = useState<Match13>(matchRef.current);
	const [status, setStatus] = useState<Status>('aim');
	const [power, setPower] = useState(0);
	const [loft, setLoft] = useState(LOFT_0);
	const [armed, setArmed] = useState(false); // the board is held: the loft shown is now committed
	const [diff, setDiff] = useState<DiffKey>('moyen');
	// Restored here rather than in an effect: the landing effect lays a pitch straight away, and an
	// effect would get the saved ground back one deal too late.
	const [ground, setGround] = useState<GroundPick>(() => {
		groundRef.current = loadGround();
		return groundRef.current;
	});
	const [groundOpen, setGroundOpen] = useState(false);
	const [padX, setPadX] = useState<PadX>(() => {
		padXRef.current = loadPadX();
		return padXRef.current;
	});
	// Laid out in px by layoutPad; null until the first measure, where the CSS centre stands in.
	// `label` is the state line's fraction of the width; `grip` the grip's left edge in px.
	const [padPos, setPadPos] = useState<{ left: number; label: number; grip: number } | null>(null);
	const [padGrip, setPadGrip] = useState<'call' | 'idle' | 'held'>(() => {
		try { return localStorage.getItem(PAD_GRIP_KEY) ? 'idle' : 'call'; } catch { return 'idle'; }
	});
	const [over, setOver] = useState(false);
	const [view, setView] = useState<ViewKey>('jeu');
	const [zoom, setZoom] = useState(0);
	const [mag, setMag] = useState(1);
	const [card, setCard] = useState<EndCard | null>(null);
	const [webglError, setWebglError] = useState(false);
	const [placeOk, setPlaceOk] = useState(false);
	// Mirrors `jackAimRef` for the confirm button. Written from gesture handlers only, never `tick`.
	const [jackAim, setJackAim] = useState<{ x: number; y: number } | null>(null);
	const [callArm, setCallArm] = useState(true); // the strip pulses until it has been used once
	const [dists, setDists] = useState(true);
	const [sound, setSound] = useState(() => sfx.isEnabled());

	const [daily, setDaily] = useState(false);
	const [dailyLoading, setDailyLoading] = useState(false);
	const [dailyDone, setDailyDone] = useState(false);
	const [dailyScore, setDailyScore] = useState<number | null>(null);
	const [station, setStationNo] = useState(0);
	const [points, setPoints] = useState(0);
	const [elapsed, setElapsed] = useState(0); // centis

	const [mpPhase, setMpPhase] = useState<'off' | 'menu' | 'connecting' | 'waiting' | 'playing'>('off');
	const [mpCode, setMpCode] = useState<string | null>(null);
	const [mpOpp, setMpOpp] = useState<string | null>(null);
	const [mpMsg, setMpMsg] = useState<string | null>(null);
	const [mySide, setMySide] = useState<Side>(HUMAN);
	const [codeInput, setCodeInput] = useState('');

	const lv = useLevels(gameId, petanqueLevels);
	// Callback refs: the rAF loop and settle() must not take `lv` as a dep, or the loop restarts
	// every render and the physics freezes (see angry / billard).
	const lvActiveRef = useRef(false);
	lvActiveRef.current = lv.active;
	const lvFinishRef = useRef(lv.finish);
	lvFinishRef.current = lv.finish;

	const won = daily ? dailyDone : match.phase === 'match-done' && match.winner === mySide;
	const { celebrating } = useCelebration(won);

	/* ---------- scene ---------- */

	const initScene = useCallback((): boolean => {
		if (g3Ref.current) return true;
		if (!canvasRef.current) return false;
		let renderer: THREE.WebGLRenderer;
		try {
			renderer = new THREE.WebGLRenderer({ canvas: canvasRef.current, antialias: true });
		} catch {
			setWebglError(true);
			return false;
		}
		renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.PCFSoftShadowMap;

		const scene = new THREE.Scene();
		const camera = new THREE.PerspectiveCamera(58, 1, 0.05, 220);
		const lights = addLights(scene);
		const bodies = new THREE.Group();
		scene.add(bodies);
		const marker = makeMarker(0x30d158);
		marker.visible = false;
		scene.add(marker);
		const circle = new THREE.Group();
		scene.add(circle);
		const rings = new THREE.Group();
		rings.visible = false;
		scene.add(rings);
		const ray = new THREE.Group();
		ray.visible = false;
		scene.add(ray);
		const jackAim = new THREE.Group();
		jackAim.visible = false;
		scene.add(jackAim);
		const dists = new THREE.Group();
		dists.visible = false;
		scene.add(dists);

		g3Ref.current = {
			renderer, scene, camera, lights, bodies, marker, circle, rings, laidAt: null, ray, rayAt: 0,
			jackAim, jackAimAt: null, dists, distsKey: '',
			pitch: null as unknown as Pitch3D, // filled by newGame, which always runs next
			fx: makeFx(scene),
			meshes: [], halos: [], shades: [], arcAir: null, arcRoll: null,
		};
		return true;
	}, []);

	/** Re-lay the throwing circle and the legal jack window on the terrain. Once per end. */
	const layGround = useCallback(() => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return;
		const c = matchRef.current.circle;
		killGroup(g.circle);
		killGroup(g.rings);
		g.circle.add(groundRing(s.t, c.x, c.y, CIRCLE_R, 0xf2e9d8));
		for (const r of [MIN_JACK, MAX_JACK]) g.rings.add(groundRing(s.t, c.x, c.y, r, 0xffd166, 0.016));
		g.laidAt = { x: c.x, y: c.y };
	}, []);

	const resize = useCallback(() => {
		const g = g3Ref.current, wrap = wrapRef.current;
		if (!g || !wrap) return;
		const w = wrap.clientWidth, h = wrap.clientHeight || Math.round(w * 0.625);
		g.renderer.setSize(w, h, false);
		g.camera.aspect = w / Math.max(1, h);
		g.camera.updateProjectionMatrix();
	}, []);

	/* ---------- bodies ---------- */

	const addBody = useCallback((b: Boule): Boule => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return b;
		s.bs.push(b);
		const m = makeBouleMesh(b.side);
		g.bodies.add(m);
		g.meshes.push(m);
		const h = makeHalo(b.side === -1 ? HALO[2] : HALO[b.side]);
		g.bodies.add(h);
		g.halos.push(h);
		const sh = makeContactShadow(b.r);
		g.bodies.add(sh);
		g.shades.push(sh);
		prevRef.current.push({ x: b.x, y: b.y, z: b.z });
		return b;
	}, []);

	const clearBodies = useCallback(() => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return;
		for (const m of [...g.meshes, ...g.halos, ...g.shades]) {
			g.bodies.remove(m);
			m.geometry.dispose();
			(m.material as THREE.Material).dispose();
		}
		g.meshes = [];
		g.halos = [];
		g.shades = [];
		s.bs = [];
		prevRef.current = [];
		jackRef.current = null;
	}, []);

	const clearArc = useCallback(() => {
		const g = g3Ref.current;
		if (!g) return;
		killMesh(g.arcAir); killMesh(g.arcRoll);
		g.arcAir = g.arcRoll = null;
		g.marker.visible = false;
	}, []);

	/** Back to the throwing view, feet at the circle, aim straight. Every mode entry runs this: a
	 *  player who left the camera on the top view would otherwise start the timed daily unable to
	 *  throw, and the chrono is the leaderboard tiebreak. */
	const resetCamera = useCallback(() => {
		viewRef.current = 'jeu';
		setView('jeu');
		viewBeforeJackRef.current = null;
		jackAimRef.current = null;
		setJackAim(null);
		introRef.current = null;
		reviewUntilRef.current = 0;
		dragRef.current = null;
		zoomRef.current = 0; zoomViewRef.current = 0; setZoom(0);
		magRef.current = 1; magShownRef.current = 1; setMag(1);
		camYawRef.current = 0; aimYawRef.current = 0;
		headYawRef.current = 0;
		headPitchRef.current = HEAD_PITCH_0;
		headDistRef.current = HEAD_DIST_0;
		fovRef.current = 0;
		lookRef.current.set(0, 0, 0); // zero means "snap", so a new pitch never gets a travelling shot
		turnKeyRef.current = '';
	}, []);

	/* ---------- a new game ---------- */

	/** Lay a fresh pitch and match. Shared by free play and by the levels ladder. */
	const layMatch = useCallback((cfg: { seed: number; surface: SurfaceId; amp: number; target: number; slope?: number }): boolean => {
		if (!initScene()) return false;
		const g = g3Ref.current;
		if (!g) return false;

		if (simRef.current) clearBodies();
		if (g.pitch) { g.scene.remove(g.pitch.group); g.pitch.dispose(); }
		const t = makeTerrain(cfg.seed, SURFACES[cfg.surface], cfg.amp, cfg.slope === undefined ? {} : { slope: cfg.slope });
		g.pitch = buildPitch3D(t, g.lights.setSun(t.seed, sunForceRef.current ?? undefined));
		g.scene.add(g.pitch.group);

		simRef.current = { t, bs: [], rng: cfg.seed & 0xffff };
		prevRef.current = [];
		targetRef.current = cfg.target;
		matchRef.current = initMatch13(cfg.target, HUMAN);
		setMatch(matchRef.current);
		statusRef.current = 'aim';
		setStatus('aim');
		setCard(null);
		setOver(false);
		aiPendingRef.current = false;
		powerRef.current = 0;
		setPower(0);
		placeRef.current = null; setPlaceOk(false);
		resetCamera();
		clearArc();
		return true;
	}, [clearArc, clearBodies, initScene, resetCamera]);

	const newGame = useCallback((key: DiffKey) => {
		const d = DIFFS[key];
		const pick = groundRef.current;
		const rel = pick.relief === 'auto' ? null : RELIEFS[pick.relief];
		diffRef.current = key;
		dailyRef.current = null;
		setDaily(false);
		if (!layMatch({
			seed: (Math.random() * 1e9) | 0,
			surface: pick.surface === 'auto' ? d.surface : pick.surface,
			amp: rel ? rel.amp : d.amp,
			slope: rel ? rel.slope : undefined,
			target: 13,
		})) return;
		setDiff(key);
		trackGame(gameId, 'game_started', { mode: 'libre', diff: key });
	}, [gameId, layMatch]);

	/** Choose the ground. It only takes on the next deal — a terrain swap mid-end would move the
	 *  boules already down, so the pitch is laid again. */
	const chooseGround = useCallback((pick: Partial<GroundPick>) => {
		const next = { ...groundRef.current, ...pick };
		groundRef.current = next;
		setGround(next);
		try { localStorage.setItem(GROUND_KEY, JSON.stringify(next)); } catch { /* private mode */ }
		newGame(diffRef.current);
	}, [newGame]);

	const startLevel = useCallback((level: number) => {
		const cfg = lv.play(level);
		levelSkillRef.current = cfg.skill;
		dailyRef.current = null;
		setDaily(false);
		if (!layMatch(cfg)) return;
		trackGame(gameId, 'game_started', { mode: 'niveaux', level });
	}, [gameId, layMatch, lv]);

	/* ---------- the daily: a shooting course ---------- */

	/** Lay the course's pitch. The circle is pinned to COURSE_CIRCLE, which is what daily.ts
	 *  measured its station distances from. Turn stays HUMAN for all 12 stations, and that alone
	 *  keeps the AI out: the rAF loop only wakes it on `turn === AI`. */
	const layCourse = useCallback((course: DailyCourse): boolean => {
		if (!initScene()) return false;
		const g = g3Ref.current;
		if (!g) return false;

		if (simRef.current) clearBodies();
		if (g.pitch) { g.scene.remove(g.pitch.group); g.pitch.dispose(); }
		const t = makeTerrain(course.seed, SURFACES[course.surface], course.amp);
		g.pitch = buildPitch3D(t, g.lights.setSun(t.seed, sunForceRef.current ?? undefined));
		g.scene.add(g.pitch.group);

		simRef.current = { t, bs: [], rng: course.seed & 0xffff };
		prevRef.current = [];
		targetRef.current = 13;
		matchRef.current = { ...initMatch13(13, HUMAN), phase: 'play', circle: { ...COURSE_CIRCLE } };
		setMatch(matchRef.current);
		setCard(null);
		setOver(false);
		aiPendingRef.current = false;
		powerRef.current = 0;
		setPower(0);
		placeRef.current = null; setPlaceOk(false);
		resetCamera();
		clearArc();
		return true;
	}, [clearArc, clearBodies, initScene, resetCamera]);

	/** Put station `i` on the ground and hand the aim back to the player. */
	const setStation = useCallback((i: number) => {
		const d = dailyRef.current, s = simRef.current;
		if (!d || !s) return;
		clearBodies();
		const bodies = stationBodies(d.course.stations[i], s.t);
		for (const b of bodies) addBody(b);
		d.target = bodies[0];
		d.targetAt = { x: bodies[0].x, y: bodies[0].y };
		setStationNo(i);
		setCard(null);
		powerRef.current = 0; camYawRef.current = 0; aimYawRef.current = 0; dragRef.current = null;
		setPower(0);
		clearArc();
		statusRef.current = 'aim';
		setStatus('aim');
	}, [addBody, clearArc, clearBodies]);

	/** One attempt per device, resumable station by station. The seed comes from the server. */
	const startDaily = useCallback(async () => {
		setDaily(true);
		setDailyLoading(true);
		// The seed fetch is a real await, so the old match must be frozen for its duration: 'over' is
		// the one status that neither lets the player throw nor wakes the AI.
		statusRef.current = 'over';
		setStatus('over');
		aiPendingRef.current = false;
		const run = loadDailyRun(gameId);
		const seed = run?.seed ?? (await getDaily(gameId)).seed;
		const grades = (run?.state as { grades?: Grade[] } | undefined)?.grades ?? [];

		dailyRef.current = { course: makeCourse(seed), grades, target: null, targetAt: null };
		if (!layCourse(dailyRef.current.course)) { setDailyLoading(false); return; }
		setDailyLoading(false);
		setPoints(sumGrades(grades));

		const finished = grades.length >= STATIONS;
		setDailyDone(finished);
		if (finished) {
			const centis = run?.finalTime ?? 0;
			setElapsed(centis);
			setDailyScore(encodeDaily(sumGrades(grades), centis * 10));
			setStationNo(STATIONS - 1);
			setOver(true);
			statusRef.current = 'over';
			setStatus('over');
			return;
		}
		startRef.current = run?.startedAt ?? Date.now();
		setElapsed(Math.round((Date.now() - startRef.current) / 10));
		setDailyScore(null);
		setStation(grades.length);
		trackGame(gameId, 'game_started', { mode: 'defi' });
	}, [gameId, layCourse, setStation]);

	/* ---------- throwing ---------- */

	/** The sway right now, zero when the pad is not held. */
	const swayNow = useCallback((): { yaw: number; loft: number } => {
		const s = swayRef.current;
		return s ? swayAt((performance.now() - s.t0) / 1000, s.amp, s.ph) : { yaw: 0, loft: 0 };
	}, []);

	/** Heading and loft the boule would leave with if released now: the chosen aim plus the sway. */
	const aimHeading = useCallback((): { x: number; y: number } => {
		const m = matchRef.current;
		const y = aimYawRef.current + swayNow().yaw;
		return { x: Math.sin(y) * m.dir, y: Math.cos(y) * m.dir };
	}, [swayNow]);
	const aimLoft = useCallback((): number => {
		const e = aimLoftRef.current + swayNow().loft;
		return Math.max(elevationForBoard(0), Math.min(elevationForBoard(1), e));
	}, [swayNow]);

	/** Where the EYE points. Free, unlike the aim — this one never reaches the physics. */
	const camHeading = useCallback((): { x: number; y: number } => {
		const m = matchRef.current;
		const y = camYawRef.current;
		return { x: Math.sin(y) * m.dir, y: Math.cos(y) * m.dir };
	}, []);

	/** The head: the live jack, else the centre of what is on the ground, else a point down the
	 *  lane. Both inspection views point at this, and the walk-up walks towards it. */
	const headFocus = useCallback((): { x: number; y: number } => {
		const m = matchRef.current, s = simRef.current;
		const j = jackRef.current;
		if (j && j.live) return { x: j.x, y: j.y };
		const live = (s?.bs ?? []).filter((b) => b.live);
		if (live.length) {
			let x = 0, y = 0;
			for (const b of live) { x += b.x; y += b.y; }
			return { x: x / live.length, y: y / live.length };
		}
		return { x: m.circle.x, y: m.circle.y + m.dir * LOOK_FAR };
	}, []);

	/** The camera yaw that puts the head in the middle of the frame. Facing straight down the lane
	 *  meant turning by hand after every jack thrown off-axis. */
	const yawToHead = useCallback((): number => {
		const m = matchRef.current, f = headFocus();
		const dx = (f.x - m.circle.x) * m.dir, dy = (f.y - m.circle.y) * m.dir;
		if (Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4) return 0;
		return Math.max(-CAM_YAW_MAX, Math.min(CAM_YAW_MAX, Math.atan2(dx, dy)));
	}, [headFocus]);

	/**
	 * Carry the camera yaw over to the aim — clamped, because a throw has limits a look does not.
	 * The loft is NOT here any more: it comes from the launch board, so turning the head to read the
	 * ground can no longer change what leaves the hand.
	 * Refused while the board is held: that drag already sampled its aim, and the whole point is
	 * that the player can then keep moving without the throw sliding out from under them.
	 */
	const syncAim = useCallback(() => {
		if (dragRef.current?.mode === 'arm') return;
		aimYawRef.current = Math.max(-YAW_MAX, Math.min(YAW_MAX, camYawRef.current));
		aimDirtyRef.current = true;
	}, []);

	/* The bar interpolates the SQUARE of the speed, because what the player reads off it is a
	   distance and distance grows with v². Linear measured (J2) at 20 % of the travel landing in
	   the 6-10 m window and a third of the bar off the pitch; this reads 27-51 % and 0-7 %. */
	const speedOf = (p: number): number =>
		Math.sqrt(MIN_SPEED * MIN_SPEED + (MAX_SPEED * MAX_SPEED - MIN_SPEED * MIN_SPEED) * p);

	const doThrow = useCallback((side: Side, v: { vx: number; vy: number; vz: number }, asJack: boolean) => {
		const s = simRef.current, g = g3Ref.current;
		if (!s || !g) return;
		const b = launch(s, matchRef.current.circle, side, v, asJack);
		addBody(b);
		if (asJack) jackRef.current = b;
		clearArc();
		g.rings.visible = false;
		accRef.current = 0;
		rollTimeRef.current = 0;
		statusRef.current = 'rolling';
		setStatus('rolling');
		powerRef.current = 0;
		setPower(0);
		// Back to the throwing eye: at full zoom the eye is 1.5 m from the head, so a boule leaving
		// from the circle 8 m behind it would fly out of frame from the very first instant.
		zoomRef.current = 0;
		setZoom(0);
	}, [addBody, clearArc]);

	/** Cosmetic aim stream, so their screen sees us drawing back. Never feeds the simulation. */
	const streamAim = useCallback((live: boolean) => {
		const net = netRef.current;
		if (!onlineRef.current || !net) return;
		const now = performance.now();
		if (live && now - aimSentRef.current < AIM_SEND_MS) return;
		aimSentRef.current = now;
		// The SAMPLED aim, never the camera: what the other screen must see is the throw being
		// drawn back. Where this player happens to be looking is nobody else's business.
		net.sendAim({ yaw: aimYawRef.current, power: powerRef.current, loft: aimLoftRef.current, live });
	}, []);

	const throwFromAim = useCallback(() => {
		const m = matchRef.current;
		const h = aimHeading();
		const v = throwVelocity(h.x, h.y, speedOf(powerRef.current), aimLoft());
		swayRef.current = null;
		const jack = m.phase === 'throw-jack';
		// Velocities, never angles: converting an angle calls sin/cos, and two JS engines may not
		// round those the same way. This is the one message the other board cannot do without.
		if (onlineRef.current) netRef.current?.sendThrow({ ...v, jack });
		streamAim(false);
		doThrow(m.turn, v, jack);
	}, [aimHeading, aimLoft, doThrow, streamAim]);

	/* ---------- which view we are in ---------- */

	/**
	 * Any contact ends the walk-up — and zooms back out, because going out there was never the
	 * player's doing. Leaving them stranded put the eye metres up the lane while the boule still
	 * leaves from the circle behind it, so the preview arc started off the top of the frame.
	 * The zoom controls opt out with `keepZoom`: they are taking the eye over on purpose.
	 */
	const cancelIntro = useCallback((keepZoom = false) => {
		if (!introRef.current) return;
		introRef.current = null;
		// A player who taps through the review has seen enough — and must not keep the AI waiting
		// for a beat that is no longer playing.
		reviewUntilRef.current = 0;
		if (keepZoom) return;
		zoomRef.current = 0;
		setZoom(0);
	}, []);

	/**
	 * Go and look at what the throw did, then come back. Armed on every settle that leaves the end
	 * open — a boule lands 6 to 10 m out, and from the circle the difference between holding the
	 * point and losing it is a few pixels. Same three-stage timer as the walk-up, but all the way
	 * in. Not at the end of an end: the table is the verdict there, and it would sit on top of this.
	 */
	const reviewHead = useCallback((now: number) => {
		const s = simRef.current, j = jackRef.current;
		if (dailyRef.current || !s || !j || !j.live) return;
		if (viewRef.current !== 'jeu') return; // the other two views already ARE an inspection
		if (!s.bs.some((b) => b.live && b !== j)) return;
		zoomRef.current = 1;
		setZoom(1);
		introRef.current = { stage: 'out', until: now + REVIEW_OUT * 1000, hold: REVIEW_HOLD * 1000, back: REVIEW_BACK * 1000 };
		reviewUntilRef.current = now + REVIEW_MS;
	}, []);

	const setViewKey = useCallback((k: ViewKey) => {
		if (viewRef.current === k) return;
		cancelIntro();
		dragRef.current = null;
		setArmed(false);
		if (viewRef.current === 'jeu') {
			powerRef.current = 0;
			setPower(0);
			aimDirtyRef.current = true;
			streamAim(false); // else their screen keeps a half-drawn ray of ours for ever
		}
		headPanRef.current = { x: 0, y: 0 }; // the review's slide belongs to the review, not to the view
		if (k === 'tete') headYawRef.current = camYawRef.current; // open where the player was looking
		// Back to the eye: face the head, not the lane axis. Coming home from a top view with the
		// camera still pointing where it was left is how the jack ended up off screen.
		if (k === 'jeu') { camYawRef.current = yawToHead(); syncAim(); }
		lookRef.current.set(0, 0, 0); // zero means snap, not a travelling shot across the pitch
		viewRef.current = k;
		setView(k);
	}, [cancelIntro, streamAim, syncAim, yawToHead]);

	const cycleView = useCallback(() => {
		setViewKey(VIEW_ORDER[(VIEW_ORDER.indexOf(viewRef.current) + 1) % VIEW_ORDER.length]);
	}, [setViewKey]);

	/**
	 * Slide the picture out from under the verdict card and shrink it to what is left.
	 * `r` is the layout's radius about the head, in metres, as measured by `frameEnd`.
	 *
	 * The card's box is READ, never assumed: its height follows the number of rows in the table, so
	 * any constant here would be right for one row count and wrong for the rest. The free rectangle
	 * is the best of the four full-span bands the card leaves — in landscape that is the strip beside
	 * it, in portrait the one above it, and nothing has to know which.
	 */
	const fitAround = useCallback((r: number) => {
		const cv = canvasRef.current?.getBoundingClientRect();
		const el = document.querySelector('.pe-endcard')?.getBoundingClientRect();
		const cam = g3Ref.current?.camera;
		if (!cv || !el || !cam || cv.width < 1 || cv.height < 1) return;
		const bands = [
			{ x: cv.left, y: cv.top, w: el.left - cv.left, h: cv.height },
			{ x: el.right, y: cv.top, w: cv.right - el.right, h: cv.height },
			{ x: cv.left, y: cv.top, w: cv.width, h: el.top - cv.top },
			{ x: cv.left, y: el.bottom, w: cv.width, h: cv.bottom - el.bottom },
		];
		/* Publish the card's real height so the bottom-right action row can step over it in portrait.
		   Measured rather than declared: the card grows with the number of rows in the table, and the
		   CSS that has to clear it cannot see that. */
		document.documentElement.style.setProperty('--pe-review-h', `${Math.round(el.height)}px`);
		let best = bands[0];
		for (const b of bands) if (b.w * b.h > best.w * best.h) best = b;
		if (best.w < 40 || best.h < 40) return; // the card owns the screen: leave the plain fit alone
		const vTan = Math.tan((cam.fov * Math.PI) / 360);
		const hTan = vTan * cam.aspect;
		/* Both axes, and the vertical one foreshortened: the layout lies flat, so its along-axis
		   extent shrinks by sin(pitch) while the across-axis one does not. */
		const span = r * END_FIT;
		const dist = Math.max(span / (hTan * (best.w / cv.width)),
			(span * Math.sin(END_PITCH)) / (vTan * (best.h / cv.height)));
		headDistRef.current = Math.max(HEAD_DIST_MIN, Math.min(HEAD_DIST_MAX, dist));
		/* Pan the camera the OPPOSITE way to the picture: to put the layout in a band left of centre,
		   the eye steps right. Screen y grows downward and the camera's up does not, which is why the
		   vertical term keeps the sign the horizontal one flips. */
		const fx = (best.x + best.w / 2 - (cv.left + cv.width / 2)) / (cv.width / 2);
		const fy = (best.y + best.h / 2 - (cv.top + cv.height / 2)) / (cv.height / 2);
		headPanRef.current = { x: -fx * headDistRef.current * hTan, y: fy * headDistRef.current * vTan };
	}, []);

	/**
	 * Seat the head orbit on the layout that just scored, seen from the side it was thrown from.
	 * `from` is passed in rather than read off the match: `finishEnd` has already moved the circle
	 * to the next end by the time this runs, which is the whole bug.
	 * The orbit's own refs are what gets written, so the player can keep dragging to look around —
	 * a camera held by the tick would have swallowed the drag.
	 */
	const frameEnd = useCallback((from: { x: number; y: number }) => {
		const s = simRef.current;
		if (!s) return;
		const hf = headFocus();
		// Radius of the whole layout about the head, so a boule knocked wide is still in the picture.
		let r = 0.6;
		for (const b of s.bs) {
			if (!b.live) continue;
			const dx = b.x - hf.x, dy = b.y - hf.y;
			r = Math.max(r, Math.sqrt(dx * dx + dy * dy) + b.r);
		}
		setViewKey('tete'); // first: it seeds the yaw from the aim, and we want our own
		/* Fitted to the HORIZONTAL half-angle. The vertical one is tighter on a wide canvas, but the
		   layout is flat on the ground, so its along-axis extent is foreshortened by sin(pitch) and
		   the across-axis one is not — the wide axis is the binding constraint. */
		const fit = (r * END_FIT) / Math.tan((VIEW_HFOV.tete * Math.PI) / 360);
		headDistRef.current = Math.max(HEAD_DIST_MIN, Math.min(HEAD_DIST_MAX, fit));
		headPitchRef.current = END_PITCH;
		/* Stand where the throw came from. `headCamera` puts the eye at focus - (sin yaw, cos yaw)·d,
		   so pointing that offset back at `from` means yaw = atan2 of the head-ward direction. */
		const ux = hf.x - from.x, uy = hf.y - from.y;
		const d = Math.sqrt(ux * ux + uy * uy);
		if (d > 1e-3) headYawRef.current = Math.atan2(ux / d, uy / d);
		/* The fit above centres the layout on the CANVAS, and the card is about to take a piece of
		   that canvas — in portrait, 6 of 7 boules landed behind it. So it is re-fitted to the
		   rectangle the card leaves free, once the card is really in the DOM: its height follows the
		   number of rows, and a constant guessed here would be wrong at every other row count.
		   Two frames, because the first is the one React commits the card on. */
		requestAnimationFrame(() => requestAnimationFrame(() => fitAround(r)));
	}, [fitAround, headFocus, setViewKey]);

	/** The jack is both aimed and hand-placed from above — from the circle you cannot see the ring. */
	const enterJackView = useCallback(() => {
		if (viewBeforeJackRef.current === null) viewBeforeJackRef.current = viewRef.current;
		setViewKey('dessus');
	}, [setViewKey]);

	const leaveJackView = useCallback(() => {
		const v = viewBeforeJackRef.current;
		viewBeforeJackRef.current = null;
		if (v) setViewKey(v);
	}, [setViewKey]);

	/* ---------- what the AI does when its turn comes ---------- */

	const aiAct = useCallback(() => {
		const s = simRef.current, m = matchRef.current, g = g3Ref.current;
		if (!s || !g) return;
		// The think timer spans frames, so the turn can move between arming and firing. Without this
		// the AI throws on the player's turn, and applySettled bills the boule to the player.
		if (m.turn !== AI || m.winner !== null || (m.phase === 'play' && m.left[AI] <= 0)) return;
		const skill = lvActiveRef.current ? levelSkillRef.current : DIFFS[diffRef.current].skill;
		const rng = rngRef.current++;

		if (m.phase === 'place-jack') {
			const j = jackRef.current;
			if (!j) return;
			j.x = m.circle.x;
			j.y = m.circle.y + m.dir * 7.4;
			j.live = true;
			place(s.t, j);
			matchRef.current = applyPlacedJack(m);
			setMatch(matchRef.current);
			statusRef.current = 'aim';
			setStatus('aim');
			return;
		}
		if (m.phase === 'throw-jack') {
			doThrow(AI, planJack(s, m, skill, rng), true);
			return;
		}
		const j = jackRef.current;
		if (!j) return;
		doThrow(AI, planThrow(s, j, m, AI, skill, rng), false);
	}, [doThrow]);

	/* ---------- one body has come to rest ---------- */

	const settle = useCallback(() => {
		const s = simRef.current, g = g3Ref.current;
		if (!s || !g) return;
		const m = matchRef.current;
		const j = jackRef.current;

		const d = dailyRef.current;
		if (d && d.target && d.targetAt) {
			const shooter = s.bs[s.bs.length - 1];
			const at = d.targetAt;
			const moved = dist2(d.target, at);
			const grade = gradeShot({
				hit: moved > TOUCH_M || !d.target.live,
				moved,
				rollOn: dist2(shooter, at),
				targetLive: d.target.live,
				shooterLive: shooter.live,
			});
			d.grades.push(grade);
			const total = sumGrades(d.grades);
			setPoints(total);
			setCard({ text: `${GRADE_LABEL[grade]} · +${grade}`, mine: grade >= 3, rows: [] });

			const last = d.grades.length >= STATIONS;
			const centis = Math.round((Date.now() - startRef.current) / 10);
			saveDailyRun(gameId, {
				startedAt: startRef.current,
				done: last,
				finalTime: last ? centis : undefined,
				seed: d.course.seed,
				state: { grades: d.grades },
			});
			if (!last) {
				statusRef.current = 'end';
				setStatus('end');
				endAtRef.current = performance.now() + STATION_CARD_MS;
				return;
			}
			setElapsed(centis);
			setDailyScore(encodeDaily(total, centis * 10));
			setDailyDone(true);
			setOver(true);
			statusRef.current = 'over';
			setStatus('over');
			trackGame(gameId, 'game_won', { mode: 'defi', points: total });
			return;
		}

		if (m.phase === 'throw-jack' && j) {
			const next = applyJack(m, j);
			matchRef.current = next;
			setMatch(next);
			if (next.phase === 'place-jack') {
				statusRef.current = 'placing';
				setStatus('placing');
				placeRef.current = { x: next.circle.x, y: next.circle.y + next.dir * 7.4 };
				setPlaceOk(next.turn === mySideRef.current);
				if (next.turn === mySideRef.current) enterJackView();
			} else {
				statusRef.current = 'aim';
				setStatus('aim');
			}
			return;
		}

		if (!j) return;
		const next = applySettled(m, s.bs, j);
		matchRef.current = next;
		setMatch(next);
		if (next.phase !== 'end-done') {
			statusRef.current = 'aim';
			setStatus('aim');
			reviewHead(performance.now());
			return;
		}
		const before = next.scores[0] + next.scores[1];
		const done = finishEnd(next, s.bs, j);
		const me = mySideRef.current;
		const mine = done.scores[me] > next.scores[me];
		const got = done.scores[0] + done.scores[1] - before;
		matchRef.current = done;
		setMatch(done);
		// The table is read off the ground BEFORE it is cleared for the next end, and off the same
		// distances the score came from — see `bouleTable`.
		const rows = bouleTable(s.bs, j);
		setCard({ text: done.lastEvent ?? (got ? `${got} point${got > 1 ? 's' : ''}` : 'Mène nulle'), mine, rows });
		statusRef.current = done.phase === 'match-done' ? 'over' : 'end';
		setStatus(statusRef.current);
		endAtRef.current = performance.now() + (rows.length ? END_TABLE_MS : END_CARD_MS);
		/* Hold the layout the card is about. `next` is the match BEFORE `finishEnd` advanced it, so
		   `next.circle` is the circle this end was actually thrown from — `done.circle` is already
		   the next one, and standing there is what left the boules behind the eye. */
		viewBeforeEndRef.current = viewRef.current;
		frameEnd(next.circle);
		if (done.phase === 'match-done') {
			setOver(true);
			const win = done.winner === me;
			if (win) sfx.win(); else sfx.lose();
			// A level is a match against the AI; an online win must never bank one.
			if (lvActiveRef.current && !onlineRef.current) {
				const conceded = done.scores[other(me)];
				lvFinishRef.current({ won: win, score: targetRef.current - conceded, stat: conceded });
			}
			trackGame(gameId, win ? 'game_won' : 'game_over',
				onlineRef.current ? { mode: 'en-ligne' }
				: lvActiveRef.current ? { mode: 'niveaux' }
				: { mode: 'libre', diff: diffRef.current });
		}
	}, [enterJackView, frameEnd, gameId, reviewHead]);

	/**
	 * The host rules at rest. Positions and the state it derived go out together, so a float that
	 * drifted on one peer cannot survive into the next throw. The guest still runs its own rules
	 * first (so its cards and its "who has the point" read instantly) and simply adopts this after —
	 * which makes the correction self-healing instead of a blocking wait that could hang the game.
	 */
	const applySync = useCallback((msg: SyncMsg) => {
		const s = simRef.current;
		if (!s) return;
		// A mismatched count means the ground was already cleared for the next end, so these
		// positions belong to bodies that no longer exist. Dropping is the only safe move.
		if (s.bs.length * 4 !== msg.bs.length) return;
		for (let i = 0; i < s.bs.length; i++) {
			const b = s.bs[i], k = i * 4;
			b.x = msg.bs[k]; b.y = msg.bs[k + 1]; b.z = msg.bs[k + 2];
			b.live = msg.bs[k + 3] === 1;
			b.vx = 0; b.vy = 0; b.vz = 0; b.rolling = false;
		}
		matchRef.current = msg.match;
		setMatch(msg.match);
		// The status is only realigned when we are idle. Both peers ran the same rules on the same
		// board, so what differs is a float — cutting a card or a roll short would cost more.
		if (statusRef.current === 'aim' || statusRef.current === 'placing') {
			const want: Status = msg.match.phase === 'place-jack' ? 'placing' : 'aim';
			statusRef.current = want;
			setStatus(want);
			const mine = msg.match.turn === mySideRef.current;
			setPlaceOk(want === 'placing' && mine && placeRef.current !== null);
			if (want === 'placing' && mine) enterJackView(); else if (want === 'aim') leaveJackView();
		}
	}, [enterJackView, leaveJackView]);

	const onSettled = useCallback(() => {
		settle();
		const s = simRef.current, net = netRef.current;
		if (!s || !onlineRef.current || !net || dailyRef.current) return;
		if (net.isHost()) {
			const bs: number[] = [];
			for (const b of s.bs) bs.push(b.x, b.y, b.z, b.live ? 1 : 0);
			net.sendSync({ bs, match: matchRef.current });
			return;
		}
		const q = pendingSyncRef.current;
		if (q) { pendingSyncRef.current = null; applySync(q); }
	}, [applySync, settle]);

	/** Clear the ground and start the next end. Runs on the card's timer, or on a click. */
	const nextEnd = useCallback(() => {
		if (statusRef.current !== 'end') return;
		const d = dailyRef.current;
		if (d) { setStation(d.grades.length); return; }
		clearBodies();
		/* Give the borrowed view back — AFTER the ground is cleared, or `setViewKey('jeu')` aims the
		   eye at the head that is about to stop existing. Skipped when the player picked a view
		   during the review: an explicit press outranks what we took. */
		const was = viewBeforeEndRef.current;
		viewBeforeEndRef.current = null;
		headPanRef.current = { x: 0, y: 0 }; // here too: setViewKey is a no-op when the view is unchanged
		document.documentElement.style.removeProperty('--pe-review-h');
		if (was && viewRef.current === 'tete') setViewKey(was);
		setCard(null);
		aiPendingRef.current = false;
		statusRef.current = 'aim';
		setStatus('aim');
	}, [clearBodies, setStation, setViewKey]);

	/* ---------- online 1v1 ---------- */

	/** Drop the session without laying a pitch — the caller decides what comes next. */
	const resetOnline = useCallback(() => {
		if (netRef.current) { netRef.current.leave(); netRef.current = null; }
		onlineRef.current = false;
		startedOnlineRef.current = false;
		mySideRef.current = HUMAN;
		setMySide(HUMAN);
		remoteAimRef.current = null;
		pendingSyncRef.current = null;
		setMpPhase('off'); setMpCode(null); setMpOpp(null); setMpMsg(null);
	}, []);

	const startOnlineMatch = useCallback(() => {
		const net = netRef.current;
		if (!net || startedOnlineRef.current) return;
		startedOnlineRef.current = true;
		onlineRef.current = true;
		// Host is side 0, which is also the side initMatch13 gives the first jack to.
		const side: Side = net.isHost() ? 0 : 1;
		mySideRef.current = side;
		setMySide(side);
		setDaily(false);
		dailyRef.current = null;
		lv.exit();

		net.onThrow((t) => {
			// Their throw can land while our end card is still up: they moved on, so we do too.
			if (statusRef.current === 'end') nextEnd();
			const m = matchRef.current;
			if (m.turn === mySideRef.current || m.winner !== null) return;
			remoteAimRef.current = null;
			doThrow(m.turn, t, t.jack);
		});
		net.onPlace((p) => {
			const s = simRef.current, j = jackRef.current;
			if (!s || !j || statusRef.current !== 'placing' || matchRef.current.turn === mySideRef.current) return;
			j.x = p.x; j.y = p.y; j.live = true;
			place(s.t, j);
			matchRef.current = applyPlacedJack(matchRef.current);
			setMatch(matchRef.current);
			placeRef.current = null;
			setPlaceOk(false);
			statusRef.current = 'aim';
			setStatus('aim');
			leaveJackView();
		});
		net.onAim((a) => {
			if (matchRef.current.turn === mySideRef.current || statusRef.current === 'rolling') return;
			remoteAimRef.current = { ...a, seen: performance.now() };
		});
		net.onSync((msg) => {
			if (statusRef.current === 'rolling') { pendingSyncRef.current = msg; return; }
			applySync(msg);
		});

		// Same terrain on both peers, from the room id alone. Neutral ground: on gravel this coarse
		// neither seat gets an edge, and the first jack is the only thing the host does differently.
		layMatch({ seed: seedFromRoom(net.roomId), surface: ONLINE_SURFACE, amp: DIFFS.moyen.amp, target: 13 });
		setMpMsg(null);
		setMpPhase('playing');
		trackGame(gameId, 'game_started', { mode: 'en-ligne' });
	}, [applySync, doThrow, gameId, layMatch, leaveJackView, lv, nextEnd]);

	const watchPeers = useCallback(() => {
		netRef.current?.onPeers((peers) => {
			if (peers.length >= 1) { setMpOpp(peers[0].name); startOnlineMatch(); }
			else if (onlineRef.current) setMpMsg('Adversaire parti');
		});
	}, [startOnlineMatch]);

	const enterOnline = useCallback(() => {
		resetOnline();
		if (lv.active) lv.exit();
		dailyRef.current = null;
		// A clean Libre pitch as the backdrop: the online match re-lays on connect, and backing out
		// of the menu then leaves a game that is actually playable.
		newGame(diffRef.current);
		setMpMsg(null);
		setMpPhase('menu');
	}, [lv, newGame, resetOnline]);

	const leaveOnline = useCallback(() => {
		resetOnline();
		newGame(diffRef.current);
	}, [newGame, resetOnline]);

	const me = (): string => (playerName() || 'Joueur').slice(0, 16);

	const mpQuickMatch = useCallback(async () => {
		if (!multiplayerAvailable()) { setMpMsg('Multijoueur indisponible'); return; }
		setMpPhase('connecting'); setMpMsg(null); setMpCode(null);
		const net = await joinRandom(me());
		if (!net) { setMpPhase('menu'); setMpMsg('Aucune partie libre, réessaie'); return; }
		netRef.current = net; setMpPhase('waiting'); watchPeers();
	}, [watchPeers]);

	const mpCreateCode = useCallback(async () => {
		if (!multiplayerAvailable()) { setMpMsg('Multijoueur indisponible'); return; }
		const code = makeCode();
		setMpPhase('connecting'); setMpMsg(null); setMpCode(code);
		const net = await joinByCode(me(), code);
		if (!net) { setMpPhase('menu'); setMpMsg('Erreur de connexion'); return; }
		netRef.current = net; setMpPhase('waiting'); watchPeers();
	}, [watchPeers]);

	const mpJoinCode = useCallback(async () => {
		const code = codeInput.trim().toUpperCase();
		if (!code) return;
		if (!multiplayerAvailable()) { setMpMsg('Multijoueur indisponible'); return; }
		setMpPhase('connecting'); setMpMsg(null); setMpCode(code);
		const net = await joinByCode(me(), code);
		if (!net) { setMpPhase('menu'); setMpMsg('Code plein ou invalide'); return; }
		netRef.current = net; setMpPhase('waiting'); watchPeers();
	}, [codeInput, watchPeers]);

	useEffect(() => () => { netRef.current?.leave(); }, []);

	/* ---------- hand placing the jack ---------- */

	const pickGround = useCallback((clientX: number, clientY: number): { x: number; y: number } | null => {
		const g = g3Ref.current, cv = canvasRef.current;
		if (!g || !cv) return null;
		const r = cv.getBoundingClientRect();
		const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
		const ray = new THREE.Raycaster();
		ray.setFromCamera(ndc, g.camera);
		const hit = new THREE.Vector3();
		// The relief is centimetres deep, so the flat plane is close enough to place a jack on.
		if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) return null;
		return { x: hit.x + PITCH_W / 2, y: hit.z + PITCH_L / 2 };
	}, []);

	/**
	 * Pull a tap into the legal window, so a clumsy finger still produces a legal jack. The default
	 * margin is for HAND placing, where the spot is exact. Aiming is a different question — see
	 * `AIM_LO` / `AIM_HI`.
	 */
	const legalise = useCallback((p: { x: number; y: number }, lo = MIN_JACK + 0.15, hi = MAX_JACK - 0.15):
	{ x: number; y: number } => {
		const c = matchRef.current.circle;
		const x = Math.min(PITCH_W - EDGE, Math.max(EDGE, p.x));
		const y = Math.min(PITCH_L - EDGE, Math.max(EDGE, p.y));
		const dx = x - c.x, dy = y - c.y;
		const d = Math.sqrt(dx * dx + dy * dy) || 1;
		const k = d < lo ? lo / d : d > hi ? hi / d : 1;
		return { x: c.x + dx * k, y: c.y + dy * k };
	}, []);

	const confirmPlace = useCallback(() => {
		const s = simRef.current, j = jackRef.current, p = placeRef.current;
		if (!s || !j || !p) return;
		j.x = p.x; j.y = p.y; j.live = true;
		place(s.t, j);
		if (jackCheck(matchRef.current.circle, j) !== 'ok') return; // legalise() should make this dead code
		if (onlineRef.current) netRef.current?.sendPlace({ x: p.x, y: p.y });
		matchRef.current = applyPlacedJack(matchRef.current);
		setMatch(matchRef.current);
		placeRef.current = null;
		setPlaceOk(false);
		statusRef.current = 'aim';
		setStatus('aim');
		leaveJackView();
	}, [leaveJackView]);

	/* ---------- aiming the jack ---------- */

	/** True while this device owns an aimed-but-unthrown jack. The gate for the whole flow. */
	const jackAiming = useCallback((): boolean =>
		statusRef.current === 'aim' && matchRef.current.phase === 'throw-jack'
		&& matchRef.current.turn === mySideRef.current && jackAimRef.current !== null, []);

	const moveJackAim = useCallback((clientX: number, clientY: number) => {
		const p = pickGround(clientX, clientY);
		if (!p) return;
		const q = legalise(p, AIM_LO, AIM_HI);
		jackAimRef.current = q;
		setJackAim(q);
	}, [legalise, pickGround]);

	/**
	 * Throw the jack at the chosen spot. Not a placement: it flies, with a small spread, so picking
	 * the far edge of the window is a real gamble. Illegal landings fall through to `place-jack`
	 * exactly as an AI jack does — one settle path, no special case.
	 */
	const throwJackAt = useCallback(() => {
		const s = simRef.current, m = matchRef.current, aim = jackAimRef.current;
		if (!s || !aim || !jackAiming()) return;
		const v = jackThrow(s, m, aim, JACK_SPREAD_PLAYER, rngRef.current++);
		jackAimRef.current = null;
		setJackAim(null);
		leaveJackView();
		// Only the velocity travels. The spread is already baked into it, so the other board replays
		// the same flight without ever seeing the aim or the seeded draw behind it.
		if (onlineRef.current) netRef.current?.sendThrow({ vx: v.vx, vy: v.vy, vz: v.vz, jack: true });
		doThrow(m.turn, v, true);
	}, [doThrow, jackAiming, leaveJackView]);

	/* ---------- camera controls ---------- */

	const tiltBy = useCallback((d: number) => {
		cancelIntro();
		camPitchRef.current = Math.max(CAM_PITCH_LOW, Math.min(CAM_PITCH_HIGH, camPitchRef.current + d));
		syncAim();
	}, [cancelIntro, syncAim]);

	/** Zoom in on the head, or back out to the throwing eye. Inspection only. */
	const zoomBy = useCallback((d: number) => {
		cancelIntro(true);
		const z = Math.max(0, Math.min(1, zoomRef.current + d));
		zoomRef.current = z;
		setZoom(z);
	}, [cancelIntro]);

	/* ---------- the aim drag ---------- */

	/** The launch pad in client px, asked of the element that draws it. The box is laid out by CSS,
	 *  so reading it back is the only way the hit test cannot drift from the drawing — the old
	 *  version re-derived the same clamp in JS and in a custom property. */
	const armBox = useCallback((): DOMRect | null => armElRef.current?.getBoundingClientRect() ?? null, []);

	/** The loft a touch on the pad asks for: 1 (plomb) at the bottom edge, 0 (grazing) at the top.
	 *  Upside down against the screen on purpose — the gesture that lobs is the one that starts low
	 *  and has the whole pad to swing through. The padding lets a thumb reach a full plomb without
	 *  having to land exactly on the edge. */
	const boardAt = useCallback((b: DOMRect, y: number): number => {
		const top = b.top + BOARD_PAD_PX, bot = b.bottom - BOARD_PAD_PX;
		const t = (y - top) / Math.max(1, bot - top);
		return t < 0 ? 0 : t > 1 ? 1 : t;
	}, []);

	/* The jack has its own path — aimed with a ring, thrown with a button — so the strip stays inert
	   during that phase. Two ways to throw the same jack would mean one of them ignores the ring. */
	const canThrow = useCallback((): boolean =>
		statusRef.current === 'aim' && matchRef.current.turn === mySideRef.current
		&& matchRef.current.phase !== 'throw-jack'
		&& viewRef.current === 'jeu' && !pinchRef.current, []);

	const aimStart = useCallback((x: number, y: number) => {
		sfx.unlock(); // first canvas contact of the session is the gesture iOS needs to arm audio
		cancelIntro(); // any contact interrupts the walk-up
		const cv = canvasRef.current;
		if (!cv) return;
		if (statusRef.current === 'placing' && matchRef.current.turn === mySideRef.current) {
			const p = pickGround(x, y);
			if (p) { placeRef.current = legalise(p); setPlaceOk(true); }
			dragRef.current = { mode: 'place', x0: x, y0: y, a0: 0, b0: 0 };
			return;
		}
		const pad = armBox();
		// A box now, not a half-plane: the pad no longer spans the width, so the pitch on either side
		// of it has to stay a camera drag. That is the point of shrinking it.
		if (pad && x >= pad.left && x <= pad.right && y >= pad.top && y <= pad.bottom) {
			// The board is the arm. Off the game view there is nothing to throw, so a tap here brings
			// the game view back rather than being a dead zone — unless the jack is being aimed, where
			// leaving the top view mid-gesture would throw away the spot the player just picked.
			if (viewRef.current !== 'jeu') { if (!jackAiming()) setViewKey('jeu'); return; }
			if (!canThrow()) return;
			setCallArm(false); // found it — stop waving
			// Back to the throwing eye: the zoom is for reading the head, and the boule leaves from
			// the circle whatever the eye is doing. Previewing an arc that starts behind you is
			// nonsense, and `doThrow` resets it anyway — this only makes it happen before the preview.
			zoomRef.current = 0;
			setZoom(0);
			powerRef.current = 0;
			// The press point IS the loft — this is the whole launch board. The yaw is sampled off
			// the camera in the same beat, as the direction the sideways steer works from.
			// `syncAim` refuses once the drag is armed, so the order matters — arm second.
			syncAim();
			const loftNow = elevationForBoard(boardAt(pad, y));
			aimLoftRef.current = loftNow;
			setLoft(loftNow);
			// b0 carries the seam for an arm drag, because power is measured from the seam and not from
			// the press point: the board is the safe zone, and a pull that has not cleared it is not a
			// throw yet. Sampled once here — the rect cannot move under a finger that is already down.
			// Declared cost of the inversion: the seam is the pad's TOP, so a plomb pressed at the
			// bottom drags the whole pad before it charges, while a roulette charges at once.
			dragRef.current = { mode: 'arm', x0: x, y0: y, a0: aimYawRef.current, b0: pad.top };
			// Daily and online sway like Moyen for everyone: a shared board must not favour a ladder.
			const skill = dailyRef.current || onlineRef.current ? DIFFS.moyen.skill
				: lvActiveRef.current ? levelSkillRef.current : DIFFS[diffRef.current].skill;
			swayRef.current = { t0: performance.now(), amp: swayAmp(skill), ph: [0, 1, 2, 3].map(() => Math.random() * Math.PI * 2) };
			setArmed(true);
			aimDirtyRef.current = true;
			return;
		}
		// Aiming the jack, above the strip. Must come before the early return below: that return is
		// there to hold the top view still, which is exactly the condition this gesture needs.
		if (viewRef.current === 'dessus' && jackAiming()) {
			moveJackAim(x, y);
			dragRef.current = { mode: 'jackaim', x0: x, y0: y, a0: 0, b0: 0 };
			return;
		}
		// The top view holds still: the tap that places the jack must land where it was aimed.
		if (viewRef.current === 'dessus') return;
		dragRef.current = viewRef.current === 'tete'
			? { mode: 'look', x0: x, y0: y, a0: headYawRef.current, b0: headPitchRef.current }
			: { mode: 'look', x0: x, y0: y, a0: camYawRef.current, b0: camPitchRef.current };
	}, [armBox, boardAt, canThrow, cancelIntro, jackAiming, legalise, moveJackAim, pickGround, setViewKey, syncAim]);

	const aimMove = useCallback((x: number, y: number) => {
		const d = dragRef.current;
		if (!d) return;
		if (d.mode === 'place') {
			if (statusRef.current !== 'placing') return;
			const p = pickGround(x, y);
			if (p) { placeRef.current = legalise(p); setPlaceOk(true); }
			return;
		}
		if (d.mode === 'jackaim') {
			if (jackAiming()) moveJackAim(x, y);
			return;
		}
		if (d.mode === 'arm') {
			if (!canThrow()) return;
			/* Measured from the seam, not from the press point. Asked for as "coming back into the
			   launch zone cancels the throw", which only holds if being inside the zone means zero
			   power — press-relative power cannot express it: the board is 200 px tall in fullscreen
			   and a full pull is 190 px, so a press at the bottom would saturate BEFORE clearing the
			   board and a soft roulette could never leave. The cost is dead travel from a low press
			   up to the seam, which is the pull-back of the gesture and is shown as such. */
			const p = Math.max(0, Math.min(1, (d.b0 - y) / POWER_PX));
			// Sideways in the strip steers the throw and nothing else — the eye keeps the framing it
			// had. Same rad-per-px as the camera drag, so the gesture reads the same wherever the
			// thumb is. The dead band is not polish: a thumb pulling 190 px down wanders 10-30 px
			// sideways on the way, which without it is a degree or two of drift nobody asked for.
			// The loft is deliberately NOT re-read here: a pull of 190 px would sweep the whole board
			// on its way up, and the angle the player chose has to survive the pull that fires it.
			const dx = x - d.x0;
			const steer = Math.abs(dx) <= AIM_DEAD_PX ? 0 : dx - Math.sign(dx) * AIM_DEAD_PX;
			const yaw = Math.max(-YAW_MAX, Math.min(YAW_MAX, d.a0 - steer * YAW_PER_PX));
			if (p !== powerRef.current || yaw !== aimYawRef.current) aimDirtyRef.current = true;
			aimYawRef.current = yaw;
			powerRef.current = p;
			setPower(p);
			// Only the arm streams. A player idly turning the camera would push 12 messages a second
			// for as long as they kept looking around.
			if (p >= 0.06) streamAim(true);
			return;
		}
		if (viewRef.current === 'tete') {
			headYawRef.current = d.a0 - (x - d.x0) * YAW_PER_PX * 2;
			// Opposite sign to the game view on purpose: there the drag grabs the WORLD, here it
			// moves the EYE around the head, which is what every orbit control does.
			headPitchRef.current = Math.max(HEAD_PITCH_MIN, Math.min(HEAD_PITCH_MAX, d.b0 + (y - d.y0) * PITCH_PER_PX));
			return;
		}
		if (viewRef.current !== 'jeu') return;
		// Drag right looks right on screen: the camera looks down -yaw, so the sign flips here.
		camYawRef.current = Math.max(-CAM_YAW_MAX, Math.min(CAM_YAW_MAX, d.a0 - (x - d.x0) * YAW_PER_PX));
		// The finger leads the gaze: slide up and the view looks up (a lower pitch raises the look target).
		camPitchRef.current = Math.max(CAM_PITCH_LOW, Math.min(CAM_PITCH_HIGH, d.b0 + (y - d.y0) * PITCH_PER_PX));
		syncAim();
	}, [canThrow, jackAiming, legalise, moveJackAim, pickGround, streamAim, syncAim]);

	const aimEnd = useCallback(() => {
		const d = dragRef.current;
		dragRef.current = null;
		if (d?.mode === 'arm') setArmed(false);
		if (!d || d.mode !== 'arm' || !canThrow()) { swayRef.current = null; return; }
		// The safe zone, and it needs no test of its own: a finger still on the board reads zero power
		// by construction, so "released without clearing the board" and "released without pulling" are
		// the same sentence. Sliding back down onto the board un-arms a throw already charged.
		if (powerRef.current < 0.06) {
			swayRef.current = null;
			powerRef.current = 0;
			setPower(0);
			aimDirtyRef.current = true;
			streamAim(false);
			return;
		}
		throwFromAim();
	}, [canThrow, streamAim, throwFromAim]);

	const { onPointerDown } = usePointerDrag(aimStart, aimMove, aimEnd);

	/* The zoom slider. A DOM sibling above the canvas, so the canvas handler never sees the event
	   and no stopPropagation is needed. Its own usePointerDrag instance: each one binds its own
	   element and posts its own document listeners. Touching it anywhere jumps straight to that
	   value — there is no grab-the-thumb-first step. */
	const zoomTrackRef = useRef<HTMLDivElement | null>(null);
	const zoomTo = useCallback((clientY: number) => {
		const el = zoomTrackRef.current;
		if (!el) return;
		const r = el.getBoundingClientRect();
		const z = Math.max(0, Math.min(1, (r.bottom - clientY) / Math.max(1, r.height)));
		zoomRef.current = z;
		setZoom(z);
	}, []);
	const { onPointerDown: onZoomDown } = usePointerDrag(
		(_x, y) => { cancelIntro(true); zoomDragRef.current = true; zoomTo(y); },
		(_x, y) => zoomTo(y),
		() => { zoomDragRef.current = false; },
	);
	/* The pad slides along the bottom edge. Its travel is measured, not declared: the side gauges are
	   vertically centred, so on a short screen they reach down into the pad's band and the travel
	   stops at them. A gauge wholly above the band leaves the whole width. */
	const layoutPad = useCallback(() => {
		const wrap = wrapRef.current, el = armElRef.current;
		if (!wrap || !el) return;
		const wr = wrap.getBoundingClientRect();
		const W = wr.width, w = el.offsetWidth;
		const bandTop = wr.top + el.offsetTop - PAD_HEAD;
		/* Two passes: the zoom and the leaderboard pill take presses and are never covered; the loft
		   gauge is inert, so when a short canvas leaves no room between all three the pad may sit on it. */
		const travel = (sel: string): { lo: number; hi: number } => {
			let l0 = PAD_EDGE, r0 = PAD_EDGE;
			for (const o of document.querySelectorAll(sel)) {
				const r = o.getBoundingClientRect();
				if (r.width < 1 || r.bottom <= bandTop || r.top >= wr.bottom || r.right <= wr.left || r.left >= wr.right) continue;
				if (r.left + r.width / 2 < wr.left + W / 2) l0 = Math.max(l0, r.right - wr.left + PAD_GAP);
				else r0 = Math.max(r0, wr.right - r.left + PAD_GAP);
			}
			return { lo: l0, hi: W - r0 - w };
		};
		let { lo, hi } = travel('.pe-loft, .pe-zoom, .lbc-pill');
		if (hi < lo) ({ lo, hi } = travel('.pe-zoom, .lbc-pill'));
		if (hi < lo) lo = hi = Math.max(PAD_EDGE, Math.min(W - PAD_EDGE - w, (lo + hi) / 2));
		// Piecewise, so 0.5 is the canvas centre even when the two gauges are not the same width.
		const c = Math.max(lo, Math.min(hi, (W - w) / 2));
		padRangeRef.current = { lo, hi, c };
		const f = padXRef.current[padOrient()];
		const left = Math.round(f <= 0.5 ? lo + (c - lo) * f * 2 : c + (hi - c) * (f - 0.5) * 2);
		const mid = left + w / 2;
		shoulderRef.current = mid > W * 0.55 ? -1 : 1;
		// The state line rides the same fraction of the width, so it hugs the pad without leaving the screen.
		const label = Math.max(0, Math.min(1, (mid - PAD_EDGE) / Math.max(1, W - PAD_EDGE * 2)));
		const grip = mid > W / 2 + 1 ? 'l' : 'r';
		const gripLeft = grip === 'r' ? left + w + 6 : left - 6 - PAD_GRIP_W;
		setPadPos((p) => (p && p.left === left && p.label === label && p.grip === gripLeft ? p : { left, label, grip: gripLeft }));
	}, []);

	const savePadX = useCallback((f: number) => {
		const next = { ...padXRef.current, [padOrient()]: f };
		padXRef.current = next;
		try { localStorage.setItem(PAD_KEY, JSON.stringify(next)); } catch { /* private mode */ }
		setPadX(next);
		layoutPad();
	}, [layoutPad]);

	/* The grip beside the pad. The pad itself cannot be the handle: a press there is a loft and a
	   sideways slide is the aim. Snaps to left, centre and right when released close to them. */
	const { onPointerDown: onGripDown } = usePointerDrag(
		(x) => {
			const el = armElRef.current;
			if (!el) return;
			padGripRef.current = { x0: x, left0: el.offsetLeft };
			setPadGrip('held');
			try { localStorage.setItem(PAD_GRIP_KEY, '1'); } catch { /* private mode */ }
		},
		(x) => {
			const g = padGripRef.current;
			if (!g) return;
			const { lo, hi, c } = padRangeRef.current;
			const p = Math.max(lo, Math.min(hi, g.left0 + x - g.x0));
			const f = p <= c ? (c > lo ? (p - lo) / (c - lo) / 2 : 0.5) : (hi > c ? 0.5 + (p - c) / (hi - c) / 2 : 0.5);
			padXRef.current = { ...padXRef.current, [padOrient()]: f };
			layoutPad();
		},
		() => {
			if (!padGripRef.current) return;
			padGripRef.current = null;
			const f = padXRef.current[padOrient()];
			savePadX(PAD_SNAPS.find((s) => Math.abs(s - f) < PAD_SNAP_R) ?? f);
			setPadGrip('idle');
		},
	);
	const onGripKey = useCallback((e: React.KeyboardEvent) => {
		const d = e.key === 'ArrowRight' ? 0.1 : e.key === 'ArrowLeft' ? -0.1 : 0;
		if (!d) return;
		e.preventDefault();
		savePadX(Math.max(0, Math.min(1, padXRef.current[padOrient()] + d)));
	}, [savePadX]);

	const onZoomKey = useCallback((e: React.KeyboardEvent) => {
		const d = e.key === 'ArrowUp' || e.key === 'ArrowRight' ? ZOOM_STEP
			: e.key === 'ArrowDown' || e.key === 'ArrowLeft' ? -ZOOM_STEP
			: e.key === 'Home' ? -1 : e.key === 'End' ? 1 : 0;
		if (!d) return;
		e.preventDefault();
		zoomBy(d);
	}, [zoomBy]);

	useEffect(() => {
		const cv = canvasRef.current;
		if (!cv) return;
		// The wheel zooms, in every view. Nothing about the throw is on it: the loft is on the board.
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			const up = e.deltaY < 0;
			if (viewRef.current === 'jeu') zoomBy(up ? ZOOM_STEP : -ZOOM_STEP);
			else if (viewRef.current === 'tete') {
				cancelIntro();
				headDistRef.current = Math.max(HEAD_DIST_MIN, Math.min(HEAD_DIST_MAX, headDistRef.current + (up ? -0.45 : 0.45)));
			}
		};
		cv.addEventListener('wheel', onWheel, { passive: false });

		// A second finger cancels the gesture instead of doing anything. Native listeners: React's
		// multi-touch pointer events are dead on a real iPhone (ios-touch-input memory). This is what
		// stops a two-finger page gesture from firing a boule.
		const onTouchStart = (e: TouchEvent) => {
			if (e.touches.length < 2) return;
			pinchRef.current = true;
			dragRef.current = null;
			setArmed(false);
			powerRef.current = 0;
			setPower(0);
			aimDirtyRef.current = true;
		};
		const onTouchEnd = (e: TouchEvent) => { if (e.touches.length < 2) pinchRef.current = false; };
		cv.addEventListener('touchstart', onTouchStart, { passive: true });
		cv.addEventListener('touchend', onTouchEnd);
		cv.addEventListener('touchcancel', onTouchEnd);
		return () => {
			cv.removeEventListener('wheel', onWheel);
			cv.removeEventListener('touchstart', onTouchStart);
			cv.removeEventListener('touchend', onTouchEnd);
			cv.removeEventListener('touchcancel', onTouchEnd);
		};
	}, [cancelIntro, zoomBy]);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (isTypingTarget(e.target)) return;
			if (e.key === 'ArrowUp') { e.preventDefault(); tiltBy(-0.06); }
			else if (e.key === 'ArrowDown') { e.preventDefault(); tiltBy(0.06); }
			else if (e.key === 'v' || e.key === 'V') cycleView();
			else if (e.key === 'w' || e.key === 'W') { e.preventDefault(); zoomBy(ZOOM_STEP); }
			else if (e.key === 's' || e.key === 'S') { e.preventDefault(); zoomBy(-ZOOM_STEP); }
			else if (e.key === 'c' || e.key === 'C') zoomBy(-1);
		};
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [cycleView, tiltBy, zoomBy]);

	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;
		resize();
		const ro = new ResizeObserver(resize);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, [resize]);

	// The side gauges come and go with the view, so the pad's travel is re-measured with them.
	useLayoutEffect(() => {
		layoutPad();
		const wrap = wrapRef.current;
		if (!wrap) return;
		const ro = new ResizeObserver(layoutPad);
		ro.observe(wrap);
		return () => ro.disconnect();
	}, [layoutPad, padX, view]);

	useEffect(() => {
		const onFs = () => requestAnimationFrame(resize);
		document.addEventListener('fullscreenchange', onFs);
		document.addEventListener('webkitfullscreenchange', onFs);
		return () => {
			document.removeEventListener('fullscreenchange', onFs);
			document.removeEventListener('webkitfullscreenchange', onFs);
		};
	}, [resize]);

	/**
	 * My turn to throw the jack: open the top view and drop the aiming ring in the middle of the
	 * legal window. Seeding it here rather than on first touch means the screen is never empty and
	 * the mechanic shows itself. Driven off the phase, so it covers a new game, a new end and a
	 * rematch without any of them having to remember.
	 */
	useEffect(() => {
		const mine = match.phase === 'throw-jack' && match.turn === mySide && status === 'aim';
		if (!mine) {
			if (jackAimRef.current) { jackAimRef.current = null; setJackAim(null); }
			return;
		}
		if (jackAimRef.current) return;
		const c = match.circle;
		const p = { x: c.x, y: c.y + match.dir * (MIN_JACK + MAX_JACK) / 2 };
		jackAimRef.current = p;
		setJackAim(p);
		enterJackView();
	}, [enterJackView, match.circle, match.dir, match.phase, match.turn, mySide, status]);

	/* ---------- impacts ---------- */

	const onImpact = useCallback((im: Impact) => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return;
		const x = wx(im.x), z = wz(im.y);
		if (im.kind === 'ground') {
			if (im.speed < 1.2) return;
			g.fx.puff(x, im.z - BOULE_R, z, im.speed, DUST[s.t.surface.id]);
			sfx.groundHit(im.speed, s.t.surface.id);
		} else if (im.kind === 'boule') {
			g.fx.puff(x, im.z, z, im.speed * 0.6, 0xf2e6d2);
			if (im.speed > 3.5) g.fx.ring(x, im.z - BOULE_R, z, 0xffd166);
			sfx.clack(im.speed);
		} else if (im.kind === 'pebble') {
			if (im.speed < 1) return;
			g.fx.puff(x, im.z + 0.01, z, im.speed * 0.35, DUST[s.t.surface.id]);
			sfx.pebble(im.speed);
		}
	}, []);

	/* ---------- the aim preview ---------- */

	const rebuildArc = useCallback(() => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return;
		killMesh(g.arcAir); killMesh(g.arcRoll);
		g.arcAir = g.arcRoll = null;
		g.marker.visible = false;
		const m = matchRef.current;
		if (statusRef.current !== 'aim' || m.turn !== mySideRef.current || viewRef.current !== 'jeu'
			|| powerRef.current < 0.06) return;

		const asJack = m.phase === 'throw-jack';
		const h = aimHeading();
		const v = throwVelocity(h.x, h.y, speedOf(powerRef.current), aimLoft());
		const from = m.circle;
		const pred = predictThrow(s, from, v, (c) =>
			place(c.t, asJack ? makeJack(from.x, from.y) : makeBoule(from.x, from.y, m.turn)));

		const tint = pred.blocked ? 0xff6b6b : 0x8ce99a;
		arcPtsRef.current = pred.air;
		g.arcAir = arcMesh(pred.air, tint, 0.022);
		if (g.arcAir) g.scene.add(g.arcAir);
		g.arcRoll = arcMesh(pred.roll, 0xfff3bf, 0.016);
		if (g.arcRoll) g.scene.add(g.arcRoll);
		if (pred.land) {
			g.marker.position.copy(pred.land);
			g.marker.position.y += 0.012;
			(g.marker.material as THREE.MeshBasicMaterial).color.setHex(tint);
			g.marker.visible = true;
		}
	}, [aimHeading, aimLoft]);

	/* ---------- where the action is ---------- */

	/**
	 * Zoom out to the head, hold, come back — as a player would look before throwing. Only a timer:
	 * the existing zoom easing does the whole move, so this never touches the pitch or the yaw and
	 * the throw is identical before and after. Skipped in the daily, where the chrono is the tiebreak.
	 */
	const maybeIntro = useCallback((now: number) => {
		const m = matchRef.current, s = simRef.current;
		if (dailyRef.current || !s) return;
		// The review is armed on the settle that hands the turn over, one step before this runs.
		// It goes to the same place, so restarting it here would only cut it short.
		if (introRef.current) return;
		if (statusRef.current !== 'aim' || m.turn !== mySideRef.current) return;
		if (viewRef.current !== 'jeu' || m.phase !== 'play') return;
		if (!s.bs.some((b) => b.live)) return; // nothing to go and look at yet
		if (dist2(m.circle, headFocus()) < INTRO_STOP) return;
		zoomRef.current = INTRO_ZOOM;
		setZoom(INTRO_ZOOM);
		introRef.current = { stage: 'out', until: now + INTRO_OUT * 1000, hold: INTRO_HOLD * 1000, back: INTRO_BACK * 1000 };
	}, [headFocus]);

	/* ---------- per-frame ---------- */

	const tick = useCallback((now: number, dt: number) => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s || !g.pitch) return;

		// Physics, fixed step. The guard keeps a stalled tab from simulating minutes in one frame.
		if (statusRef.current === 'rolling') {
			accRef.current += dt * 1000;
			let guard = 0;
			while (accRef.current >= STEP && guard++ < 8) {
				accRef.current -= STEP;
				const bs = s.bs, pp = prevRef.current;
				for (let i = 0; i < bs.length; i++) { pp[i].x = bs[i].x; pp[i].y = bs[i].y; pp[i].z = bs[i].z; }
				const imps = impactsRef.current;
				imps.length = 0;
				stepSim(s, STEP / 1000, imps);
				for (const im of imps) onImpact(im);
				rollTimeRef.current += STEP / 1000;
				if (isSettled(bs) || rollTimeRef.current > ROLL_CAP) {
					accRef.current = 0;
					onSettled();
					break;
				}
			}
			alphaRef.current = statusRef.current === 'rolling' ? accRef.current / STEP : 1;
		} else {
			alphaRef.current = 1;
		}

		// Read the match AFTER the step, never before. A boule that settles in this very frame hands
		// the turn over inside onSettled, and a stale `turn` here armed the AI on the player's turn —
		// which is how the AI came to replay while it held the point and to throw a fourth boule.
		const m = matchRef.current;

		// A new turn re-centres both, on the head rather than on the lane axis. This used to live in
		// aimStart, but zeroing the yaw on every press would swing the view out from under the
		// player mid-gesture.
		const key = `${m.endNo}:${m.turn}:${m.phase}:${m.left[0]}${m.left[1]}`;
		if (key !== turnKeyRef.current) {
			turnKeyRef.current = key;
			camYawRef.current = yawToHead();
			aimYawRef.current = Math.max(-YAW_MAX, Math.min(YAW_MAX, camYawRef.current));
			aimDirtyRef.current = true;
			maybeIntro(now);
		}
		const intro = introRef.current;
		if (intro && now >= intro.until) {
			if (intro.stage === 'out') introRef.current = { ...intro, stage: 'hold', until: now + intro.hold };
			else if (intro.stage === 'hold') {
				introRef.current = { ...intro, stage: 'back', until: now + intro.back };
				zoomRef.current = 0;
				setZoom(0);
			} else introRef.current = null;
		}

		// The AI takes a beat before playing, otherwise its throw reads as a glitch. Online, seat 1
		// is a person: waking the AI here would play their boule for them.
		if (!onlineRef.current
			&& (statusRef.current === 'aim' || statusRef.current === 'placing') && m.turn === AI && !aiPendingRef.current) {
			aiPendingRef.current = true;
			// Never mid-review: the AI throwing while the eye is still up the lane looking at the last
			// boule reads as a boule appearing out of nowhere.
			aiAtRef.current = Math.max(now + AI_THINK_MS, reviewUntilRef.current);
		}
		if (aiPendingRef.current && now >= aiAtRef.current) {
			aiPendingRef.current = false;
			aiAct();
		}
		if (statusRef.current === 'end' && now >= endAtRef.current) nextEnd();

		// While the pad is held the sway moves the throw every frame, so the preview must follow it:
		// the moving arc and landing marker are how the player times the release.
		if (aimDirtyRef.current || (swayRef.current && powerRef.current >= 0.06)) { aimDirtyRef.current = false; rebuildArc(); }

		/* --- meshes --- */
		const a = alphaRef.current;
		for (let i = 0; i < s.bs.length; i++) {
			const b = s.bs[i], mesh = g.meshes[i], p = prevRef.current[i];
			if (!mesh) continue;
			mesh.visible = b.live;
			const bx = p && a < 1 ? p.x + (b.x - p.x) * a : b.x;
			const by = p && a < 1 ? p.y + (b.y - p.y) * a : b.y;
			const bz = p && a < 1 ? p.z + (b.z - p.z) * a : b.z;
			mesh.position.set(wx(bx), bz, wz(by));
			const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
			if (sp > 0.25) {
				SPIN.set(b.vy, 0, -b.vx).normalize();
				mesh.rotateOnWorldAxis(SPIN, (sp * dt) / b.r);
			}
			/* The contact shadow follows the ground point, not the body: a boule in the air keeps its
			   mark under where it will land, which is the only cue the eye has for the height of a
			   lob. Hidden once it is a metre up, where a mark that size stops meaning anything. */
			const shade = g.shades[i];
			if (shade) {
				const air = bz - heightAt(s.t, bx, by) - b.r;
				shade.visible = b.live && air < 1.0;
				if (shade.visible) {
					layFlat(shade, s.t, bx, by);
					const f = 1 - Math.max(0, air) * 0.85;
					(shade.material as THREE.MeshBasicMaterial).opacity = 0.5 * f;
					shade.scale.setScalar(b.r * 2.1 * (1 + Math.max(0, air) * 0.5));
				}
			}

			const halo = g.halos[i];
			if (!halo) continue;
			halo.visible = b.live;
			if (!b.live) continue;
			halo.position.set(wx(bx), heightAt(s.t, bx, by) + 0.008, wz(by));
			// Grows with camera distance AND with the field, so the ring keeps its apparent size.
			// The floor is a world size though, so it has to be un-divided by the field or a zoomed
			// ring shrinks to exactly the boule radius and disappears into its silhouette.
			const rr = haloRadius(halo.position.distanceTo(g.camera.position), g.camera.fov,
				HALO_PER_M, haloFloorFor(HALO_MIN_R, g.camera.fov));
			halo.scale.set(rr, 1, rr);
		}

		// The circle and the legal window are sampled on the terrain, so they are rebuilt when the
		// circle moves — once an end — and never touched per frame.
		if (!g.laidAt || g.laidAt.x !== m.circle.x || g.laidAt.y !== m.circle.y) layGround();
		g.rings.visible = m.phase === 'throw-jack' || m.phase === 'place-jack';

		// Where the jack is being aimed. Sampled on the terrain like every other ground ring — a flat
		// one sinks under the relief — so it is rebuilt when the target moves, never per frame.
		const ja = jackAimRef.current;
		g.jackAim.visible = ja !== null;
		if (ja && (!g.jackAimAt || g.jackAimAt.x !== ja.x || g.jackAimAt.y !== ja.y)) {
			killGroup(g.jackAim);
			g.jackAim.add(groundRing(s.t, ja.x, ja.y, JACK_AIM_R, HALO[2], 0.02));
			g.jackAim.add(groundRing(s.t, ja.x, ja.y, JACK_AIM_R * 0.4, HALO[2], 0.02));
			g.jackAimAt = { x: ja.x, y: ja.y };
		}

		/* One ring per boule, centred on the jack. Hidden while anything moves: a ring is a measurement,
		   and a measurement of a rolling boule is a lie. Keyed on the resting positions rather than
		   rebuilt per frame — each ring is sampled on the relief, which is 48 to 96 segments of tube. */
		const jk = jackRef.current;
		/* Kept up through 'end' on purpose, and not gated on the phase: `finishEnd` has already
		   flipped it to 'throw-jack' by then, and that is the exact moment the player is counting. */
		const showDists = distsRef.current && !dailyRef.current && !!jk && jk.live
			&& (statusRef.current === 'end' || (statusRef.current === 'aim' && m.phase === 'play'));
		g.dists.visible = showDists;
		if (!showDists) {
			g.distsKey = '';
		} else if (jk) {
			let key = `${jk.x.toFixed(3)},${jk.y.toFixed(3)}`;
			for (const b of s.bs) if (b.live && b !== jk) key += `|${b.x.toFixed(3)},${b.y.toFixed(3)}`;
			if (key !== g.distsKey) {
				g.distsKey = key;
				killGroup(g.dists);
				for (const b of s.bs) {
					if (!b.live || b === jk || (b.side !== 0 && b.side !== 1)) continue;
					g.dists.add(groundRing(s.t, jk.x, jk.y, dist2(b, jk), HALO[b.side], DIST_TUBE, DIST_ALPHA));
				}
			}
		}

		// The opponent drawing back. Built once per message, not per frame, and dropped when the
		// stream dries up — a frozen ray would read as an aim they are still holding.
		const ra = remoteAimRef.current;
		const showRay = ra !== null && ra.live && now - ra.seen < AIM_STALE_MS && statusRef.current !== 'rolling';
		if (!showRay) {
			if (g.ray.visible) { killGroup(g.ray); g.ray.visible = false; g.rayAt = 0; }
		} else if (ra && g.rayAt !== ra.seen) {
			g.rayAt = ra.seen;
			killGroup(g.ray);
			const v = speedOf(ra.power);
			const reach = Math.min(PITCH_L - 1, (v * v * Math.sin(2 * ra.loft)) / G);
			g.ray.add(aimRay(s.t, m.circle.x, m.circle.y,
				Math.sin(ra.yaw) * m.dir, Math.cos(ra.yaw) * m.dir, reach, HALO[1]));
			g.ray.visible = true;
		}

		// While the human places the jack by hand, the jack itself is the marker.
		if (statusRef.current === 'placing' && placeRef.current && jackRef.current) {
			const p = placeRef.current, i = s.bs.indexOf(jackRef.current);
			const jm = g.meshes[i], jh = g.halos[i], js = g.shades[i], gy = heightAt(s.t, p.x, p.y);
			if (jm) { jm.visible = true; jm.position.set(wx(p.x), gy + jackRef.current.r, wz(p.y)); }
			if (jh) { jh.visible = true; jh.position.set(wx(p.x), gy + 0.008, wz(p.y)); }
			if (js) { js.visible = true; layFlat(js, s.t, p.x, p.y); }
		}

		g.fx.update(dt);

		/* --- camera: zoom, then focus, then field, then pose --- */
		const view = viewRef.current;
		const ground = heightAt(s.t, m.circle.x, m.circle.y);

		// The zoom is eased first because the field is read off it. Under a thumb on the slider the
		// slow ease reads as latency, so the drag gets a shorter one.
		const ztau = zoomDragRef.current ? ZOOM_DRAG_TAU : ZOOM_TAU;
		zoomViewRef.current += (zoomRef.current - zoomViewRef.current) * (1 - Math.exp(-dt / ztau));
		const z = zoomViewRef.current;

		// The field comes before the pose: topCamera solves its height from the fov.
		const baseFov = verticalFov(VIEW_HFOV[view], g.camera.aspect);
		/* ZOOM_VFOV is a chosen stop, so it does NOT go through verticalFov — clamping it to
		   VFOV_MIN would cap the zoom at 1.9x on a phone, which is where it is needed most. */
		const wantFov = view === 'jeu' ? baseFov + (ZOOM_VFOV - baseFov) * z : baseFov;
		fovRef.current = fovRef.current === 0 ? wantFov
			: fovRef.current + (wantFov - fovRef.current) * (1 - Math.exp(-dt / Math.min(FOV_TAU, ztau)));
		if (Math.abs(g.camera.fov - fovRef.current) > 1e-3) {
			g.camera.fov = fovRef.current;
			g.camera.updateProjectionMatrix();
		}

		if (view === 'dessus') {
			// Anchored on the CIRCLE, never on the jack. While the jack is placed by hand it is still
			// live wherever the illegal throw left it, so following it dragged the eye off the pitch
			// and left the legal window behind the camera.
			const jackPhase = m.phase === 'throw-jack' || m.phase === 'place-jack';
			const far = jackPhase ? MAX_JACK : Math.max(MIN_JACK, dist2(m.circle, headFocus()));
			const fr = laneFrame(m.circle, m.dir, far);
			topCamera(g.camera, fr.focus, m.dir, fr.along, PITCH_W + 1, ground);
		} else if (view === 'tete') {
			// Its own yaw and pitch: inspecting the boules must never move the throw.
			const hf = headFocus();
			headCamera(g.camera, hf, headYawRef.current, headPitchRef.current, headDistRef.current,
				heightAt(s.t, hf.x, hf.y), headPanRef.current);
		} else {
			const rolling = statusRef.current === 'rolling';
			const wantPitch = rolling ? Math.max(camPitchRef.current, ROLL_PITCH) : camPitchRef.current;
			viewPitchRef.current += (wantPitch - viewPitchRef.current) * (1 - Math.exp(-dt / PITCH_TAU));
			/* The feet walk towards the HEAD, not along the camera heading: a yaw at its limit is 24
			   degrees off, which is 3.3 m of lateral miss at 8 m, and the end of travel would not be
			   ZOOM_DIST any more — the whole readability number rests on that distance being exact. */
			const hf = headFocus();
			const reach = dist2(m.circle, hf);
			const walkM = Math.min(WALK_MAX, zoomWalk(reach, z));
			const axis = reach > 1e-3
				? { x: (hf.x - m.circle.x) / reach, y: (hf.y - m.circle.y) / reach }
				: undefined;
			aimCamera(g.camera, m.circle, m.dir, viewPitchRef.current, camYawRef.current, CAM_DIST, ground,
				walkM, true, axis, EYE_H + (ZOOM_EYE - EYE_H) * z, shoulderRef.current);
			const h = camHeading();
			const live = rolling ? s.bs.find((b) => b.live && Math.sqrt(b.vx * b.vx + b.vy * b.vy) > 0.05) : undefined;
			const focus = live ?? (statusRef.current === 'placing' ? placeRef.current : null);
			const want = wantLook.current;
			if (focus) {
				want.set(wx(focus.x), ground + 0.1, wz(focus.y));
			} else if (z > 0.02) {
				// Zoomed in, the head IS the subject: look straight at it, or a yawed eye would frame
				// the ground beside it.
				want.set(wx(hf.x), heightAt(s.t, hf.x, hf.y) + 0.1, wz(hf.y));
			} else {
				/* Look at the HEAD, not at the ground in front of the circle. Staring 2.2 m out put the
				   boules — 6 to 10 m away — as a few pixels at the top of the frame, which is what made
				   the situation unreadable. Never behind the eye: always at least LOOK_MIN past it.
				   The pitch is folded in as a HEIGHT on that target, not as a shorter distance: solving
				   the distance from the pitch drags the target back to 2.6 m at mid-tilt and brings the
				   bug straight back. A grazing eye looks up — which is the lob. */
				const j = jackRef.current;
				const far = Math.max(walkM + LOOK_MIN, j && j.live ? dist2(m.circle, j) : LOOK_FAR);
				const rise = far * Math.tan(LOOK_TILT_K * (PITCH_NEUTRAL - viewPitchRef.current));
				want.set(wx(m.circle.x) + h.x * far, ground + 0.15 + rise, wz(m.circle.y) + h.y * far);
			}
			if (lookRef.current.lengthSq() === 0) lookRef.current.copy(want);
			lookRef.current.lerp(want, 1 - Math.exp(-dt / LOOK_TAU));
			g.camera.lookAt(lookRef.current);

			/* What the zoom is worth, for the slider label. A ratio of two apparent sizes, so it is
			   the number the player actually sees change. Pushed to state only when the tenth moves:
			   a setState every frame restarts the rAF loop and freezes the physics. */
			const ex = g.camera.position.x - wx(hf.x);
			const ey = g.camera.position.y - (ground + BOULE_R);
			const ez = g.camera.position.z - wz(hf.y);
			const eye = Math.sqrt(ex * ex + ey * ey + ez * ez);
			const base = Math.sqrt(reach * reach + (EYE_H - BOULE_R) ** 2);
			magRef.current = (base / Math.max(0.3, eye))
				* (Math.tan((baseFov * Math.PI) / 360) / Math.tan((fovRef.current * Math.PI) / 360));
			if (Math.abs(magRef.current - magShownRef.current) >= 0.1) {
				magShownRef.current = magRef.current;
				setMag(magRef.current);
			}
		}
	}, [aiAct, camHeading, headFocus, layGround, maybeIntro, nextEnd, onImpact, onSettled, rebuildArc, yawToHead]);

	const tickRef = useRef(tick);
	tickRef.current = tick;

	useEffect(() => {
		let raf = 0;
		let last = 0;
		const frame = (now: number): void => {
			raf = requestAnimationFrame(frame);
			const g = g3Ref.current;
			if (!g) return;
			const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
			last = now;
			tickRef.current(now, dt);
			g.renderer.render(g.scene, g.camera);
		};
		raf = requestAnimationFrame(frame);
		return () => cancelAnimationFrame(raf);
	}, []);

	/* Landing. A free pitch goes up at once so the canvas is never blank, then the ladder takes
	   over on the level the player is actually on. A ?defi deep link is ModeToggle's job. */
	useEffect(() => {
		const params = new URLSearchParams(location.search);
		if (params.has('defi') || params.get('mode') === 'defi' || params.get('mode') === 'daily') return;
		newGame('moyen');
		void lv.resume().then((next) => { if (next != null) startLevel(next); });
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	/* The daily chrono is the leaderboard tiebreak, so it must not bill time spent away. */
	const ticking = daily && !dailyDone && !dailyLoading;
	usePlayClock(startRef, ticking, daily ? gameId : null);
	useEffect(() => {
		if (!ticking) return;
		const id = setInterval(() => setElapsed(Math.round((Date.now() - startRef.current) / 10)), 200);
		return () => clearInterval(id);
	}, [ticking]);

	useEffect(() => () => {
		const g = g3Ref.current;
		if (!g) return;
		g.fx.dispose();
		g.lights.dispose();
		g.pitch?.dispose();
		g.renderer.dispose();
		g3Ref.current = null;
	}, []);

	/** Where each live body lands on the canvas, and how big it is there, in CSS pixels. */
	const screenSizes = useCallback(() => {
		const g = g3Ref.current, s = simRef.current;
		if (!g || !s) return [];
		const el = g.renderer.domElement;
		const w = el.clientWidth, h = el.clientHeight;
		const perM = (far: number): number => h / (2 * far * Math.tan((g.camera.fov * Math.PI) / 360));
		const p = new THREE.Vector3();
		return s.bs.map((b, i) => {
			const mesh = g.meshes[i];
			if (!b.live || !mesh) return null;
			const far = (g.halos[i] ?? mesh).position.distanceTo(g.camera.position);
			const k = perM(far);
			p.copy(mesh.position).project(g.camera);
			return {
				side: b.side,
				m: Math.round(far * 10) / 10,
				body: Math.round(b.r * 2 * k),
				halo: Math.round(haloRadius(far, g.camera.fov, HALO_PER_M, haloFloorFor(HALO_MIN_R, g.camera.fov)) * 2 * k),
				px: Math.round(((p.x + 1) / 2) * w),
				py: Math.round(((1 - p.y) / 2) * h),
			};
		}).filter(Boolean);
	}, []);

	/**
	 * The previewed arc in CSS pixels, minus its first metre and a half. Those points sit inside the
	 * player's own hand: at a grazing camera they fall thirty degrees below the axis, off the frame,
	 * and they swamped both numbers below — one read 5947 px of bow. The flight is the question.
	 */
	const arcScreen = useCallback((): { x: number; y: number; on: boolean; behind: boolean }[] => {
		const g = g3Ref.current;
		if (!g) return [];
		const el = g.renderer.domElement, w = el.clientWidth, h = el.clientHeight;
		const v = new THREE.Vector3();
		const out: { x: number; y: number; on: boolean; behind: boolean }[] = [];
		for (const p of arcPtsRef.current) {
			if (p.distanceTo(g.camera.position) < ARC_NEAR) continue;
			v.copy(p).project(g.camera);
			// Past the far plane or behind the eye, x and y are mirrored garbage. Kept apart, or the
			// edge tally blames a side the arc never crossed.
			const behind = v.z > 1;
			out.push({
				x: ((v.x + 1) / 2) * w,
				y: ((1 - v.y) / 2) * h,
				on: Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && !behind,
				behind,
			});
		}
		return out;
	}, []);

	/**
	 * How far the aim arc bows off a straight line on screen, in CSS pixels. The camera used to sit
	 * exactly on the throw line, which puts the whole parabola in a plane through the eye — so it
	 * projected to a dead straight segment and the loft, the mechanic the game is built on, was
	 * invisible. This is the number that guards it.
	 */
	const arcBow = useCallback((): number => {
		const flat = arcScreen();
		if (flat.length < 3) return 0;
		const a = flat[0], b = flat[flat.length - 1];
		const dx = b.x - a.x, dy = b.y - a.y;
		const len = Math.sqrt(dx * dx + dy * dy);
		if (len < 1) return 0;
		let max = 0;
		for (const p of flat) max = Math.max(max, Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len);
		return Math.round(max);
	}, [arcScreen]);

	/** Share of the previewed arc that actually projects inside the frame. A tighter field can crop
	 *  the apex of a lob, and `bow` alone would not see it. */
	const arcOnScreen = useCallback((): number => {
		const flat = arcScreen();
		if (!flat.length) return 1;
		return Math.round((flat.filter((p) => p.on).length / flat.length) * 100) / 100;
	}, [arcScreen]);

	/** Bug 7 as a number: with the top view up, is the whole legal jack window on screen? */
	const topFrames = useCallback((): { circle: boolean; near: boolean; far: boolean } | null => {
		const g = g3Ref.current;
		if (!g || viewRef.current !== 'dessus') return null;
		const c = matchRef.current.circle, dir = matchRef.current.dir;
		const v = new THREE.Vector3();
		const on = (x: number, y: number): boolean => {
			v.set(wx(x), 0, wz(y)).project(g.camera);
			return Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z <= 1;
		};
		return {
			circle: on(c.x, c.y),
			near: on(c.x, c.y + dir * MIN_JACK),
			far: on(c.x, c.y + dir * MAX_JACK),
		};
	}, []);

	/* The sun is a function of the deal's seed, and the deal with fixed bodies (Défi, station 1) is
	   the only one whose pixels repeat run to run — so an A/B across sun angles has no seed to turn.
	   This is the knob the probe turns instead: degrees in, same code path out, and it re-lays the
	   pitch so the painted decor shadows move with it. Measurement only; the game never sets it. */
	useEffect(() => {
		const w = window as unknown as { __petanqueSun?: (el: number, az: number, seed?: number, expo?: number) => void };
		w.__petanqueSun = (el, az, seed, expo) => {
			sunForceRef.current = { el: (el * Math.PI) / 180, az: (az * Math.PI) / 180, seed };
			const g = g3Ref.current, s = simRef.current;
			if (!g || !s) return;
			if (expo !== undefined) g.lights.setSkyExposure(expo);
			g.scene.remove(g.pitch.group);
			g.pitch.dispose();
			g.pitch = buildPitch3D(s.t, g.lights.setSun(s.t.seed, sunForceRef.current));
			g.scene.add(g.pitch.group);
		};
		return () => { delete (window as unknown as { __petanqueSun?: unknown }).__petanqueSun; };
	}, []);

	/* Jump to the end of the match. Measurement only: the end panel is the one piece of chrome that
	 * lives 13 points away, so a guard that has to play its way there never audits it — which is how
	 * it shipped as a modal sitting on the pitch. Sets exactly what the real finish sets. */
	useEffect(() => {
		const w = window as unknown as { __petanqueOver?: () => void };
		w.__petanqueOver = () => {
			const m = matchRef.current, me = mySideRef.current;
			const scores: [number, number] = [0, 0];
			scores[me] = m.target;
			scores[other(me)] = Math.max(0, m.target - 2);
			const done: Match13 = { ...m, scores, phase: 'match-done', winner: me, lastEvent: null };
			matchRef.current = done;
			setMatch(done);
			const s = simRef.current, j = jackRef.current;
			setCard({ text: 'Fin', mine: true, rows: s && j ? bouleTable(s.bs, j) : [] });
			statusRef.current = 'over';
			setStatus('over');
			setOver(true);
		};
		return () => { delete (window as unknown as { __petanqueOver?: unknown }).__petanqueOver; };
	}, []);

	// Read-only snapshot for the smoke check.
	useEffect(() => {
		const w = window as unknown as { __petanque?: () => unknown };
		w.__petanque = () => ({
			status: statusRef.current,
			match: matchRef.current,
			bodies: simRef.current?.bs.length ?? 0,
			sway: swayRef.current ? { ...swayNow(), amp: swayRef.current.amp } : null,
			// What the GROUND holds, which is not the same question as the rules' `left`. The bug that
			// let the AI throw a fourth boule billed it to the other side, so `left` stayed plausible
			// while the ground did not. Also what the multiplayer guard compares between two peers.
			bs: (simRef.current?.bs ?? []).map((b) => ({ x: b.x, y: b.y, z: b.z, side: b.side, live: b.live })),
			jack: jackRef.current ? { x: jackRef.current.x, y: jackRef.current.y, live: jackRef.current.live } : null,
			power: powerRef.current,
			loft: aimLoftRef.current,
			/* Which sun this deal drew, and where it lands on screen. A shadow measurement that does not
			   name the sun is not repeatable — and `ndc` answers the question a flare depends on:
			   is the sun ever actually in frame, or does the azimuth rule keep it off every view? */
			sun: ((): { el: number; az: number; ndc: [number, number] | null } | null => {
				const g = g3Ref.current;
				const s = g?.lights.current();
				if (!g || !s) return null;
				const v = s.dir.clone().multiplyScalar(500).add(g.camera.position).project(g.camera);
				const front = s.dir.clone().applyQuaternion(g.camera.quaternion.clone().invert()).z < 0;
				return {
					el: Math.round((s.el * 180) / Math.PI),
					az: Math.round((s.az * 180) / Math.PI),
					ndc: front ? [Math.round(v.x * 100) / 100, Math.round(v.y * 100) / 100] : null,
				};
			})(),
			/* The camera and the aim side by side — the only way to ask "is the aim sampled?"
			   instead of judging it by eye. `frozen` is the board being held. */
			aim: {
				yaw: aimYawRef.current,
				loft: aimLoftRef.current,
				board: boardForElevation(aimLoftRef.current),
				frozen: dragRef.current?.mode === 'arm',
			},
			/* `eye` is in PITCH metres, not world units, so a guard can ask which side of the head the
			   camera stands on without redoing the wx/wz offset. A yaw alone cannot answer that: flip
			   it by pi and the boules are still all in frame, perfectly framed from the wrong end. */
			cam: (() => {
				const p = g3Ref.current?.camera.position;
				return {
					yaw: camYawRef.current, pitch: camPitchRef.current,
					eye: p ? { x: p.x + PITCH_W / 2, y: p.z + PITCH_L / 2, h: p.y } : null,
				};
			})(),
			// The head view orbits on its own angles, so the game view's pitch says nothing about it.
			head: { yaw: headYawRef.current, pitch: headPitchRef.current, dist: headDistRef.current },
			// The jack target, so "the tap moved it and it stayed legal" is a number, not a screenshot.
			jackAim: jackAimRef.current ? { ...jackAimRef.current } : null,
			view: viewRef.current,
			zoom: Math.round(zoomRef.current * 1000) / 1000,
			zoomView: Math.round(zoomViewRef.current * 1000) / 1000,
			mag: Math.round(magRef.current * 100) / 100,
			fov: Math.round((g3Ref.current?.camera.fov ?? 0) * 10) / 10,
			// The launch pad's real box in canvas-relative px, plus its centre, and what the drag is
			// doing. The centre is reported rather than left to be derived: guards used to read
			// `(top + height) / 2`, where `height` was the CANVAS height — right only while the pad
			// ran to the bottom edge across the full width, which it no longer does.
			// `pad` is the dead margin at each end, so a guard can aim a press at a known loft.
			arm: (() => {
				const cv = canvasRef.current, el = armElRef.current;
				if (!cv || !el) return null;
				const r = cv.getBoundingClientRect(), b = el.getBoundingClientRect();
				return {
					left: Math.round(b.left - r.left), top: Math.round(b.top - r.top),
					width: Math.round(b.width), height: Math.round(b.height),
					cx: Math.round(b.left - r.left + b.width / 2), cy: Math.round(b.top - r.top + b.height / 2),
					pad: BOARD_PAD_PX, mode: dragRef.current?.mode ?? null,
					x: padXRef.current[padOrient()], range: { ...padRangeRef.current }, shoulder: shoulderRef.current,
				};
			})(),
			intro: introRef.current ? introRef.current.stage : null,
			// The distance rings, from the SCENE and not from the toggle: "the button is on" and
			// "there are six rings on the ground" are two different claims.
			dists: {
				on: distsRef.current,
				visible: g3Ref.current?.dists.visible ?? false,
				rings: g3Ref.current?.dists.children.length ?? 0,
			},
			fx: g3Ref.current?.fx.stats() ?? null,
			// Sound is driven by the same impacts as the FX, so `played` rising is the only proof it
			// fired; a muted run must leave it flat. The smoke test reads exactly this.
			sound: sfx.stats(),
			// Everything the daily needs is derived from dailyRef, never from state: this effect
			// runs once, so any state it closed over would be the mount value forever.
			daily: dailyRef.current ? {
				surface: dailyRef.current.course.surface,
				station: Math.min(dailyRef.current.grades.length, STATIONS - 1),
				points: sumGrades(dailyRef.current.grades),
				grades: [...dailyRef.current.grades],
				done: dailyRef.current.grades.length >= STATIONS,
			} : null,
			// Screen size of each body and of its halo — a boule 10 m out is a couple of pixels,
			// so this is the only honest way to ask whether the board is readable.
			seen: screenSizes(),
			bow: arcBow(),
			arcOnScreen: arcOnScreen(),
			/* The arc and its ground track (the lane it flies over, at landing height) in canvas px, so a
			   guard can ask what the pulling hand covers. */
			...((): { arcPx: number[][]; lanePx: number[][] } => {
				const g = g3Ref.current, pts = arcPtsRef.current;
				if (!g || !pts.length) return { arcPx: [], lanePx: [] };
				const el = g.renderer.domElement, w = el.clientWidth, h = el.clientHeight;
				const floor = pts[pts.length - 1].y, v = new THREE.Vector3();
				const px = (p: THREE.Vector3, y: number): number[] | null => {
					v.set(p.x, y, p.z).project(g.camera);
					const x = (v.x + 1) * 0.5 * w, sy = (1 - v.y) * 0.5 * h;
					return v.z < 1 && x >= 0 && x <= w && sy >= 0 && sy <= h ? [Math.round(x), Math.round(sy)] : null;
				};
				return {
					arcPx: pts.map((p) => px(p, p.y)).filter((p): p is number[] => !!p),
					lanePx: pts.map((p) => px(p, floor)).filter((p): p is number[] => !!p),
				};
			})(),
			// How many points the two numbers above were judged on, and which edge loses the rest:
			// "the arc is cropped" is five different bugs and they have five different fixes.
			arc: (() => {
				const cv = canvasRef.current, pts = arcScreen();
				const w = cv?.clientWidth ?? 0;
				const off = { left: 0, right: 0, up: 0, down: 0, behind: 0 };
				const at = [];
				for (let i = 0; i < pts.length; i++) {
					const p = pts[i];
					if (p.on) continue;
					if (p.behind) off.behind++;
					else if (p.x < 0) off.left++; else if (p.x > w) off.right++;
					else if (p.y < 0) off.up++; else off.down++;
					at.push(Math.round((i / (pts.length - 1)) * 100)); // where along the flight, in %
				}
				return { n: pts.length, ...off, at };
			})(),
			topFrames: topFrames(),
			online: onlineRef.current ? { side: mySideRef.current, host: netRef.current?.isHost() ?? false } : null,
			// The opponent drawing back, and whether their ray is actually on screen. Two questions:
			// the message can land and the ray still not be built.
			oppAim: remoteAimRef.current ? { power: remoteAimRef.current.power, live: remoteAimRef.current.live } : null,
			rayVisible: g3Ref.current?.ray.visible ?? false,
			// Online, two peers agreeing on the rules means nothing if they stand on different ground.
			// The checksum walks the real heightfield rather than trusting that the same seed rebuilds it.
			terrain: terrainStamp(simRef.current?.t ?? null),
		});
		return () => { delete (window as unknown as { __petanque?: unknown }).__petanque; };
	}, [arcBow, arcOnScreen, arcScreen, screenSizes, swayNow, topFrames]);


	/* ---------- HUD ---------- */

	// Online the guest sits in seat 1, so the HUD reads every score and every boule count through
	// `mySide`. Offline it is always HUMAN, which makes this the same code in both modes.
	const foeSide = other(mySide);
	const online = mpPhase === 'playing';
	const myTurn = match.turn === mySide;
	// The board only throws in the game view, and never during the jack phase — the jack has its
	// own ring-and-button path. Anywhere else it is a drawing with a tap-to-return on it.
	const jackPhase = match.phase === 'throw-jack';
	// `over` too: the pad cannot throw once the match is done, and it was still drawing itself live
	// under the end panel — the audit only ever missed it because the view happened to be `tete`.
	const armLive = view === 'jeu' && !jackPhase && !over;
	const padStyle = padPos ? { left: `${padPos.left}px`, transform: 'none' } : undefined;
	// Which graduation lights up: the one nearest where the finger would have to land.
	const boardT = boardForElevation(loft);
	const boardBand = BOARD_MARKS.reduce((a, b) =>
		(Math.abs(b.t - boardT) < Math.abs(a.t - boardT) ? b : a)).label;
	const holder = !daily && jackRef.current && status !== 'placing' ? pointHolder(simRef.current?.bs ?? [], jackRef.current) : null;
	const course = dailyRef.current?.course ?? null;
	const st = course?.stations[station] ?? null;
	const fmtPacked = (v: number): string => formatScore(DAILY_LB.petanque.fmt, v);

	const hint = daily
		? (dailyDone ? `Parcours terminé · ${points} / ${MAX_DAILY_SCORE}`
			: status === 'rolling' ? 'La boule roule…'
			: st ? `${KIND_LABEL[st.kind]} à ${st.dist} m — tire !`
			: 'Préparation du défi…')
		: status === 'placing'
		? (myTurn ? '✋ Touche le sol dans l’anneau jaune' : 'L’adversaire place le bouchon…')
		: status === 'rolling' ? 'La boule roule…'
		: !myTurn ? (online ? 'L’adversaire joue…' : 'L’adversaire réfléchit…')
		: match.phase === 'throw-jack' ? '🎯 Touche le sol pour viser'
		: '▲ Pose le doigt sur la planche, puis remonte';

	/* The one line above the board — the board itself now carries no text at all, because its centre
	   is where the thumb lands. A finger down gets the gesture, everything else gets the state. The
	   old "tu as le point" branches went with it: the scoreboard already prints 🎯 next to the
	   holder, and a second copy eight words away was the whole bottom-of-screen pile-up. */
	const armMsg = view !== 'jeu' ? '👁 Touche la planche pour revenir en vue Jeu'
		: armed ? (power > 0 ? '◀ ▶ oriente · lâche pour lancer' : '✖ Lâche ici et rien ne part — remonte pour armer')
		: hint;

	return (
		<div className="pe-root">
			<style>{CSS}</style>

			<div className="pe-topbar">
				<div className="pe-hud-top">
					<div className="pe-modetoggle">
						<ModeToggle
							daily={daily}
							onFree={() => { if (lv.active) lv.exit(); resetOnline(); newGame(diff); }}
							onDaily={() => { lv.exit(); resetOnline(); void startDaily(); }}
							showLevels
							levelsActive={lv.active}
							onLevels={() => { setDaily(false); dailyRef.current = null; resetOnline(); lv.enter(); }}
							showOnline={multiplayerAvailable()}
							onlineActive={mpPhase !== 'off'}
							onOnline={enterOnline}
						/>
					</div>
					<div className="pe-stats">
						{daily ? (
							<>
								<span className="pe-stat">🎯 Atelier {Math.min(station + 1, STATIONS)}/{STATIONS}</span>
								<span className="pe-stat">🏆 {points} / {MAX_DAILY_SCORE}</span>
								<span className="pe-stat">⏱ <span className="chrono">{fmtCentis(elapsed)}</span></span>
							</>
						) : (
							lv.active && !lv.menu && <span className="pe-stat">🎯 Niveau {lv.level}</span>
						)}
					</div>
					<div className="pe-hud-actions">
						{!daily && !lv.active && mpPhase === 'off' && withExpert(DIFF_ORDER, gameId).map((k) => (
							<button key={k} className={`pe-pill ${diff === k ? 'active' : ''}`} onClick={() => newGame(k as DiffKey)} title="Force de l’adversaire et terrain">{DIFFS[k as DiffKey].label}</button>
						))}
						{/* `pe-act`, not `pe-view`: the camera guards count the view segments and assert
						    there are exactly three of them. */}
						{!daily && !lv.active && mpPhase === 'off' && (
							<button className={`pe-act ${groundOpen ? 'on' : ''}`} aria-pressed={groundOpen}
								onClick={() => setGroundOpen((v) => !v)}
								aria-label="Choisir le terrain" title="Choisir le terrain">🏟</button>
						)}
						{!daily && (
							<button className={`pe-act ${dists ? 'on' : ''}`} aria-pressed={dists}
								onClick={() => { distsRef.current = !dists; setDists(!dists); }}
								aria-label="Cercles de distance au bouchon" title="Cercles de distance au bouchon">◎</button>
						)}
						{mpPhase !== 'off' ? (
							<button className="pe-act" onClick={leaveOnline} aria-label="Quitter la partie en ligne" title="Quitter la partie en ligne">🚪</button>
						) : !daily && (
							<button className="pe-act" onClick={() => { if (lv.active) startLevel(lv.level); else newGame(diff); }} aria-label="Recommencer" title="Recommencer">↻</button>
						)}
						<button className={`pe-act ${sound ? 'on' : ''}`} aria-pressed={sound}
							onClick={() => { const on = !sound; sfx.setEnabled(on); setSound(on); }}
							aria-label={sound ? 'Couper le son' : 'Activer le son'} title={sound ? 'Couper le son' : 'Activer le son'}>{sound ? '🔊' : '🔇'}</button>
					</div>
				</div>
				{daily ? (
					<div className="pe-tag">
						{dailyLoading ? 'Préparation du défi…' : `Défi du jour · ${dailyWeekdayLabel()} · ${course ? SURFACES[course.surface].label : ''}`}
					</div>
				) : (
					/* The TV board: who plays, how many boules each side has left, and the score.
					   Boules are coloured by SIDE, never a hardcoded green and red — online the guest
					   sits in seat 1, so its own rings are the red ones. */
					<div className="pe-board">
						<div className={`pe-side ${myTurn && status !== 'rolling' ? 'on' : ''}`}>
							<span className="pe-side-name">😎 Toi</span>
							<span className="pe-dots" style={{ color: hex(HALO[mySide]) }}>
								{'●'.repeat(match.left[mySide])}{'○'.repeat(BOULES_PER_SIDE - match.left[mySide])}
							</span>
							<span className="pe-pt">{holder === mySide ? '🎯' : ''}</span>
						</div>
						<div className="pe-board-mid">
							<span className="pe-board-score">{match.scores[mySide]} — {match.scores[foeSide]}</span>
							<span className="pe-board-end">Mène {match.endNo}</span>
						</div>
						<div className={`pe-side foe ${!myTurn && status !== 'rolling' ? 'on' : ''}`}>
							<span className="pe-pt">{holder === foeSide ? '🎯' : ''}</span>
							<span className="pe-dots" style={{ color: hex(HALO[foeSide]) }}>
								{'●'.repeat(match.left[foeSide])}{'○'.repeat(BOULES_PER_SIDE - match.left[foeSide])}
							</span>
							<span className="pe-side-name">
								{online ? `🧑 ${mpOpp ?? 'Adversaire'}` : `🤖 ${lv.active ? `IA ${Math.round(levelSkillRef.current * 100)}%` : DIFFS[diff].label}`}
							</span>
						</div>
					</div>
				)}
				{/* Its own row, never inside pe-hud-actions: that one goes fixed bottom-right in
				    fullscreen, where it would sit on the throwing strip and on the Quitter button. */}
				<div className="pe-views" role="tablist" aria-label="Vue de la caméra">
					{VIEW_ORDER.map((k) => (
						<button key={k} role="tab" aria-selected={view === k} className={`pe-view ${view === k ? 'on' : ''}`}
							onClick={() => setViewKey(k)} title={`${VIEWS[k].label} (V)`}>
							{VIEWS[k].icon} <span className="pe-view-txt">{VIEWS[k].label}</span>
						</button>
					))}
				</div>
				{!daily && match.lastEvent && status !== 'end' && <div className="pe-tag">{match.lastEvent}</div>}
			</div>

			<div className="pe-playwrap" ref={wrapRef}>
				{/* Niveaux has its own outcome beat (LevelOutcome), so the confetti must not double up. */}
				{celebrating && !lv.active && <Celebration />}
				<canvas ref={canvasRef} className="pe-canvas" onPointerDown={onPointerDown} onContextMenu={(e) => e.preventDefault()} />

				{webglError && (
					<div className="pe-overlay"><div className="pe-card">Ton appareil ne peut pas afficher le terrain 3D (WebGL indisponible).</div></div>
				)}

				{/* The loft gauge — a readout of the board, which is where the angle is actually set.
				    The launch-board mechanic is invented here, so nothing on screen may leave it
				    implicit; this gauge and the graduations below are the tutorial. */}
				{view === 'jeu' && (
					<div className={`pe-loft${armed ? ' frozen' : ''}`}>
						<span className="pe-loft-label">{LOFT_LABEL(loft)}</span>
						<div className="pe-loft-bar"><div className="pe-loft-fill" style={{ height: `${Math.round(boardForElevation(loft) * 100)}%` }} /></div>
						<span className="pe-loft-hint">{armed ? 'angle verrouillé' : 'plus bas = plus lobé'}</span>
					</div>
				)}

				{/* Zoom in on the head. Loft lives on the left, the zoom on the right, so the two are
				    never confused — zooming must not read as a throw change. The label is the
				    magnification, because that is the thing the player is actually after. */}
				{view === 'jeu' && (
					<div className="pe-zoom">
						<button className="pe-zoom-btn" onClick={() => zoomBy(ZOOM_STEP)} disabled={zoom >= 1} aria-label="Zoomer sur les boules" title="Zoomer (W, molette)">＋</button>
						<div
							ref={zoomTrackRef}
							className="pe-zoom-bar"
							role="slider"
							tabIndex={0}
							aria-label="Zoom sur les boules"
							aria-valuemin={0}
							aria-valuemax={100}
							aria-valuenow={Math.round(zoom * 100)}
							aria-valuetext={`grossissement ${mag.toFixed(1)} fois`}
							onPointerDown={onZoomDown}
							onKeyDown={onZoomKey}
						>
							<div className="pe-zoom-fill" style={{ height: `${Math.round(zoom * 100)}%` }} />
							<div className="pe-zoom-thumb" style={{ bottom: `calc(${Math.round(zoom * 100)}% - 7px)` }} />
						</div>
						<button className="pe-zoom-btn" onClick={() => zoomBy(-ZOOM_STEP)} disabled={zoom <= 0} aria-label="Dézoomer" title="Dézoomer (S, molette)">－</button>
						<span className="pe-zoom-label">🔍 ×{mag.toFixed(1)}</span>
					</div>
				)}

				{/* The launch board. Purely a drawing: the hit test lives in aimStart, so there is
				    exactly one way into a throw and this cannot swallow a camera drag. It pulses until
				    the first contact of the session — the whole complaint was that nobody found it. */}
				<div ref={armElRef} className={`pe-arm ${armLive ? '' : 'off'}${armLive && callArm && myTurn && status === 'aim' && power === 0 ? ' call' : ''}${armed && power === 0 ? ' hold' : ''}`} style={padStyle} aria-hidden="true">
					<div className="pe-arm-fill" style={{ height: `${Math.round(power * 100)}%` }} />
					{/* The graduations. Where the finger lands decides the angle, and a board with no
					    marks on it would make that a secret. */}
					{armLive && view === 'jeu' && !jackPhase && (
						<div className="pe-board-marks">
							{BOARD_MARKS.map((mk) => (
								<span
									key={mk.label}
									className={`pe-board-mark${mk.label === boardBand ? ' on' : ''}`}
									style={{ top: `calc(${BOARD_PAD_PX}px + ${mk.t} * (100% - ${BOARD_PAD_PX * 2}px))` }}
								>
									{mk.label}
								</span>
							))}
						</div>
					)}
				</div>

				<div className="pe-power" style={padStyle} aria-hidden="true">
					<div className="pe-power-fill" style={{ width: `${Math.round(power * 100)}%` }} />
				</div>

				<span
					className={`pe-arm-label${armed && power === 0 ? ' warn' : ''}`}
					style={padPos ? { left: `calc(${PAD_EDGE}px + (100% - ${PAD_EDGE * 2}px) * ${padPos.label})`, transform: `translateX(${-padPos.label * 100}%)` } : undefined}
				>{armMsg}</span>

				{/* Slides the pad along the bottom edge. Beside it, on the side facing the pitch, and gone
				    while the pad is held or a verdict owns the band. */}
				{padPos && armLive && !armed && !card && (
					<div
						className={`pe-arm-grip${padGrip === 'call' ? ' call' : ''}${padGrip === 'held' ? ' held' : ''}`}
						style={{ left: `${padPos.grip}px` }}
						onPointerDown={onGripDown}
						onKeyDown={onGripKey}
						tabIndex={0}
						role="slider"
						aria-label="Déplacer la planche de tir"
						aria-valuemin={0}
						aria-valuemax={100}
						aria-valuenow={Math.round(padX[padOrient()] * 100)}
						title="Glisse pour déplacer la planche"
					>⋮⋮</div>
				)}

				{status === 'placing' && myTurn && placeOk && (
					<button className="pe-placeok" onClick={confirmPlace}>✓ Poser ici</button>
				)}

				{status === 'aim' && myTurn && match.phase === 'throw-jack' && jackAim && (
					<button className="pe-placeok" onClick={throwJackAt}>🎯 Lancer le bouchon ici</button>
				)}

				{card && !over && (
					<div className="pe-overlay pe-aside pe-aside-review">
						<div className={`pe-card pe-endcard ${card.mine ? 'mine' : ''}`} onClick={nextEnd}>
							<span>{card.text}</span>
							{card.rows.length > 0 && <BouleTable rows={card.rows} mySide={mySide} />}
						</div>
					</div>
				)}

				{over && daily && (
					<div className="pe-overlay pe-aside">
						<div className="pe-card pe-endpanel">
							🎯 Parcours terminé
							<strong>{points} / {MAX_DAILY_SCORE} · {fmtCentis(elapsed)}</strong>
							<span className="pe-grades">{dailyRef.current?.grades.map((g, i) => (
								<span key={i} className={`pe-grade g${g}`}>{g}</span>
							))}</span>
						</div>
					</div>
				)}

				{over && !daily && !lv.active && (
					<div className="pe-overlay pe-aside">
						<div className="pe-card pe-endpanel">
							{match.winner === mySide ? '🏆 Tu gagnes la partie !' : '❌ L’adversaire gagne'}
							<strong>{match.scores[mySide]} — {match.scores[foeSide]}</strong>
							{/* The last end's table: the boule that ended the match is the one people argue about. */}
							{card && card.rows.length > 0 && <BouleTable rows={card.rows} mySide={mySide} />}
							{online
								? <button className="pe-replay" onClick={leaveOnline}>Quitter</button>
								: <button className="pe-replay" onClick={() => newGame(diff)}>Nouvelle partie</button>}
						</div>
					</div>
				)}

				{/* Lobby. Shown over a playable Libre pitch, so backing out leaves a real game. */}
				{(mpPhase === 'menu' || mpPhase === 'connecting' || mpPhase === 'waiting') && (
					<div className="pe-overlay">
						<div className="pe-card pe-mp">
							{mpPhase === 'menu' ? (
								<>
									<div className="pe-mp-title">Jouer en ligne</div>
									<button className="pe-replay" onClick={mpQuickMatch}>⚡ Partie rapide</button>
									<button className="pe-replay" onClick={mpCreateCode}>🔑 Créer un code ami</button>
									<div className="pe-mp-join">
										<input value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().slice(0, 4))} maxLength={4} placeholder="CODE" aria-label="Code ami" />
										<button className="pe-replay" onClick={mpJoinCode}>Rejoindre</button>
									</div>
									{mpMsg && <span className="pe-mp-msg">{mpMsg}</span>}
									<button className="pe-act" onClick={leaveOnline}>Retour</button>
								</>
							) : (
								<>
									<div className="pe-mp-title">{mpPhase === 'connecting' ? 'Connexion…' : 'En attente d’un joueur…'}</div>
									{mpCode && <div className="pe-mp-code">Code : <strong>{mpCode}</strong></div>}
									{mpMsg && <span className="pe-mp-msg">{mpMsg}</span>}
									<button className="pe-act" onClick={leaveOnline}>Annuler</button>
								</>
							)}
						</div>
					</div>
				)}

				{/* The ground picker, free play only. Every row re-deals, so the change is felt at
				    once instead of waiting for a partie nobody wants to finish first. */}
				{groundOpen && (
					<div className="pe-overlay">
						<div className="pe-card pe-ground">
							<div className="pe-mp-title">Le terrain</div>
							<div className="pe-ground-row">
								<span className="pe-ground-lab">Surface</span>
								<div className="pe-ground-opts">
									<button className={`pe-pill ${ground.surface === 'auto' ? 'active' : ''}`} onClick={() => chooseGround({ surface: 'auto' })}>Au hasard</button>
									{SURFACE_IDS.map((s) => (
										<button key={s} className={`pe-pill ${ground.surface === s ? 'active' : ''}`}
											title={SURFACE_HINT[s]} onClick={() => chooseGround({ surface: s })}>{SURFACES[s].label}</button>
									))}
								</div>
							</div>
							<div className="pe-ground-row">
								<span className="pe-ground-lab">Relief</span>
								<div className="pe-ground-opts">
									<button className={`pe-pill ${ground.relief === 'auto' ? 'active' : ''}`} onClick={() => chooseGround({ relief: 'auto' })}>Au hasard</button>
									{RELIEF_ORDER.map((r) => (
										<button key={r} className={`pe-pill ${ground.relief === r ? 'active' : ''}`}
											title={RELIEFS[r].hint} onClick={() => chooseGround({ relief: r })}>{RELIEFS[r].label}</button>
									))}
								</div>
							</div>
							<span className="pe-ground-hint">
								{ground.surface === 'auto' ? 'Surface suivant la difficulté' : SURFACE_HINT[ground.surface]}
								{' · '}
								{ground.relief === 'auto' ? 'relief suivant la difficulté' : RELIEFS[ground.relief].hint}
							</span>
							<button className="pe-replay" onClick={() => setGroundOpen(false)}>Jouer</button>
						</div>
					</div>
				)}

				{lv.active && lv.menu && (
					<div className="pe-overlay pe-levels">
						<LevelSelect progress={lv.progress} onPick={startLevel} />
					</div>
				)}

				{lv.done && (
					<LevelOutcome
						level={lv.level}
						lastLevel={petanqueLevels.count}
						won={lv.won}
						stars={lv.stars}
						detail={lv.won ? `Gagné ${match.scores[HUMAN]} — ${match.scores[AI]}` : `Battu ${match.scores[HUMAN]} — ${match.scores[AI]}`}
						onNext={() => startLevel(lv.level + 1)}
						onReplay={() => startLevel(lv.level)}
						onMenu={lv.backToMenu}
					/>
				)}
			</div>

			{daily && <Leaderboard
				key={`lb-${points}-${dailyDone ? 1 : 0}`}
				game={LB_ID(gameId)}
				metric="time"
				submitValue={dailyDone && dailyScore != null ? dailyScore : undefined}
				format={fmtPacked}
			/>}

			{!daily && !lv.active && (
				<LeaderboardCorner game={LB_ID(gameId)} metric="time" format={fmtPacked} side="right" />
			)}

			<p className="pe-help">
				Partout sur l’image, tu <strong>tournes la caméra librement</strong> — elle ne touche jamais au tir.
				Le <strong>pavé en bas au centre</strong>, c’est ta <strong>planche d’envol</strong> : la hauteur à laquelle tu
				poses le doigt choisit l’angle — <strong>tout en bas = plomb</strong>, tout en haut = roulette au ras du sol — et
				la graduation te dit où tu en es.
				Glisse vers le haut pour la puissance, sur le côté pour corriger la direction, relâche pour lancer.
				Le curseur 🔍 (ou la molette) t’<strong>avance sur les boules</strong> pour les voir de près, sans jamais toucher au tir.
				Le <strong>bouchon se vise</strong> : vu de dessus, touche le terrain pour poser le cercle, puis lance-le dessus.
				{daily
					? ` Défi du jour : ${STATIONS} ateliers, une boule chacun. Carreau = 5 pts, cible sortie = 3, touchée en place = 1. Le chrono départage les ex æquo.`
					: <> Bouchon entre 6 et 10 m, sinon c’est à l’adversaire de le poser. Celui qui n’a pas le point rejoue. Premier à {match.target}.</>}
			</p>
		</div>
	);
}

/** Identity of the ground, for the multiplayer guard. Strided so it costs nothing per snapshot. */
function terrainStamp(t: Terrain | null): { seed: number; surface: SurfaceId; amp: number; pebbles: number; sum: number } | null {
	if (!t) return null;
	let sum = 0;
	for (let i = 0; i < t.hs.length; i += 97) sum += t.hs[i];
	return { seed: t.seed, surface: t.surface.id, amp: t.amp, pebbles: t.pebbles.length, sum: Math.round(sum * 1e6) / 1e6 };
}

const SPIN = new THREE.Vector3();

const CSS = `
.pe-root {
  --pe-accent: var(--accent-regular);
  width: 100%; max-width: 620px; margin-inline: auto; color: var(--gray-0);
  font-family: var(--font-body); display: flex; flex-direction: column; align-items: center;
  position: relative;
}

/* The launch pad's box, named once. Everything that must sit CLEAR of the pad keys off these, because
   anything keyed off the viewport bottom instead walks into the graduations as soon as a safe-area
   inset appears — a percentage in a bottom offset resolves against this same box, so the two uses
   give the same pixels.
   The height is a FIXED 150 px, not a share of the canvas: a thumb needs a band it can find, and at
   90 px a press landed 25 px off and crossed two graduations.
   The clamp is a floor, not a preference. On the WINDOWED page the canvas is 16/10 of the column —
   390x213 on a phone — where 45 % is 96 px, under that measured floor. So the floor wins and the pad
   takes 29 % of that canvas: a canvas that short has no room to be both readable and small, and the
   old full-width band took 52 % of it. Fullscreen, which is where the game is played, gets the 150.
   Centred here only until layoutPad measures it: the player slides it along the edge with its grip.
   No backticks anywhere in this block: it is a template literal, and one closes the string. */
.pe-playwrap { --pe-arm-h: clamp(110px, 45%, 150px); --pe-arm-w: min(220px, calc(100% - 24px)); --pe-arm-b: 16px; width: 100%; aspect-ratio: 16 / 10; position: relative; overflow: hidden; border-radius: 14px; box-shadow: var(--shadow-lg); }
.pe-canvas { display: block; width: 100%; height: 100%; touch-action: none; cursor: crosshair; background: #7fb4dd; }

/* Fullscreen means the PITCH is fullscreen: the HUD floats over it and costs no pixel of ground. */
.game-page.gf-full:has(.pe-root) { padding: 0; }
.game-page.gf-full .pe-root { max-width: none; width: 100%; height: 100%; }
.game-page.gf-full .pe-help { display: none; }
.game-page.gf-full .pe-playwrap { flex: 1; aspect-ratio: auto; border-radius: 0; box-shadow: none; }
.game-page.gf-full .pe-topbar {
  position: absolute; inset: 0 0 auto 0; margin: 0; z-index: 3; gap: 6px; pointer-events: none;
  padding: max(6px, env(safe-area-inset-top)) max(8px, env(safe-area-inset-right)) 0 max(8px, env(safe-area-inset-left));
}
.game-page.gf-full .pe-topbar > * { pointer-events: none; }
.game-page.gf-full .pe-hud-top > * { pointer-events: auto; }
/* Billard hides the mode tabs in fullscreen, but billard is not opened in fullscreen: here the page
   starts there, so hiding them would make Niveaux, Défi and En ligne unreachable without quitting
   first — and nothing on screen would say so. Kept, but out of the middle.

   The mode tabs and the camera views used to stack UNDER the scoreboard, three bands of chrome down
   the centre of the pitch — which is where the boules go. They are two edge columns instead: left is
   what you play, right is what you look at, and the centre keeps the score alone. Both hang off the
   Quitter button, whose height the fullscreen shell measures because the label is translated. */
.game-page.gf-full .pe-hud-top,
.game-page.gf-full .pe-views {
  position: absolute; z-index: 4;
  top: calc(max(12px, env(safe-area-inset-top)) + var(--gf-exit-h, 36px) + 8px);
}
.game-page.gf-full .pe-hud-top {
  left: max(8px, env(safe-area-inset-left));
  width: 124px; flex-direction: column; align-items: stretch; gap: 6px;
}
.game-page.gf-full .pe-views { right: max(8px, env(safe-area-inset-right)); flex-direction: column; border-radius: 16px; }
.game-page.gf-full .pe-view { text-align: left; }
.game-page.gf-full .pe-modetoggle { width: 100%; }
.game-page.gf-full .pe-modetoggle .dt-toggle { margin: 0; flex-direction: column; flex-wrap: nowrap; border-radius: 16px; padding: 3px; gap: 3px; }
.game-page.gf-full .pe-modetoggle .dt-seg { flex: none; font-size: 12px; padding: 7px 9px; text-align: left; }
/* Below ~560px the two side gauges sit close enough to the top that a full-height column walks into
   them — loft on the left, zoom on the right, both centred on a screen that is barely taller than
   they are. Short screens keep the wide blocks, still parked in their corner: centre clear either way. */
@media (max-height: 560px) {
  .game-page.gf-full .pe-hud-top { width: auto; max-width: 46vw; flex-direction: row; align-items: flex-start; }
  .game-page.gf-full .pe-modetoggle { width: 188px; }
  .game-page.gf-full .pe-modetoggle .dt-toggle { flex-direction: row; flex-wrap: wrap; }
  .game-page.gf-full .pe-modetoggle .dt-seg { flex: 1 1 calc(50% - 3px); padding: 6px 4px; text-align: center; }
  .game-page.gf-full .pe-views { flex-direction: row; border-radius: 999px; }
}
/* Here the tabs sit on the sky, not on the page background, so they wear the HUD's own skin — the
   same dark glass as .pe-stat — instead of a white slab that reads as a hole cut in the scene. */
.game-page.gf-full .pe-modetoggle .dt-toggle { background: rgba(28,20,12,0.62); border-color: rgba(255,255,255,0.16); box-shadow: none; backdrop-filter: blur(4px); }
.game-page.gf-full .pe-modetoggle .dt-seg:not(.active) { color: #e6dbcd; }
.game-page.gf-full .pe-board { order: -1; margin-top: 0; }
/* The Quitter button is fixed to the top-right corner at the top of the z stack, so anything under
   it is unreadable AND untappable. Past 680px — the 460px board plus a button's width each side —
   the centred board never reaches it; below that it spans the screen, so it yields the corner.
   The width is measured by GameFullscreen; 0 if we are not the ones in fullscreen. */
@media (max-width: 680px) {
  .game-page.gf-full .pe-board {
    max-width: calc(100% - var(--gf-exit-w, 0px) - 8px);
    margin-right: calc(var(--gf-exit-w, 0px) + 8px);
  }
}
/* Only pe-hud-top children get their pointer events back above, so the views row needs its own
   rule — without it the segments are dead in fullscreen, on the platform that needs them most. */
.game-page.gf-full .pe-views { pointer-events: auto; }
/* Clears the launch pad instead of sitting in the bottom corner. The pad is 220 px wide and centred,
   so the corner is pitch again — but the button would still stand over it, and the pad is the only
   way to throw. In fullscreen the stage is the viewport, so this repeats the pad's own box in vh;
   the two copies are kept honest by the actions-over-board check in scripts/snap-petanque-phone.mjs.
   The 40px is the seam stack — power bar then state line — that lives just above the pad. */
.game-page.gf-full .pe-hud-actions {
  position: fixed; z-index: 4; max-width: 45vw;
  right: max(8px, env(safe-area-inset-right));
  bottom: calc(max(10px, env(safe-area-inset-bottom)) + clamp(110px, 45vh, 150px) + 16px + 40px);
}
.game-page.gf-full .pe-stat { font-size: 12px; padding: 4px 10px; }
.game-page.gf-full .pe-act, .game-page.gf-full .pe-pill { font-size: 12px; padding: 4px 10px; }

.pe-topbar { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 8px; margin-bottom: 10px; }
.pe-hud-top { width: 100%; display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; flex-wrap: wrap; pointer-events: none; }
.pe-hud-top > * { pointer-events: auto; }
.pe-hud-actions { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
.pe-modetoggle { display: block; }
.pe-grades { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 4px; }
.pe-grade { width: 22px; height: 22px; border-radius: 6px; display: grid; place-items: center; font-size: 12px; font-weight: 800; background: rgba(255,255,255,0.12); color: #f4ece2; }
.pe-grade.g5 { background: #30d158; color: #06240f; }
.pe-grade.g3 { background: #ffc107; color: #3a2a00; }
.pe-grade.g1 { background: #7a6a55; }
.pe-grade.g0 { background: rgba(255,95,86,0.35); }

.pe-stats { display: flex; gap: 6px; font-weight: 700; font-size: 13px; flex-wrap: wrap; }
.pe-stat { background: rgba(28,20,12,0.6); color: #f4ece2; border-radius: 999px; padding: 5px 11px; backdrop-filter: blur(4px); box-shadow: 0 1px 3px rgba(0,0,0,0.35); font-variant-numeric: tabular-nums; }
.pe-boules { display: flex; gap: 8px; letter-spacing: 1px; }
.pe-dots.me { color: #dfe6f0; }
.pe-dots.foe { color: #d0916a; }

.pe-pill { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(28,20,12,0.55); color: #f0e6da; font: inherit; font-weight: 600; font-size: 13px; border-radius: 999px; padding: 6px 12px; cursor: pointer; backdrop-filter: blur(4px); }
.pe-pill.active { background: var(--pe-accent); color: var(--accent-text-over); border-color: var(--pe-accent); }
.pe-act { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(28,20,12,0.55); color: #f0e6da; font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 6px 12px; min-width: 36px; cursor: pointer; backdrop-filter: blur(4px); }
.pe-act:hover { border-color: var(--pe-accent); color: #fff; }
.pe-act.on { border-color: var(--pe-accent); background: rgba(231,150,60,0.34); color: #fff; }

/* The TV board. The active side is marked three times — ring, pulsing dot, and the hint at the
   bottom — because on a phone any one of them alone is missable. */
.pe-board { width: 100%; max-width: 460px; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 6px; background: rgba(28,20,12,0.62); border: 1.5px solid rgba(255,255,255,0.14); border-radius: 14px; padding: 5px 9px; backdrop-filter: blur(4px); pointer-events: none; }
.pe-side { display: flex; align-items: center; gap: 6px; min-width: 0; border: 1.5px solid transparent; border-radius: 999px; padding: 2px 7px; }
.pe-side.foe { justify-content: flex-end; }
.pe-side.on { border-color: var(--pe-accent); background: color-mix(in srgb, var(--pe-accent) 22%, transparent); }
.pe-side.on .pe-side-name::after { content: '●'; margin-left: 5px; font-size: 9px; color: var(--pe-accent); animation: pe-beat 1.1s ease-in-out infinite; }
@keyframes pe-beat { 0%, 100% { opacity: 0.25; } 50% { opacity: 1; } }
.pe-side-name { color: #f0e6da; font-weight: 700; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pe-dots { letter-spacing: 1px; font-size: 13px; line-height: 1; text-shadow: 0 1px 2px rgba(0,0,0,0.6); }
.pe-pt { font-size: 11px; width: 13px; text-align: center; }
.pe-board-mid { display: flex; flex-direction: column; align-items: center; line-height: 1.1; }
.pe-board-score { color: #fff; font-weight: 800; font-size: 17px; font-variant-numeric: tabular-nums; }
.pe-board-end { color: #d8cbb8; font-size: 10px; font-weight: 700; opacity: 0.85; }

.pe-views { display: flex; gap: 2px; background: rgba(28,20,12,0.6); border: 1.5px solid rgba(255,255,255,0.22); border-radius: 999px; padding: 2px; backdrop-filter: blur(4px); }
.pe-view { border: none; background: transparent; color: #e8ddcf; font: inherit; font-weight: 700; font-size: 12px; border-radius: 999px; padding: 4px 11px; cursor: pointer; white-space: nowrap; }
.pe-view.on { background: var(--pe-accent); color: var(--accent-text-over); }
@media (max-width: 420px) { .pe-view-txt { display: none; } }
.pe-tag { background: rgba(28,20,12,0.6); color: #f0e6da; font-size: 12.5px; font-weight: 500; padding: 5px 14px; border-radius: 999px; backdrop-filter: blur(4px); pointer-events: none; text-align: center; max-width: 96%; }

/* Vertical gauge on the left edge: the angle the board is currently offering, named. */
.pe-loft { position: absolute; left: 10px; top: 50%; transform: translateY(-50%); z-index: 3; display: flex; flex-direction: column; align-items: center; gap: 5px; pointer-events: none; }
.pe-loft-label { background: rgba(28,20,12,0.62); color: #ffe8b0; font-weight: 800; font-size: 11.5px; padding: 3px 9px; border-radius: 999px; backdrop-filter: blur(4px); white-space: nowrap; }
/* Fills DOWNWARD: it is a readout of the pad, and on the pad a plomb is the bottom. A gauge that
   filled up for a lob would teach the opposite of the gesture. */
.pe-loft-bar { width: 9px; height: 96px; border-radius: 999px; background: rgba(28,20,12,0.5); border: 1.5px solid rgba(255,255,255,0.28); display: flex; flex-direction: column; justify-content: flex-start; overflow: hidden; }
.pe-loft-fill { width: 100%; background: linear-gradient(180deg, #ffd166, #f4801f); transition: height 0.08s linear; }
.pe-loft-hint { color: #f0e6da; font-size: 10px; opacity: 0.8; text-shadow: 0 1px 2px rgba(0,0,0,0.6); white-space: nowrap; }
/* Held board: the angle is committed. A solid ring says "this is the value that leaves". */
.pe-loft.frozen .pe-loft-bar { border-color: #ffd166; border-width: 2.5px; box-shadow: 0 0 10px rgba(255,209,102,0.55); }
.pe-loft.frozen .pe-loft-label { background: rgba(255,209,102,0.92); color: #2b1d0c; }
.pe-loft.frozen .pe-loft-hint { color: #ffd166; opacity: 1; }

/* Mirror of the loft gauge on the right edge — the eye, not the arm. */
.pe-zoom { position: absolute; right: 10px; top: 50%; transform: translateY(-50%); z-index: 4; display: flex; flex-direction: column; align-items: center; gap: 5px; }
.pe-zoom-btn { border: 1.5px solid rgba(255,255,255,0.28); background: rgba(28,20,12,0.55); color: #f0e6da; font: inherit; font-weight: 700; font-size: 13px; line-height: 1; border-radius: 999px; width: 30px; height: 26px; cursor: pointer; backdrop-filter: blur(4px); }
.pe-zoom-btn:hover:not(:disabled) { border-color: var(--pe-accent); color: #fff; }
.pe-zoom-btn:disabled { opacity: 0.35; cursor: default; }
/* A thumb-sized target, not a hairline: touching anywhere on the track jumps straight to that
   value, so the width IS the affordance. The ＋－ stay as the accessible fallback. */
.pe-zoom-bar { position: relative; width: 28px; height: 120px; border-radius: 999px; background: rgba(28,20,12,0.5); border: 1.5px solid rgba(255,255,255,0.28); display: flex; flex-direction: column; justify-content: flex-end; cursor: ns-resize; touch-action: none; }
.pe-zoom-bar:focus-visible { outline: 2px solid var(--pe-accent); outline-offset: 2px; }
.pe-zoom-fill { width: 100%; border-radius: 999px; background: linear-gradient(180deg, #8ce99a, #30d158); transition: height 0.12s linear; }
.pe-zoom-thumb { position: absolute; left: 50%; width: 22px; height: 14px; margin-left: -11px; border-radius: 999px; background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.5); transition: bottom 0.12s linear; pointer-events: none; }
.pe-zoom-label { color: #f0e6da; font-size: 11px; font-weight: 700; opacity: 0.9; text-shadow: 0 1px 2px rgba(0,0,0,0.6); white-space: nowrap; }

/* The launch pad. Drawing only — aimStart owns the hit test, so there is one path into a throw and
   this can never swallow a camera drag.
   It has to READ as a control. A 30 %-opacity dotted rule did not: players never found it. Solid
   accent edge all the way round, a dashed echo under the seam, and a darker floor.
   It used to be a full-width band eating 30 % of the canvas, almost all of it empty. Now it is a
   fixed pad on the bottom edge, centred: everything left and right of it went back to being pitch,
   and the drag there is the camera again. Centred and not in the dead middle of the screen, because
   the hand would then cover the very lane it is aiming down. */
.pe-arm { position: absolute; left: 50%; transform: translateX(-50%); bottom: var(--pe-arm-b); width: var(--pe-arm-w); height: var(--pe-arm-h); z-index: 2; pointer-events: none; border: 2px solid rgba(255,209,102,0.85); border-radius: 14px; overflow: hidden; background: linear-gradient(180deg, rgba(20,14,9,0.12) 0%, rgba(20,14,9,0.5) 100%); }
.pe-arm::before { content: ''; position: absolute; left: 0; right: 0; top: 4px; border-top: 1.5px dashed rgba(255,209,102,0.45); }
.pe-arm.off { border-color: rgba(255,255,255,0.3); background: linear-gradient(180deg, rgba(20,14,9,0.08) 0%, rgba(20,14,9,0.26) 100%); }
.pe-arm.off::before { border-top-color: rgba(255,255,255,0.16); }
.pe-arm.call { animation: pe-arm-call 2.2s ease-in-out infinite; }
@keyframes pe-arm-call { 0%, 100% { border-color: rgba(255,209,102,0.85); } 50% { border-color: rgba(255,209,102,0.25); } }
@media (prefers-reduced-motion: reduce) { .pe-arm.call { animation: none; } }
.pe-arm-fill { position: absolute; left: 0; right: 0; bottom: 0; background: linear-gradient(180deg, rgba(140,233,154,0.10), rgba(255,107,107,0.30)); }
/* The one line above the board. It sits OUTSIDE the board on purpose: the board is a surface the
   thumb lands on, and its middle is the part the thumb lands on most. This was two elements printed
   one above the other down there, which is how the bottom of the screen ended up with four rows of
   text in 80 px. Ellipsised rather than wrapped — a second line would push into the seam. */
.pe-arm-label { position: absolute; left: 50%; transform: translateX(-50%); bottom: calc(var(--pe-arm-b) + var(--pe-arm-h) + 11px); z-index: 3; background: rgba(28,20,12,0.6); color: #f4ece2; font-weight: 600; font-size: 12.5px; padding: 4px 13px; border-radius: 999px; backdrop-filter: blur(4px); pointer-events: none; white-space: nowrap; max-width: 92%; overflow: hidden; text-overflow: ellipsis; }
/* Finger down, nothing pulled yet: letting go here throws nothing. Said in words AND in colour,
   because the board looks identical whether it is armed or merely touched. */
.pe-arm-label.warn { background: rgba(120,34,28,0.72); color: #ffd7d2; font-weight: 700; }
/* The pad's handle, beside it on the pitch side. Pulses a few times the first time it shows. */
.pe-arm-grip { position: absolute; bottom: calc(var(--pe-arm-b) + var(--pe-arm-h) / 2 - 24px); width: 22px; height: 48px; z-index: 3; display: grid; place-items: center; border: 1.5px solid rgba(255,255,255,0.3); border-radius: 999px; background: rgba(28,20,12,0.55); color: #f0e6da; font-size: 12px; font-weight: 800; letter-spacing: -2px; cursor: ew-resize; touch-action: none; user-select: none; -webkit-user-select: none; backdrop-filter: blur(4px); }
.pe-arm-grip:focus-visible { outline: 2px solid var(--pe-accent); outline-offset: 2px; }
.pe-arm-grip.held { border-color: #ffd166; color: #ffd166; }
.pe-arm-grip.call { animation: pe-arm-call 1.4s ease-in-out 3; border-color: rgba(255,209,102,0.85); }
@media (prefers-reduced-motion: reduce) { .pe-arm-grip.call { animation: none; } }

/* The graduations live INSIDE the pad now — the pad is only 220 px wide, so there is no "beside it"
   left to hug. The word sits left, the tick reaches right: the tick is what points at the height,
   the word only names it. Placed from the top and not from the bottom, because the board is upside
   down on purpose — Plomb is the bottom row and Roulette the top one. */
.pe-board-marks { position: absolute; left: 10px; right: 10px; top: 0; bottom: 0; pointer-events: none; }
.pe-board-mark { position: absolute; left: 0; right: 0; text-align: left; color: #f0e6da; font-size: 10px; font-weight: 700; letter-spacing: 0.02em; opacity: 0.62; text-shadow: 0 1px 3px rgba(0,0,0,0.85); transform: translateY(-50%); }
.pe-board-mark::after { content: ''; position: absolute; top: 50%; right: 0; width: 30px; border-top: 1.5px solid rgba(255,255,255,0.3); }
.pe-board-mark.on { color: #ffd166; opacity: 1; font-size: 11px; }
.pe-board-mark.on::after { border-top-color: rgba(255,209,102,0.85); }
/* Held with nothing pulled: the board is the cancel surface, so it says so with its own skin. */
.pe-arm.hold { border-color: rgba(255,138,128,0.85); background: linear-gradient(180deg, rgba(60,16,12,0.12) 0%, rgba(80,20,14,0.5) 100%); }
.pe-arm.hold::before { border-top-color: rgba(255,138,128,0.45); }

/* Rides the seam instead of standing inside the pad, where it printed straight over the "Roulette"
   graduation — and where the thumb that sets it covers it anyway. Same width as the pad, so it reads
   as that pad's gauge and not as a bar belonging to the whole screen. */
.pe-power { position: absolute; left: 50%; transform: translateX(-50%); width: var(--pe-arm-w); border-radius: 999px; bottom: calc(var(--pe-arm-b) + var(--pe-arm-h) + 3px); height: 4px; background: rgba(28,20,12,0.45); overflow: hidden; z-index: 3; pointer-events: none; }
.pe-power-fill { height: 100%; background: linear-gradient(90deg, #8ce99a, #ffd166 55%, #ff6b6b); }


.pe-placeok { position: absolute; left: 50%; bottom: calc(max(12px, env(safe-area-inset-bottom)) + 56px); transform: translateX(-50%); z-index: 5; border: 2px solid rgba(255,255,255,0.5); background: linear-gradient(180deg, #30d158, #1e963c); color: #fff; font: inherit; font-weight: 800; font-size: 15px; padding: 9px 22px; border-radius: 999px; cursor: pointer; box-shadow: var(--shadow-md); }
.pe-placeok:hover { filter: brightness(1.08); }

/* The end-of-end verdict. It used to sit dead centre, which was wrong twice over: it covered the
   pitch, and the pitch behind it was the NEXT end's empty lane anyway, because finishEnd moves the
   circle in the same beat it scores. It docks aside now, on the same rails as the end-of-match
   panel, and the camera holds the layout it is a verdict about. Only the tint is its own. */
.pe-endcard { font-weight: 800; font-size: 17px; cursor: pointer; }
.pe-endcard.mine { background: linear-gradient(180deg, rgba(48,209,88,0.96), rgba(24,140,60,0.96)); border-color: rgba(255,255,255,0.4); }

.pe-table { width: 100%; min-width: 14rem; font-weight: 600; font-size: 13.5px; }
.pe-table-cap { display: block; opacity: 0.72; font-size: 11.5px; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 3px; }
.pe-table ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.pe-table li { display: grid; grid-template-columns: 1em 2.6em 1fr 1em; gap: 6px; align-items: center; text-align: left; padding: 2px 6px; border-radius: 6px; background: rgba(0,0,0,0.22); }
.pe-table li.won { background: rgba(255,255,255,0.22); }
.pe-table-d { text-align: right; font-variant-numeric: tabular-nums; }
.pe-table-pt { text-align: center; color: #ffd166; }
.pe-card .pe-table li { background: color-mix(in srgb, var(--gray-0) 8%, transparent); }
.pe-card .pe-table li.won { background: color-mix(in srgb, var(--pe-accent) 26%, transparent); }

/* The cards live inside pe-playwrap, which is 16/10 and clips. On a phone that is ~240 px of room
   for a lobby that is 300 px tall, and the Rejoindre row fell off the bottom with nothing to say
   so. The overlay scrolls and the card is allowed to fill it. */
.pe-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 6; padding: 8px; overflow: auto; }
.pe-levels { align-items: flex-start; overflow-y: auto; padding: 16px 12px; background: color-mix(in srgb, var(--gray-999) 82%, transparent); }
.pe-card { background: var(--gray-999); border: 2px solid var(--pe-accent); border-radius: 16px; padding: 18px 26px; box-shadow: var(--shadow-lg); color: var(--gray-0); text-align: center; font-size: 16px; display: flex; flex-direction: column; gap: 10px; align-items: center; max-width: 100%; margin: auto; }
.pe-card strong { color: var(--pe-accent); font-size: 22px; font-variant-numeric: tabular-nums; }
.pe-replay { border: none; background: var(--pe-accent); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 24px; cursor: pointer; }

/* The result panel docks LEFT instead of taking the middle. A partie ends on the one arrangement of
   boules everybody wants to look at — whose is in, by how much, where the jack finished — and a
   centred card covered exactly that. The overlay stops taking presses so the pitch behind stays
   draggable; only the panel itself does. It starts below the mode tabs (they own the top-left) and
   is narrow enough to leave the lane readable; scripts/snap-petanque-phone.mjs counts it as a real
   part, unlike the modal cards, because now it CAN collide with something.
   pe-aside, not pe-side: .pe-side is already the TV board's two halves. The rules here are scoped by
   .pe-overlay so they would not have leaked, but any probe asking the DOM for .pe-side would. */
.pe-overlay.pe-aside { justify-content: flex-start; align-items: flex-start; pointer-events: none; padding: clamp(56px, 25vh, 216px) 8px 8px max(10px, env(safe-area-inset-left)); }
.pe-overlay.pe-aside .pe-card { pointer-events: auto; width: clamp(214px, 52vw, 380px); margin: 0; }
@media (orientation: landscape) and (max-height: 520px) {
  /* Lying down, 844x390 of HUD leaves no free rectangle: the audit's own boxes say the left column
     is tabs down to y 126 and the leaderboard pill out to x 56, and 212 px of panel does not fit in
     what is left above the launch band. So it starts just under the tabs, clears the pill, and takes
     the band — which is inert, and dead anyway once the match is over. */
  .pe-overlay.pe-aside { align-items: flex-start; padding: 132px 8px 8px max(64px, env(safe-area-inset-left)); }
  .pe-overlay.pe-aside .pe-card { width: clamp(214px, 34vw, 340px); }
}
/* Standing up, there is no side at all: the card is 214 px at its narrowest and the canvas is 390.
   Measured, the aside dock left 6 of 7 boules behind it. So the verdict takes the bottom band, which
   while it is up is as dead as the landscape band is once a match is over — the same argument, one
   axis round. The camera then fits the layout into the band above; it reads the card's real box, so
   this rule and that fit cannot drift apart.
   AFTER the .pe-aside rules, not before: same specificity, so the later one wins and writing this
   above them changed nothing at all. */
@media (orientation: portrait) {
  /* Dock to the BOTTOM band — align-items is the cross axis of the row, justify-content the main one
     (swapping the two sent the card to the right edge, 98 % across). Centre it and a full-width card
     splits the screen into two 36 % bands, neither big enough to hold the layout; pushed to the edge,
     the other side opens to ~70 %. */
  .pe-overlay.pe-aside-review { justify-content: center; align-items: flex-end; padding: 8px; }
  .pe-overlay.pe-aside-review .pe-card { width: 96%; }
  /* The bottom band is the launch furniture's — the pad, its power bar, its one-line label. All of it
     is aim-only and dead while a verdict is up, so it is hidden, not collided with: the audit skips
     display:none and so does the eye. The camera fits the layout into the band this frees above. */
  .game-page.gf-full:has(.pe-aside-review) .pe-arm,
  .game-page.gf-full:has(.pe-aside-review) .pe-power,
  .game-page.gf-full:has(.pe-aside-review) .pe-arm-label { display: none; }
  /* The action row normally clears the launch pad; while the verdict is up the card is what sits
     there instead, and it is taller. It steps over the card's MEASURED height (frameEnd publishes
     it) — a constant would be wrong at every table size but one. Not hidden: the ◎ that draws the
     distance rings is the one control you actually want while reading a verdict. */
  .game-page.gf-full:has(.pe-aside-review) .pe-hud-actions {
    bottom: calc(max(10px, env(safe-area-inset-bottom)) + var(--pe-review-h, 260px) + 12px);
  }
}

.pe-mp { min-width: min(240px, 100%); }
/* A short landing area (a phone in windowed mode is ~240 px of pitch) has to give the lobby every
   pixel it can before the overlay starts scrolling. */
@media (max-height: 460px), (max-width: 26em) {
  .pe-card { padding: 12px 16px; gap: 7px; font-size: 15px; }
  .pe-replay { padding: 8px 18px; font-size: 14px; }
  .pe-mp-title { font-size: 15.5px; }
}
.pe-ground { min-width: min(310px, 100%); }
.pe-ground-row { display: flex; align-items: baseline; gap: 8px; width: 100%; flex-wrap: wrap; }
.pe-ground-lab { font-size: 11.5px; font-weight: 700; color: var(--gray-300); text-transform: uppercase; letter-spacing: 0.04em; }
.pe-ground-opts { display: flex; flex-wrap: wrap; gap: 5px; flex: 1; justify-content: center; }
/* The pills are drawn for the HUD, where the backdrop is always dark earth; on the card they sit
   on --gray-999, which is white in the light theme. */
.pe-ground .pe-pill { background: color-mix(in srgb, var(--gray-0) 8%, transparent); color: var(--gray-100); border-color: var(--gray-700); font-size: 12.5px; padding: 5px 10px; }
.pe-ground .pe-pill.active { background: var(--pe-accent); color: var(--accent-text-over); border-color: var(--pe-accent); }
.pe-ground-hint { font-size: 12px; color: var(--gray-300); }

.pe-mp-title { font-family: var(--font-brand); font-weight: 700; font-size: 17px; }
.pe-mp-join { display: flex; gap: 6px; width: 100%; }
.pe-mp-join input { flex: 1; min-width: 0; text-align: center; letter-spacing: 3px; text-transform: uppercase; font: inherit; font-weight: 700; border-radius: 999px; border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0); padding: 8px 10px; }
.pe-mp-code { font-size: 15px; color: var(--gray-100); }
.pe-mp-code strong { font-size: 22px; letter-spacing: 4px; }
.pe-mp-msg { font-size: 13px; color: var(--gray-200); }

.pe-help { max-width: 480px; text-align: center; color: var(--gray-300); font-size: 12.5px; line-height: 1.55; margin-top: 1rem; }
`;
