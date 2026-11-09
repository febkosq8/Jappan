import type { PlayerChange, PlayerChangeSource, PlayerQueue, PlayerQueueMetadata } from "../helpers/player.js";

/** The user performing an action, from Discord or from the logged-in web user. */
export interface PlayerActor {
	/** Discord user ID; null only for an admin web user without a linked Discord account. */
	readonly userId: string | null;
	readonly username: string;
	readonly source: PlayerChangeSource;
	/** Bot admins can use any session and bypass the lock. */
	readonly isAdmin: boolean;
	/** Connected to the session's voice channel (always true for admins). Required to change the session. */
	readonly inVoiceChannel: boolean;
}

/** The session owner is the user who started it. */
export function isPlayerSessionOwner(queue: PlayerQueue, actor: Pick<PlayerActor, "userId">): boolean {
	return actor.userId !== null && actor.userId === queue.metadata.owner.id;
}

/** Changing a session needs the voice channel, and while locked only the owner and bot admins may change it. */
export function canControlPlayerSession(queue: PlayerQueue, actor: PlayerActor): boolean {
	if (!actor.inVoiceChannel) {
		return false;
	}
	return !queue.metadata.locked || actor.isAdmin || isPlayerSessionOwner(queue, actor);
}

/** Records who last changed the session, so the embed and the web player can show it. */
export function recordPlayerChange(
	queue: { metadata: PlayerQueueMetadata },
	actor: Pick<PlayerActor, "userId" | "username" | "source">,
): void {
	const change: PlayerChange = {
		userId: actor.userId,
		username: actor.username,
		source: actor.source,
		timestampMs: Date.now(),
	};
	queue.metadata.lastChangedBy = change;
}
