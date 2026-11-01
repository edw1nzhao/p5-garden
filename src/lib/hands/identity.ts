import type { Handedness, RawFrame, RawHand } from './frames.js';

export type Role = 'drawing' | 'off';

/** A hand with an id that stays the same for as long as it is tracked. */
export interface TrackedHand {
	id: number;
	hand: RawHand;
}

export interface SlotFrame {
	time: number;
	aspect: number;
	drawing: TrackedHand | null;
	off: TrackedHand | null;
	/** The wrists are so close that roles are frozen and new actions should wait. */
	crossing: boolean;
}

export interface SlotOptions {
	drawingHand?: Handedness;
	/** How long a hand that drops out keeps its slot. */
	graceMs?: number;
	/** How far, in frame widths, a hand may be from where its track was heading. */
	gate?: number;
	/** Wrist distance, in frame widths, below which the hands count as crossing. */
	crossing?: number;
}

// Unverified: MediaPipe's docs say labels name the user's own hands for unmirrored input.
export const LABEL_IS_USERS_HAND = true;

interface Vec {
	x: number;
	y: number;
}

interface Track {
	id: number;
	hand: RawHand;
	pos: Vec;
	vel: Vec;
	seen: number;
	born: number;
	/** Running vote for the user's own right hand (+1) or left (-1), weighted by score. */
	belief: number;
}

interface Detection {
	hand: RawHand;
	pos: Vec;
}

const ROLES: Role[] = ['drawing', 'off'];
const other = (role: Role): Role => (role === 'drawing' ? 'off' : 'drawing');
const distance = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);
const usersHand = (hand: RawHand): Handedness =>
	LABEL_IS_USERS_HAND ? hand.label : hand.label === 'Left' ? 'Right' : 'Left';
const vote = (hand: RawHand) => (usersHand(hand) === 'Right' ? 1 : -1) * hand.score;
// How fast a hand's label vote follows new frames, and how sure it must be to change role.
const BELIEF_RATE = 0.2;
const ROLE_MARGIN = 0.3;

/** Two role slots fed by MediaPipe's unordered hands, matched by where each wrist was heading. */
export class HandSlots {
	#tracks: Record<Role, Track | null> = { drawing: null, off: null };
	#nextId = 1;
	#options: Required<SlotOptions>;

