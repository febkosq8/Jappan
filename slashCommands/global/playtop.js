const { SlashCommandBuilder, GuildMember } = require("discord.js");
const { useQueue, QueryType } = require("discord-player");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
const ClientHandler = require("../../Components/ClientHandler");
class playtop {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new playtop(client);
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
	processCommand() {
		this.#name = "playtop";
		this.#desc = "Priotize play a song before the next one";
		this.#helpDesc =
			"Place a song to the top of the song queue so that this song is played after the current one has ended. \nWill disconnect after 5 minutes of inactivity.";
		this.#cType = "music";
		this.#id = "1032296352316657672";

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
				return void interaction.editReply({
					content: "You are not in a voice channel!",
					ephemeral: true,
				});
			}

			if (
				interaction.guild.members.me.voice.channelId &&
				interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
			) {
				return void interaction.editReply({
					content: "You are not in my voice channel!",
					ephemeral: true,
				});
			}
			const query = interaction.options.getString("query");
			const searchResult = await player.search(query);

			if (!searchResult.hasTracks()) {
				interaction.editReply(`We found no tracks for ${query}!`);
				return;
			} else {
				let queue = useQueue(interaction.guild.id);
				if (!queue) {
					await interaction.followUp({
						content: `⏱ | Loading your track`,
					});
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
				} else {
					queue.insertTrack(searchResult.tracks[0], 0);
					await interaction.editReply(
						`:musical_note: | Added ${searchResult.tracks[0].title} to the top of the queue!`
					);
				}
			}
		} catch (error) {
			EventHandler.auditEvent("ERROR", "Failed to execute player playtop command with Error : " + error, error);
			interaction.followUp({
				content: "There was an error trying to execute that command: " + error.message,
			});
		}
	}
}
module.exports = playtop;
