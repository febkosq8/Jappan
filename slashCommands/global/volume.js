const { GuildMember, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
const { usePlayer } = require("discord-player");
class volume {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new volume(client);
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
		this.#name = "volume";
		this.#desc = "Change the output volume";
		this.#helpDesc = "Change the output volume";
		this.#cType = "music";
		this.#id = "1083507846806777994";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addIntegerOption((option) =>
				option
					.setName("volume")
					.setDescription("Volume number between 0 - 200")
					.setMinValue(0)
					.setMaxValue(200)
					.setRequired(true)
			)
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
		const guildPlayerNode = usePlayer(interaction.guild.id);
		if (!guildPlayerNode.isPlaying()) {
			await interaction.followUp({
				content: ":x: | No music is being played!",
			});
			return;
		}

		var volume = interaction.options.getInteger("volume");
		const success = guildPlayerNode.setVolume(volume);

		await interaction.followUp({
			content: success ? `🔊 | Volume set to ${volume}!` : ":x: | Something went wrong!",
		});
	}
}
module.exports = volume;
