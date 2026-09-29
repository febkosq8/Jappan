import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { formatGuild, formatUser } from "../helpers/discord.js";
import { createPlayerControls, createPlayerEmbed, getPlayerVoiceChannel } from "../helpers/player.js";
import type { QueueRepeatMode } from "discord-player";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";
import { getPlayer, playSearchResult, searchPlayer } from "../services/player.js";

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

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addStringOption((option) =>
			option
				.setName("query")
				.setDescription("The song or playlist to play")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.setContexts([InteractionContextType.Guild]),
	autocomplete: async (interaction) => {
		const query = interaction.options.getString("query", true).trim();
		if (!query) {
			await interaction.respond([]);
			return;
		}

		try {
			const searchResponse = await searchPlayer(query);
			if (!searchResponse.success) {
				await interaction.respond([]);
				return;
			}
			const result = searchResponse.data;
			const choices = result.playlist
				? [{ name: `${result.playlist.title} | Playlist`.slice(0, 100), value: query }]
				: result.tracks.slice(0, 6).map((track) => ({
						name: `${track.title.slice(0, 100)} | Track`,
						value: track.url,
					}));
			await interaction.respond(choices);
		} catch {
			await interaction.respond([]);
		}
	},
	execute: async ({ interaction }) => {
		await interaction.deferReply();

		const voiceChannelResult = getPlayerVoiceChannel(interaction);
		if (!voiceChannelResult.success) {
			await interaction.editReply({ embeds: [voiceChannelResult.embed] });
			return;
		}
		const { channel: voiceChannel, member } = voiceChannelResult;

		const query = interaction.options.getString("query", true).trim();
		try {
			const searchResponse = await searchPlayer(query);
			if (!searchResponse.success) {
				await interaction.editReply({
					embeds: [
						createPlayerEmbed({
							title:
								searchResponse.error_code === "PLAYER_DOWN"
									? "🤖 Player out of service"
									: "🤖 Player not ready",
							description:
								searchResponse.error_code === "PLAYER_DOWN"
									? "⚠️ The bot's music player is currently out of service.\nPlease check back later."
									: "⚠️ The bot's music player is not ready yet.\nPlease try again shortly.",
						}),
					],
				});
				return;
			}
			const searchResult = searchResponse.data;
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
						queueSize: searchResult.tracks.length + (searchResult.playlist?.tracks.length ?? 0),
					}),
				],
				components: [
					...createPlayerControls({
						queueSize: searchResult.tracks.length + (searchResult.playlist?.tracks.length ?? 0),
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
			});
			if (!playResponse.success) {
				await interaction.editReply({
					embeds: [
						createPlayerEmbed({
							title:
								playResponse.error_code === "PLAYER_DOWN"
									? "🤖 Player out of service"
									: "🤖 Player not ready",
							description:
								playResponse.error_code === "PLAYER_DOWN"
									? "🤖 The bot's music player is currently out of service.\nPlease check back later."
									: "🤖 The bot's music player is not ready yet.\nPlease try again shortly.",
						}),
					],
				});
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
