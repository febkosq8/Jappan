const { GuildMember, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const { useQueue, useHistory } = require("discord-player");
const ClientHandler = require("../../Components/ClientHandler");

class previous {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new previous(client);
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
		this.#name = "previous";
		this.#desc = "Play the previous song in the queue";
		this.#helpDesc = "Go back a song in the queue history";
		this.#cType = "music";
		this.#id = "1032296352316657669";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, player) {
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
		const history = useHistory(interaction.guild.id);
		if (!history?.previousTrack) {
			return interaction.editReply({
				content: `:x: | We found no tracks in history!`,
			});
		}
		await history.previous();
		await interaction.editReply({
			content: ":arrow_backward: | Going back a song in the queue history",
		});
	}
}
module.exports = previous;
