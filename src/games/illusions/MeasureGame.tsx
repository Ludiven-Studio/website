import { useCallback, useRef, useState } from 'react';
import { trackGame } from '../../lib/analytics';
import {
	ORDER,
	ROUNDS,
	VIEW_W,
	VIEW_H,
	MIN_RATIO,
	MAX_RATIO,
	figure,
	errorPct,
	errorText,
	randomStart,
	meanAbsError,
	verdict,
	shuffled,
	formatPct,
	type FigureKind,
	type Shape,
} from './measure';

/* =====================================================
   L'ŒIL MESUREUR — React island
   Five size illusions: set the target to match, then see the truth.
   Geometry and scoring live in ./measure (pure, tested).
   ===================================================== */

type Phase = 'adjust' | 'reveal' | 'done';

const BEST_KEY = 'ludiven-oeil-mesureur-best';
const NUDGE = 0.005;

const readBest = (): number | null => {
	try {
		const v = parseFloat(localStorage.getItem(BEST_KEY) ?? '');
		return Number.isFinite(v) ? v : null;
	} catch {
		return null;
	}
};

const clamp = (r: number) => Math.min(MAX_RATIO, Math.max(MIN_RATIO, r));

function Figure({ kind, ratio, reveal }: { kind: FigureKind; ratio: number; reveal: boolean }) {
	const { shapes, guides } = figure(kind, ratio);
	const cls = (s: Shape) => {
		if (s.role === 'inducer') return s.type === 'circle' && s.fill ? 'ilme-ind ilme-dot' : 'ilme-ind ilme-stroke';
		if (s.role === 'guide') return 'ilme-guide';
		const base = s.type === 'circle' ? 'ilme-disc' : 'ilme-stroke';
		return `${base} ${s.role === 'target' ? 'ilme-tgt' : 'ilme-ref'}`;
	};
	const draw = (s: Shape, i: number) =>
		s.type === 'line' ? (
			<line key={i} className={cls(s)} x1={s.x1} y1={s.y1} x2={s.x2} y2={s.y2} />
		) : (
			<circle key={i} className={cls(s)} cx={s.cx} cy={s.cy} r={s.r} />
		);
	return (
		<svg
			className={`ilme-svg ${reveal ? 'reveal' : ''}`}
			viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
			role="img"
			aria-label={ROUNDS[kind].name}
		>
			{shapes.map(draw)}
			<g className="ilme-guides">{guides.map((g, i) => draw(g, shapes.length + i))}</g>
		</svg>
	);
}

