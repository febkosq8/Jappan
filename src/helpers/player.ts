import { Player } from "discord-player";
import {
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

export interface PlayerHealthCheckResult {
	readonly tracks: number;
	readonly attempt: number;
}

export type PlayerVoiceChannelResult =
	| {
			readonly success: true;
			readonly channel: VoiceChannel;
			readonly member: GuildMember | APIInteractionGuildMember;
	  }
	| { readonly success: false; readonly embed: EmbedBuilder };

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

export function updatePlayerQueueMessage(queue: { metadata: { statusMessage?: Message } }, content: string): void {
	void queue.metadata.statusMessage
		?.edit({
			embeds: [createPlayerEmbed({ title: "🎵 Player status", description: content, color: "Blue" })],
		})
		.catch((error: unknown) => {
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
