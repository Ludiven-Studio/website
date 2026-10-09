import { useCallback, useEffect, useRef, useState } from 'react';
import { mulberry32 } from '../prng';
import { trackGame } from '../../lib/analytics';
import {
	SUBJECTS,
	PALETTES,
	choicesFor,
	makeTile,
	modeSeparation,
	shapeDepth,
	shuffle,
	stereogram,
	type ViewMode,
} from './stereogram';

/* =====================================================
   STÉRÉOGRAMMES — hidden 3D shapes (React island)
   Engine lives in ./stereogram (pure, tested).
   ===================================================== */

const MAX_W = 560;
const RATIO = 0.75;
const MODE_KEY = 'ludiven-stereo-mode';
const SCALE_KEY = 'ludiven-stereo-scale';

interface Card {
	subject: number;
	seed: number;
	choices: number[];
}

const readPref = (key: string): string | null => {
	try {
		return localStorage.getItem(key);
	} catch {
		return null;
	}
};
const writePref = (key: string, v: string) => {
	try {
		localStorage.setItem(key, v);
	} catch {
		/* private mode */
	}
};

/** Rasterise an emoji, fit its real ink box into the frame, and turn it into depth. */
function glyphDepth(glyph: string, w: number, h: number): Float32Array | null {
	const S = 512;
	const a = document.createElement('canvas');
	a.width = S;
	a.height = S;
	const actx = a.getContext('2d', { willReadFrequently: true });
	if (!actx) return null;
	actx.font = `${S * 0.78}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
	actx.textAlign = 'center';
	actx.textBaseline = 'middle';
	actx.fillStyle = '#000';
	actx.fillText(glyph, S / 2, S / 2);
	const src = actx.getImageData(0, 0, S, S).data;
	let x0 = S, y0 = S, x1 = -1, y1 = -1;
	for (let y = 0; y < S; y++)
		for (let x = 0; x < S; x++)
			if (src[(y * S + x) * 4 + 3] > 16) {
				if (x < x0) x0 = x;
				if (x > x1) x1 = x;
				if (y < y0) y0 = y;
				if (y > y1) y1 = y;
			}
	if (x1 < 0) return null;
	const bw = x1 - x0 + 1;
	const bh = y1 - y0 + 1;
	const fit = Math.min((w * 0.8) / bw, (h * 0.8) / bh);
	const dw = bw * fit;
	const dh = bh * fit;
	const b = document.createElement('canvas');
	b.width = w;
	b.height = h;
	const bctx = b.getContext('2d', { willReadFrequently: true });
	if (!bctx) return null;
	bctx.imageSmoothingQuality = 'high';
	bctx.drawImage(a, x0, y0, bw, bh, (w - dw) / 2, (h - dh) / 2, dw, dh);
	const px = bctx.getImageData(0, 0, w, h).data;
	const mask = new Uint8Array(w * h);
	const lum = new Float32Array(w * h);
	for (let i = 0; i < w * h; i++) {
		mask[i] = px[i * 4 + 3] > 128 ? 1 : 0;
		lum[i] = (0.2126 * px[i * 4] + 0.7152 * px[i * 4 + 1] + 0.0722 * px[i * 4 + 2]) / 255;
	}
	return shapeDepth(mask, lum, w, h, Math.min(w, h) * 0.09);
}

const newOrder = () => [0, ...shuffle(SUBJECTS.map((_, i) => i).slice(1), Math.random)];

const makeCard = (subject: number): Card => {
	const seed = Math.floor(Math.random() * 2 ** 31);
	return { subject, seed, choices: choicesFor(subject, mulberry32(seed ^ 0x5bd1e995)) };
};

export default function StereogramGame({ gameId }: { gameId: string }) {
	const [order, setOrder] = useState<number[]>(newOrder);
	const [pos, setPos] = useState(0);
	const [card, setCard] = useState<Card>(() => makeCard(0));
	const [mode, setMode] = useState<ViewMode>(() => (readPref(MODE_KEY) === 'parallel' ? 'parallel' : 'cross'));
	const [scale, setScale] = useState(() => {
		const v = Number(readPref(SCALE_KEY));
		return v >= 0.8 && v <= 1.25 ? v : 1;
	});
	const [picked, setPicked] = useState<number | null>(null); // -1 = gave up
	const [reveal, setReveal] = useState(false);
	const [score, setScore] = useState({ found: 0, seen: 0 });
	const [cssW, setCssW] = useState(0);
	const [helpOpen, setHelpOpen] = useState(false);
	const [bgSep, setBgSep] = useState(0);
	const rootRef = useRef<HTMLDivElement>(null);
	const picRef = useRef<HTMLCanvasElement>(null);
	const solRef = useRef<HTMLCanvasElement>(null);
	const depthCache = useRef(new Map<string, Float32Array | null>());
	const startedRef = useRef(false);

	useEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		let t = 0;
		const measure = () => setCssW(Math.min(MAX_W, Math.floor(el.clientWidth)));
		measure();
		const ro = new ResizeObserver(() => {
			clearTimeout(t);
			t = window.setTimeout(measure, 120);
		});
		ro.observe(el);
		return () => {
			ro.disconnect();
			clearTimeout(t);
		};
	}, []);

	useEffect(() => {
		const pic = picRef.current;
		const sol = solRef.current;
		if (!pic || !sol || cssW < 100) return;
		const dpr = Math.min(2, window.devicePixelRatio || 1);
		const w = Math.round(cssW * dpr);
		const h = Math.round(cssW * RATIO * dpr);
		const key = `${card.subject}:${w}x${h}`;
		if (!depthCache.current.has(key)) depthCache.current.set(key, glyphDepth(SUBJECTS[card.subject].glyph, w, h));
		const depth = depthCache.current.get(key) ?? new Float32Array(w * h);
		const far = Math.max(52, Math.min(96, cssW / 6.5)) * scale * dpr;
		const rng = mulberry32(card.seed);
		const tile = makeTile(Math.round(far), h, PALETTES[card.seed % PALETTES.length], rng, dpr);
		const pix = stereogram(depth, w, h, tile, { far, mode });
		for (const c of [pic, sol]) {
			c.width = w;
			c.height = h;
		}
		pic.getContext('2d')?.putImageData(new ImageData(pix, w, h), 0, 0);
		const g = new Uint8ClampedArray(w * h * 4);
		for (let i = 0; i < w * h; i++) {
			const v = 28 + depth[i] * 210;
			g[i * 4] = v;
			g[i * 4 + 1] = v;
			g[i * 4 + 2] = v * 0.9 + 25;
			g[i * 4 + 3] = 255;
		}
		sol.getContext('2d')?.putImageData(new ImageData(g, w, h), 0, 0);
		setBgSep(modeSeparation(0, far, mode) / dpr);
	}, [card, mode, scale, cssW]);

	const markStarted = useCallback(() => {
		if (startedRef.current) return;
		startedRef.current = true;
		trackGame(gameId, 'game_started');
	}, [gameId]);

	const answer = (i: number) => {
		if (picked != null) return;
		markStarted();
		setPicked(i);
		const ok = i === card.subject;
		setScore((s) => ({ found: s.found + (ok ? 1 : 0), seen: s.seen + 1 }));
		if (ok) trackGame(gameId, 'game_won');
		else setReveal(true);
	};

	const next = () => {
		let nextPos = pos + 1;
		let nextOrder = order;
		if (nextPos >= order.length) {
			nextOrder = shuffle(order, Math.random);
			setOrder(nextOrder);
			nextPos = 0;
		}
		setPos(nextPos);
		setCard(makeCard(nextOrder[nextPos]));
		setPicked(null);
		setReveal(false);
	};

	const pickMode = (m: ViewMode) => {
		setMode(m);
		writePref(MODE_KEY, m);
	};

	const subject = SUBJECTS[card.subject];
	const done = picked != null;

	return (
		<div className="ilst-root" ref={rootRef}>
			<style>{CSS}</style>

			<div className="ilst-modes" role="tablist" aria-label="Méthode">
				<button role="tab" aria-selected={mode === 'cross'} className={`ilst-pill ${mode === 'cross' ? 'on' : ''}`} onClick={() => pickMode('cross')}>
					😵‍💫 Loucher
				</button>
				<button role="tab" aria-selected={mode === 'parallel'} className={`ilst-pill ${mode === 'parallel' ? 'on' : ''}`} onClick={() => pickMode('parallel')}>
					🔭 Regard au loin
				</button>
				<button className="ilst-help-btn" aria-expanded={helpOpen} onClick={() => setHelpOpen((o) => !o)}>
					{helpOpen ? 'Masquer l’aide' : 'Comment faire ?'}
				</button>
			</div>

			{helpOpen && (
				<div className="ilst-help">
					{mode === 'cross' ? (
						<ol>
							<li>Tiens-toi à environ 40 cm de l’écran.</li>
							<li>Place un doigt à mi-chemin entre tes yeux et l’image, et fixe le bout du doigt : l’image derrière se dédouble.</li>
							<li>Avance ou recule le doigt jusqu’à voir <strong>trois points</strong> en haut au lieu de deux.</li>
							<li>Garde ce regard, retire le doigt et patiente : la forme surgit en relief.</li>
						</ol>
					) : (
						<ol>
							<li>Approche ton visage tout près de l’écran : l’image est floue, c’est normal.</li>
							<li>Regarde « à travers » l’écran, comme vers un point loin derrière.</li>
							<li>Recule très lentement sans changer de regard, jusqu’à voir <strong>trois points</strong> en haut.</li>
							<li>Patiente quelques secondes : la forme se détache du fond.</li>
						</ol>
					)}
					<p className="ilst-tip">Si la forme paraît creusée au lieu de ressortir, change de méthode avec les boutons du haut.</p>
				</div>
			)}

			<div className="ilst-frame" style={{ width: cssW || undefined }}>
				<div className="ilst-band" aria-hidden="true">
					<span className="ilst-dot" style={{ left: `calc(50% - ${bgSep / 2}px)` }} />
					<span className="ilst-dot" style={{ left: `calc(50% + ${bgSep / 2}px)` }} />
				</div>
				<div className="ilst-pic" data-art style={{ aspectRatio: `1 / ${RATIO}` }}>
					<canvas ref={picRef} className="ilst-canvas" role="img" aria-label="Stéréogramme : une forme cachée en relief" />
					<canvas ref={solRef} className={`ilst-canvas ilst-sol ${reveal ? 'on' : ''}`} aria-hidden={!reveal} />
				</div>
			</div>

			<div className="ilst-quiz">
				{!done ? (
					<>
						<p className="ilst-q">Qu’as-tu vu ?</p>
						<div className="ilst-choices">
							{card.choices.map((i) => (
								<button key={i} className="ilst-choice" onClick={() => answer(i)}>
									{SUBJECTS[i].label}
								</button>
							))}
						</div>
						<button className="ilst-link" onClick={() => { markStarted(); setPicked(-1); setReveal(true); setScore((s) => ({ ...s, seen: s.seen + 1 })); }}>
							Je ne vois rien, montre-moi
						</button>
					</>
				) : (
					<>
						<p className={`ilst-verdict ${picked === card.subject ? 'ok' : ''}`} aria-live="polite">
							{picked === card.subject
								? `🎉 Bien vu ! C’était ${subject.name}.`
								: picked === -1
									? `C’était ${subject.name}. Garde la solution en tête et réessaie de le voir en relief.`
									: `Raté : c’était ${subject.name}.`}
						</p>
						<div className="ilst-actions">
							<button className="ilst-act" onClick={() => setReveal((r) => !r)}>
								{reveal ? '🙈 Cacher la solution' : '👁 Voir la solution'}
							</button>
							<button className="ilst-next" onClick={next}>Image suivante →</button>
						</div>
					</>
				)}
			</div>

			<div className="ilst-foot">
				<span className="ilst-score">✅ {score.found} trouvée{score.found > 1 ? 's' : ''} sur {score.seen}</span>
				<label className="ilst-scale">
					<span>Écart des motifs</span>
					<input
						type="range"
						min={0.8}
						max={1.25}
						step={0.05}
						value={scale}
						onChange={(e) => {
							const v = Number(e.target.value);
							setScale(v);
							writePref(SCALE_KEY, String(v));
						}}
					/>
				</label>
			</div>
		</div>
	);
}

const CSS = `
.ilst-root {
  width: 100%;
  max-width: ${MAX_W}px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  color: var(--gray-0);
  font-family: var(--font-body);
}
.ilst-modes { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; align-items: center; }
.ilst-pill {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit;
  font-weight: 600;
  font-size: 13px;
  border-radius: 999px;
  padding: 6px 13px;
  cursor: pointer;
}
.ilst-pill.on { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }
.ilst-help-btn {
  border: none;
  background: none;
  color: var(--accent-regular);
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  padding: 6px 4px;
}
.ilst-help {
  width: 100%;
  box-sizing: border-box;
  background: var(--gray-999);
  border: 1px solid var(--gray-800);
  border-radius: 14px;
  padding: 10px 14px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--gray-200);
}
.ilst-help ol { margin: 0; padding-left: 1.2em; }
.ilst-help li + li { margin-top: 3px; }
.ilst-tip { margin: 8px 0 0; color: var(--gray-300); font-size: 12.5px; }
.ilst-frame {
  max-width: 100%;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-md);
  background: #14121c;
}
.ilst-band { position: relative; height: 30px; background: #14121c; }
.ilst-dot {
  position: absolute;
  top: 50%;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  border-radius: 50%;
  background: #fff;
}
.ilst-pic { position: relative; width: 100%; }
.ilst-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ilst-sol { opacity: 0; transition: opacity 0.35s ease; pointer-events: none; }
.ilst-sol.on { opacity: 1; }
.ilst-quiz { display: flex; flex-direction: column; align-items: center; gap: 0.6rem; width: 100%; }
.ilst-q { margin: 0; font-family: var(--font-brand); font-weight: 600; font-size: 17px; }
.ilst-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; width: 100%; max-width: 360px; }
.ilst-choice {
  border: 1.5px solid var(--gray-700);
  background: var(--gray-999);
  color: var(--gray-0);
  font: inherit;
  font-weight: 600;
  font-size: 15px;
  border-radius: 12px;
  padding: 10px 8px;
  cursor: pointer;
}
.ilst-choice:hover, .ilst-choice:focus-visible { border-color: var(--accent-regular); color: var(--accent-regular); }
.ilst-link {
  border: none;
  background: none;
  color: var(--gray-300);
  font: inherit;
  font-size: 13px;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}
.ilst-verdict { margin: 0; text-align: center; font-size: 15px; font-weight: 600; color: var(--gray-100); max-width: 420px; }
.ilst-verdict.ok { color: #2f9e6f; }
.ilst-actions { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; }
.ilst-act {
  border: 1.5px solid var(--gray-700);
  background: transparent;
  color: var(--gray-300);
  font: inherit;
  font-weight: 600;
  font-size: 13px;
  border-radius: 999px;
  padding: 8px 14px;
  cursor: pointer;
}
.ilst-next {
  border: none;
  background: var(--accent-regular);
  color: var(--accent-text-over);
  font: inherit;
  font-weight: 700;
  font-size: 14px;
  border-radius: 999px;
  padding: 9px 18px;
  cursor: pointer;
}
.ilst-foot {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem 1rem;
  width: 100%;
  max-width: ${MAX_W}px;
  font-size: 13px;
  color: var(--gray-300);
}
.ilst-score { font-weight: 600; color: var(--gray-200); }
.ilst-scale { display: inline-flex; align-items: center; gap: 8px; }
.ilst-scale input { width: 120px; accent-color: var(--accent-regular); }
`;
