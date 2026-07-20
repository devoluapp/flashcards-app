import { fsrs, generatorParameters, Rating, State, type Card as FsrsCard } from 'ts-fsrs';
import type { CardRecord, FsrsState } from './types';
import { currentUser } from './pb';

export { Rating };

const STATE_NAMES: Record<State, FsrsState> = {
	[State.New]: 'new',
	[State.Learning]: 'learning',
	[State.Review]: 'review',
	[State.Relearning]: 'relearning'
};
const STATE_VALUES: Record<FsrsState, State> = {
	new: State.New,
	learning: State.Learning,
	review: State.Review,
	relearning: State.Relearning
};

export function stateName(state: State): FsrsState {
	return STATE_NAMES[state] ?? 'new';
}

export function makeScheduler() {
	const u = currentUser();
	const params = generatorParameters({
		request_retention: u?.desired_retention ?? 0.9,
		enable_fuzz: true,
		w: u?.fsrs_params?.length ? u.fsrs_params : undefined
	});
	return fsrs(params);
}

export function toFsrsCard(rec: CardRecord): FsrsCard {
	return {
		due: rec.due ? new Date(rec.due) : new Date(),
		stability: rec.stability ?? 0,
		difficulty: rec.difficulty ?? 0,
		elapsed_days: rec.elapsed_days ?? 0,
		scheduled_days: rec.scheduled_days ?? 0,
		learning_steps: 0,
		reps: rec.reps ?? 0,
		lapses: rec.lapses ?? 0,
		state: rec.state ? STATE_VALUES[rec.state] : State.New,
		last_review: rec.last_review ? new Date(rec.last_review) : undefined
	};
}

export const RATINGS = [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy] as const;

export const RATING_LABEL: Record<number, string> = {
	[Rating.Again]: 'Errei',
	[Rating.Hard]: 'Difícil',
	[Rating.Good]: 'Bom',
	[Rating.Easy]: 'Fácil'
};
