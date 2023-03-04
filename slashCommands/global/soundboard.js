const { SlashCommandBuilder, GuildMember } = require("discord.js");
const { Player } = require("discord-player");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
const ClientHandler = require("../../Components/ClientHandler");
class soundboard {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	voiceClips = [
		{ whatrasudeep: "https://youtu.be/hmXbadIoB8M" },
		{ yametekudasai: "https://youtu.be/gb4ZnGIhPD0" },
		{ mcmiyuki: "https://youtu.be/piGuCMs_qok" },
		{ punishmedad: "https://youtu.be/OyQvw7I_Sww" },
		{ chadbg: "https://youtu.be/LY6YVQr94dE" },
		{ butwhy: "https://youtu.be/K4smXP46tG4" },
	];

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new soundboard(client);
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
		this.#name = "soundboard";
		this.#desc = "Play a set of sounds from the list";
		this.#helpDesc =
			"Play's the user selected sound to the voice channel that the user is in. Will override any other sounds that are playing.";
		this.#cType = "fun";
		this.#id = "1050047698000171078";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addStringOption((option) =>
				option
					.setName("voiceclip")
					.setDescription("Which voice clip to play")
					.setRequired(true)
					.addChoices(
						{ name: "What ra Sudeep", value: "whatrasudeep" },
						{ name: "Yamete Kudasai", value: "yametekudasai" },
						{ name: "MC Miyuki RAP", value: "mcmiyuki" },
						{ name: "Punish me daddy ft. Dafuq", value: "punishmedad" },
						{ name: "Chad bg music", value: "chadbg" },
						{ name: "But Why ft. Mukesh", value: "butwhy" }
					)
			)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, client) {
		const player = new Player(client);
		player.events.on("error", (queue, error) => {
			EventHandler.auditEvent(
				"ERROR",
				`[${queue.guild.name}] Discord Player General error emitted from the queue: ${error.message}`,
				error
			);
		});
		player.events.on("playerError", (queue, error) => {
			EventHandler.auditEvent(
				"ERROR",
				`[${queue.guild.name}] Discord Player error emitted from the connection: ${error.message}`,
				error
			);
		});
		player.events.on("connectionError", (queue, error) => {
			EventHandler.auditEvent(
				"ERROR",
				`[${queue.guild.name}] Discord Player Connection error emitted from the connection: ${error.message}`,
				error
			);
		});
		await interaction.deferReply({ ephemeral: false });
		let type = interaction.options.getString("voiceclip");
		let query = this.voiceClips.find((clip) => Object.keys(clip)[0] === type)?.[type];
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
			const searchResult = await player.search(query);

			if (!searchResult.hasTracks()) {
				interaction.editReply(`We didn't find that track!`);
				return;
			} else {
				await player.play(interaction.member.voice.channel, searchResult, {
					nodeOptions: {
						metadata: interaction.channel,
					},
				});
				await interaction.followUp({
					content: `⏱ | Loading your voice clip`,
				});
			}
		} catch (error) {
			EventHandler.auditEvent("ERROR", "Failed to execute soundboard command with Error : " + error, error);
			interaction.followUp({
				content: "There was an error trying to execute that command: " + error.message,
			});
		}
	}
}
module.exports = soundboard;
