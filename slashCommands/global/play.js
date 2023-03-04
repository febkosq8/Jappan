const { SlashCommandBuilder, GuildMember } = require("discord.js");
const { QueryType } = require("discord-player");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
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
	constructor(client) {
		this.processCommand(client);
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
	processCommand(client) {
		this.#name = "play";
		this.#desc = "Play a song/playlist";
		this.#helpDesc =
			"Play a song/playlist. New songs are added to the end of the queue. \nWill disconnect after 5 minutes of inactivity.";
		this.#cType = "music";
		this.#id = "1032296352316657671";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addStringOption((option) =>
				option
					.setName("query")
					.setDescription("The playlist / song you want to play")
					.setRequired(true)
					.setAutocomplete(true)
			)
			.setDMPermission(false)
			.toJSON();
	}
	async autocomplete(interaction, player) {
		const query = interaction.options.getString("query");
		const result = await player.search(query);

		let returnData = [];
		if (result.playlist) {
			returnData.push({ name: result.playlist.title + " | Playlist", value: query });
		}
		result.tracks.slice(0, 6).map((track) => returnData.push({ name: track.title, value: track.url }));
		await interaction.respond(returnData);
	}
	async execute(interaction, player) {
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
			const searchResult = await player.search(query);

			if (!searchResult.hasTracks()) {
				await interaction.editReply(`We found no tracks for ${query}!`);
				return;
			} else {
				await player.play(interaction.member.voice.channel, searchResult, {
					nodeOptions: {
						metadata: interaction.channel,
						bufferingTimeout: 15000,
						leaveOnStop: true,
						leaveOnStopCooldown: 5000,
						leaveOnEnd: true,
						leaveOnEndCooldown: 15000,
						leaveOnEmpty: true,
						leaveOnEmptyCooldown: 300000,
						skipOnNoStream: true,
					},
				});
			}

			await interaction.followUp({
				content: `⏱ | Loading your ${searchResult.playlist ? "playlist" : "track"}`,
			});
		} catch (error) {
			EventHandler.auditEvent("ERROR", "Failed to execute player play command with Error : " + error, error);
			interaction.followUp({
				content: "There was an error trying to execute that command: " + error.message,
			});
		}
	}
}
module.exports = play;
