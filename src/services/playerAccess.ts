import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import type { PlayerChange, PlayerChangeSource, PlayerQueue, PlayerQueueMetadata } from "../helpers/player.js";
import AuthUserModel from "../models/authUser.js";
import type { AuthSession } from "./auth.js";
import { logger } from "./logger.js";
export const playerGuildMemberRequired = "You must be a member of this player's server to use it";
const playerAccessValidationFailed = "Player access validation failed";

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

/** The signed-in dashboard user behind a web player action. */
export interface PlayerWebUser {
	readonly username: string;
	readonly isAdmin: boolean;
	/** Linked Discord account; null when the account has none. */
	readonly discordAccountId: string | null;
}
export type PlayerActorResult =
	| { readonly success: true; readonly actor: PlayerActor }
	| { readonly success: false; readonly status: 403 | 500; readonly error: string };
export function toPlayerWebUser({
	session,
	discordAccountId,
}: {
	session: AuthSession;
	discordAccountId: string | null;
}): PlayerWebUser {
	return {
		username: session.user.username ?? session.user.name,
		isAdmin: session.user.role === "admin",
		discordAccountId,
	};
}
export async function getPlayerWebUser(session: AuthSession): Promise<PlayerWebUser> {
	const user = await AuthUserModel.findById(session.user.id).select({ discordAccountId: 1 }).exec();
	return toPlayerWebUser({ session, discordAccountId: user?.discordAccountId ?? null });
}
/** Whether the Discord user is connected to the session's voice channel, from the gateway cache only. */
export function isUserInPlayerVoiceChannel(queue: PlayerQueue, userId: string | null): boolean {
	const channel = queue.channel;
	return userId !== null && channel !== null && "members" in channel && channel.members.has(userId);
}
/**
 * Turns a signed-in user into the actor for a player session and requires them to be a member of the
 * session's guild; bot admins skip the membership check. Used by the HTTP route and the WebSocket so
 * both authorize identically.
 */
export async function resolvePlayerActor({
	queue,
	user,
}: {
	queue: PlayerQueue;
	user: PlayerWebUser;
}): Promise<PlayerActorResult> {
	const actor: PlayerActor = {
		userId: user.discordAccountId,
		username: user.username,
		source: "web",
		isAdmin: user.isAdmin,
		inVoiceChannel: user.isAdmin,
	};
	if (user.isAdmin) {
		return { success: true, actor };
	}
	if (!actor.userId || !queue.guild.available) {
		return { success: false, status: 403, error: playerGuildMemberRequired };
	}
	try {
		// Cache-first: discord.js only calls the API when the member is not already cached
		const member = await queue.guild.members.fetch(actor.userId);
		return {
			success: true,
			actor: {
				...actor,
				inVoiceChannel: Boolean(queue.channel) && member.voice.channelId === queue.channel?.id,
			},
		};
	} catch (error: unknown) {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) {
			return { success: false, status: 403, error: playerGuildMemberRequired };
		}
		logger.error("PLAYER", "Player guild membership validation failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return { success: false, status: 500, error: playerAccessValidationFailed };
	}
}
