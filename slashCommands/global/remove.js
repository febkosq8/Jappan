const { GuildMember, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const { useQueue } = require("discord-player");
const ClientHandler = require("../../Components/ClientHandler");
class remove {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new remove(client);
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
		this.#name = "remove";
		this.#desc = "Remove a song from the queue";
		this.#helpDesc = "Remove a song from the queue";
		this.#cType = "music";
		this.#id = "1032296352371196015";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addIntegerOption((option) =>
				option.setName("number").setDescription("The queue number you want to remove").setRequired(true)
			)
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
		const number = interaction.options.getInteger("number") - 1;
		if (number > queue.tracks.toArray().length) {
			await interaction.followUp({
				content: ":x: | Track number greater than queue depth!",
			});
			return;
		}

		const removedTrack = queue.removeTrack(number);
		await interaction.followUp({
			content: removedTrack ? `✅ | Removed **${removedTrack}**!` : ":x: | Something went wrong!",
		});
	}
}
module.exports = remove;
