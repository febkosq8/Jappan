import { randomUUID } from "node:crypto";
import { DefaultExtractors } from "@discord-player/extractor";
import { load as loadExtractors } from "@extractorpack/extractorpack";
import { Player, type PlayerNodeInitializerOptions, type SearchOptions, type SearchResult } from "discord-player";
import type { APIInteractionGuildMember, Client, GuildMember, Message } from "discord.js";

import { registerPlayerHandlers } from "../handlers/player.js";
import {
	checkPlayerHealth,
	type PlayerQueue,
	type PlayerQueueMetadata,
	markPlayerStatusMessageReplaced,
	markPlayerStatusMessageShutdown,
	updatePlayerQueueMessage,
} from "../helpers/player.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";
import { isPlayerSessionOwner, recordPlayerChange } from "./playerAccess.js";
import { notifyPlayerChanged } from "./playerWebsocket.js";

let player: Player | undefined;
let playerDown = false;

export class PlayerNotInitializedError extends Error {
	public constructor() {
		super("Player is not initialized");
		this.name = "PlayerNotInitializedError";
	}
}

export type PlayerErrorCode = "PLAYER_NOT_INITIALIZED" | "PLAYER_DOWN";

export type PlayerPlayErrorCode = PlayerErrorCode | "PLAYER_LOCKED";
export type PlayerResult<Result, ErrorCode extends string = PlayerErrorCode> =
	{ readonly success: true; readonly data: Result } | { readonly success: false; readonly error_code: ErrorCode };

export interface ActivePlayerSession {
	readonly sessionId: string;
	readonly guild: { readonly id: string; readonly name: string; readonly icon: string | null };
	readonly channel: { readonly id: string; readonly name: string } | null;
	readonly owner: { readonly id: string; readonly username: string; readonly avatarUrl: string | null };
	readonly queueSize: number;
	readonly nowPlaying: {
		readonly name: string;
		readonly url: string | null;
		readonly timestamp: { readonly current: string; readonly total: string | null } | null;
	} | null;
	readonly playerState: "Playing" | "Paused";
}

function getPlayerErrorCode(): PlayerErrorCode | undefined {
	if (!player) {
		return "PLAYER_NOT_INITIALIZED";
	}
	if (playerDown) {
		return "PLAYER_DOWN";
	}
	return undefined;
}

