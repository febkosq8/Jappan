const { SlashCommandBuilder, InteractionContextType } = require("discord.js");
const config = require("../config.json");

class play {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new play(client);
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
		this.#name = "";
		this.#desc = "";
		this.#helpDesc = "";
		this.#cType = "";
		this.#id = "";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.addStringOption((option) =>
				option.setName("query").setDescription("The playlist / song you want to play").setRequired(true),
			)
			.setContexts([InteractionContextType.Guild])
			.toJSON();
	}
	async execute(interaction, player) {}
}
module.exports = play;
