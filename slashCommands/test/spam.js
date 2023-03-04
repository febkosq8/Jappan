const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const axios = require("axios");

class clear {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new clear(client);
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
		this.#name = "spam";
		this.#desc = "Spam messages";
		this.#helpDesc = "Spam messages";
		this.#cType = "test";
		this.#id = "123";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addNumberOption((option) =>
				option.setName("count").setDescription("Number of messages to spam").setRequired(true)
			)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, client) {
		await interaction.deferReply();
		let count = interaction.options.get("count").value;
		for (let i = 1; i <= count; i++) {
			let spamQuote = await axios.get("https://api.quotable.io/random");
			spamQuote = spamQuote.data;
			interaction.followUp("Quote #" + i + " : " + spamQuote.content);
		}
	}
}

module.exports = clear;
