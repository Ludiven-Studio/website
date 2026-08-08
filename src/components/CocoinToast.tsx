/* Floating "+N cocoins" chip, shown whenever the wallet grows — stars, daily challenge,
   return reward. Every gain goes through wallet.earn(), so no game has to call anything.
   Fixed to the viewport and mounted outside .game-head, so it still shows in fullscreen. */

import { useEffect, useState } from 'react';
import { EARN_EVENT } from '../lib/wallet';
import Cocoin from './Cocoin';

interface Pop { id: number; amount: number; }

const HOLD_MS = 1900;

export default function CocoinToast() {
	const [pops, setPops] = useState<Pop[]>([]);

	useEffect(() => {
		let n = 0;
		const timers: ReturnType<typeof setTimeout>[] = [];
		const onEarn = (e: Event) => {
			const amount = Math.round(Number((e as CustomEvent<{ amount: number }>).detail?.amount) || 0);
			if (amount <= 0) return;
			const id = ++n;
			setPops((p) => [...p, { id, amount }]);
			timers.push(setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), HOLD_MS));
		};
		window.addEventListener(EARN_EVENT, onEarn);
		return () => {
			window.removeEventListener(EARN_EVENT, onEarn);
			for (const t of timers) clearTimeout(t);
		};
	}, []);

	if (pops.length === 0) return null;

	return (
		<div className="ci-toast" role="status" aria-live="polite">
			<style>{CSS}</style>
			{pops.map((p) => (
				<div key={p.id} className="ci-pop">
					<Cocoin size={24} />
					<span>+{p.amount} cocoins</span>
				</div>
			))}
		</div>
	);
}

const CSS = `
.ci-toast {
  position: fixed; z-index: 2147483000; pointer-events: none;
  left: 50%; transform: translateX(-50%);
  bottom: max(18px, env(safe-area-inset-bottom));
  display: flex; flex-direction: column-reverse; align-items: center; gap: 6px;
  font-family: var(--font-body);
}
.ci-pop {
  display: inline-flex; align-items: center; gap: 7px;
  background: var(--gray-999); border: 2px solid #e8a317; border-radius: 999px;
  padding: 7px 15px 7px 11px; box-shadow: var(--shadow-md);
  font-weight: 800; font-size: 15px; color: var(--gray-0); white-space: nowrap;
  animation: ci-rise 1.9s cubic-bezier(0.2, 1.4, 0.4, 1) forwards;
}
@keyframes ci-rise {
  0%   { opacity: 0; transform: translateY(22px) scale(0.7); }
  16%  { opacity: 1; transform: translateY(0) scale(1); }
  74%  { opacity: 1; transform: translateY(0) scale(1); }
  100% { opacity: 0; transform: translateY(-26px) scale(0.94); }
}
@media (prefers-reduced-motion: reduce) {
  .ci-pop { animation: ci-fade 1.9s ease forwards; }
  @keyframes ci-fade { 0%,90% { opacity: 1; } 100% { opacity: 0; } }
}
`;
