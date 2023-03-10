const { EmbedBuilder, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");

class ping {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new ping(client);
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
		this.#name = "ping";
		this.#desc = "Get latency information about the bot";
		this.#helpDesc = "Get latency information about the bot";
		this.#cType = "general";
		this.#id = "1083507846433480709";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
		const pingLoadEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setAuthor({
				name: config.botName + " : Ping",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.addFields(
				{
					name: ":robot: Bot Latency :",
					value: "Loading",
				},
				{
					name: ":satellite: API Latency :",
					value: "Loading",
				}
			);

		const msg = await interaction.editReply({
			embeds: [pingLoadEmbed],
			fetchReply: true,
			ephemeral: true,
		});

		let botPing = msg.createdTimestamp - interaction.createdTimestamp;
		let apiPing = interaction.client.ws.ping;
		const pingEmbed = new EmbedBuilder()
			.setColor(0x0099ff)
			.setAuthor({
				name: config.botName + " : Ping",
				iconURL: config.botpfp,
				url: config.botWebsite,
			})
			.addFields(
				{
					name: ":robot: Bot Latency :",
					value: botPing + " ms",
				},
				{
					name: ":satellite: API Latency :",
					value: apiPing + " ms",
				}
			);
		await interaction.editReply({
			embeds: [pingEmbed],
			ephemeral: true,
		});
	}
}
module.exports = ping;
