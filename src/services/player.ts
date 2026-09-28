import { DefaultExtractors } from "@discord-player/extractor";
import { load as loadExtractors } from "@extractorpack/extractorpack";
import { Player, type SearchResult } from "discord-player";
import type { Client, GuildMember, Message } from "discord.js";

import { getConfig } from "./config.js";
import { logger } from "./logger.js";

let player: Player | undefined;
let playerDownReason: string | undefined;

const playerHealthCheckQuery = "https://www.youtube.com/playlist?list=PLUSI8zJ8UM4H6ZGVT4psbs35WnyGLCxMj";
const playerHealthCheckMaxAttempts = 3;

export interface InitializePlayerOptions {
	readonly bypassHealthCheck?: boolean;
}

function updateQueueMessage(queue: { metadata: { statusMessage?: Message } }, content: string): void {
	void queue.metadata.statusMessage?.edit(content).catch((error: unknown) => {
		logger.warn("PLAYER", "Failed to update player status message", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}

function registerPlayerDebugListeners(): void {
	const initializedPlayer = getPlayer();
	const events = initializedPlayer.events;

	initializedPlayer.on("debug", (message) => {
		logger.debug("PLAYER", message);
	});
	events.on("debug", (queue, message) => {
		logger.debug("PLAYER", `Queue ${queue.guild.id}: ${message}`);
	});
	events.on("playerStart", (queue, track) => {
		logger.debug("PLAYER", "Track started", {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			track: track.title,
		});
	});
	events.on("playerFinish", (queue, track) => {
		logger.debug("PLAYER", "Track finished", {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			track: track.title,
		});
	});
	events.on("playerSkip", (queue, track, reason, description) => {
		logger.debug("PLAYER", "Track skipped", {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			track: track.title,
			reason,
			description,
		});
	});
	events.on("audioTrackAdd", (queue, track) => {
		logger.debug("PLAYER", "Track added to queue", {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			track: track.title,
		});
	});
	events.on("audioTracksAdd", (queue, tracks) => {
		logger.debug("PLAYER", "Tracks added to queue", {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			count: tracks.length,
		});
	});
	events.on("audioTrackRemove", (queue, track) => {
		logger.debug("PLAYER", "Track removed from queue", {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			track: track.title,
		});
	});
	events.on("audioTracksRemove", (queue, tracks) => {
		logger.debug("PLAYER", "Tracks removed from queue", {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			count: tracks.length,
		});
	});
	events.on("emptyQueue", (queue) => {
		logger.debug("PLAYER", "Queue is empty", { guild: `${queue.guild.name} <${queue.guild.id}>` });
	});
	events.on("emptyChannel", (queue) => {
		logger.debug("PLAYER", "Voice channel is empty", { guild: `${queue.guild.name} <${queue.guild.id}>` });
	});
	events.on("disconnect", (queue) => {
		logger.debug("PLAYER", "Player disconnected", { guild: `${queue.guild.name} <${queue.guild.id}>` });
	});
	events.on("queueCreate", (queue) => {
		logger.debug("PLAYER", "Queue created", { guild: `${queue.guild.name} <${queue.guild.id}>` });
	});
	events.on("queueDelete", (queue) => {
		logger.debug("PLAYER", "Queue deleted", { guild: `${queue.guild.name} <${queue.guild.id}>` });
	});
	logger.info("PLAYER", "Player debug listeners loaded");
}

function registerPlayerListeners(): void {
	const initializedPlayer = getPlayer();
	initializedPlayer.on("error", (error) => {
		logger.error("PLAYER", `Player error: ${error.message}`, { stack: error.stack });
	});
	initializedPlayer.events.on("error", (queue, error) => {
		logger.error("PLAYER", `Queue ${queue.guild.name} <${queue.guild.id}> error: ${error.message}`, {
			stack: error.stack,
			track: queue.currentTrack?.title,
		});
	});
	initializedPlayer.events.on("playerError", (queue, error, track) => {
		updateQueueMessage(queue, `⚠️ Playback failed for **${track.title}**.`);
		logger.error("PLAYER", `Track playback error: ${error.message}`, {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			stack: error.stack,
			track: track.title,
		});
	});
}

function registerPlayerStatusListeners(): void {
	const initializedPlayer = getPlayer();
	const events = initializedPlayer.events;

	events.on("playerStart", (queue, track) => {
		updateQueueMessage(queue, `▶️ Started playing: **${track.title}**`);
	});
	events.on("playerSkip", (queue, track, reason, description) => {
		updateQueueMessage(queue, `⚠️ Skipping: **${track.title}** (${description || reason})`);
	});
	events.on("audioTrackAdd", (queue, track) => {
		updateQueueMessage(queue, `🎵 Track queued: **${track.title}**`);
	});
	events.on("audioTracksAdd", (queue, tracks) => {
		updateQueueMessage(queue, `🎶 ${tracks.length} tracks queued.`);
	});
	events.on("emptyQueue", (queue) => {
		updateQueueMessage(queue, "✅ Queue finished.");
	});
	events.on("emptyChannel", (queue) => {
		updateQueueMessage(queue, "⚠️ The voice channel is empty. Leaving soon.");
	});
	events.on("disconnect", (queue) => {
		updateQueueMessage(queue, "⚠️ Playback disconnected.");
	});
}

export async function initializePlayer(client: Client): Promise<Player | undefined> {
	if (player) {
		return player;
	}
	if (playerDownReason) {
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
		registerPlayerListeners();
		registerPlayerStatusListeners();
		if (getConfig("PLAYER_DEBUG")) {
			registerPlayerDebugListeners();
		}
		logger.info("PLAYER", "Player initialized", {
			extractorsCount: initializedPlayer.extractors.store.size,
		});
		return initializedPlayer;
	} catch (error: unknown) {
		player = undefined;
		playerDownReason = error instanceof Error ? error.message : String(error);
		logger.error("PLAYER", "Player is down; music commands are unavailable", {
			error: playerDownReason,
			stack: error instanceof Error ? error.stack : undefined,
		});
		return undefined;
	}
}

export async function runPlayerHealthCheck({
	bypassHealthCheck = false,
}: InitializePlayerOptions = {}): Promise<boolean> {
	if (!player) {
		logger.error("PLAYER", "Player health check could not run because the player is unavailable", {
			error: playerDownReason ?? "Player has not been initialized",
		});
		return false;
	}

	try {
		let healthCheckTracks = 0;
		let healthCheckAttempt = 0;
		for (let attempt = 1; attempt <= playerHealthCheckMaxAttempts; attempt += 1) {
			healthCheckAttempt = attempt;
			const healthCheckResult = await player.search(playerHealthCheckQuery, {
				fallbackSearchEngine: "youtubeSearch",
			});
			healthCheckTracks = healthCheckResult.tracks.length + (healthCheckResult.playlist?.tracks.length ?? 0);
			if (healthCheckTracks > 0 || attempt === playerHealthCheckMaxAttempts) {
				break;
			}
			await new Promise((resolve) => setTimeout(resolve, 1000));
		}

		if (healthCheckTracks === 0) {
			if (bypassHealthCheck) {
				logger.debug("PLAYER", "Player health check failing but bypassed", {
					query: playerHealthCheckQuery,
					healthCheckTracks,
					attempt: `${healthCheckAttempt}/${playerHealthCheckMaxAttempts}`,
				});
				return true;
			}
			throw new Error(`Player health check found no tracks for "${playerHealthCheckQuery}"`);
		}

		logger.info("PLAYER", "Player health check passed", {
			tracks: healthCheckTracks,
			attempt: `${healthCheckAttempt}/${playerHealthCheckMaxAttempts}`,
		});
		return true;
	} catch (error: unknown) {
		player = undefined;
		playerDownReason = error instanceof Error ? error.message : String(error);
		logger.error("PLAYER", "Player is down; music commands are unavailable", {
			error: playerDownReason,
			stack: error instanceof Error ? error.stack : undefined,
		});
		return false;
	}
}

export function getPlayer(): Player {
	if (!player) {
		throw new Error(playerDownReason ?? "Player has not been initialized");
	}

	return player;
}

export async function searchPlayer(query: string): Promise<SearchResult> {
	return getPlayer().search(query, { fallbackSearchEngine: "youtubeSearch" });
}

export async function playSearchResult({
	channel,
	member,
	searchResult,
	statusMessage,
}: {
	channel: string;
	member: GuildMember;
	searchResult: SearchResult;
	statusMessage: Message;
}): Promise<void> {
	await getPlayer().play(channel, searchResult, {
		nodeOptions: {
			metadata: { requestedBy: member.user.id, statusMessage },
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
}
