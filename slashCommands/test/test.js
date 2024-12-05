const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const ClientHandler = require("../../Components/ClientHandler");
const GuildHandler = require("../../Components/GuildHandler");

class test {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new test(client);
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
		this.#name = "test";
		this.#desc = "test command";
		this.#helpDesc = "test command";
		this.#cType = "test";
		this.#id = "-1";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(this.#desc)
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async execute(interaction) {
		await interaction.deferReply();
		await GuildHandler.updateGuild();
		await interaction.editReply("Ran tasks");
		setTimeout(async () => {
			await interaction.followUp("What tasks");
		}, 5000);
	}
}
module.exports = test;
