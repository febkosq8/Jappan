const { GuildMember, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const { useQueue } = require("discord-player");
const ClientHandler = require("../../Components/ClientHandler");

class pause {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new pause(client);
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
		this.#name = "pause";
		this.#desc = "Toggle pause for the current queue";
		this.#helpDesc = "Pause or resume the player";
		this.#cType = "music";
		this.#id = "1032296352316657669";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
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
		const queue = useQueue(interaction.guild.id);
		if (!queue || !queue.currentTrack) {
			await interaction.editReply({
				content: ":x: | No music is being played!",
			});
			return;
		}

		const newPauseState = !queue.node.isPaused();

		queue.node.setPaused(newPauseState);
		await interaction.editReply({
			content: newPauseState ? ":pause_button: | Paused player" : ":arrow_forward: | Resumed player",
		});
	}
}
module.exports = pause;
