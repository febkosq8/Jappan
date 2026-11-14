import { ChannelType, DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes, type Message } from "discord.js";

import { getClientGuild } from "../helpers/guild.js";
import { createPlayerLoadingEmbed } from "../helpers/player.js";
import { logger } from "./logger.js";
import type { PlayerWebUser } from "./playerAccess.js";
import { resolvePlayerQuery } from "./playerSearch.js";
import { getPlayer, isPlayerAvailable, playSearchResult } from "./player.js";

export type StartPlayerSessionResult =
	| { readonly success: true; readonly sessionId: string; readonly skippedTracks: number }
	| {
			readonly success: false;
			readonly status: 403 | 404 | 409 | 422 | 423 | 503;
			readonly error: string;
	  };

/** Starts or adds to playback for the signed-in user from the dashboard. */
export async function startPlayerSession({
	guildId,
	query,
	user,
}: {
	guildId: string;
	query: string;
	user: PlayerWebUser;
}): Promise<StartPlayerSessionResult> {
	const guild = getClientGuild(guildId);
	if (!guild) {
		return { success: false, status: 404, error: "Jappan is not available in that server." };
	}
	if (!guild.available) {
		return { success: false, status: 503, error: "That server is temporarily unavailable." };
	}

	let member;
	try {
		member = await guild.members.fetch(user.id);
	} catch (error: unknown) {
		if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) {
			return { success: false, status: 403, error: "You must be a member of that server to start playback." };
		}
		throw error;
	}
	const voiceChannelId = member.voice.channelId;
	if (!voiceChannelId) {
		return { success: false, status: 409, error: "Join a voice channel in that server before starting playback." };
	}

	let voiceChannel;
	try {
		voiceChannel = await guild.channels.fetch(voiceChannelId);
	} catch (error: unknown) {
		if (
			error instanceof DiscordAPIError &&
			[
				RESTJSONErrorCodes.UnknownChannel,
				RESTJSONErrorCodes.MissingAccess,
				RESTJSONErrorCodes.MissingPermissions,
			].includes(Number(error.code))
		) {
			return {
				success: false,
				status: 403,
				error: "Jappan cannot access your voice channel. Check the bot's channel permissions.",
			};
		}
		throw error;
	}
	if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
		return { success: false, status: 409, error: "Join a standard voice channel to start playback." };
	}
	if (!voiceChannel.joinable || !voiceChannel.speakable) {
		return {
			success: false,
			status: 403,
			error: "Jappan needs permission to view, connect to, and speak in your voice channel.",
		};
	}
	if (!isPlayerAvailable()) {
		return {
			success: false,
			status: 503,
			error: "The music player is unavailable. Please try again shortly.",
		};
	}
	const botMember = guild.members.me;
	if (
		!botMember ||
		!voiceChannel.permissionsFor(botMember).has([PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks])
	) {
		return {
			success: false,
			status: 403,
			error: "Jappan needs permission to send messages and embeds in your voice channel to post the player controls.",
		};
	}

	const existingQueue = [...getPlayer().nodes.cache.values()].find(
		(queue) => queue.guild.id === guild.id && !queue.metadata.healthCheck && !queue.deleted,
	);
	if (existingQueue?.channel && existingQueue.channel.id !== voiceChannel.id) {
		return {
			success: false,
			status: 409,
			error: "Jappan is already playing in another voice channel in that server. Join that channel or stop its session first.",
		};
	}

	const resolvedQuery = await resolvePlayerQuery({ query, userId: user.id });
	if (!resolvedQuery.success) {
		return {
			success: false,
			status: 503,
			error: "The music player is unavailable. Please try again shortly.",
		};
	}
	const { searchResult, savedPlaylist } = resolvedQuery;
	if (!searchResult.hasTracks()) {
		return { success: false, status: 422, error: "No tracks were found for that query." };
	}
	const shuffle = savedPlaylist?.shuffle ?? false;
	if (shuffle) {
		searchResult.setTracks([...searchResult.tracks].sort(() => Math.random() - 0.5));
	}

	const previousStatusMessage = existingQueue?.metadata.statusMessage;
	const statusMessage =
		previousStatusMessage?.channelId === voiceChannel.id
			? previousStatusMessage
			: await voiceChannel.send({ embeds: [createPlayerLoadingEmbed({ searchResult, member })] });
	const createdStatusMessage = statusMessage.id !== previousStatusMessage?.id;
	let result: Awaited<ReturnType<typeof playSearchResult>>;
	try {
		result = await playSearchResult({
			channel: voiceChannel.id,
			member,
			searchResult,
			statusMessage,
			previousStatusMessage,
			source: "web",
			shuffle,
			repeatMode: savedPlaylist?.loop ? 2 : 0,
		});
	} catch (error: unknown) {
		if (createdStatusMessage) {
			await removeUnstartedStatusMessage(statusMessage);
		}
		throw error;
	}
	if (!result.success) {
		if (createdStatusMessage) {
			await removeUnstartedStatusMessage(statusMessage);
		}
		switch (result.error_code) {
			case "PLAYER_LOCKED":
				return {
					success: false,
					status: 423,
					error: "This player session is locked by its owner, so you cannot add tracks.",
				};
			case "PLAYER_QUEUE_FULL":
				return {
					success: false,
					status: 422,
					error: "The player queue is full. Remove tracks before adding more.",
				};
			default:
				return {
					success: false,
					status: 503,
					error: "The music player is unavailable. Please try again shortly.",
				};
		}
	}
	return {
		success: true,
		sessionId: result.data.sessionId,
		skippedTracks: result.data.skippedTracks,
	};
}

async function removeUnstartedStatusMessage(message: Message): Promise<void> {
	try {
		await message.delete();
	} catch (error: unknown) {
		logger.warn("PLAYER", "Failed to remove an unstarted web player status message", {
			messageId: message.id,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}
