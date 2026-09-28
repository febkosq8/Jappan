import { DefaultExtractors } from "@discord-player/extractor";
import { load as loadExtractors } from "@extractorpack/extractorpack";
import { Player, type SearchResult } from "discord-player";
import type { APIInteractionGuildMember, Client, GuildMember, Message } from "discord.js";

import { registerPlayerHandlers } from "../handlers/player.js";
import { checkPlayerHealth } from "../helpers/player.js";
import { formatUser } from "../helpers/discord.js";
import { getConfig } from "./config.js";
import { logger } from "./logger.js";

let player: Player | undefined;
let playerDown = false;

export class PlayerNotInitializedError extends Error {
	public constructor() {
		super("Player is not initialized");
		this.name = "PlayerNotInitializedError";
	}
}

export type PlayerErrorCode = "PLAYER_NOT_INITIALIZED" | "PLAYER_DOWN";

export type PlayerResult<Result> =
	| { readonly success: true; readonly data: Result }
	| { readonly success: false; readonly error_code: PlayerErrorCode };

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
		const playerOptions = {
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

export async function searchPlayer(query: string): Promise<PlayerResult<SearchResult>> {
	const errorCode = getPlayerErrorCode();
	if (errorCode) {
		return { success: false, error_code: errorCode };
	}

	return { success: true, data: await getPlayer().search(query, { fallbackSearchEngine: "youtubeSearch" }) };
}

export async function playSearchResult({
	channel,
	member,
	searchResult,
	statusMessage,
}: {
	channel: string;
	member: GuildMember | APIInteractionGuildMember;
	searchResult: SearchResult;
	statusMessage: Message;
}): Promise<PlayerResult<void>> {
	const errorCode = getPlayerErrorCode();
	if (errorCode) {
		return { success: false, error_code: errorCode };
	}

	await getPlayer().play(channel, searchResult, {
		nodeOptions: {
			metadata: { requestedBy: member.user.id, requestedByDisplay: formatUser(member.user), statusMessage },
			bufferingTimeout: 15000,
			leaveOnStop: true,
			leaveOnStopCooldown: 5000,
			leaveOnEnd: true,
			leaveOnEndCooldown: 15000,
			leaveOnEmpty: true,
			leaveOnEmptyCooldown: 300000,
		},
		requestedBy: member.user.id,
	});
	return { success: true, data: undefined };
}
