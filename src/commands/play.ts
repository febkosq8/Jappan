import { InteractionContextType, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { formatGuild, formatUser } from "../helpers/discord.js";
import { createPlayerEmbed, getValidatedPlayerVoiceChannel } from "../helpers/player.js";
import type { QueueRepeatMode } from "discord-player";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";
import { MAX_QUEUE_SIZE } from "../helpers/playerLimits.js";
import { getPlayer, playSearchResult } from "../services/player.js";
import { getPlayerSuggestions, resolvePlayerQuery, type PlayerSuggestionKind } from "../services/playerSearch.js";

const commandData = {
	name: "play",
	description: "Play a song or playlist",
	category: "music",
	isDBDependant: false,
	hasSubCommands: false,
	requiredBotPermissions: [
		PermissionFlagsBits.ViewChannel,
		PermissionFlagsBits.SendMessages,
		PermissionFlagsBits.EmbedLinks,
		PermissionFlagsBits.Connect,
		PermissionFlagsBits.Speak,
	],
} satisfies BotCommandData;

const suggestionKindLabels: Record<PlayerSuggestionKind, string> = {
	track: "Track",
	playlist: "Playlist",
	savedPlaylist: "Saved Playlist",
};

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addStringOption((option) =>
			option
				.setName("query")
				.setDescription("The song, playlist, or saved playlist to play")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addBooleanOption((option) => option.setName("shuffle").setDescription("Shuffle the playback queue"))
		.addBooleanOption((option) => option.setName("loop").setDescription("Loop the playback queue"))
		.setContexts([InteractionContextType.Guild]),
	autocomplete: async (interaction) => {
		const suggestions = await getPlayerSuggestions({
			query: interaction.options.getString("query", true),
			userId: interaction.user.id,
		});
		await interaction.respond(
			suggestions.map((suggestion) => ({
				name: `${suggestion.title} | ${suggestionKindLabels[suggestion.kind]}`.slice(0, 100),
				value: suggestion.value,
			})),
		);
	},
	execute: async ({ interaction }) => {
		await interaction.deferReply();

		const voiceChannelResult = getValidatedPlayerVoiceChannel(interaction);
		if (!voiceChannelResult.success) {
			await interaction.editReply({ embeds: [voiceChannelResult.embed] });
			return;
		}
		const { channel: voiceChannel, member } = voiceChannelResult;

		const query = interaction.options.getString("query", true).trim();
		const shuffle = interaction.options.getBoolean("shuffle");
		const loop = interaction.options.getBoolean("loop");
		try {
			const resolvedQuery = await resolvePlayerQuery({ query, userId: interaction.user.id });
			if (!resolvedQuery.success) {
				await interaction.editReply({
					embeds: [
						createPlayerEmbed({
							title:
								resolvedQuery.error_code === "PLAYER_DOWN"
									? "🤖 Player out of service"
									: "🤖 Player not ready",
							description:
								resolvedQuery.error_code === "PLAYER_DOWN"
									? "⚠️ The bot's music player is currently out of service.\nPlease check back later."
									: "⚠️ The bot's music player is not ready yet.\nPlease try again shortly.",
						}),
					],
				});
				return;
			}
			const { searchResult, savedPlaylist } = resolvedQuery;
			const shouldShuffle = shuffle ?? savedPlaylist?.shuffle ?? false;
			const shouldLoop = loop ?? savedPlaylist?.loop ?? false;
			if (shouldShuffle) {
				searchResult.setTracks([...searchResult.tracks].sort(() => Math.random() - 0.5));
			}
			if (!searchResult.hasTracks()) {
				await interaction.editReply({
					embeds: [
						createPlayerEmbed({
							title: "⛔ No tracks found",
							description: `No tracks found for '${query}'.`,
						}),
					],
				});
				return;
			}

			const statusMessage = await interaction.editReply({
				embeds: [
					createPlayerEmbed({
						title: "⏳ Loading playback",
						description: `Waiting for your ${searchResult.playlist ? "playlist" : "track"} to start.`,
						color: "Blue",
						requestedBy: formatUser(member.user),
						...(searchResult.tracks[0]?.thumbnail ? { thumbnail: searchResult.tracks[0].thumbnail } : {}),
					}),
				],
			});
			const previousStatusMessage = getPlayer().queues.get(interaction.guildId!)?.metadata.statusMessage;
			const playResponse = await playSearchResult({
				channel: voiceChannel.id,
				member,
				searchResult,
				statusMessage,
				previousStatusMessage,
				shuffle: shouldShuffle,
				repeatMode: shouldLoop ? 2 : 0,
			});
			if (playResponse.success && playResponse.data.skippedTracks > 0) {
				await interaction.followUp({
					content: `⚠ The queue is limited to ${MAX_QUEUE_SIZE} tracks, so ${playResponse.data.skippedTracks} ${playResponse.data.skippedTracks === 1 ? "track was" : "tracks were"} left out.`,
					flags: MessageFlags.Ephemeral,
				});
			}
			if (!playResponse.success) {
				const playFailure =
					playResponse.error_code === "PLAYER_QUEUE_FULL"
						? {
								title: "📚 Queue is full",
								description: `The queue can hold up to ${MAX_QUEUE_SIZE} tracks and there is not enough room for this.\nRemove some tracks or add fewer.`,
							}
						: playResponse.error_code === "PLAYER_LOCKED"
							? {
									title: "🔒 Session locked",
									description:
										"The owner of this player session locked it.\nOnly they can add tracks or change playback until it is unlocked.",
								}
							: playResponse.error_code === "PLAYER_DOWN"
								? {
										title: "🤖 Player out of service",
										description:
											"🤖 The bot's music player is currently out of service.\nPlease check back later.",
									}
								: {
										title: "🤖 Player not ready",
										description:
											"🤖 The bot's music player is not ready yet.\nPlease try again shortly.",
									};
				await interaction.editReply({ embeds: [createPlayerEmbed(playFailure)] });
			}
		} catch (error: unknown) {
			logger.error("PLAYER", "Failed to start playback", {
				guild: interaction.guild ? formatGuild(interaction.guild) : undefined,
				query,
				error,
			});
			await interaction.editReply({
				embeds: [
					createPlayerEmbed({
						title: "⛔ Playback failed",
						description: "I could not start playback for that query.",
					}),
				],
			});
		}
	},
};

export default command;
