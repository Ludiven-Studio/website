/**
 * Games listen for keys on `window`, so a global handler still fires while the player types in
 * the pseudo field, a lobby code or a search box — and `preventDefault` then eats the letter.
 * Every global keydown/keyup handler must bail on this before reading the key.
 */
export const isTypingTarget = (target: EventTarget | null): boolean => {
	// While a shared popup (GameModal) is up the keys are its own: digits must not land in the grid behind.
	if (typeof document !== 'undefined' && document.querySelector('.gm-back')) return true;
	return isTextField(target);
};

export const isTextField = (target: EventTarget | null): boolean => {
	const el = target as HTMLElement | null;
	if (!el || typeof el.tagName !== 'string') return false;
	const tag = el.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
};
