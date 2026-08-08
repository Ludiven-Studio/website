import { useEffect, useRef, useState } from 'react';
import { claimDailyReward } from '../lib/wallet';
import { useWallet } from '../lib/useWallet';
import { trackEvent } from '../lib/analytics';
import Cocoin from './Cocoin';

/* Compact wallet reminder: balance, the daily reward when it's claimable, and a way
   into the shop. Sits in .game-head, which GameFullscreen already hides in fullscreen.
   The gain itself is announced by CocoinToast — here the coin just pops. */

export default function CocoinBar() {
	const { balance, reward, ready, refresh } = useWallet();
	const [bump, setBump] = useState(0);
	const prev = useRef<number | null>(null);

	// The first read jumps from the neutral 0 to the real balance — not a gain, hence `ready`.
	useEffect(() => {
		if (!ready) return;
		if (prev.current != null && balance > prev.current) setBump((n) => n + 1);
		prev.current = balance;
	}, [balance, ready]);

	const claim = () => {
		const g = claimDailyReward();
		if (g > 0) {
			trackEvent('cocottes:reward_claim', { amount: g });
			refresh();
		}
	};

	return (
		<div className="cb-root">
			<style>{CSS}</style>
			<span
				key={bump}
				className={`cb-bal${bump ? ' pop' : ''}`}
				title="Tes cocoins"
				aria-label={`${balance} cocoins`}
			>
				<Cocoin size={18} /> {balance}
			</span>
			{reward.canClaim && (
				<button className="cb-claim" onClick={claim}>🎁 +{reward.amount}</button>
			)}
			<a className="cb-shop" href="/jeux/boutique">🎖️ Boutique</a>
		</div>
	);
}

const CSS = `
.cb-root {
  display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; justify-content: center;
  font-family: var(--font-body);
  background: var(--gray-999); border: 1.5px solid var(--gray-800); border-radius: 999px;
  padding: 5px 10px;
}
.cb-bal {
  display: inline-flex; align-items: center; gap: 5px;
  font-weight: 800; font-size: 14px; color: var(--gray-0); font-variant-numeric: tabular-nums;
}
.cb-bal.pop { animation: cb-pop 0.7s cubic-bezier(0.2, 1.6, 0.4, 1); }
@keyframes cb-pop {
  0% { transform: scale(1); }
  35% { transform: scale(1.28); }
  100% { transform: scale(1); }
}
.cb-claim {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 12.5px; border-radius: 999px; padding: 4px 11px; cursor: pointer;
}
.cb-claim:hover { filter: brightness(1.06); }
.cb-shop {
  border: 1.5px solid var(--gray-700); color: var(--gray-100); text-decoration: none;
  font-weight: 700; font-size: 12.5px; border-radius: 999px; padding: 4px 11px;
}
.cb-shop:hover { border-color: var(--accent-regular); color: var(--accent-regular); }
@media (prefers-reduced-motion: reduce) { .cb-bal.pop { animation: none; } }
`;
