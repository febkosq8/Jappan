const {
	GuildMember,
	SlashCommandBuilder,
	ActionRowBuilder,
	ButtonBuilder,
	ButtonStyle,
	EmbedBuilder,
} = require("discord.js");
const config = require("../../config.json");
const { useQueue, usePlayer } = require("discord-player");
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
		this.#name = "nowplaying";
		this.#desc = "Get the song that is currently playing";
		this.#helpDesc = "Get the song that is currently playing";
		this.#cType = "music";
		this.#id = "1083507846433480707";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
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

		const butttonLabelList = [
			{ key: "PlayerQueue", value: "Current Queue", style: ButtonStyle.Primary },
			{ key: "PlayerPrevious", value: "⏮️ Previous", style: ButtonStyle.Secondary },
			{ key: "PlayerPause", value: "⏯️ Toggle Pause", style: ButtonStyle.Secondary },
			{ key: "PlayerSkip", value: "⏭️ Skip", style: ButtonStyle.Secondary },
			{ key: "PlayerStop", value: "⏹️ Stop", style: ButtonStyle.Danger },
		];

		let buttonRow = new ActionRowBuilder();
		for (let i = 0; i < butttonLabelList.length; i++) {
			buttonRow.addComponents(
				new ButtonBuilder()
					.setCustomId(butttonLabelList[i].key)
					.setLabel(butttonLabelList[i].value)
					.setStyle(butttonLabelList[i].style)
			);
		}

		const guildPlayerNode = usePlayer(interaction.guild.id);
		if (!guildPlayerNode?.queue) {
			await interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}
		const currentTrack = guildPlayerNode.queue.currentTrack;
		const progress = guildPlayerNode.createProgressBar();
		const perc = guildPlayerNode.getTimestamp();
		let requestedByString = currentTrack.requestedBy.username + "#" + currentTrack.requestedBy.discriminator;
		if (!requestedByString) {
			requestedByString = "Someone";
		}
		const nowPlayingEmbed = new EmbedBuilder()
			.setColor(0xffffff)
			.setTitle("Now Playing")
			.setAuthor({
				name: config.botName,
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.setFields({
				name: "\u200b",
				value: progress,
			})
			.setDescription(`:musical_note: | **${currentTrack.title}** | **${perc.progress} %**`)
			.setFooter({ text: `Song requested by ${requestedByString}` })
			.setTimestamp();
		await interaction.followUp({
			embeds: [nowPlayingEmbed],
			components: [buttonRow],
		});
	}
}
module.exports = nowplaying;
