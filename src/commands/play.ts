import { ChannelType, InteractionContextType, PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { logger } from "../services/logger.js";
import { playSearchResult, searchPlayer } from "../services/player.js";

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
			console.log({ query, result, hasResults: result.hasTracks() });
			const choices = result.playlist
				? [{ name: `${result.playlist.title} | Playlist`.slice(0, 100), value: query }]
				: result.tracks.slice(0, 6).map((track) => ({
						name: track.title.slice(0, 100),
						value: track.url,
					}));
			await interaction.respond(choices);
		} catch {
			await interaction.respond([]);
		}
	},
	execute: async ({ interaction }) => {
		await interaction.deferReply();

		const member = interaction.member;
		if (!member || typeof member !== "object" || !("voice" in member) || !member.voice.channel) {
			await interaction.editReply("You are not in a voice channel.");
			return;
		}

		const voiceChannel = member.voice.channel;
		if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice || !interaction.guild) {
			await interaction.editReply("You must join a standard voice channel to play music.");
			return;
		}
		if (
			interaction.guild.members.me?.voice.channelId &&
			interaction.guild.members.me.voice.channelId !== voiceChannel.id
		) {
			await interaction.editReply("You are not in my voice channel.");
			return;
		}
		if (!voiceChannel.joinable || !voiceChannel.speakable) {
			await interaction.editReply("I cannot join and speak in your voice channel.");
			return;
		}

		const query = interaction.options.getString("query", true).trim();
		try {
			const searchResponse = await searchPlayer(query);
			if (!searchResponse.success) {
				await interaction.editReply(
					searchResponse.error_code === "PLAYER_DOWN"
						? "The bot's music player is currently out of service. Please check back later."
						: "The bot's music player is not ready yet. Please try again shortly.",
				);
				return;
			}
			const searchResult = searchResponse.data;
			if (!searchResult.hasTracks()) {
				await interaction.editReply(`No tracks found for '${query}'.`);
				return;
			}

			const statusMessage = await interaction.editReply(
				`Loading your ${searchResult.playlist ? "playlist" : "track"}.`,
			);
			const playResponse = await playSearchResult({
				channel: voiceChannel.id,
				member,
				searchResult,
				statusMessage,
			});
			if (!playResponse.success) {
				await interaction.editReply(
					playResponse.error_code === "PLAYER_DOWN"
						? "The bot's music player is currently out of service. Please check back later."
						: "The bot's music player is not ready yet. Please try again shortly.",
				);
			}
		} catch (error: unknown) {
			logger.error("PLAYER", "Failed to start playback", {
				guild: interaction.guild ? `${interaction.guild.name} <${interaction.guild.id}>` : undefined,
				query,
				error,
			});
			await interaction.editReply("I could not start playback for that query.");
		}
	},
};

export default command;
