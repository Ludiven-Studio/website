// Shared wallet state for React islands. Each island holds its own copy, so they all
// listen to WALLET_EVENT to stay in sync within a page (plus 'storage' across tabs).

import { useState, useEffect, useCallback } from 'react';
import { balance, equippedBlason, rewardState, unlockedGames, WALLET_EVENT, type RewardState } from './wallet';

export interface WalletView {
	balance: number;
	equipped: string | null;
	reward: RewardState;
	unlocked: string[];
	refresh: () => void;
}

const NEUTRAL: RewardState = { playedToday: false, canClaim: false, amount: 5 };

export function useWallet(): WalletView {
	const [bal, setBal] = useState(0);
	const [equipped, setEquipped] = useState<string | null>(null);
	const [reward, setReward] = useState<RewardState>(NEUTRAL);
	const [unlocked, setUnlocked] = useState<string[]>([]);

	const refresh = useCallback(() => {
		setBal(balance());
		setEquipped(equippedBlason()?.id ?? null);
		setReward(rewardState());
		setUnlocked(unlockedGames());
	}, []);

	useEffect(() => {
		refresh();
		const onVis = () => { if (!document.hidden) refresh(); };
		document.addEventListener('visibilitychange', onVis);
		window.addEventListener('pageshow', refresh);
		window.addEventListener('storage', refresh);
		window.addEventListener(WALLET_EVENT, refresh);
		return () => {
			document.removeEventListener('visibilitychange', onVis);
			window.removeEventListener('pageshow', refresh);
			window.removeEventListener('storage', refresh);
			window.removeEventListener(WALLET_EVENT, refresh);
		};
	}, [refresh]);

	return { balance: bal, equipped, reward, unlocked, refresh };
}
