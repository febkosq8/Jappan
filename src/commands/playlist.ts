import { EmbedBuilder, InteractionContextType, MessageFlags, SlashCommandBuilder } from "discord.js";

import { formatUser } from "../helpers/discord.js";
import { createPlayerControls, createPlayerEmbed, getPlayerVoiceChannel } from "../helpers/player.js";
import type { BotCommand, BotCommandData } from "../services/commandLoader.js";
import { playSearchResult, searchPlayer } from "../services/player.js";
import { findUserPlaylist, listUserPlaylists, removeUserPlaylist, saveUserPlaylist } from "../services/userPlaylist.js";

const commandData = {
	name: "playlist",
	description: "Save and play your music playlists",
	category: "music",
	isDBDependant: true,
	hasSubCommands: true,
	subCommands: [
		{ name: "add", description: "Save or update a playlist", category: "music" },
		{ name: "play", description: "Play one of your saved playlists", category: "music" },
		{ name: "remove", description: "Remove one of your saved playlists", category: "music" },
		{ name: "check", description: "List your saved playlists", category: "music" },
	],
} satisfies BotCommandData;

const command: BotCommand = {
	commandData,
	data: new SlashCommandBuilder()
		.setName(commandData.name)
		.setDescription(commandData.description)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("add")
				.setDescription("Save or update a playlist")
				.addStringOption((option) =>
					option
						.setName("listname")
						.setDescription("Name for this playlist; unique per user, case-insensitive")
						.setRequired(true),
				)
				.addStringOption((option) =>
					option.setName("query").setDescription("Playlist URL or song search query").setRequired(true),
				)
				.addBooleanOption((option) =>
					option.setName("shuffle").setDescription("Shuffle on playback").setRequired(true),
				)
				.addBooleanOption((option) =>
					option.setName("loop").setDescription("Loop the playlist").setRequired(true),
				),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("play")
				.setDescription("Play one of your saved playlists")
				.addStringOption((option) =>
					option
						.setName("listname")
						.setDescription("Saved playlist name")
						.setRequired(true)
						.setAutocomplete(true),
				)
				.addBooleanOption((option) =>
					option.setName("shuffle").setDescription("Override saved shuffle setting"),
				)
				.addBooleanOption((option) => option.setName("loop").setDescription("Override saved loop setting")),
		)
		.addSubcommand((subcommand) =>
			subcommand
				.setName("remove")
				.setDescription("Remove one of your saved playlists")
				.addStringOption((option) =>
					option
						.setName("listname")
						.setDescription("Saved playlist name")
						.setRequired(true)
						.setAutocomplete(true),
				),
		)
		.addSubcommand((subcommand) => subcommand.setName("check").setDescription("List your saved playlists"))
		.setContexts([InteractionContextType.Guild]),
	autocomplete: async (interaction) => {
		const focused = interaction.options.getString("listname", true);
		const choices = (await listUserPlaylists(interaction.user.id))
			.filter((entry) => entry.listname.toLowerCase().includes(focused.trim().toLowerCase()))
			.sort((first, second) => first.listname.localeCompare(second.listname))
			.slice(0, 25)
			.map((entry) => ({ name: entry.listname, value: entry.listname }));
		await interaction.respond(choices);
	},
	execute: async ({ interaction }) => {
		const subcommand = interaction.options.getSubcommand();
		if (subcommand === "play") {
			await interaction.deferReply();
		} else {
			await interaction.deferReply({ flags: MessageFlags.Ephemeral });
		}
		if (subcommand === "add") {
			const listname = interaction.options.getString("listname", true).trim();
			const query = interaction.options.getString("query", true).trim();
			if (!listname || listname.length > 100) {
				await interaction.editReply("⛔ Playlist names must be between 1 and 100 characters.");
				return;
			}
			const searchResponse = await searchPlayer(query, { requestedBy: interaction.user.id });
			if (!searchResponse.success || !searchResponse.data.hasTracks()) {
				await interaction.editReply(`⛔ No tracks found for '${query}'.`);
				return;
			}
			const shuffle = interaction.options.getBoolean("shuffle", true);
			const loop = interaction.options.getBoolean("loop", true);
			await saveUserPlaylist({
				userId: interaction.user.id,
				username: formatUser(interaction.user),
				entry: {
					listname,
					query,
					shuffle,
					loop,
				},
			});
			const savedPlaylistEmbed = createPlayerEmbed({
				title: "✅ Playlist saved",
				description: `Saved playlist **${listname}** successfully.`,
				color: "Green",
			});
			savedPlaylistEmbed.addFields(
				{
					name: "🔍 Query",
					value: query.length > 1024 ? `${query.slice(0, 1021)}...` : query,
				},
				{ name: "🔀 Shuffle", value: shuffle ? "Enabled" : "Disabled", inline: true },
				{ name: "🔁 Loop", value: loop ? "Enabled" : "Disabled", inline: true },
			);
			await interaction.editReply({
				embeds: [savedPlaylistEmbed],
			});
			return;
		}

		if (subcommand === "check") {
			const playlists = await listUserPlaylists(interaction.user.id);
			const playlistEmbeds =
				playlists.length === 0
					? [
							new EmbedBuilder()
								.setTitle("Your saved playlists")
								.setDescription("You have no saved playlists.")
								.setColor("Gold"),
						]
					: [];
			for (let start = 0; start < playlists.length; start += 25) {
				const embed = new EmbedBuilder().setTitle("Your saved playlists").setColor("Gold");
				for (const [offset, entry] of playlists.slice(start, start + 25).entries()) {
					const query = entry.query.length > 1024 ? `${entry.query.slice(0, 1021)}...` : entry.query;
					embed.addFields({
						name: `#${start + offset + 1}`,
						value: `📛 Listname: **${entry.listname}**\n🔍 Query: ${query}\n🔀 Shuffle: ${entry.shuffle ? "Enabled" : "Disabled"}\n🔁 Loop: ${entry.loop ? "Enabled" : "Disabled"}`,
					});
				}
				playlistEmbeds.push(embed);
			}
			await interaction.editReply({
				embeds: playlistEmbeds,
			});
			return;
		}

		if (subcommand === "remove") {
			const listname = interaction.options.getString("listname", true);
			const removed = await removeUserPlaylist({ userId: interaction.user.id, listname });
			if (!removed) {
				await interaction.editReply(`⛔ No saved playlist matched **${listname}**.`);
				return;
			}
			const removedPlaylistEmbed = createPlayerEmbed({
				title: "🗑️ Playlist removed",
				description: `Removed saved playlist **${listname}**.`,
				color: "Green",
			});
			await interaction.editReply({ embeds: [removedPlaylistEmbed] });
			return;
		}

		if (subcommand === "play") {
			const listname = interaction.options.getString("listname", true);
			const playlist = await findUserPlaylist(interaction.user.id, listname);
			if (!playlist) {
				await interaction.editReply("⛔ No saved playlist matched that name.");
				return;
			}
			const voiceChannelResult = getPlayerVoiceChannel(interaction);
			if (!voiceChannelResult.success) {
				await interaction.editReply({ embeds: [voiceChannelResult.embed] });
				return;
			}
			const searchResponse = await searchPlayer(playlist.query, { requestedBy: interaction.user.id });
			if (!searchResponse.success || !searchResponse.data.hasTracks()) {
				await interaction.editReply("⛔ No tracks could be found for this saved playlist.");
				return;
			}
			const shuffle = interaction.options.getBoolean("shuffle") ?? playlist.shuffle;
			const searchResult = searchResponse.data;
			if (shuffle) {
				searchResult.setTracks([...searchResult.tracks].sort(() => Math.random() - 0.5));
			}
			const statusMessage = await interaction.editReply({
				embeds: [
					createPlayerEmbed({
						title: "⏳ Loading playback",
						description: `Waiting for your ${searchResult.playlist ? "playlist" : "track"} to start.`,
						color: "Blue",
						requestedBy: formatUser(voiceChannelResult.member.user),
						queueSize: searchResult.tracks.length + (searchResult.playlist?.tracks.length ?? 0),
					}),
				],
				components: createPlayerControls({
					queueSize: searchResult.tracks.length + (searchResult.playlist?.tracks.length ?? 0),
				}),
			});
			await playSearchResult({
				channel: voiceChannelResult.channel.id,
				member: voiceChannelResult.member,
				searchResult,
				statusMessage,
				repeatMode: playlist.loop ? 2 : 0,
			});
			return;
		}

		await interaction.editReply("⛔ Unsupported playlist subcommand.");
	},
};

export default command;
