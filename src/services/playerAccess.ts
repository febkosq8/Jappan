import { DiscordAPIError, RESTJSONErrorCodes } from "discord.js";
import type { PlayerChange, PlayerChangeSource, PlayerQueue, PlayerQueueMetadata } from "../helpers/player.js";
import AuthUserModel from "../models/authUser.js";
import type { AuthSession } from "./auth.js";
import { logger } from "./logger.js";
export const playerGuildMemberRequired = "You must be a member of this player's server to use it";
const playerAccessValidationFailed = "Player access validation failed";

/** The user performing an action, from Discord or from the logged-in web user. */
export interface PlayerActor {
	readonly id: string;
	readonly username: string;
	readonly source: PlayerChangeSource;
	/** Bot admins can use any session and bypass the lock. */
	readonly isAdmin: boolean;
	/** Connected to the session's voice channel (always true for admins). Required to change the session. */
	readonly inVoiceChannel: boolean;
}

/** The session owner is the user who started it. */
export function isPlayerSessionOwner(queue: PlayerQueue, actor: Pick<PlayerActor, "id">): boolean {
	return actor.id === queue.metadata.owner.id;
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
	actor: Pick<PlayerActor, "id" | "username" | "source">,
): void {
	const change: PlayerChange = {
		id: actor.id,
		username: actor.username,
		source: actor.source,
		timestampMs: Date.now(),
	};
	queue.metadata.lastChangedBy = change;
}

/** The signed-in dashboard user behind a web player action. */
export interface PlayerWebUser {
	/** Linked Discord account ID; every dashboard account signs in with Discord, so it always has one. */
	readonly id: string;
	readonly username: string;
	readonly isAdmin: boolean;
}
export type PlayerActorResult =
	| { readonly success: true; readonly actor: PlayerActor }
	| { readonly success: false; readonly status: 403 | 500; readonly error: string };
export function toPlayerWebUser({ session, id }: { session: AuthSession; id: string }): PlayerWebUser {
	return {
		id,
		username: session.user.username ?? session.user.name,
		isAdmin: session.user.role === "admin",
	};
}
export async function getPlayerWebUser(session: AuthSession): Promise<PlayerWebUser> {
	const user = await AuthUserModel.findById(session.user.id).select({ discordAccountId: 1 }).exec();
	if (!user?.discordAccountId) {
		throw new Error("Signed-in user has no linked Discord account");
	}
	return toPlayerWebUser({ session, id: user.discordAccountId });
}
/** Whether the Discord user is connected to the session's voice channel, from the gateway cache only. */
export function isUserInPlayerVoiceChannel(queue: PlayerQueue, userId: string): boolean {
	const channel = queue.channel;
	return channel !== null && "members" in channel && channel.members.has(userId);
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
		id: user.id,
		username: user.username,
		source: "web",
		isAdmin: user.isAdmin,
		inVoiceChannel: user.isAdmin,
	};
	if (user.isAdmin) {
		return { success: true, actor };
	}
	if (!queue.guild.available) {
		return { success: false, status: 403, error: playerGuildMemberRequired };
	}
	try {
		// Cache-first: discord.js only calls the API when the member is not already cached
		const member = await queue.guild.members.fetch(actor.id);
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
