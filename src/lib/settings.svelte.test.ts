import { afterEach, describe, expect, it, vi } from 'vitest';
import { settings, SETTINGS_KEY } from './settings.svelte.js';

function stubStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v)
	});
	return data;
}

afterEach(() => {
	vi.unstubAllGlobals();
	settings.drawingHand = 'Right';
});

describe('settings', () => {
	it('defaults to the right hand', () => {
		expect(settings.drawingHand).toBe('Right');
	});

	it('saves the drawing hand under one key and loads it back', () => {
		const data = stubStorage();
		settings.drawingHand = 'Left';
		expect(JSON.parse(data.get(SETTINGS_KEY)!)).toEqual({ drawingHand: 'Left' });
		settings.drawingHand = 'Right';
		data.set(SETTINGS_KEY, JSON.stringify({ drawingHand: 'Left' }));
		settings.load();
		expect(settings.drawingHand).toBe('Left');
	});

	it('ignores junk and keeps working when storage throws', () => {
		stubStorage({ [SETTINGS_KEY]: '{"drawingHand":"Both"}' });
		settings.load();
		expect(settings.drawingHand).toBe('Right');
		vi.stubGlobal('localStorage', {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			}
		});
		settings.load();
		settings.drawingHand = 'Left';
		expect(settings.drawingHand).toBe('Left');
	});
});
