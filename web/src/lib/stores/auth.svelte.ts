import { pb, currentUser } from '$lib/pb';
import type { UserRecord } from '$lib/types';

class AuthStore {
	user = $state<UserRecord | null>(currentUser());
	isValid = $state(pb.authStore.isValid);

	constructor() {
		pb.authStore.onChange(() => {
			this.user = currentUser();
			this.isValid = pb.authStore.isValid;
		}, true);
	}

	logout() {
		pb.authStore.clear();
	}
}

export const auth = new AuthStore();
