const { SlashCommandBuilder, GuildMember } = require("discord.js");
const { useMainPlayer } = require("discord-player");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
const PlayerHandler = require("../../Components/PlayerHandler");
const ClientHandler = require("../../Components/ClientHandler");
class play {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new play(client);
		}
		return this.instance;
	}
	constructor() {
		this.processCommand();
	}

	getCommand() {
		return this.#command;
	}
	getDetails() {
		return {
			name: this.#name,
			helpDesc: this.#helpDesc,
			cType: this.#cType,
			id: ClientHandler.getCommandId(this.#name) || this.#id,
		};
	}
	processCommand() {
		this.#name = "play";
		this.#desc = "Play a song/playlist";
		this.#helpDesc =
			"Play a song/playlist. New songs are added to the end of the queue. \nWill disconnect after 5 minutes of inactivity.";
		this.#cType = "music";
		this.#id = "1083507846433480710";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addStringOption((option) =>
				option
					.setName("query")
					.setDescription("The playlist / song you want to play")
					.setRequired(true)
					.setAutocomplete(true),
			)
			.setDMPermission(false)
			.toJSON();
	}
	async autocomplete(interaction) {
		const player = useMainPlayer();
		const query = interaction.options.getString("query");
		let returnData = [];
		if (query) {
			let result = await player.search(query);
			if (result.playlist) {
				if (result.playlist.title.length > 100) {
					result.playlist.title = result.playlist.title.substring(0, 90) + "..(truncated)..";
				}
				returnData.push({ name: result.playlist.title + " | Playlist", value: query });
			}
			result.tracks.slice(0, 6).map((track) => returnData.push({ name: track.title, value: track.url }));
		}
		await interaction.respond(returnData);
	}
	async execute(interaction) {
		const player = useMainPlayer();
		await interaction.deferReply();
		try {
			if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
				await interaction.editReply({
					content: "You are not in a voice channel!",
					ephemeral: true,
				});
				return;
			}

			if (
				interaction.guild.members.me.voice.channelId &&
				interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
			) {
				await interaction.editReply({
					content: "You are not in my voice channel!",
					ephemeral: true,
				});
				return;
			}

			const query = interaction.options.getString("query");
			const searchResult = await player.search(query, { requestedBy: interaction.user });

			if (!searchResult.hasTracks()) {
				await interaction.editReply(`We found no tracks for ${query}!`);
				return;
			} else {
				await PlayerHandler.playGuildPlayer(interaction, searchResult);
			}

			await interaction.followUp({
				content: `⏱ | Loading your ${searchResult.playlist ? "playlist" : "track"}`,
			});
		} catch (error) {
			EventHandler.auditEvent("ERROR", "Failed to execute player play command with Error : " + error, error);
			interaction.followUp({
				content: ":warning: We failed to execute that command because of an error",
			});
		}
	}
}
module.exports = play;
