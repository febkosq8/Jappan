const { GuildMember, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const { useQueue } = require("discord-player");
const ClientHandler = require("../../Components/ClientHandler");
class nowplaying {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new nowplaying(client);
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
		this.#name = "nowplaying";
		this.#desc = "Get the song that is currently playing";
		this.#helpDesc = "Get the song that is currently playing";
		this.#cType = "music";
		this.#id = "1032296352316657668";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, player) {
		await interaction.deferReply();
		if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
			interaction.editReply({
				content: "You are not in a voice channel!",
				ephemeral: true,
			});
			return;
		}

		if (
			interaction.guild.members.me.voice.channelId &&
			interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
		) {
			interaction.editReply({
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
		const currentTrack = queue.currentTrack;
		const progress = queue.node.createProgressBar();
		const perc = queue.node.getTimestamp();
		await interaction.followUp({
			embeds: [
				{
					title: "Now Playing",
					description: `:musical_note: | **${currentTrack.title}** | ${perc.progress} %`,
					fields: [
						{
							name: "\u200b",
							value: progress,
						},
					],
					color: 0xffffff,
				},
			],
		});
	}
}
module.exports = nowplaying;
