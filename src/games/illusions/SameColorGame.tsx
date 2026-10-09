import { useRef, useState, type ReactNode } from 'react';
import { trackGame } from '../../lib/analytics';
import {
	ADELSON,
	CONTRAST,
	MUNKER,
	ROUNDS,
	TWIST,
	VIEW,
	WHITE,
	cylinderBase,
	project,
	scaleHex,
	shadowPolygon,
	tileCenter,
	tileColor,
	tileCorners,
	type Round,
	type Vec,
} from './sameColor';

/* =====================================================
   MÊME COULEUR ? — lightness and colour illusions.
   Answer, then slide the context away to see the truth.
   ===================================================== */

type Phase = 'ask' | 'reveal' | 'end';

const pts = (ps: Vec[]) => ps.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');

export default function SameColorGame({ gameId }: { gameId: string }) {
	const [round, setRound] = useState(0);
	const [phase, setPhase] = useState<Phase>('ask');
	const [answers, setAnswers] = useState<number[]>([]);
	const [t, setT] = useState(0); // 0 = full context, 1 = context gone
	const started = useRef(false);

	const r = ROUNDS[round];
	const last = round === ROUNDS.length - 1;
	const score = answers.filter((a, i) => a === ROUNDS[i].correct).length;
	const fooled = answers.length - score;

	const answer = (k: number) => {
		if (!started.current) {
			started.current = true;
			trackGame(gameId, 'game_started');
		}
		setAnswers((a) => [...a, k]);
		setT(0);
		setPhase('reveal');
	};

	const next = () => {
		setT(0);
		if (last) {
			setPhase('end');
			trackGame(gameId, 'game_won');
		} else {
			setRound(round + 1);
			setPhase('ask');
		}
	};

	const replay = () => {
		setRound(0);
		setAnswers([]);
		setT(0);
		setPhase('ask');
	};

	const right = phase === 'reveal' && answers[round] === r.correct;

	return (
		<div className="ilsc-root">
			<style>{CSS}</style>

			<ol className="ilsc-steps" aria-label="Manches">
				{ROUNDS.map((x, i) => {
					const done = i < answers.length;
					const ok = done && answers[i] === x.correct;
					return (
						<li
							key={x.id}
							className={`ilsc-step ${i === round && phase !== 'end' ? 'cur' : ''} ${done ? (ok ? 'ok' : 'ko') : ''}`}
							title={x.name}
						>
							{done ? (ok ? '✓' : '✗') : i + 1}
						</li>
					);
				})}
			</ol>

			{phase !== 'end' ? (
				<>
					<p className="ilsc-name">
						Manche {round + 1}/{ROUNDS.length} · {r.name}
					</p>
					<div className="ilsc-figure" {...(r.id === 'adelson' ? { 'data-art': '' } : {})}>
						<Figure round={r} t={t} />
					</div>

					<p className="ilsc-question">{r.question}</p>

					{phase === 'ask' ? (
						<div className="ilsc-answers" style={{ gridTemplateColumns: `repeat(${r.options.length}, 1fr)` }}>
							{r.options.map((o, k) => (
								<button key={o} className="ilsc-answer" onClick={() => answer(k)}>
									{o}
								</button>
							))}
						</div>
					) : (
						<div className="ilsc-reveal" aria-live="polite">
							<p className={`ilsc-verdict ${right ? 'ok' : 'ko'}`}>
								{right ? 'Bien vu ! 👀' : 'Piégé·e ! 😄'}
								<span>Ta réponse : {r.options[answers[round]]}</span>
							</p>
							<label className="ilsc-slide">
								<span>🎚️ Fais glisser pour retirer le décor</span>
								<input
									type="range"
									min={0}
									max={100}
									value={Math.round(t * 100)}
									onChange={(e) => setT(Number(e.target.value) / 100)}
									aria-label="Retirer le décor"
								/>
							</label>
							<p className="ilsc-truth">{r.truth}</p>
							<p className="ilsc-why">{r.why}</p>
							<button className="ilsc-next" onClick={next}>
								{last ? 'Voir mon score' : 'Manche suivante →'}
							</button>
						</div>
					)}
				</>
			) : (
				<div className="ilsc-end" aria-live="polite">
					<p className="ilsc-score">
						{score}/{ROUNDS.length}
					</p>
					<p className="ilsc-fooled">
						{fooled === 0
							? "Ton œil ne s'est jamais fait avoir : impressionnant !"
							: `Ton œil s'est fait avoir ${fooled} fois.`}
					</p>
					<ul className="ilsc-recap">
						{ROUNDS.map((x, i) => (
							<li key={x.id} className={answers[i] === x.correct ? 'ok' : 'ko'}>
								<span>{answers[i] === x.correct ? '✓' : '✗'}</span> {x.name}
							</li>
						))}
					</ul>
					<p className="ilsc-why">
						Ton cerveau ne mesure pas la lumière comme un appareil photo : il devine la vraie couleur
						des objets en tenant compte de l'éclairage, des ombres et de ce qui les entoure. C'est ce
						qui te fait reconnaître une feuille blanche à l'ombre… et tomber dans ces pièges.
					</p>
					<button className="ilsc-next" onClick={replay}>
						Rejouer
					</button>
				</div>
			)}
		</div>
	);
}

