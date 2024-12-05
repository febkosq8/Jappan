const { GuildMember, SlashCommandBuilder, InteractionContextType } = require("discord.js");
const { useQueue, QueueRepeatMode, useMainPlayer } = require("discord-player");
const config = require("../../config.json");
const EventHandler = require("../../Components/EventHandler");
const ClientHandler = require("../../Components/ClientHandler");

class loop {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new loop(client);
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
		this.#name = "loop";
		this.#desc = "Set the loop mode";
		(this.#helpDesc =
			"Set the bot to repeat the queue in various loop modes. \n**Options**\nOff - Default mode with no loop active\nTrack - Loops  the current track\nQueue - Loops  the current queue\nAutoplay - Play related songs automatically based on your existing queue"),
			(this.#cType = "music");
		this.#id = "1083507845984682083";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addIntegerOption((option) =>
				option
					.setName("mode")
					.setDescription("Loop type")
					.setRequired(true)
					.addChoices(
						{ name: "Off", value: QueueRepeatMode.OFF },
						{ name: "Track", value: QueueRepeatMode.TRACK },
						{ name: "Queue", value: QueueRepeatMode.QUEUE },
						{ name: "Autoplay", value: QueueRepeatMode.AUTOPLAY },
					),
			)
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
		try {
			if (!(interaction.member instanceof GuildMember) || !interaction.member.voice.channel) {
				return void interaction.reply({
					content: "You are not in a voice channel!",
					ephemeral: true,
				});
			}

			if (
				interaction.guild.members.me.voice.channelId &&
				interaction.member.voice.channelId !== interaction.guild.members.me.voice.channelId
			) {
				return void interaction.reply({
					content: "You are not in my voice channel!",
					ephemeral: true,
				});
			}
			const queue = useQueue(interaction.guild.id);
			if (!queue) {
				return void interaction.followUp({
					content: ":x: | No music is being played!",
				});
			}

			const loopMode = interaction.options.getInteger("mode");
			queue.setRepeatMode(loopMode);
			const mode =
				loopMode === QueueRepeatMode.TRACK
					? ":repeat_one:"
					: loopMode === QueueRepeatMode.QUEUE
						? ":repeat:"
						: ":arrow_forward:";

			return void interaction.followUp({
				content: `${mode} | Updated loop mode!`,
			});
		} catch (error) {
			interaction.followUp({
				content: ":x: | Could not update loop mode!",
			});
			EventHandler.auditEvent("ERROR", "Failed to update player loop mode with Error : " + error, error);
		}
	}
}
module.exports = loop;
