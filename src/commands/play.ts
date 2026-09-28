import {
	ChannelType,
	InteractionContextType,
	MessageFlags,
	PermissionFlagsBits,
	SlashCommandBuilder,
} from "discord.js";

import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
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
			const result = await searchPlayer(query);
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
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

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
			const searchResult = await searchPlayer(query);
			if (!searchResult.hasTracks()) {
				await interaction.editReply(`No tracks found for '${query}'.`);
				return;
			}

			await playSearchResult({ channel: voiceChannel.id, member, searchResult });
			await interaction.editReply(`Loading your ${searchResult.playlist ? "playlist" : "track"}.`);
		} catch {
			await interaction.editReply("I could not start playback for that query.");
		}
	},
};

export default command;
