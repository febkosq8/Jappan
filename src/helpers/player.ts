import { randomUUID } from "node:crypto";
import { Player, type GuildQueue, type QueueRepeatMode, type SearchResult } from "discord-player";
import {
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	ChannelType,
	EmbedBuilder,
	userMention,
	type APIInteractionGuildMember,
	type ChatInputCommandInteraction,
	type GuildMember,
	type Message,
	type MessageEditOptions,
	type VoiceChannel,
} from "discord.js";

import { getConfig } from "../services/config.js";
import { logger } from "../services/logger.js";
import { formatChannel, formatGuild, formatUser, formatUserMention } from "./discord.js";
import { getClientGuild } from "./guild.js";
import { trimString } from "./string.js";
import { wait } from "./utils.js";

export type PlayerChangeSource = "discord" | "web";
/** Who last successfully changed a player session, stored in queue metadata. */
export interface PlayerChange {
	readonly id: string;
	readonly username: string;
	readonly source: PlayerChangeSource;
	readonly timestampMs: number;
}
export interface PlayerOwner {
	readonly id: string;
	readonly username: string;
}
/** Everything the bot stores in a player queue's metadata. */
export interface PlayerQueueMetadata {
	/** Unguessable ID used by the web player; never derived from the guild ID. */
	sessionId: string;
	/** Whoever started the session; they alone (plus admins) can lock or unlock it. */
	owner: PlayerOwner;
	locked: boolean;
	shuffle: boolean;
	/** The Discord message that shows this player; absent for the health-check queue. */
	statusMessage?: Message;
	lastChangedBy?: PlayerChange;
	/** Set only on the player health-check queue, which is never exposed through the API. */
	healthCheck?: boolean;
}
export type PlayerQueue = GuildQueue<PlayerQueueMetadata>;
const playerChangeSourceLabels: Record<PlayerChangeSource, string> = { discord: "Discord", web: "Web Player" };
/** Lock and last-change details shown in the player embed, ready to spread into createPlayerEmbed. */
export function getPlayerStatusDetails(queue: { metadata: { locked?: boolean; lastChangedBy?: PlayerChange } }): {
	locked: boolean;
	lastChangedBy?: string;
} {
	const change = queue.metadata.lastChangedBy;
	return {
		locked: Boolean(queue.metadata.locked),
		...(change
			? {
					lastChangedBy: `${formatUserMention(change)} via ${playerChangeSourceLabels[change.source]}`,
				}
			: {}),
	};
}

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

/**
 * Reorders the upcoming tracks at random when the session has shuffle on. Shuffle is applied to the queue itself,
 * never through discord-player's dynamic shuffle, so the queue list is always the real play order.
 */
export function shuffleQueueIfEnabled(queue: {
	metadata: PlayerQueueMetadata;
	tracks: { size: number; shuffle(): void };
}): void {
	if (queue.metadata.shuffle && queue.tracks.size > 1) {
		queue.tracks.shuffle();
	}
}
/**
 * True when the bot is no longer connected to voice. discord-player normally deletes the queue then, but only if
 * Discord's voice-state event reaches it in the right state, so a queue can outlive its connection.
 */
export function isQueueDisconnected(queue: { dispatcher: { isDestroyed(): boolean } | null }): boolean {
	return queue.dispatcher === null || queue.dispatcher.isDestroyed();
}
/**
 * Ends a session whose bot already left voice but whose queue was never deleted. Deleting the queue makes the web
 * player hear that the session ended, and the Discord message is updated the way a normal disconnect does.
 */
export function closeDisconnectedQueue(queue: PlayerQueue): void {
	if (queue.deleted) {
		return;
	}
	logger.info("PLAYER", "Closing a session whose voice connection ended", { guild: formatGuild(queue.guild) });
	markPlayerStatusMessageDisconnected(queue);
	queue.delete();
}

/** Replaces the status message, which would otherwise keep showing the last track as if it were still playing. */
export function markPlayerStatusMessageDisconnected(queue: Pick<PlayerQueue, "metadata">): void {
	const { statusMessage, owner } = queue.metadata;
	if (statusMessage) {
		void markPlayerStatusMessageStopped({
			message: statusMessage,
			owner,
			title: "👋 Playback disconnected",
			description: "The bot was disconnected from the voice channel.",
		});
	}
}
export function getNextRepeatMode(repeatMode: QueueRepeatMode): QueueRepeatMode {
	return (repeatMode === 3 ? 0 : repeatMode + 1) as QueueRepeatMode;
}