function Figure({ round, t }: { round: Round; t: number }) {
	switch (round.id) {
		case 'adelson':
			return <Adelson t={t} patches={round.patches} />;
		case 'contrast':
			return <Contrast t={t} />;
		case 'white':
			return <White t={t} />;
		case 'munker':
			return <Munker t={t} />;
		case 'twist':
			return <Twist t={t} />;
	}
}

const Svg = ({ label, children }: { label: string; children: ReactNode }) => (
	<svg viewBox={`0 0 ${VIEW.w} ${VIEW.h}`} role="img" aria-label={label} className="ilsc-svg">
		{children}
	</svg>
);

function Adelson({ t, patches }: { t: number; patches: [string, string] }) {
	const A = ADELSON;
	const tiles: { i: number; j: number }[] = [];
	for (let i = 0; i < A.n; i++) for (let j = 0; j < A.n; j++) tiles.push({ i, j });
	const tile = (i: number, j: number, fill: string, key?: string) => (
		<polygon key={key} points={pts(tileCorners(i, j))} fill={fill} stroke={fill} strokeWidth={0.6} />
	);
	// Front faces of the board's slab, one per edge tile.
	const faces: { ps: Vec[]; fill: string }[] = [];
	for (let i = 0; i < A.n; i++) {
		const p1 = project(i, A.n);
		const p2 = project(i + 1, A.n);
		faces.push({ ps: [p1, p2, [p2[0], p2[1] + A.thick], [p1[0], p1[1] + A.thick]], fill: scaleHex(tileColor(i, A.n - 1, false), 0.62) });
	}
	for (let j = 0; j < A.n; j++) {
		const p1 = project(A.n, j);
		const p2 = project(A.n, j + 1);
		faces.push({ ps: [p1, p2, [p2[0], p2[1] + A.thick], [p1[0], p1[1] + A.thick]], fill: scaleHex(tileColor(A.n - 1, j, false), 0.8) });
	}
	const base = cylinderBase();
	const H = A.cyl.height;
	const body = `M${base.x - base.rx},${base.y - H} L${base.x - base.rx},${base.y} A${base.rx} ${base.ry} 0 0 0 ${base.x + base.rx},${base.y} L${base.x + base.rx},${base.y - H} Z`;
	const ca = tileCenter(...A.a);
	const cb = tileCenter(...A.b);
	const ctx = 1 - t;
	return (
		<Svg label="Échiquier avec un cylindre vert qui projette son ombre ; une case A en pleine lumière et une case B dans l'ombre">
			<defs>
				<filter id="ilsc-soft" x="-30%" y="-30%" width="160%" height="160%">
					<feGaussianBlur stdDeviation="5" />
				</filter>
				<mask id="ilsc-shade" maskUnits="userSpaceOnUse" x="0" y="0" width={VIEW.w} height={VIEW.h}>
					<rect width={VIEW.w} height={VIEW.h} fill="#000" />
					<polygon points={pts(shadowPolygon())} fill="#fff" filter="url(#ilsc-soft)" />
				</mask>
				<linearGradient id="ilsc-cyl" x1="0" x2="1" y1="0" y2="0">
					<stop offset="0" stopColor="#1d5a21" />
					<stop offset="0.55" stopColor="#3f9643" />
					<stop offset="1" stopColor="#86cc7d" />
				</linearGradient>
			</defs>
			<rect width={VIEW.w} height={VIEW.h} fill={A.neutral} />
			<g opacity={ctx}>
				<rect width={VIEW.w} height={VIEW.h} fill={A.bg} />
				{faces.map((f, k) => (
					<polygon key={k} points={pts(f.ps)} fill={f.fill} stroke={f.fill} strokeWidth={0.6} />
				))}
				<g>{tiles.map(({ i, j }) => tile(i, j, tileColor(i, j, false), `l${i}${j}`))}</g>
				<g mask="url(#ilsc-shade)">{tiles.map(({ i, j }) => tile(i, j, tileColor(i, j, true), `s${i}${j}`))}</g>
				<path d={body} fill="url(#ilsc-cyl)" />
				<ellipse cx={base.x} cy={base.y - H} rx={base.rx} ry={base.ry} fill="#93d68a" />
			</g>
			{/* A and B are redrawn last, exact, so no blur or blend can touch them. */}
			{tile(...A.a, patches[0])}
			{tile(...A.b, patches[1])}
			<line x1={ca[0]} y1={ca[1]} x2={cb[0]} y2={cb[1]} stroke={patches[0]} strokeWidth={12} opacity={t} />
			<text x={ca[0]} y={ca[1] - 4} className="ilsc-label">A</text>
			<text x={cb[0]} y={cb[1] - 4} className="ilsc-label">B</text>
		</Svg>
	);
}

