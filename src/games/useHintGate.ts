import { useCallback, useEffect, useRef, useState } from 'react';

/* =====================================================
   HINT GATE — one hint every 30 s in the timed modes.
   Daily and levels race the chrono, so hints used to be cut there entirely.
   Instead every logic / word game now offers one, on a shared cooldown: the
   window opens 30 s after ▶ Commencer and restarts only when a hint is spent —
   never on a player move, so the wait is predictable and identical everywhere.
   Free mode passes gated=false and keeps hints instant.
   ===================================================== */

export const HINT_COOLDOWN_MS = 30000;

export interface HintGate {
	ready: boolean; // hint available right now
	wait: number; // seconds left before the next one (0 when ready)
	label: string; // caption for the hint button
	consume: () => void; // call once a hint has been handed out
}

/**
 * @param gated  true in timed modes (daily / levels); false = no cooldown at all
 * @param running true while the player is actually playing (chrono started, not won)
 */
export function useHintGate(gated: boolean, running: boolean, cooldownMs = HINT_COOLDOWN_MS): HintGate {
	const readyAtRef = useRef(Infinity);
	const full = Math.ceil(cooldownMs / 1000);
	const [wait, setWait] = useState(full);

	const tick = useCallback(() => {
		const left = readyAtRef.current - Date.now();
		setWait(Number.isFinite(left) ? Math.max(0, Math.ceil(left / 1000)) : full);
	}, [full]);

	const consume = useCallback(() => {
		readyAtRef.current = Date.now() + cooldownMs;
		tick();
	}, [cooldownMs, tick]);

	// A fresh window on every start; frozen (full wait) while the board is armed or over.
	useEffect(() => {
		if (running) readyAtRef.current = Date.now() + cooldownMs;
		else readyAtRef.current = Infinity;
		tick();
	}, [running, cooldownMs, tick]);

	useEffect(() => {
		if (!gated || !running) return;
		const id = setInterval(tick, 250);
		return () => clearInterval(id);
	}, [gated, running, tick]);

	const ready = !gated || wait === 0;
	return { ready, wait: gated ? wait : 0, label: ready ? '💡 Indice' : `💡 Indice dans ${wait} s`, consume };
}
