import { Player } from "discord-player";

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
		logger.error("PLAYER", `Queue ${queue.guild.name} <${queue.guild.id}> error: ${error.message}`, {
			stack: error.stack,
			track: queue.currentTrack?.title,
		});
	});
	player.events.on("playerError", (queue, error, track) => {
		updatePlayerQueueMessage(queue, `⚠️ Playback failed for **${track.title}**.`);
		logger.error("PLAYER", `Track playback error: ${error.message}`, {
			guild: `${queue.guild.name} <${queue.guild.id}>`,
			stack: error.stack,
			track: track.title,
		});
	});
}

function registerPlayerStatusHandlers(player: Player): void {
	const events = player.events;

	events.on("playerStart", (queue, track) => {
		updatePlayerQueueMessage(queue, `▶️ Started playing: **${track.title}**`);
	});
	events.on("playerSkip", (queue, track, reason, description) => {
		updatePlayerQueueMessage(queue, `⚠️ Skipping: **${track.title}** (${description || reason})`);
	});
	events.on("audioTrackAdd", (queue, track) => {
		updatePlayerQueueMessage(queue, `🎵 Track queued: **${track.title}**`);
	});
	events.on("audioTracksAdd", (queue, tracks) => {
		updatePlayerQueueMessage(queue, `🎶 ${tracks.length} tracks queued.`);
	});
	events.on("emptyQueue", (queue) => {
		updatePlayerQueueMessage(queue, "✅ Queue finished.");
	});
	events.on("emptyChannel", (queue) => {
		updatePlayerQueueMessage(queue, "⚠️ The voice channel is empty. Leaving soon.");
	});
	events.on("disconnect", (queue) => {
		updatePlayerQueueMessage(queue, "⚠️ Playback disconnected.");
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
