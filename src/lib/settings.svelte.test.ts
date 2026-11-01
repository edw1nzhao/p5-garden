import { afterEach, describe, expect, it, vi } from 'vitest';
import { CALIBRATED_SHAPES, type Templates } from './hands/calibration.js';
import { settings, SETTINGS_KEY } from './settings.svelte.js';

function stubStorage(initial: Record<string, string> = {}) {
	const data = new Map(Object.entries(initial));
	vi.stubGlobal('localStorage', {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v)
	});
	return data;
}

const templates = Object.fromEntries(
	CALIBRATED_SHAPES.map((s, i) => [s, [i, 1, 1, 1, 0.5]])
) as Templates;

afterEach(() => {
	vi.unstubAllGlobals();
	settings.drawingHand = 'Right';
	settings.labelsInverted = false;
	settings.handsOnboarded = false;
	settings.calibration = null;
});

const saved = (data: Map<string, string>) => JSON.parse(data.get(SETTINGS_KEY)!);

describe('settings', () => {
	it('defaults to the right hand, upright labels, no setup and no calibration', () => {
		expect(settings.drawingHand).toBe('Right');
		expect(settings.labelsInverted).toBe(false);
		expect(settings.handsOnboarded).toBe(false);
		expect(settings.calibration).toBeNull();
	});

	it('saves the drawing hand under one key and loads it back', () => {
		const data = stubStorage();
		settings.drawingHand = 'Left';
		expect(saved(data)).toMatchObject({ drawingHand: 'Left' });
		settings.drawingHand = 'Right';
		data.set(SETTINGS_KEY, JSON.stringify({ drawingHand: 'Left' }));
		settings.load();
		expect(settings.drawingHand).toBe('Left');
	});

	it('saves and loads the label convention, the setup flag and the calibration', () => {
		const data = stubStorage();
		settings.labelsInverted = true;
		settings.handsOnboarded = true;
		settings.calibration = templates;
		expect(saved(data)).toEqual({
			drawingHand: 'Right',
			labelsInverted: true,
			handsOnboarded: true,
			calibration: templates
		});
		const stored = data.get(SETTINGS_KEY)!;
		settings.labelsInverted = false;
		settings.handsOnboarded = false;
		settings.calibration = null;
		data.set(SETTINGS_KEY, stored);
		settings.load();
		expect(settings.labelsInverted).toBe(true);
		expect(settings.handsOnboarded).toBe(true);
		expect(settings.calibration).toEqual(templates);
	});

	it('forgets an old sweep setting and drops a malformed calibration', () => {
		const data = stubStorage({
			[SETTINGS_KEY]: JSON.stringify({ sweepToClear: false, calibration: { fist: [1] } })
		});
		settings.load();
		expect(settings.calibration).toBeNull();
		settings.drawingHand = 'Left';
		expect(saved(data)).not.toHaveProperty('sweepToClear');
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