export async function initializePlayer(client: Client): Promise<Player | undefined> {
	if (player) {
		return player;
	}
	if (playerDown) {
		return undefined;
	}

	try {
		const playerOptions: ConstructorParameters<typeof Player>[1] = {
			skipFFmpeg: false,
		};
		const initializedPlayer = new Player(
			client as unknown as ConstructorParameters<typeof Player>[0],
			playerOptions,
		);
		await loadExtractors(initializedPlayer);
		await initializedPlayer.extractors.loadMulti(DefaultExtractors);
		player = initializedPlayer;
		registerPlayerHandlers(initializedPlayer);
		logger.info("PLAYER", "Player initialized", {
			extractorsCount: initializedPlayer.extractors.store.size,
		});
		return initializedPlayer;
	} catch (error: unknown) {
		player = undefined;
		playerDown = true;
		logger.error("PLAYER", "Player is down; music commands are unavailable", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return undefined;
	}
}

export async function runPlayerHealthCheck(): Promise<boolean> {
	if (!player) {
		playerDown = true;
		logger.warn("PLAYER", "Health check could not run because the Player instance is unavailable");
		return false;
	}

	const healthCheckMaxAttempts = getConfig("PLAYER_HEALTH_CHECK_MAX_ATTEMPTS");
	if (healthCheckMaxAttempts === 0) {
		playerDown = false;
		logger.info("PLAYER", "Player health check bypassed by configuration");
		return true;
	}

	try {
		const healthCheckResult = await checkPlayerHealth(player);

		if (healthCheckResult.tracks === 0) {
			playerDown = true;
			logger.warn("PLAYER", "Health check found no tracks; Player is down");
			return false;
		}

		playerDown = false;
		logger.info("PLAYER", "Health check passed", {
			tracks: healthCheckResult.tracks,
			attempt: `${healthCheckResult.attempt}/${healthCheckMaxAttempts}`,
			playbackChecked: healthCheckResult.playbackChecked,
		});
		return true;
	} catch (error: unknown) {
		playerDown = true;
		logger.error("PLAYER", "Error occurred during health check; Player is down", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
		return false;
	}
}

export function getPlayer(): Player {
	if (!player) {
		throw new PlayerNotInitializedError();
	}

	return player;
}

/**
 * Finds the active queue for an unguessable player session ID stored in queue metadata.
 * The session ID is not the guild ID, so it cannot be derived from public information.
 */
export function getQueueBySessionId(sessionId: string): PlayerQueue | undefined {
	return listPlayerQueues().find((queue) => !queue.metadata.healthCheck && queue.metadata.sessionId === sessionId);
}
/** Every active queue, including the health-check queue while its probe is running. */
function listPlayerQueues(): PlayerQueue[] {
	return player ? [...player.nodes.cache.values()] : [];
}
export function isPlayerAvailable(): boolean {
	return player !== undefined && !playerDown;
}

export function getActivePlayerSessions(): ActivePlayerSession[] {
	return listPlayerQueues().map((queue) => {
		const { owner } = queue.metadata;
		const ownerUser = queue.guild.client.users.cache.get(owner.id);
		const track = queue.currentTrack;
		const timestamp = track ? queue.node.getTimestamp(true) : null;
		const trackUrl = track?.url;
		const nowPlayingUrl =
			trackUrl && URL.canParse(trackUrl) && ["http:", "https:"].includes(new URL(trackUrl).protocol)
				? trackUrl
				: null;
		return {
			sessionId: queue.metadata.sessionId,
			guild: { id: queue.guild.id, name: queue.guild.name, icon: queue.guild.iconURL() },
			channel: queue.channel ? { id: queue.channel.id, name: queue.channel.name } : null,
			owner: {
				id: owner.id,
				username: ownerUser?.username ?? owner.username,
				avatarUrl: ownerUser?.displayAvatarURL() ?? null,
			},
			queueSize: queue.tracks.size,
			nowPlaying: track
				? {
						name: track.title,
						url: nowPlayingUrl,
						timestamp:
							timestamp && Number.isFinite(timestamp.current.value) && timestamp.current.value >= 0
								? {
										current: timestamp.current.label,
										total:
											Number.isFinite(timestamp.total.value) && timestamp.total.value > 0
												? timestamp.total.label
												: null,
									}
								: null,
					}
				: null,
			playerState: queue.node.isPaused() ? "Paused" : "Playing",
		};
	});
}

export async function shutdownPlayer(): Promise<void> {
	if (!player) {
		return;
	}

	const activePlayer = player;
	player = undefined;
	try {
		for (const queue of activePlayer.nodes.cache.values()) {
			const message = queue.metadata.statusMessage;
			if (!message) continue;
			try {
				await markPlayerStatusMessageShutdown(message);
			} catch (error: unknown) {
				logger.warn("PLAYER", "Failed to update player status during shutdown", {
					messageId: message.id,
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		await activePlayer.destroy();
		logger.info("PLAYER", "All active player queues stopped");
	} catch (error: unknown) {
		logger.error("PLAYER", "Failed to stop all active player queues", {
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
		});
	}
}

export async function searchPlayer(
	query: string,
	searchOptions = {} as SearchOptions,
): Promise<PlayerResult<SearchResult>> {
	const errorCode = getPlayerErrorCode();
	if (errorCode) {
		return { success: false, error_code: errorCode };
	}

	return {
		success: true,
		data: await getPlayer().search(query, { fallbackSearchEngine: "youtubeSearch", ...searchOptions }),
	};
}

export async function playSearchResult({
	channel,
	member,
	searchResult,
	statusMessage,
	previousStatusMessage,
	shuffle = false,
	repeatMode = 0,
	playNodeOptions,
}: {
	channel: string;
	member: GuildMember | APIInteractionGuildMember;
	searchResult: SearchResult;
	statusMessage: Message;
	previousStatusMessage?: Message;
	shuffle?: boolean;
	repeatMode?: 0 | 1 | 2 | 3;
	playNodeOptions?: Omit<NonNullable<PlayerNodeInitializerOptions<PlayerQueueMetadata>["nodeOptions"]>, "metadata">;
}): Promise<PlayerResult<void, PlayerPlayErrorCode>> {
	const errorCode = getPlayerErrorCode();
	if (errorCode) {
		return { success: false, error_code: errorCode };
	}
	// Adding tracks changes the queue, so a locked session only accepts the owner
	const existingQueue = listPlayerQueues().find(
		(candidate) => candidate.channel?.id === channel && !candidate.metadata.healthCheck,
	);
	if (
		existingQueue &&
		existingQueue.metadata.locked &&
		!isPlayerSessionOwner(existingQueue, { userId: member.user.id })
	) {
		return { success: false, error_code: "PLAYER_LOCKED" };
	}

	// Only used when this call creates the queue; an existing queue keeps its own metadata
	const metadata: PlayerQueueMetadata = {
		sessionId: randomUUID(),
		owner: { id: member.user.id, username: member.user.username },
		locked: false,
		shuffle,
		statusMessage,
	};
	const { queue } = await getPlayer().play<PlayerQueueMetadata>(channel, searchResult, {
		nodeOptions: {
			repeatMode,
			bufferingTimeout: 15000,
			leaveOnStop: true,
			leaveOnStopCooldown: 5000,
			leaveOnEnd: true,
			leaveOnEndCooldown: 15000,
			leaveOnEmpty: true,
			leaveOnEmptyCooldown: 300000,
			...playNodeOptions,
			metadata,
		},
		requestedBy: member.user.id,
	});
	if (previousStatusMessage && previousStatusMessage.id !== statusMessage.id) {
		await markPlayerStatusMessageReplaced({
			message: previousStatusMessage,
			requestedById: member.user.id,
		});
	}
	recordPlayerChange(queue, { userId: member.user.id, username: member.user.username, source: "discord" });
	queue.metadata.statusMessage = statusMessage;
	notifyPlayerChanged(queue);
	await updatePlayerQueueMessage({ queue, content: "" });
	return { success: true, data: undefined };
}
