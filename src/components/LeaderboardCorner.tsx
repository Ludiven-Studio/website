import { useState } from 'react';
import { leaderboardEnabled, type Metric, type ScoreRow } from '../lib/leaderboard';
import Leaderboard from './Leaderboard';

/* Collapsible corner pill showing the day's leaderboard — shown in free mode
   to entice players into the daily challenge. */

interface Props {
	game: string;
	metric: Metric;
	/** Custom value formatter (e.g. to decode an encoded value). Defaults to time/score. */
	format?: (v: number) => string;
	/** Custom rows source, forwarded to Leaderboard (cf. lib/scores getLeaderboard). */
	source?: () => Promise<ScoreRow[]>;
	/** 'right' shrinks the pill to its trophy and pins it to the corner — for games whose
	    controls live along the bottom of the board (bulles aims there). */
	side?: 'center' | 'right';
}

export default function LeaderboardCorner({ game, metric, format, source, side = 'center' }: Props) {
	const [open, setOpen] = useState(false);
	if (!leaderboardEnabled()) return null;

	return (
		<div className={`lbc-root ${side === 'right' ? 'lbc-side' : ''}`}>
			<style>{CSS}</style>
			{open && (
				<div className="lbc-panel">
					<button className="lbc-close" onClick={() => setOpen(false)} aria-label="Fermer">
						✕
					</button>
					<Leaderboard game={game} metric={metric} format={format} source={source} actions={false} />
				</div>
			)}
			<button
				className="lbc-pill"
				onClick={() => setOpen((o) => !o)}
				aria-expanded={open}
				aria-label="Classement du jour"
			>
				🏆<span className="lbc-label"> Classement du jour</span>
			</button>
		</div>
	);
}

const CSS = `
.lbc-root {
  position: fixed; left: 50%; transform: translateX(-50%); bottom: 12px; z-index: 50;
  display: flex; flex-direction: column; align-items: center; gap: 8px;
}
.lbc-root.lbc-side {
  left: auto; right: 12px; transform: none; align-items: flex-end;
}
.lbc-side .lbc-pill { padding: 9px 11px; font-size: 16px; }
.lbc-side .lbc-label { display: none; }
.lbc-pill {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 13px; border-radius: 999px;
  padding: 10px 16px; cursor: pointer; box-shadow: 0 6px 20px rgba(0,0,0,0.25);
}
.lbc-panel {
  position: relative;
  background: var(--gray-999); border: 1.5px solid var(--gray-800);
  border-radius: 16px; padding: 14px 16px 10px; box-shadow: var(--shadow-lg);
  width: min(86vw, 320px); max-height: 60vh; overflow-y: auto;
}
.lbc-close {
  position: absolute; top: 8px; right: 10px; border: none; background: transparent;
  color: var(--gray-300); font-size: 15px; cursor: pointer; line-height: 1;
}
.lbc-panel .lb-root { margin-top: 0; }
`;