export default function MeasureGame({ gameId }: { gameId: string }) {
	const [order, setOrder] = useState<FigureKind[]>(ORDER);
	const [starts, setStarts] = useState<number[]>(() => ORDER.map(() => randomStart(Math.random)));
	const [idx, setIdx] = useState(0);
	const [ratio, setRatio] = useState(() => starts[0]);
	const [phase, setPhase] = useState<Phase>('adjust');
	const [results, setResults] = useState<{ kind: FigureKind; ratio: number }[]>([]);
	const [best, setBest] = useState<number | null>(() => readBest());
	const [newBest, setNewBest] = useState(false);
	const started = useRef(false);

	const kind = order[idx];
	const info = ROUNDS[kind];

	const touch = useCallback(() => {
		if (started.current) return;
		started.current = true;
		trackGame(gameId, 'game_started');
	}, [gameId]);

	const adjust = (r: number) => {
		touch();
		setRatio(clamp(r));
	};

	const validate = () => {
		touch();
		setResults((prev) => [...prev, { kind, ratio }]);
		setPhase('reveal');
	};

	const next = () => {
		if (idx + 1 < order.length) {
			setIdx(idx + 1);
			setRatio(starts[idx + 1]);
			setPhase('adjust');
			return;
		}
		const mean = meanAbsError(results.map((r) => r.ratio));
		const record = best == null || mean < best;
		setNewBest(record && best != null);
		if (record) {
			setBest(mean);
			try {
				localStorage.setItem(BEST_KEY, String(mean));
			} catch {
				/* private mode: the record just won't stick */
			}
		}
		setPhase('done');
		trackGame(gameId, 'game_won', { score: Math.round(mean * 10) / 10 });
	};

	const replay = () => {
		const o = shuffled(ORDER, Math.random);
		const s = o.map(() => randomStart(Math.random));
		setOrder(o);
		setStarts(s);
		setIdx(0);
		setRatio(s[0]);
		setResults([]);
		setNewBest(false);
		setPhase('adjust');
	};

	const mean = meanAbsError(results.map((r) => r.ratio));
	const v = verdict(mean);
	const last = results[results.length - 1];

	return (
		<div className="ilme-root">
			<style>{CSS}</style>

			{phase !== 'done' ? (
				<>
					<div className="ilme-top">
						<span className="ilme-step">Manche {idx + 1}/{order.length}</span>
						<div className="ilme-dots" aria-hidden="true">
							{order.map((k, i) => (
								<span key={k} className={`ilme-pip ${i < idx || (i === idx && phase === 'reveal') ? 'on' : ''} ${i === idx ? 'cur' : ''}`} />
							))}
						</div>
					</div>
					<h2 className="ilme-name">{info.name}</h2>
					<p className="ilme-ask">{info.ask}</p>

					<div className="ilme-figure" data-art>
						<Figure key={`${idx}-${kind}`} kind={kind} ratio={ratio} reveal={phase === 'reveal'} />
					</div>

					{phase === 'adjust' ? (
						<div className="ilme-panel">
							<div className="ilme-ctrl">
								<button className="ilme-nudge" onClick={() => adjust(ratio - NUDGE)} aria-label="Plus petit">
									−
								</button>
								<input
									className="ilme-range"
									type="range"
									min={MIN_RATIO}
									max={MAX_RATIO}
									step={0.002}
									value={ratio}
									onChange={(e) => adjust(parseFloat(e.target.value))}
									aria-label={`Taille de ${info.target}`}
								/>
								<button className="ilme-nudge" onClick={() => adjust(ratio + NUDGE)} aria-label="Plus grand">
									+
								</button>
							</div>
							<button className="ilme-main" onClick={validate}>
								Valider
							</button>
						</div>
					) : (
						last && (
							<div className="ilme-panel">
								<p className={`ilme-err ${Math.abs(errorPct(last.ratio)) < 5 ? 'good' : ''}`}>{errorText(last.kind, last.ratio)}</p>
								<p className="ilme-fact">{info.fact}</p>
								<button className="ilme-main" onClick={next}>
									{idx + 1 < order.length ? 'Manche suivante' : 'Voir mon score'}
								</button>
							</div>
						)
					)}
				</>
			) : (
				<div className="ilme-end" role="status">
					<div className="ilme-end-emoji" aria-hidden="true">{v.emoji}</div>
					<h2 className="ilme-end-title">{v.title}</h2>
					<p className="ilme-end-text">{v.text}</p>
					<p className="ilme-end-mean">
						Écart moyen : <strong>{formatPct(mean)} %</strong>
					</p>
					{newBest ? (
						<p className="ilme-end-best">🎉 Nouveau record !</p>
					) : (
						best != null && <p className="ilme-end-best">Ton record : {formatPct(best)} %</p>
					)}
					<ul className="ilme-recap">
						{results.map((r) => {
							const e = errorPct(r.ratio);
							return (
								<li key={r.kind}>
									<span>{ROUNDS[r.kind].name}</span>
									<span className={`ilme-recap-e ${Math.abs(e) < 5 ? 'good' : ''}`}>
										{e >= 0 ? '+' : '−'}
										{formatPct(Math.abs(e))} %
									</span>
								</li>
							);
						})}
					</ul>
					<p className="ilme-end-note">
						+ : réglé trop grand · − : réglé trop petit. Ces figures trompent tout le monde : c'est tout leur intérêt.
					</p>
					<button className="ilme-main" onClick={replay}>
						Rejouer
					</button>
				</div>
			)}
		</div>
	);
}

