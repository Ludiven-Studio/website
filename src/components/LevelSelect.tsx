/* Shared level-select grid for the progression mode. 100 tiles: locked (🔒),
   unlocked (playable), and cleared (1-3 ★). Game-agnostic — each game feeds its
   own GameProgress and handles onPick(level). */

import type { GameProgress } from '../lib/progression';
import { LEVEL_COUNT, unlockedUpTo } from '../lib/progression';

interface Props {
	progress: GameProgress;
	onPick: (level: number) => void;
	/** Optional total-stars caption; defaults to "X / 300 ⭐". */
	title?: string;
}

export default function LevelSelect({ progress, onPick, title }: Props) {
	const unlocked = unlockedUpTo(progress);
	const totalStars = Object.values(progress.stars).reduce((a, b) => a + b, 0);

	return (
		<div className="ls-wrap">
			<style>{CSS}</style>
			<p className="ls-caption">{title ?? `${totalStars} / ${LEVEL_COUNT * 3} ⭐`}</p>
			<div className="ls-grid" role="list">
				{Array.from({ length: LEVEL_COUNT }, (_, i) => {
					const level = i + 1;
					const stars: 0 | 1 | 2 | 3 = progress.stars[level] ?? 0;
					const locked = level > unlocked;
					return (
						<button
							key={level}
							role="listitem"
							className={`ls-tile ${locked ? 'locked' : ''} ${stars > 0 ? 'done' : ''} ${level === unlocked ? 'next' : ''}`}
							disabled={locked}
							onClick={() => !locked && onPick(level)}
							aria-label={locked ? `Niveau ${level} verrouillé` : `Niveau ${level}, ${stars} étoile${stars > 1 ? 's' : ''}`}
						>
							{locked ? (
								<span className="ls-lock">🔒</span>
							) : (
								<>
									<span className="ls-num">{level}</span>
									<span className="ls-stars">
										{[1, 2, 3].map((s) => (
											<span key={s} className={s <= stars ? 'on' : ''}>★</span>
										))}
									</span>
								</>
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}

const CSS = `
.ls-wrap { width: 100%; max-width: 640px; margin: 0 auto; }
.ls-caption { text-align: center; color: var(--gray-300); font-size: 13px; font-weight: 600; margin: 0 0 0.75rem; }
.ls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
  gap: 8px;
}
.ls-tile {
  aspect-ratio: 1;
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px;
  border: 1.5px solid var(--gray-700); background: var(--gray-999); color: var(--gray-0);
  border-radius: 12px; font: inherit; cursor: pointer;
  transition: transform 0.1s ease, border-color 0.15s ease, background-color 0.15s ease;
  -webkit-tap-highlight-color: transparent;
}
.ls-tile:not(.locked):hover { transform: translateY(-2px); border-color: var(--accent-regular); }
.ls-tile:not(.locked):active { transform: translateY(0); }
.ls-tile.locked { background: var(--gray-900); border-color: var(--gray-800); color: var(--gray-500); cursor: not-allowed; }
.ls-tile.done { border-color: var(--accent-light); background: linear-gradient(160deg, var(--gray-999), #f6ecff); }
.ls-tile.next { border-color: var(--accent-regular); box-shadow: 0 0 0 2px var(--accent-overlay); }
.ls-num { font-weight: 800; font-size: 17px; line-height: 1; }
.ls-lock { font-size: 17px; opacity: 0.7; }
.ls-stars { display: inline-flex; gap: 1px; font-size: 10px; line-height: 1; color: var(--gray-600); }
.ls-stars .on { color: #f5a623; }
@media (prefers-reduced-motion: reduce) { .ls-tile { transition: none; } }
`;
