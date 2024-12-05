const { GuildMember, SlashCommandBuilder, EmbedBuilder, InteractionContextType } = require("discord.js");
const config = require("../../config.json");
const { usePlayer } = require("discord-player");
const ClientHandler = require("../../Components/ClientHandler");
const PlayerHandler = require("../../Components/PlayerHandler");
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
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
		if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
			return interaction.editReply({
				content: "You are not in a voice channel!",
				ephemeral: true,
			});
		}
		if (
			interaction.guild.members.me.voice.channelId &&
			interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
		) {
			return interaction.editReply({
				content: "You are not in my voice channel!",
				ephemeral: true,
			});
		}
		const nowPlayingEmbedData = await PlayerHandler.nowPlayingQueue(interaction.guild.id);
		let interval;
		if (!nowPlayingEmbedData) {
			return interaction.editReply({
				content: ":x: | No music is being played!",
			});
		}
		const guildPlayerNode = usePlayer(interaction.guild.id);
		interval = setInterval(async () => {
			let nowPlayingEmbedData = await PlayerHandler.nowPlayingQueue(interaction.guild.id);
			if (!nowPlayingEmbedData || !guildPlayerNode?.queue || !guildPlayerNode.queue.metadata.nowPlaying) {
				clearInterval(interval);
				interval = undefined;
				nowPlayingEmbedData = {
					embeds: [
						new EmbedBuilder()
							.setColor(0xffffff)
							.setTitle("We ran out of music")
							.setAuthor({
								name: config.botName,
								iconURL: config.botpfp,
								url: config.botWebsite,
							})
							.setDescription(`Start a new queue`)
							.setTimestamp(),
					],
				};
			}
			guildPlayerNode.queue.metadata.nowPlaying.edit(nowPlayingEmbedData);
		}, 30000);
		const reply = await interaction.followUp(nowPlayingEmbedData);
		guildPlayerNode.queue.metadata.nowPlaying = reply;
	}
}
module.exports = nowplaying;