function getRepeatModeLabel(repeatMode: QueueRepeatMode): string {
	return repeatMode === 1 ? "🔂 Track" : repeatMode === 2 ? "🔁 Queue" : repeatMode === 3 ? "🔀 Auto" : "🚫 Off";
}

function getPlayerSourceLabel(source: string): string {
	return source.toLowerCase() === "youtube"
		? "YouTube"
		: source.toLowerCase() === "spotify"
			? "Spotify"
			: source.toLowerCase() === "soundcloud"
				? "SoundCloud"
				: source;
}

export function createPlayerControls({
	queueView = false,
	paused = false,
	hasCurrentTrack = false,
	shuffle = false,
	repeatMode = 0,
	hasPrevious = false,
	queueSize,
	hasNext = false,
	queuePage = 0,
	queuePageCount = 1,
	sessionId,
	locked = false,
}: {
	queueView?: boolean;
	paused?: boolean;
	hasCurrentTrack?: boolean;
	shuffle?: boolean;
	repeatMode?: QueueRepeatMode;
	hasPrevious?: boolean;
	queueSize?: number;
	hasNext?: boolean;
	queuePage?: number;
	queuePageCount?: number;
	sessionId?: string;
	locked?: boolean;
} = {}): ActionRowBuilder<ButtonBuilder>[] {
	const controls: ButtonBuilder[] = [];
	const viewControls: ButtonBuilder[] = [];
	const paginationControls: ButtonBuilder[] = [];
	if (queueSize !== undefined && queueSize > 0) {
		viewControls.push(
			new ButtonBuilder()
				.setCustomId(`PlayerControl|ACTION#queue:VIEW#${queueView ? "queue" : "nowPlaying"}`)
				.setLabel(queueView ? "Now Playing" : "Current Queue")
				.setStyle(ButtonStyle.Primary),
		);
	}
	if (hasCurrentTrack) {
		const nextRepeatMode = getNextRepeatMode(repeatMode);
		if (queueSize !== undefined && queueSize > 1) {
			controls.push(
				new ButtonBuilder()
					.setCustomId("PlayerControl|ACTION#shuffle")
					.setLabel(shuffle ? "🔀 Off" : "🔀 On")
					.setStyle(ButtonStyle.Secondary),
			);
		}
		controls.push(
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#repeat")
				.setLabel(getRepeatModeLabel(nextRepeatMode))
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#pause")
				.setLabel(paused ? "▶️ Play" : "⏸️ Pause")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	if (queuePageCount > 1 && queuePage > 0) {
		paginationControls.push(
			new ButtonBuilder()
				.setCustomId(`PlayerControl|ACTION#queuePage:PAGE#${queuePage - 1}`)
				.setLabel("◀️ Page")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	if (queuePageCount > 1 && queuePage < queuePageCount - 1) {
		paginationControls.push(
			new ButtonBuilder()
				.setCustomId(`PlayerControl|ACTION#queuePage:PAGE#${queuePage + 1}`)
				.setLabel("Page ▶️")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	if (hasPrevious && !paused && queuePageCount <= 1) {
		controls.push(
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#previous")
				.setLabel("⏮️ Previous")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	if (hasNext && !paused && queuePageCount <= 1) {
		controls.push(
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#skip")
				.setLabel("⏭️ Skip")
				.setStyle(ButtonStyle.Secondary),
		);
	}
	if (sessionId) {
		controls.push(
			new ButtonBuilder()
				.setCustomId("PlayerControl|ACTION#lock")
				.setLabel(locked ? "🔓 Unlock" : "🔒 Lock")
				.setStyle(ButtonStyle.Secondary),
			new ButtonBuilder()
				.setURL(new URL(`/player/${encodeURIComponent(sessionId)}`, getConfig("BOT_WEBSITE")).href)
				.setLabel("🌐 Web Player")
				.setStyle(ButtonStyle.Link),
		);
	}
	controls.push(
		new ButtonBuilder().setCustomId("PlayerControl|ACTION#stop").setLabel("⏹️ Stop").setStyle(ButtonStyle.Danger),
	);
	const rows: ActionRowBuilder<ButtonBuilder>[] = [];
	if (paginationControls.length > 0) {
		rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...paginationControls));
	}
	const remainingControls = [...viewControls, ...controls];
	for (let index = 0; index < remainingControls.length; index += 5) {
		rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(...remainingControls.slice(index, index + 5)));
	}
	return rows;
}

export function createPlayerEmbed({
	title,
	description,
	color = "Red",
	requestedBy,
	thumbnail,
	queueSize,
	queueDurationMs,
	durationMs,
	source,
	repeatMode,
	shuffle,
	footerText,
	locked,
	lastChangedBy,
}: {
	title: string;
	description: string;
	color?: "Blue" | "Green" | "Orange" | "Red";
	requestedBy?: string;
	thumbnail?: string;
	queueSize?: number;
	queueDurationMs?: number;
	durationMs?: number;
	source?: string;
	repeatMode?: QueueRepeatMode;
	shuffle?: boolean;
	footerText?: string;
	locked?: boolean;
	lastChangedBy?: string;
}): EmbedBuilder {
	const config = getConfig();
	const embed = new EmbedBuilder()
		.setColor(color)
		.setAuthor({ name: `${config.BOT_NAME} : Player`, iconURL: config.BOT_PFP })
		.setTitle(trimString(title, 256))
		.setDescription(
			source && /playing/i.test(description)
				? description.replace(/playing/i, (status) => `${status} via ${getPlayerSourceLabel(source)}`)
				: description,
		)
		.setTimestamp();
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
			value: `${queueSize} track${queueSize === 1 ? "" : "s"} waiting${queueSize > 1 && queueDurationMs ? `\n[Runtime: ${formatPlayerTime(queueDurationMs)}]` : ""}`,
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
	if (repeatMode !== undefined) {
		embed.addFields({
			name: "\u200b",
			value: "\u200b",
			inline: true,
		});
		embed.addFields({
			name: "Repeat",
			value: getRepeatModeLabel(repeatMode),
			inline: true,
		});
	}
	if (shuffle !== undefined) {
		embed.addFields({
			name: "Shuffle",
			value: shuffle ? "🔀 Enabled" : "🚫 Disabled",
			inline: true,
		});
	}
	if (locked) {
		embed.addFields({
			name: "Lock",
			value: "🔒 Locked by the owner",
			inline: true,
		});
	}
	if (lastChangedBy) {
		embed.addFields({
			name: "Last change",
			value: trimString(lastChangedBy, 1024),
			inline: false,
		});
	}
	return embed;
}

export function formatPlayerTime(milliseconds: number): string {
	const totalSeconds = Math.floor(milliseconds / 1000);
	const totalHours = Math.floor(totalSeconds / 3600);
	const days = Math.floor(totalHours / 24);
	const hours = totalHours % 24;
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	return days > 0
		? `${days}d ${hours}h ${minutes}m ${seconds}s`
		: totalHours > 0
			? `${hours}h ${minutes}m ${seconds}s`
			: `${minutes}m ${seconds}s`;
}

export function getValidatedPlayerVoiceChannel(interaction: ChatInputCommandInteraction): PlayerVoiceChannelResult {
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
		metadata: PlayerQueueMetadata;
		guild: Parameters<typeof formatGuild>[0];
		channel: Parameters<typeof formatChannel>[0] | null;
		currentTrack?: { title?: string; thumbnail?: string; durationMS?: number; source?: string } | null;
		node?: { isPaused(): boolean; streamTime?: number };
		history?: { previousTrack?: unknown; nextTrack?: unknown };
		tracks?: { size: number; toArray(): Array<{ durationMS?: number }> };
		repeatMode?: QueueRepeatMode;
	};
	content: string;
	controls?: boolean;
}): Promise<void> {
	const statusMessage = queue.metadata.statusMessage;
	if (!statusMessage) {
		return Promise.resolve();
	}
	const queueDurationMs = queue.tracks?.toArray().reduce((total, track) => total + (track.durationMS ?? 0), 0);

	return editPlayerStatusMessage({
		guild: queue.guild,
		channel: queue.channel,
		user: formatUser(queue.metadata.owner),
		message: statusMessage,
		options: {
			embeds: [
				createPlayerEmbed({
					title: queue.currentTrack?.title
						? `🎵 ${queue.currentTrack.title}`
						: queue.history?.nextTrack
							? "⏳ Loading playback"
							: "🎵 Nothing playing",
					description: queue.currentTrack
						? queue.node?.isPaused()
							? "⏸️ Paused"
							: "▶️ Playing"
						: queue.history?.nextTrack
							? "⏳ Waiting for the next track"
							: "Choose a track to start playback.",
					color: "Blue",
					requestedBy: formatUser(queue.metadata.owner),
					...(queue.currentTrack?.thumbnail ? { thumbnail: queue.currentTrack.thumbnail } : {}),
					...(queue.currentTrack?.source ? { source: queue.currentTrack.source } : {}),
					...(queue.tracks ? { queueSize: queue.tracks.size } : {}),
					...(queueDurationMs ? { queueDurationMs } : {}),
					...(queue.currentTrack?.durationMS ? { durationMs: queue.currentTrack.durationMS } : {}),
					...(queue.repeatMode !== undefined ? { repeatMode: queue.repeatMode } : {}),
					...(queue.metadata.shuffle !== undefined ? { shuffle: queue.metadata.shuffle } : {}),
					...getPlayerStatusDetails(queue),
				}),
			],
			components: controls
				? [
						...createPlayerControls({
							sessionId: queue.metadata.sessionId,
							locked: Boolean(queue.metadata.locked),
							paused: queue.node?.isPaused() ?? false,
							hasCurrentTrack: Boolean(queue.currentTrack),
							shuffle: queue.metadata.shuffle ?? false,
							hasPrevious: Boolean(queue.history?.previousTrack),
							hasNext: Boolean(queue.history?.nextTrack),
							...(queue.repeatMode !== undefined ? { repeatMode: queue.repeatMode } : {}),
							...(queue.tracks ? { queueSize: queue.tracks.size } : {}),
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

export async function markPlayerStatusMessageReplaced({
	message,
	requestedById,
}: {
	message: Message;
	requestedById?: string;
}): Promise<void> {
	await message.edit({
		embeds: [
			createPlayerEmbed({
				title: "🎵 Newer playback request",
				description: `A newer play request${requestedById ? ` by ${userMention(requestedById)}` : ""} was added.\nCheck the latest player embed for current playback.`,
				color: "Blue",
			}),
		],
		components: [],
	});
}

export async function markPlayerStatusMessageStopped({
	message,
	owner,
	title = "⏹️ Player stopped",
	description = "Playback has been stopped.",
}: {
	message: Message;
	owner?: PlayerOwner | undefined;
	title?: string;
	description?: string;
}): Promise<void> {
	await message
		.edit({
			embeds: [
				createPlayerEmbed({
					title,
					description,
					color: "Blue",
					...(owner ? { requestedBy: formatUser(owner) } : {}),
				}),
			],
			components: [],
		})
		.catch((error: unknown) => {
			logger.warn("PLAYER", "Failed to mark player status message as stopped", {
				error: error instanceof Error ? error.message : String(error),
			});
		});
}
export async function markPlayerStatusMessageShutdown(message: Message): Promise<void> {
	await message.edit({
		embeds: [
			createPlayerEmbed({
				title: "⏹️ Player stopped",
				description: "Playback stopped because the bot is shutting down.",
				color: "Blue",
			}),
		],
		components: [],
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
	const botUser = initializedPlayer.client.user;
	if (!botUser) {
		throw new Error("Cannot check player health without a Discord bot user");
	}
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
			requestedBy: botUser.id,
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
	const healthCheckPlaybackMsTimeout = getConfig("PLAYER_HEALTH_CHECK_PLAYBACK_MS_TIMEOUT");
	const healthCheckPlaybackStabilityMsTimeout = getConfig("PLAYER_HEALTH_CHECK_PLAYBACK_STABILITY_MS_TIMEOUT");
	if (healthCheckGuildId && healthCheckChannelId && healthCheckTracks > 0) {
		const guild = getClientGuild(healthCheckGuildId);
		const channel = guild?.channels.cache.get(healthCheckChannelId);
		if (healthCheckDebug) {
			logger.debug("PLAYER", "Player health-check playback probe initialized", {
				healthCheckGuildId,
				healthCheckChannelId,
			});
		}
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
				metadata: {
					sessionId: randomUUID(),
					healthCheck: true,
					owner: { id: botUser.id, username: botUser.username },
					locked: false,
					shuffle: false,
				},
				leaveOnEnd: true,
				leaveOnEmpty: true,
			},
		});
		try {
			if (healthCheckDebug) {
				logger.debug("PLAYER", "Waiting for player health-check playback to start", {
					playbackTimeout: healthCheckPlaybackMsTimeout,
				});
			}
			const playbackDeadline = Date.now() + healthCheckPlaybackMsTimeout;
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
					stabilityTimeout: healthCheckPlaybackStabilityMsTimeout,
				});
			}
			const playbackStabilityDeadline = Date.now() + healthCheckPlaybackStabilityMsTimeout;
			while (Date.now() < playbackStabilityDeadline) {
				await wait(250);
				if (!queue.node.isPlaying()) {
					throw new Error("Player health-check track stopped during playback verification");
				}
			}
			playbackChecked = true;
			if (healthCheckDebug) {
				logger.debug("PLAYER", "Player health-check playback stability passed", {
					stabilityTimeout: healthCheckPlaybackStabilityMsTimeout,
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
