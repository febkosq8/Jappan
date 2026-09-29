import { InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import { formatGuild, formatUser } from "../helpers/discord.js";
import { createPlayerEmbed, getPlayerVoiceChannel } from "../helpers/player.js";
import type { QueueRepeatMode } from "discord-player";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { isDatabaseConnected } from "../services/database.js";
import { logger } from "../services/logger.js";
import { getPlayer, playSearchResult, searchPlayer } from "../services/player.js";
import { findUserPlaylist, listUserPlaylists } from "../services/userPlaylist.js";

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
				.setDescription("The song, playlist, or saved playlist to play")
				.setRequired(true)
				.setAutocomplete(true),
		)
		.addBooleanOption((option) => option.setName("shuffle").setDescription("Shuffle the playback queue"))
		.addBooleanOption((option) => option.setName("loop").setDescription("Loop the playback queue"))
		.setContexts([InteractionContextType.Guild]),
	autocomplete: async (interaction) => {
		const query = interaction.options.getString("query", true).trim();
		const savedPlaylists = isDatabaseConnected()
			? await listUserPlaylists(interaction.user.id).catch(() => [])
			: [];
		const savedChoices = savedPlaylists.map((playlist) => ({
			name: `${playlist.listname} | Saved Playlist`.slice(0, 100),
			value: playlist.listname,
		}));
		if (!query) {
			await interaction.respond(savedChoices.slice(0, 25));
			return;
		}

		try {
			const exactSavedPlaylist = savedPlaylists.find(
				(playlist) => playlist.listname.toLowerCase() === query.toLowerCase(),
			);
			if (exactSavedPlaylist) {
				await interaction.respond([
					{
						name: `${exactSavedPlaylist.listname} | Saved Playlist`.slice(0, 100),
						value: exactSavedPlaylist.listname,
					},
				]);
				return;
			}
			const searchResponse = await searchPlayer(query, { requestedBy: interaction.user.id });
			const matchingSavedChoices = savedChoices.filter((choice) =>
				choice.name.toLowerCase().includes(query.toLowerCase()),
			);
			const result = searchResponse.success ? searchResponse.data : undefined;
			const trackChoices = result?.playlist
				? [{ name: `${result.playlist.title} | Playlist`.slice(0, 100), value: query }]
				: (result?.tracks.slice(0, 6).map((track) => ({
						name: `${track.title.slice(0, 100)} | Track`,
						value: track.url,
					})) ?? []);
			const choices = [...matchingSavedChoices, ...trackChoices].slice(0, 25);
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
		const shuffle = interaction.options.getBoolean("shuffle");
		const loop = interaction.options.getBoolean("loop");
		try {
			let savedPlaylist;
			if (isDatabaseConnected()) {
				try {
					savedPlaylist = await findUserPlaylist(interaction.user.id, query);
				} catch (error: unknown) {
					logger.warn("PLAYER", "Failed to look up saved playlist; using live search", { error, query });
				}
			}
			const searchResponse = await searchPlayer(savedPlaylist?.query ?? query, {
				requestedBy: interaction.user.id,
			});
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
