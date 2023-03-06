const { GuildMember, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
const { useQueue } = require("discord-player");
const ClientHandler = require("../../Components/ClientHandler");
class shuffle {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new shuffle(client);
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
		this.#name = "shuffle";
		this.#desc = "Shuffle the queue";
		this.#helpDesc = "Shuffle the current queue";
		this.#cType = "music";
		this.#id = "1032296352371196017";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
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
		const queue = useQueue(interaction.guild.id);
		if (!queue) {
			await interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}
		try {
			queue.tracks.shuffle();
			await interaction.followUp({
				content: ":twisted_rightwards_arrows: | Queue has been shuffled!",
			});
		} catch (error) {
			EventHandler.auditEvent("ERROR", "Failed to execute player shuffle command with Error : " + error, error);
			await interaction.followUp({
				content: ":x: | Something went wrong!",
			});
		}
	}
}
module.exports = shuffle;
