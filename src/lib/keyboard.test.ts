import { describe, it, expect } from 'vitest';
import { isTypingTarget } from './keyboard';

/** Stand-in for a DOM node: the helper only reads tagName and isContentEditable. */
const node = (tagName: string, editable = false) =>
	({ tagName, isContentEditable: editable }) as unknown as EventTarget;

describe('isTypingTarget', () => {
	it('claims the fields a player types into', () => {
		// The pseudo field in Leaderboard.tsx and the bolides lobby-code field are both plain inputs.
		expect(isTypingTarget(node('INPUT'))).toBe(true);
		expect(isTypingTarget(node('TEXTAREA'))).toBe(true);
		expect(isTypingTarget(node('SELECT'))).toBe(true);
		expect(isTypingTarget(node('DIV', true))).toBe(true);
	});

	it('leaves the game its keys everywhere else', () => {
		expect(isTypingTarget(node('BODY'))).toBe(false);
		expect(isTypingTarget(node('CANVAS'))).toBe(false);
		expect(isTypingTarget(node('BUTTON'))).toBe(false);
		expect(isTypingTarget(node('DIV'))).toBe(false);
	});

	it('survives a target that is not an element', () => {
		// A key event can be retargeted at window or document, which have no tagName.
		expect(isTypingTarget(null)).toBe(false);
		expect(isTypingTarget({} as EventTarget)).toBe(false);
	});
});
