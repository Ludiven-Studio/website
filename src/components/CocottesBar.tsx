import { useState } from 'react';
import { claimDailyReward } from '../lib/wallet';
import { useWallet } from '../lib/useWallet';
import { trackEvent } from '../lib/analytics';

/* Compact wallet reminder: balance, the daily reward when it's claimable, and a way
   into the shop. Sits in .game-head, which GameFullscreen already hides in fullscreen. */

export default function CocottesBar() {
	const { balance, reward, refresh } = useWallet();
	const [msg, setMsg] = useState('');

	const claim = () => {
		const g = claimDailyReward();
		if (g > 0) {
			trackEvent('cocottes:reward_claim', { amount: g });
			setMsg(`+${g} 🐔 !`);
			refresh();
			setTimeout(() => setMsg(''), 2200);
		}
	};

	return (
		<div className="cb-root">
			<style>{CSS}</style>
			<span className="cb-bal" title="Tes cocottes">🐔 {balance}</span>
			{reward.canClaim && (
				<button className="cb-claim" onClick={claim}>🎁 +{reward.amount}</button>
			)}
			{msg && <span className="cb-msg">{msg}</span>}
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
.cb-bal { font-weight: 800; font-size: 14px; color: var(--gray-0); font-variant-numeric: tabular-nums; }
.cb-claim {
  border: none; background: var(--accent-regular); color: var(--accent-text-over);
  font: inherit; font-weight: 700; font-size: 12.5px; border-radius: 999px; padding: 4px 11px; cursor: pointer;
}
.cb-claim:hover { filter: brightness(1.06); }
.cb-msg { font-weight: 700; font-size: 12.5px; color: var(--accent-regular); }
.cb-shop {
  border: 1.5px solid var(--gray-700); color: var(--gray-100); text-decoration: none;
  font-weight: 700; font-size: 12.5px; border-radius: 999px; padding: 4px 11px;
}
.cb-shop:hover { border-color: var(--accent-regular); color: var(--accent-regular); }
`;
