const { SlashCommandBuilder, GuildMember, InteractionContextType } = require("discord.js");
const { useQueue, useMainPlayer } = require("discord-player");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
const PlayerHandler = require("../../Components/PlayerHandler");
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
		this.#name = "playtop";
		this.#desc = "Priotize play a song before the next one";
		this.#helpDesc =
			"Place a song to the top of the song queue so that this song is played after the current one has ended. \nWill disconnect after 5 minutes of inactivity.";
		this.#cType = "music";
		this.#id = "1083507846433480712";

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
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async autocomplete(interaction) {
		try {
			const player = useMainPlayer();
			const query = interaction.options.getString("query");
			let returnData = [];
			if (query) {
				let result = await player.search(query);
				if (result.playlist) {
					if (result.playlist.title.length > 100) {
						result.playlist.title = result.playlist.title.substring(0, 90) + "...";
					}
					let name = result.playlist.title + " | Playlist";
					if (name.length > 100) {
						name = name.substring(0, 90) + "...";
					}
					returnData.push({ name, value: query });
				}
				result.tracks.slice(0, 6).map((track) =>
					returnData.push({
						name: track.description.length > 100 ? track.description.substring(0, 90) + "..." : track.description,
						value: track.url,
					}),
				);
			}
			await interaction.respond(returnData);
		} catch (error) {}
	}
	async execute(interaction) {
		const player = useMainPlayer();
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
			const searchResult = await player.search(query, { requestedBy: interaction.user });

			if (!searchResult.hasTracks()) {
				interaction.editReply(`We found no tracks for '${query}' !`);
				return;
			} else {
				let queue = useQueue(interaction.guild.id);
				if (!queue) {
					await PlayerHandler.playGuildPlayer({ interaction, searchResult });
				} else {
					queue.insertTrack(searchResult.tracks[0], 0);
					await interaction.editReply(
						`:musical_note: | Added ${searchResult.tracks[0].title} to the top of the queue!`,
					);
				}
			}
		} catch (error) {
			EventHandler.auditEvent("ERROR", "Failed to execute player playtop command with Error : " + error, error);
			interaction.followUp({
				content: ":warning: We failed to execute that command because of an error",
			});
		}
	}
}
module.exports = playtop;
