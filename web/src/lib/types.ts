// Espelha o schema em flashcards-backend/backend/pb_migrations/*.js — mantenha em sincronia.

export type Plan = 'free' | 'pro';
export type FsrsState = 'new' | 'learning' | 'review' | 'relearning';
export type ImportType = 'anki' | 'quizlet' | 'csv';
export type ImportStatus = 'pending' | 'processing' | 'done' | 'error';

export interface BaseRecord {
	id: string;
	collectionId: string;
	collectionName: string;
	created: string;
	updated: string;
}

export interface UserRecord extends BaseRecord {
	email: string;
	name: string;
	avatar: string;
	plan: Plan;
	desired_retention: number;
	fsrs_params: number[] | null;
	timezone: string;
	storage_used: number;
	settings: Record<string, unknown> | null;
	verified: boolean;
}

export interface DeckRecord extends BaseRecord {
	user: string;
	name: string;
	description: string;
	color: string;
	parent: string;
	is_public: boolean;
	deleted: boolean;
}

export interface CardRecord extends BaseRecord {
	user: string;
	deck: string;
	front: string;
	back: string;
	front_image: string;
	back_image: string;
	media: string[];
	tags: string[] | null;
	state: FsrsState;
	due: string;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	scheduled_days: number;
	reps: number;
	lapses: number;
	last_review: string;
	suspended: boolean;
	source: string;
	deleted: boolean;
}

export interface ReviewLogRecord extends BaseRecord {
	user: string;
	card: string;
	rating: 1 | 2 | 3 | 4;
	state: FsrsState;
	due: string;
	stability: number;
	difficulty: number;
	elapsed_days: number;
	last_elapsed_days: number;
	scheduled_days: number;
	review: string;
	duration_ms: number;
}

export interface ImportJobRecord extends BaseRecord {
	user: string;
	type: ImportType;
	file: string;
	target_deck: string;
	options: Record<string, unknown> | null;
	status: ImportStatus;
	result: { created?: number; total?: number; error?: string } | null;
}
