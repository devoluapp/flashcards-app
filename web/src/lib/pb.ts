import PocketBase from 'pocketbase';
import { PUBLIC_PB_URL } from '$env/static/public';
import type { UserRecord } from './types';

export const pb = new PocketBase(PUBLIC_PB_URL || 'http://127.0.0.1:8090');

// v0.23+: pb.authStore.record (não .model) e pb.files.getURL (não getUrl)
export function currentUser(): UserRecord | null {
	return (pb.authStore.record as UserRecord | null) ?? null;
}

export function fileUrl(record: { collectionId: string; collectionName: string; id: string }, filename: string, opts?: { thumb?: string }): string {
	if (!filename) return '';
	return pb.files.getURL(record, filename, opts);
}
