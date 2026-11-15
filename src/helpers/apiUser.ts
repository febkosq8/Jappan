export interface ApiUser {
	id: string;
	displayName: string;
	username: string;
	avatarUrl: string | null;
}

export function toApiUser({
	id,
	username,
	displayName,
	avatarUrl,
}: {
	id: string;
	username: string;
	displayName?: string | null | undefined;
	avatarUrl?: string | null;
}): ApiUser {
	return {
		id,
		displayName: displayName ?? username,
		username,
		avatarUrl: avatarUrl ?? null,
	};
}