function Contrast({ t }: { t: number }) {
	return (
		<Svg label="Une barre grise posée sur un dégradé du noir au blanc">
			<defs>
				<linearGradient id="ilsc-grad" x1="0" x2="1" y1="0" y2="0">
					<stop offset="0" stopColor={CONTRAST.from} />
					<stop offset="1" stopColor={CONTRAST.to} />
				</linearGradient>
			</defs>
			<rect width={VIEW.w} height={VIEW.h} fill={CONTRAST.neutral} />
			<rect width={VIEW.w} height={VIEW.h} fill="url(#ilsc-grad)" opacity={1 - t} />
			<rect x={30} y={128} width={420} height={44} fill={CONTRAST.bar} />
		</Svg>
	);
}

function White({ t }: { t: number }) {
	const W = WHITE;
	const y = (row: number) => row * W.stripe;
	return (
		<Svg label="Bandes noires et blanches ; des barres grises remplacent des morceaux de bandes noires à gauche et de bandes blanches à droite">
			<rect width={VIEW.w} height={VIEW.h} fill={W.neutral} />
			<g opacity={1 - t}>
				{Array.from({ length: W.rows }, (_, row) => (
					<rect key={row} y={y(row)} width={VIEW.w} height={W.stripe} fill={row % 2 ? W.white : W.black} />
				))}
			</g>
			{W.leftBars.rows.map((row) => (
				<rect key={`l${row}`} x={W.leftBars.x} y={y(row)} width={W.leftBars.w} height={W.stripe} fill={W.grey} />
			))}
			{W.rightBars.rows.map((row) => (
				<rect key={`r${row}`} x={W.rightBars.x} y={y(row)} width={W.rightBars.w} height={W.stripe} fill={W.grey} />
			))}
		</Svg>
	);
}

function Munker({ t }: { t: number }) {
	const M = MUNKER;
	const stripes = (x0: number, x1: number, fill: string) =>
		Array.from({ length: Math.ceil(VIEW.h / M.period) }, (_, k) => (
			<rect key={`${fill}${k}`} x={x0} y={k * M.period} width={x1 - x0} height={M.band} fill={fill} />
		));
	return (
		<Svg label="Deux disques rouges barrés de rayures, jaunes à gauche et bleues à droite">
			<rect width={VIEW.w} height={VIEW.h} fill={M.bg} />
			<circle cx={M.left[0]} cy={M.left[1]} r={M.r} fill={M.disc} />
			<circle cx={M.right[0]} cy={M.right[1]} r={M.r} fill={M.disc} />
			<g opacity={1 - t}>
				{stripes(0, VIEW.w / 2, M.yellow)}
				{stripes(VIEW.w / 2, VIEW.w, M.blue)}
			</g>
		</Svg>
	);
}

function Twist({ t }: { t: number }) {
	const T = TWIST;
	const half = VIEW.w / 2;
	const sq = (cx: number, fill: string) => (
		<rect x={cx - T.size / 2} y={VIEW.h / 2 - T.size / 2} width={T.size} height={T.size} fill={fill} />
	);
	return (
		<Svg label="Un carré gris sur fond noir et un carré gris sur fond blanc">
			<rect width={VIEW.w} height={VIEW.h} fill={T.neutral} />
			<g opacity={1 - t}>
				<rect width={half} height={VIEW.h} fill={T.darkBg} />
				<rect x={half} width={half} height={VIEW.h} fill={T.lightBg} />
			</g>
			{sq(half / 2, T.left)}
			{sq(half + half / 2, T.right)}
		</Svg>
	);
}

