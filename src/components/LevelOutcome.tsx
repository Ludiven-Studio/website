/* Shared end-of-level card for the progression mode: 1-3 stars on a win (with
   Next / Replay / Map), or a retry prompt on a loss. Game-agnostic. */

interface Props {
	level: number;
	lastLevel: number;
	won: boolean;
	stars: number;
	onNext: () => void;
	onReplay: () => void;
	onMenu: () => void;
	/** Optional extra line, e.g. "Résolu en 42 s · 18 coups". */
	detail?: string;
}

export default function LevelOutcome({ level, lastLevel, won, stars, onNext, onReplay, onMenu, detail }: Props) {
	return (
		<div className="lo-wrap" role="dialog" aria-label={won ? 'Niveau réussi' : 'Niveau échoué'}>
			<style>{CSS}</style>
			<div className="lo-card">
				{won && (
					<p className="lo-stars" aria-label={`${stars} étoiles sur 3`}>
						{[1, 2, 3].map((s) => (
							<span key={s} className={s <= stars ? 'on' : ''}>★</span>
						))}
					</p>
				)}
				<h2>{won ? `Niveau ${level} réussi !` : 'Échoué'}</h2>
				{detail && <p className="lo-detail">{detail}</p>}
				<div className="lo-btns">
					<button className="lo-btn ghost" onClick={onMenu}>🗺 Carte</button>
					{won && level < lastLevel ? (
						<button className="lo-btn" onClick={onNext}>Niveau {level + 1} →</button>
					) : (
						<button className="lo-btn" onClick={onReplay}>↻ Rejouer</button>
					)}
				</div>
			</div>
		</div>
	);
}

const CSS = `
.lo-wrap { position: absolute; inset: -8px; z-index: 10; display: flex; align-items: center; justify-content: center; background: var(--accent-subtle-overlay, rgba(0,0,0,0.04)); backdrop-filter: blur(3px); border-radius: 16px; animation: lo-fade 0.25s ease; }
.lo-card { background: var(--gray-999); border: 2px solid var(--accent-regular); border-radius: 20px; padding: 22px 30px; text-align: center; box-shadow: var(--shadow-lg); max-width: 320px; }
.lo-card h2 { font-family: var(--font-brand); font-weight: 600; margin: 4px 0 2px; font-size: 22px; color: var(--gray-0); }
.lo-stars { font-size: 32px; letter-spacing: 5px; color: var(--gray-600); margin: 0 0 4px; }
.lo-stars .on { color: #f5a623; }
.lo-detail { color: var(--gray-300); font-size: 13px; margin: 2px 0 12px; }
.lo-btns { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; margin-top: 8px; }
.lo-btn { border: none; background: var(--accent-regular); color: var(--accent-text-over); font: inherit; font-weight: 700; font-size: 15px; border-radius: 999px; padding: 10px 22px; cursor: pointer; }
.lo-btn.ghost { background: transparent; color: var(--gray-300); border: 1.5px solid var(--gray-700); }
@keyframes lo-fade { from { opacity: 0; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .lo-wrap { animation: none; } }
`;