const CSS = `
.ilme-root {
  --ilme-acc: var(--accent-regular);
  --ilme-ok: #2f9e6f;
  width: 100%;
  max-width: 560px;
  margin-inline: auto;
  color: var(--gray-0);
  font-family: var(--font-body);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.ilme-top {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.ilme-step {
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  font-size: 14px;
  background: var(--gray-900);
  border-radius: 999px;
  padding: 5px 13px;
}
.ilme-dots { display: flex; gap: 6px; }
.ilme-pip {
  width: 10px; height: 10px; border-radius: 50%;
  border: 1.5px solid var(--gray-600);
  transition: background-color 0.2s ease, border-color 0.2s ease;
}
.ilme-pip.cur { border-color: var(--accent-regular); }
.ilme-pip.on { background: var(--accent-regular); border-color: var(--accent-regular); }
.ilme-name {
  font-family: var(--font-brand);
  font-weight: 600;
  font-size: 20px;
  margin: 0.9rem 0 0.2rem;
}
.ilme-ask {
  margin: 0 0 0.9rem;
  color: var(--gray-200);
  font-size: 14.5px;
  line-height: 1.45;
  max-width: 44ch;
}
.ilme-figure {
  width: 100%;
  aspect-ratio: 16 / 10;
  background: var(--gray-999);
  border: 1px solid var(--gray-800);
  border-radius: 16px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}
.ilme-svg { display: block; width: 100%; height: 100%; }
.ilme-stroke {
  stroke: var(--gray-0);
  stroke-width: 3;
  stroke-linecap: round;
  fill: none;
  transition: opacity 0.35s ease, stroke 0.35s ease;
}
.ilme-dot { fill: var(--gray-500); stroke: none; transition: opacity 0.35s ease; }
.ilme-disc { fill: var(--ilme-acc); stroke: none; transition: fill 0.35s ease; }
/* Fade the guides in only: fading them out would flash the answer on the next round. */
.ilme-guides { opacity: 0; }
.ilme-svg.reveal .ilme-guides { transition: opacity 0.35s ease 0.15s; }
.ilme-guide {
  stroke: var(--gray-0);
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
  fill: none;
}
.ilme-svg.reveal .ilme-ind { opacity: 0.12; }
.ilme-svg.reveal .ilme-guides { opacity: 0.85; }
.ilme-svg.reveal line.ilme-tgt { stroke: var(--ilme-acc); }

.ilme-panel {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  margin-top: 1.1rem;
}
.ilme-ctrl {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
}
.ilme-range {
  flex: 1;
  min-width: 0;
  height: 32px;
  accent-color: var(--accent-regular);
  cursor: pointer;
}
.ilme-nudge {
  flex: none;
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1.5px solid var(--gray-700);
  background: var(--gray-999);
  color: var(--gray-0);
  font: inherit;
  font-weight: 700;
  font-size: 22px;
  line-height: 1;
  cursor: pointer;
}
.ilme-nudge:active { background: var(--accent-regular); color: var(--accent-text-over); border-color: var(--accent-regular); }
.ilme-main {
  border: none;
  background: var(--accent-regular);
  color: var(--accent-text-over);
  font: inherit;
  font-weight: 700;
  font-size: 16px;
  border-radius: 999px;
  padding: 11px 30px;
  cursor: pointer;
  box-shadow: var(--shadow-md);
}
.ilme-err {
  margin: 0;
  font-weight: 700;
  font-size: 16px;
  color: var(--gray-0);
}
.ilme-err.good { color: var(--ilme-ok); }
.ilme-fact {
  margin: 0;
  max-width: 46ch;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--gray-300);
}

.ilme-end {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--gray-999);
  border: 2px solid var(--accent-regular);
  border-radius: 20px;
  padding: 22px 18px 24px;
  box-shadow: var(--shadow-md);
  animation: ilme-fade 0.3s ease;
}
.ilme-end-emoji { font-size: 46px; line-height: 1; }
.ilme-end-title {
  font-family: var(--font-brand);
  font-weight: 600;
  font-size: 26px;
  margin: 8px 0 2px;
}
.ilme-end-text { margin: 0; color: var(--gray-200); font-size: 14.5px; }
.ilme-end-mean { margin: 14px 0 0; font-size: 16px; }
.ilme-end-mean strong { color: var(--ilme-acc); font-size: 22px; font-variant-numeric: tabular-nums; }
.ilme-end-best { margin: 4px 0 0; color: var(--gray-300); font-size: 13.5px; font-weight: 600; }
.ilme-recap {
  list-style: none;
  padding: 0;
  margin: 16px 0 0;
  width: 100%;
  max-width: 380px;
  font-size: 14px;
}
.ilme-recap li {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 7px 2px;
  border-top: 1px solid var(--gray-800);
  text-align: left;
}
.ilme-recap-e { font-weight: 700; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ilme-recap-e.good { color: var(--ilme-ok); }
.ilme-end-note {
  margin: 10px 0 18px;
  max-width: 40ch;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--gray-400);
}

/* The brand purple is too dark to read as a thin line on the night background. */
:root.theme-dark .ilme-root { --ilme-acc: #b77ce0; --ilme-ok: #4cc28f; }

@keyframes ilme-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }

@media (prefers-reduced-motion: reduce) {
  .ilme-stroke, .ilme-dot, .ilme-disc, .ilme-guides, .ilme-pip { transition: none; }
  .ilme-end { animation: none; }
}
`;
