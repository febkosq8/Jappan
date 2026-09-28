import { Player } from "discord-player";
import type { Message } from "discord.js";

import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";

export interface PlayerHealthCheckResult {
	readonly tracks: number;
	readonly attempt: number;
}

export function updatePlayerQueueMessage(queue: { metadata: { statusMessage?: Message } }, content: string): void {
	void queue.metadata.statusMessage?.edit(content).catch((error: unknown) => {
		logger.warn("PLAYER", "Failed to update player status message", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}

export async function checkPlayerHealth(initializedPlayer: Player): Promise<PlayerHealthCheckResult> {
	const healthCheckQuery = getConfig("PLAYER_HEALTH_CHECK_QUERY");
	const healthCheckMaxAttempts = getConfig("PLAYER_HEALTH_CHECK_MAX_ATTEMPTS");
	let healthCheckTracks = 0;
	let healthCheckAttempt = 0;

	for (let attempt = 1; attempt <= healthCheckMaxAttempts; attempt += 1) {
		healthCheckAttempt = attempt;
		const healthCheckResult = await initializedPlayer.search(healthCheckQuery, {
			fallbackSearchEngine: "youtubeSearch",
		});
		healthCheckTracks = healthCheckResult.tracks.length + (healthCheckResult.playlist?.tracks.length ?? 0);
		if (healthCheckTracks > 0 || attempt === healthCheckMaxAttempts) {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	return { tracks: healthCheckTracks, attempt: healthCheckAttempt };
}