/* ---------- Styles (prefix ilsc-) ---------- */

const CSS = `
.ilsc-root {
  --ilsc-ink: var(--accent-regular);
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
/* The brand purple is too dim on the dark page: dark theme swaps in its light tint. */
:root.theme-dark .ilsc-root { --ilsc-ink: var(--accent-dark); }
.ilsc-steps {
  list-style: none;
  display: flex;
  gap: 8px;
  padding: 0;
  margin: 0 0 0.6rem;
}
.ilsc-step {
  width: 28px;
  height: 28px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-size: 13px;
  font-weight: 700;
  border: 1.5px solid var(--gray-700);
  color: var(--gray-300);
}
.ilsc-step.cur { border-color: var(--ilsc-ink); color: var(--ilsc-ink); }
.ilsc-step.ok { background: #2f9e6f; border-color: #2f9e6f; color: #fff; }
.ilsc-step.ko { background: var(--accent-regular); border-color: var(--accent-regular); color: var(--accent-text-over); }
.ilsc-name {
  margin: 0 0 0.6rem;
  font-size: 12.5px;
  font-weight: 500;
  color: var(--gray-300);
}
.ilsc-figure {
  width: 100%;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--gray-800);
  box-shadow: var(--shadow-sm);
  line-height: 0;
}
.ilsc-svg { width: 100%; height: auto; display: block; }
.ilsc-label {
  font: 800 15px var(--font-body);
  fill: #141414;
  text-anchor: middle;
  dominant-baseline: middle;
}
.ilsc-question {
  margin: 1rem 0 0.75rem;
  font-family: var(--font-brand);
  font-weight: 600;
  font-size: 17px;
  line-height: 1.35;
  color: var(--gray-0);
}
.ilsc-answers {
  width: 100%;
  max-width: 460px;
  display: grid;
  gap: 8px;
}
.ilsc-answer {
  border: 1.5px solid var(--gray-700);
  background: var(--gray-999);
  color: var(--gray-0);
  font: inherit;
  font-weight: 600;
  font-size: 14px;
  line-height: 1.25;
  border-radius: 14px;
  padding: 10px 6px;
  min-height: 52px;
  text-wrap: balance;
  cursor: pointer;
  transition: border-color var(--theme-transition), color var(--theme-transition);
}
.ilsc-answer:hover, .ilsc-answer:focus-visible { border-color: var(--accent-regular); color: var(--accent-regular); }
.ilsc-reveal {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
}
.ilsc-verdict {
  margin: 0;
  font-family: var(--font-brand);
  font-weight: 700;
  font-size: 20px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.ilsc-verdict span { font-family: var(--font-body); font-weight: 500; font-size: 13px; color: var(--gray-300); }
.ilsc-verdict.ok { color: #2f9e6f; }
.ilsc-verdict.ko { color: var(--ilsc-ink); }
.ilsc-slide {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--gray-100);
  background: var(--accent-overlay);
  border: 1px solid var(--accent-regular);
  border-radius: 14px;
  padding: 10px 14px 8px;
}
.ilsc-slide input { width: 100%; accent-color: var(--accent-regular); cursor: pointer; }
.ilsc-truth { margin: 0; font-weight: 700; color: var(--gray-0); font-size: 15px; }
.ilsc-why {
  margin: 0;
  max-width: 460px;
  font-size: 13.5px;
  line-height: 1.5;
  color: var(--gray-300);
}
.ilsc-next {
  margin-top: 0.4rem;
  border: none;
  background: var(--accent-regular);
  color: var(--accent-text-over);
  font: inherit;
  font-weight: 700;
  font-size: 15px;
  border-radius: 999px;
  padding: 10px 24px;
  cursor: pointer;
}
.ilsc-end {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.5rem;
}
.ilsc-score {
  margin: 0;
  font-family: var(--font-brand);
  font-weight: 700;
  font-size: 44px;
  line-height: 1;
  color: var(--ilsc-ink);
}
.ilsc-fooled { margin: 0; font-weight: 600; font-size: 16px; color: var(--gray-0); }
.ilsc-recap {
  list-style: none;
  padding: 0;
  margin: 0.25rem 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
  color: var(--gray-200);
}
.ilsc-recap span { font-weight: 800; }
.ilsc-recap .ok span { color: #2f9e6f; }
.ilsc-recap .ko span { color: var(--ilsc-ink); }
`;
