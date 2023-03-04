const { GuildMember, SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { useQueue, QueueRepeatMode } = require("discord-player");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
class queue {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new queue(client);
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
		this.#name = "queue";
		this.#desc = "View the queue of songs added currently";
		this.#helpDesc = "View the current songs queue";
		this.#cType = "music";
		this.#id = "1032296352316657673";

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
		let queue = useQueue(interaction.guild.id);
		if (!queue) {
			interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		} else {
			let currQueue = queue.tracks.toArray();
			let queueLength = currQueue.length;
			let loopMode = queue.repeatMode;
			loopMode =
				loopMode === QueueRepeatMode.TRACK
					? ":repeat_one: Track"
					: loopMode === QueueRepeatMode.QUEUE
					? ":repeat: Queue"
					: ":arrow_forward: Off";
			currQueue = queueLength > 50 ? currQueue.slice(0, 50) : currQueue;
			let tracks = currQueue.map((track, idx) => `${++idx}: **${track.title}**`).join("\n");
			if (queueLength > 50) {
				tracks += `\nand ${queueLength - 50} more...`;
			}
			let descString = ``;
			if (queueLength > 0) {
				descString += `${tracks}`;
			} else {
				descString += `\`No songs in queue\``;
			}
			let queueEmbed = new EmbedBuilder()
				.setColor("LightGrey")
				.setAuthor({
					name: interaction.member.guild.name,
					iconURL: interaction.guild.iconUrl ? interaction.guild.iconUrl : config.botpfp,
					url: config.botWebsite,
				})
				.setTimestamp()
				.addFields(
					{
						name: ":musical_note: Now Playing",
						value: queue.currentTrack.title,
						inline: true,
					},
					{
						name: "Loop Mode",
						value: loopMode,
						inline: true,
					},
					{
						name: ":notes: Queue",
						value: descString,
						inline: false,
					}
				);
			return void interaction.editReply({
				embeds: [queueEmbed],
			});
		}
	}
}
module.exports = queue;
