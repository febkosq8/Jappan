const { GuildMember, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
const { useQueue } = require("discord-player");
class skip {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new skip(client);
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
		this.#name = "skip";
		this.#desc = "Skip this song";
		this.#helpDesc = "Skip the currently playing song";
		this.#cType = "music";
		this.#id = "1032296352371196018";

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
		if (!queue) {
			interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}
		const currentTrack = queue.currentTrack;
		const success = queue.node.skip();
		return void interaction.followUp({
			content: success ? `✅ | Skipped **${currentTrack}**!` : ":x: | Something went wrong!",
		});
	}
}
module.exports = skip;
