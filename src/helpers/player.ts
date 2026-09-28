import { Player, type SearchResult } from "discord-player";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	type APIInteractionGuildMember,
	type ChatInputCommandInteraction,
	type GuildMember,
	type Message,
	type VoiceChannel,
} from "discord.js";

import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";
import { formatChannel, formatGuild } from "./discord.js";
import { wait } from "./utils.js";

export interface PlayerHealthCheckResult {
	readonly tracks: number;
	readonly attempt: number;
	readonly playbackChecked: boolean;
}

export type PlayerVoiceChannelResult =
	| {
			readonly success: true;
			readonly channel: VoiceChannel;
			readonly member: GuildMember | APIInteractionGuildMember;
	  }
	| { readonly success: false; readonly embed: EmbedBuilder };

export function createPlayerControls({
	queueView = false,
	paused = false,
	hasPrevious = false,
	hasNext = false,
}: {
	queueView?: boolean;
	paused?: boolean;
	hasPrevious?: boolean;
	hasNext?: boolean;
} = {}): ActionRowBuilder<ButtonBuilder> {
	const controls = [
		new ButtonBuilder()
			.setCustomId(`PlayerControl|ACTION#queue:VIEW#${queueView ? "queue" : "nowPlaying"}`)
			.setLabel(queueView ? "Now Playing" : "Current Queue")
			.setStyle(ButtonStyle.Primary),
		new ButtonBuilder()
			.setCustomId("PlayerControl|ACTION#pause")
			.setLabel(paused ? "▶️ Play" : "⏸️ Pause")
			.setStyle(ButtonStyle.Secondary),
		new ButtonBuilder().setCustomId("PlayerControl|ACTION#stop").setLabel("⏹️ Stop").setStyle(ButtonStyle.Danger),
	];
	if (hasPrevious) {
		controls.splice(
			1,
			0,
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#previous")
				.setLabel("⏮️ Previous")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	if (hasNext) {
		controls.splice(
			2,
			0,
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#skip")
				.setLabel("⏭️ Skip")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	return new ActionRowBuilder<ButtonBuilder>().addComponents(...controls);
}

export function createPlayerEmbed({
	title,
	description,
	color = "Red",
}: {
	title: string;
	description: string;
	color?: "Blue" | "Green" | "Orange" | "Red";
}): EmbedBuilder {
	const config = getConfig();
	return new EmbedBuilder()
		.setColor(color)
		.setAuthor({ name: `${config.BOT_NAME} : Player`, iconURL: config.BOT_PFP })
		.setTitle(title)
		.setDescription(description);
}

export function getPlayerVoiceChannel(interaction: ChatInputCommandInteraction): PlayerVoiceChannelResult {
	const member = interaction.member;
	if (!member || typeof member !== "object" || !("voice" in member) || !member.voice.channel) {
		return {
			embed: createPlayerEmbed({
				title: "⛔ Voice channel required",
				description: "You are not in a voice channel.",
			}),
			success: false,
		};
	}

	const voiceChannel = member.voice.channel;
	if (voiceChannel.type !== ChannelType.GuildVoice || !interaction.guild) {
		return {
			embed: createPlayerEmbed({
				title: "⛔ Invalid voice channel",
				description: "You must join a standard voice channel to play music.",
			}),
			success: false,
		};
	}
	if (
		interaction.guild.members.me?.voice.channelId &&
		interaction.guild.members.me.voice.channelId !== voiceChannel.id
	) {
		return {
			embed: createPlayerEmbed({
				title: "⛔ Different voice channel",
				description: "You are not in my voice channel.",
			}),
			success: false,
		};
	}
	if (!voiceChannel.joinable || !voiceChannel.speakable) {
		return {
			embed: createPlayerEmbed({
				title: "⛔ Voice channel unavailable",
				description: "I cannot join and speak in your voice channel.",
			}),
			success: false,
		};
	}

	return { success: true, channel: voiceChannel, member };
}

export function updatePlayerQueueMessage({
	queue,
	content,
	controls = true,
}: {
	queue: {
		metadata: { statusMessage?: Message };
		node?: { isPaused(): boolean };
		history?: { previousTrack?: unknown };
		tracks?: { size: number };
	};
	content: string;
	controls?: boolean;
}): void {
	void queue.metadata.statusMessage
		?.edit({
			embeds: [createPlayerEmbed({ title: "🎵 Player status", description: content, color: "Blue" })],
			components: controls
				? [
						createPlayerControls({
							paused: queue.node?.isPaused() ?? false,
							hasPrevious: Boolean(queue.history?.previousTrack),
							hasNext: (queue.tracks?.size ?? 0) > 0,
						}),
					]
				: [],
		})
		.catch((error: unknown) => {
			logger.warn("PLAYER", "Failed to update player status message", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
}

export async function checkPlayerHealth(initializedPlayer: Player): Promise<PlayerHealthCheckResult> {
	const healthCheckDebug = getConfig("PLAYER_HEALTH_DEBUG");
	const healthCheckQuery = getConfig("PLAYER_HEALTH_CHECK_QUERY");
	const healthCheckMaxAttempts = getConfig("PLAYER_HEALTH_CHECK_MAX_ATTEMPTS");
	let healthCheckTracks = 0;
	let healthCheckAttempt = 0;
	let playbackChecked = false;
	let healthCheckSearchResult: SearchResult | undefined;

	for (let attempt = 1; attempt <= healthCheckMaxAttempts; attempt += 1) {
		healthCheckAttempt = attempt;
		if (healthCheckDebug) {
			logger.debug("PLAYER", "Starting player health-check search", { attempt, healthCheckMaxAttempts });
		}
		healthCheckSearchResult = await initializedPlayer.search(healthCheckQuery, {
			fallbackSearchEngine: "youtubeSearch",
		});
		healthCheckTracks =
			healthCheckSearchResult.tracks.length + (healthCheckSearchResult.playlist?.tracks.length ?? 0);
		if (healthCheckDebug) {
			logger.debug("PLAYER", "Player health-check search completed", {
				attempt,
				tracks: healthCheckTracks,
			});
		}
		if (healthCheckTracks > 0 || attempt === healthCheckMaxAttempts) {
			break;
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}

	const healthCheckGuildId = getConfig("PLAYER_HEALTH_CHECK_GUILD_ID");
	const healthCheckChannelId = getConfig("PLAYER_HEALTH_CHECK_CHANNEL_ID");
	const healthCheckPlaybackTimeout = getConfig("PLAYER_HEALTH_CHECK_PLAYBACK_TIMEOUT");
	const healthCheckPlaybackStabilityTimeout = getConfig("PLAYER_HEALTH_CHECK_PLAYBACK_STABILITY_TIMEOUT");
	if (healthCheckGuildId && healthCheckChannelId && healthCheckTracks > 0) {
		const guild = initializedPlayer.client.guilds.cache.get(healthCheckGuildId);
		const channel = guild?.channels.cache.get(healthCheckChannelId);
		if (!guild || !channel || channel.type !== ChannelType.GuildVoice) {
			throw new Error("Configured player health-check guild or voice channel was not found");
		}
		if (!channel.joinable || !channel.speakable) {
			throw new Error("Configured player health-check channel is not joinable or speakable");
		}
		if (healthCheckDebug) {
			logger.debug("PLAYER", "Starting player health-check playback probe", {
				guild: formatGuild(guild),
				channel: formatChannel(channel),
			});
		}
		const healthCheckTrack = healthCheckSearchResult?.tracks[0] ?? healthCheckSearchResult?.playlist?.tracks[0];
		if (!healthCheckTrack) {
			throw new Error("Player health-check search returned no playable track");
		}

		const { queue } = await initializedPlayer.play(channel.id, healthCheckTrack, {
			nodeOptions: {
				metadata: { healthCheck: true },
				leaveOnEnd: true,
				leaveOnEmpty: true,
			},
		});
		try {
			if (healthCheckDebug) {
				logger.debug("PLAYER", "Waiting for player health-check playback to start", {
					playbackTimeout: healthCheckPlaybackTimeout,
				});
			}
			const playbackDeadline = Date.now() + healthCheckPlaybackTimeout;
			while (!queue.node.isPlaying()) {
				if (Date.now() >= playbackDeadline) {
					throw new Error("Player health-check track did not start playing");
				}
				await wait(250);
			}
			if (healthCheckDebug) {
				logger.debug("PLAYER", "Player health-check playback started");
			}

			if (healthCheckDebug) {
				logger.debug("PLAYER", "Verifying player health-check playback stability", {
					stabilityTimeout: healthCheckPlaybackStabilityTimeout,
				});
			}
			const playbackStabilityDeadline = Date.now() + healthCheckPlaybackStabilityTimeout;
			while (Date.now() < playbackStabilityDeadline) {
				await wait(250);
				if (!queue.node.isPlaying()) {
					throw new Error("Player health-check track stopped during playback verification");
				}
			}
			playbackChecked = true;
			if (healthCheckDebug) {
				logger.debug("PLAYER", "Player health-check playback stability passed", {
					stabilityTimeout: healthCheckPlaybackStabilityTimeout,
				});
			}
		} finally {
			queue.delete();
			if (healthCheckDebug) {
				logger.debug("PLAYER", "Player health-check playback queue cleaned up");
			}
		}
	} else if (healthCheckDebug) {
		logger.debug("PLAYER", "Player health-check playback probe skipped", {
			configuredGuildAndChannel: Boolean(healthCheckGuildId && healthCheckChannelId),
			tracks: healthCheckTracks,
		});
	}

	return { tracks: healthCheckTracks, attempt: healthCheckAttempt, playbackChecked };
}