	constructor(options: SlotOptions = {}) {
		this.#options = {
			drawingHand: 'Right',
			graceMs: 300,
			gate: 0.25,
			crossing: 0.15,
			...options
		};
	}

	/** `locked` while the drawing hand is mid-stroke, so roles cannot change under it. */
	update(frame: RawFrame, { locked = false }: { locked?: boolean } = {}): SlotFrame {
		const { graceMs, crossing: crossAt } = this.#options;
		const time = frame.time;
		for (const role of ROLES) {
			const track = this.#tracks[role];
			if (track && time - track.seen > graceMs) this.#tracks[role] = null;
		}

		const detections = [...frame.hands]
			.sort((a, b) => b.score - a.score)
			.slice(0, 2)
			.map((hand) => ({
				hand,
				pos: { x: hand.landmarks[0].x, y: hand.landmarks[0].y / frame.aspect }
			}));
		const { drawing, off } = this.#tracks;
		const crossing =
			!!drawing && !!off && distance(predict(drawing, time), predict(off, time)) < crossAt;
		const live = ROLES.filter((role) => this.#tracks[role]);

		if (!(crossing && detections.length < live.length)) {
			const matched = this.#match(live, detections, time);
			for (const [role, detection] of matched) this.#follow(this.#tracks[role]!, detection, time);
			const born = detections.filter((d) => ![...matched.values()].includes(d));
			if (!crossing) this.#birth(born, time);
		}

		if (!crossing && !locked) this.#assignRoles();

		const out = (role: Role) => {
			const track = this.#tracks[role];
			return track ? { id: track.id, hand: track.hand } : null;
		};
		return { time, aspect: frame.aspect, drawing: out('drawing'), off: out('off'), crossing };
	}

	/** The pairing of tracks to detections that matches the most hands, then the closest. */
	#match(roles: Role[], detections: Detection[], time: number): Map<Role, Detection> {
		const pairs = roles.flatMap((role) =>
			detections
				.map((d) => ({ role, d, cost: distance(predict(this.#tracks[role]!, time), d.pos) }))
				.filter((p) => p.cost < this.#options.gate)
		);
		let best: typeof pairs = [];
		let bestCost = Infinity;
		for (let mask = 0; mask < 1 << pairs.length; mask++) {
			const chosen = pairs.filter((_, i) => mask & (1 << i));
			const roleSet = new Set(chosen.map((p) => p.role));
			const detSet = new Set(chosen.map((p) => p.d));
			if (roleSet.size < chosen.length || detSet.size < chosen.length) continue;
			const cost = chosen.reduce((sum, p) => sum + p.cost, 0);
			if (chosen.length > best.length || (chosen.length === best.length && cost < bestCost)) {
				best = chosen;
				bestCost = cost;
			}
		}
		return new Map(best.map((p) => [p.role, p.d]));
	}

	/** The dominant hand draws; a tie keeps the current roles. */
	#assignRoles() {
		const sign = this.#options.drawingHand === 'Right' ? 1 : -1;
		const { drawing, off } = this.#tracks;
		const dominance = (t: Track) => t.belief * sign;
		if (drawing && off) {
			if (dominance(off) - dominance(drawing) > ROLE_MARGIN)
				this.#tracks = { drawing: off, off: drawing };
		} else if (drawing && dominance(drawing) < -ROLE_MARGIN) {
			this.#tracks = { drawing: null, off: drawing };
		} else if (off && dominance(off) > ROLE_MARGIN) {
			this.#tracks = { drawing: off, off: null };
		}
	}

	#follow(track: Track, detection: Detection, time: number) {
		const dt = time - track.seen;
		if (dt > 0) {
			const vx = (detection.pos.x - track.pos.x) / dt;
			const vy = (detection.pos.y - track.pos.y) / dt;
			track.vel = { x: (track.vel.x + vx) / 2, y: (track.vel.y + vy) / 2 };
		}
		track.pos = detection.pos;
		track.belief += BELIEF_RATE * (vote(detection.hand) - track.belief);
		track.hand = detection.hand;
		track.seen = time;
	}

	#birth(born: Detection[], time: number) {
		const { drawingHand } = this.#options;
		const track = (d: Detection): Track => ({
			id: this.#nextId++,
			hand: d.hand,
			pos: d.pos,
			vel: { x: 0, y: 0 },
			seen: time,
			born: time,
			belief: vote(d.hand)
		});
		if (born.length === 2 && !this.#tracks.drawing && !this.#tracks.off) {
			const [a, b] = born;
			const aLabel = usersHand(a.hand) === drawingHand;
			const bLabel = usersHand(b.hand) === drawingHand;
			// The user's right hand shows on the left of an unmirrored camera image.
			const aSide = drawingHand === 'Right' ? a.pos.x < b.pos.x : a.pos.x > b.pos.x;
			const aDraws = aLabel !== bLabel ? aLabel : aSide;
			this.#tracks = { drawing: track(aDraws ? a : b), off: track(aDraws ? b : a) };
			return;
		}
		for (const d of born) {
			const wanted: Role = usersHand(d.hand) === drawingHand ? 'drawing' : 'off';
			const role = !this.#tracks[wanted]
				? wanted
				: !this.#tracks[other(wanted)]
					? other(wanted)
					: null;
			if (role) this.#tracks[role] = track(d);
		}
	}
}

function predict(track: Track, time: number): Vec {
	const dt = Math.min(time - track.seen, 200);
	return { x: track.pos.x + track.vel.x * dt, y: track.pos.y + track.vel.y * dt };
}
