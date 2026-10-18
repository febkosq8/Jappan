import { Player } from "discord-player";

import { formatGuild } from "../helpers/discord.js";
import { updatePlayerQueueMessage } from "../helpers/player.js";
import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";

export function registerPlayerHandlers(player: Player): void {
	registerPlayerErrorHandlers(player);
	registerPlayerStatusHandlers(player);
	if (getConfig("PLAYER_DEBUG")) {
		registerPlayerDebugHandlers(player);
	}
}

function registerPlayerErrorHandlers(player: Player): void {
	player.on("error", (error) => {
		logger.error("PLAYER", `Player error: ${error.message}`, { stack: error.stack });
	});
	player.events.on("error", (queue, error) => {
		logger.error("PLAYER", `Queue ${formatGuild(queue.guild)} error: ${error.message}`, {
			stack: error.stack,
			track: queue.currentTrack?.title,
		});
	});
	player.events.on("playerError", (queue, error, track) => {
		updatePlayerQueueMessage({ queue, content: `⚠️ Playback failed for **${track.title}**.` });
		logger.error("PLAYER", `Track playback error: ${error.message}`, {
			guild: formatGuild(queue.guild),
			stack: error.stack,
			track: track.title,
		});
	});
}

function registerPlayerStatusHandlers(player: Player): void {
	const events = player.events;

	events.on("playerStart", (queue, track) => {
		updatePlayerQueueMessage({ queue, content: `▶️ Started playing: **${track.title}**` });
	});
	events.on("playerSkip", (queue, track, reason, description) => {
		updatePlayerQueueMessage({ queue, content: `⚠️ Skipping: **${track.title}** (${description || reason})` });
	});
	events.on("audioTrackAdd", (queue, track) => {
		updatePlayerQueueMessage({ queue, content: `🎵 Track queued: **${track.title}**` });
	});
	events.on("audioTracksAdd", (queue, tracks) => {
		updatePlayerQueueMessage({ queue, content: `🎶 ${tracks.length} tracks queued.` });
	});
	events.on("emptyQueue", (queue) => {
		updatePlayerQueueMessage({ queue, content: "✅ Queue finished." });
	});
	events.on("emptyChannel", (queue) => {
		updatePlayerQueueMessage({ queue, content: "🔇 No one is in the voice channel. Leaving soon." });
	});
	events.on("disconnect", (queue) => {
		updatePlayerQueueMessage({ queue, content: "👋 Playback disconnected.", controls: false });
	});
}

function registerPlayerDebugHandlers(player: Player): void {
	const events = player.events;

	player.on("debug", (message) => {
		logger.debug("PLAYER", message);
	});
	events.on("debug", (queue, message) => {
		logger.debug("PLAYER", `Queue ${queue.guild.id}: ${message}`);
	});
	events.on("playerStart", (queue, track) => {
		logger.debug("PLAYER", "Track started", {
			guild: formatGuild(queue.guild),
			track: track.title,
		});
	});
	events.on("playerFinish", (queue, track) => {
		logger.debug("PLAYER", "Track finished", {
			guild: formatGuild(queue.guild),
			track: track.title,
		});
	});
	events.on("playerSkip", (queue, track, reason, description) => {
		logger.debug("PLAYER", "Track skipped", {
			guild: formatGuild(queue.guild),
			track: track.title,
			reason,
			description,
		});
	});
	events.on("audioTrackAdd", (queue, track) => {
		logger.debug("PLAYER", "Track added to queue", {
			guild: formatGuild(queue.guild),
			track: track.title,
		});
	});
	events.on("audioTracksAdd", (queue, tracks) => {
		logger.debug("PLAYER", "Tracks added to queue", {
			guild: formatGuild(queue.guild),
			count: tracks.length,
		});
	});
	events.on("audioTrackRemove", (queue, track) => {
		logger.debug("PLAYER", "Track removed from queue", {
			guild: formatGuild(queue.guild),
			track: track.title,
		});
	});
	events.on("audioTracksRemove", (queue, tracks) => {
		logger.debug("PLAYER", "Tracks removed from queue", {
			guild: formatGuild(queue.guild),
			count: tracks.length,
		});
	});
	events.on("emptyQueue", (queue) => {
		logger.debug("PLAYER", "Queue is empty", { guild: formatGuild(queue.guild) });
	});
	events.on("emptyChannel", (queue) => {
		logger.debug("PLAYER", "Voice channel is empty", { guild: formatGuild(queue.guild) });
	});
	events.on("disconnect", (queue) => {
		logger.debug("PLAYER", "Player disconnected", { guild: formatGuild(queue.guild) });
	});
	events.on("queueCreate", (queue) => {
		logger.debug("PLAYER", "Queue created", { guild: formatGuild(queue.guild) });
	});
	events.on("queueDelete", (queue) => {
		logger.debug("PLAYER", "Queue deleted", { guild: formatGuild(queue.guild) });
	});
	logger.info("PLAYER", "Player debug listeners loaded");
}
