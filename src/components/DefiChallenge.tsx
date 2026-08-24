import { useEffect, useState } from 'react';
import { DAILY_LB } from '../data/dailyLb';
import { formatScore } from '../lib/scoreFormat';
import { todayKey } from '../lib/leaderboard';
import { trackEvent } from '../lib/analytics';

/* Challenge banner: a shared daily link carries ?defi&vs=<value>&de=<name>&d=<day>
   (built by Leaderboard.share). Landing on it, the friend's score is the reason to
   play right now — ?defi already auto-opens daily mode (ModeToggle). Mounted by
   GamePage on every game that has a daily config. */

export default function DefiChallenge({ gameId }: { gameId: string }) {
	const [msg, setMsg] = useState('');

	// The score only makes sense against today's board: a stale link (yesterday's brag)
	// keeps the callout but drops the number.
	useEffect(() => {
		const p = new URLSearchParams(location.search);
		const de = (p.get('de') || '').trim().slice(0, 20);
		const vs = Number(p.get('vs'));
		if (!de || !Number.isFinite(vs)) return;
		const cfg = DAILY_LB[gameId];
		const val = cfg && p.get('d') === todayKey() ? formatScore(cfg.fmt, vs) : '';
		setMsg(val ? `${de} a fait ${val} au défi du jour. À toi de jouer !` : `${de} te défie — joue le défi du jour !`);
		trackEvent('defi:challenge-landing', { game: gameId });
	}, [gameId]);

	if (!msg) return null;
	return (
		<p className="dc-banner">
			<style>{CSS}</style>
			⚔️ {msg}
		</p>
	);
}

const CSS = `
.dc-banner {
  margin: 0.25rem 0 0; padding: 8px 16px;
  border: 1.5px solid var(--accent-regular); border-radius: 999px;
  background: var(--accent-overlay); color: var(--gray-0);
  font-family: var(--font-body); font-weight: 600; font-size: 14px; text-align: center;
  animation: dc-in 0.35s ease-out;
}
@keyframes dc-in {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) { .dc-banner { animation: none; } }
`;
