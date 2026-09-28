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
	type MessageEditOptions,
	type VoiceChannel,
} from "discord.js";

import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";
import { formatChannel, formatGuild, formatUser } from "./discord.js";
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
	queuePage = 0,
	queuePageCount = 1,
}: {
	queueView?: boolean;
	paused?: boolean;
	hasPrevious?: boolean;
	hasNext?: boolean;
	queuePage?: number;
	queuePageCount?: number;
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
	if (queuePageCount > 1) {
		controls.splice(
			1,
			0,
			new ButtonBuilder()
				.setCustomId(`PlayerControl|ACTION#queuePage:PAGE#${queuePage - 1}`)
				.setLabel("◀️ Page")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(queuePage <= 0),
			new ButtonBuilder()
				.setCustomId(`PlayerControl|ACTION#queuePage:PAGE#${queuePage + 1}`)
				.setLabel("Page ▶️")
				.setStyle(ButtonStyle.Secondary)
				.setDisabled(queuePage >= queuePageCount - 1),
		);
	}
	if (hasPrevious && queuePageCount <= 1) {
		controls.splice(
			1,
			0,
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#previous")
				.setLabel("⏮️ Previous")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	if (hasNext && queuePageCount <= 1) {
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
	requestedBy,
	thumbnail,
	queueSize,
	durationMs,
	footerText,
}: {
	title: string;
	description: string;
	color?: "Blue" | "Green" | "Orange" | "Red";
	requestedBy?: string;
	thumbnail?: string;
	queueSize?: number;
	durationMs?: number;
	footerText?: string;
}): EmbedBuilder {
	const config = getConfig();
	const embed = new EmbedBuilder()
		.setColor(color)
		.setAuthor({ name: `${config.BOT_NAME} : Player`, iconURL: config.BOT_PFP })
		.setTitle(title)
		.setDescription(description);
	const footerParts = [requestedBy ? `Requested by ${requestedBy}` : undefined, footerText].filter(
		(part): part is string => Boolean(part),
	);
	if (footerParts.length > 0) {
		embed.setFooter({ text: footerParts.join(" | ") });
	}
	if (thumbnail) {
		embed.setThumbnail(thumbnail);
	}
	if (queueSize !== undefined) {
		embed.addFields({
			name: "Queue",
			value: `${queueSize} track${queueSize === 1 ? "" : "s"} waiting`,
			inline: true,
		});
	}
	if (durationMs && durationMs > 0) {
		embed.addFields({
			name: "Duration",
			value: formatPlayerTime(durationMs),
			inline: true,
		});
	}
	return embed;
}

function formatPlayerTime(milliseconds: number): string {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return hours > 0 ? `${hours}h ${minutes}m ${seconds}s` : `${minutes}m ${seconds}s`;
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
		metadata: { statusMessage?: Message; requestedByDisplay?: string };
		guild: Parameters<typeof formatGuild>[0];
		channel: Parameters<typeof formatChannel>[0] | null;
		currentTrack?: { title?: string; thumbnail?: string; durationMS?: number } | null;
		node?: { isPaused(): boolean; streamTime?: number };
		history?: { previousTrack?: unknown; nextTrack?: unknown };
		tracks?: { size: number };
	};
	content: string;
	controls?: boolean;
}): void {
	const statusMessage = queue.metadata.statusMessage;
	if (!statusMessage) {
		return;
	}

	void editPlayerStatusMessage({
		guild: queue.guild,
		channel: queue.channel,
		user: queue.metadata.requestedByDisplay,
		message: statusMessage,
		options: {
			embeds: [
				createPlayerEmbed({
					title: queue.currentTrack?.title ? `🎵 ${queue.currentTrack.title}` : "🎵 Player status",
					description: queue.currentTrack
						? queue.node?.isPaused()
							? "⏸️ Currently paused."
							: "▶️ Currently playing."
						: content,
					color: "Blue",
					...(queue.metadata.requestedByDisplay ? { requestedBy: queue.metadata.requestedByDisplay } : {}),
					...(queue.currentTrack?.thumbnail ? { thumbnail: queue.currentTrack.thumbnail } : {}),
					...(queue.tracks ? { queueSize: queue.tracks.size } : {}),
					...(queue.currentTrack?.durationMS ? { durationMs: queue.currentTrack.durationMS } : {}),
				}),
			],
			components: controls
				? [
						createPlayerControls({
							paused: queue.node?.isPaused() ?? false,
							hasPrevious: Boolean(queue.history?.previousTrack),
							hasNext: Boolean(queue.history?.nextTrack),
						}),
					]
				: [],
		},
	}).catch((error: unknown) => {
		logger.warn("PLAYER", "Failed to update player status message", {
			error: error instanceof Error ? error.message : String(error),
		});
	});
}

async function editPlayerStatusMessage({
	guild,
	channel,
	user,
	message,
	options,
}: {
	guild: Parameters<typeof formatGuild>[0];
	channel?: Parameters<typeof formatChannel>[0] | null;
	user?: string | undefined;
	message: Message;
	options: MessageEditOptions;
}): Promise<void> {
	const maxRateLimitRetries = 3;
	for (let attempt = 0; ; attempt += 1) {
		try {
			await message.edit(options);
			return;
		} catch (error: unknown) {
			if (!isRateLimitError(error) || attempt >= maxRateLimitRetries) {
				throw error;
			}
			const retryDelay = 1000 * 2 ** attempt;
			logger.warn("PLAYER", "Player status update rate limited; retrying", {
				guild: formatGuild(guild),
				channel: channel ? formatChannel(channel) : undefined,
				user,
				attempt: attempt + 1,
				retryDelay,
			});
			await wait(retryDelay);
		}
	}
}

function isRateLimitError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}
	const candidate = error as { code?: number; status?: number; rawError?: { status?: number; retry_after?: number } };
	return candidate.code === 429 || candidate.status === 429 || candidate.rawError?.status === 429;
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
