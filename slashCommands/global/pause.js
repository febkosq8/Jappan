const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
const PlayerHandler = require("../../Components/PlayerHandler");

class pause {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new pause(client);
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
		this.#name = "pause";
		this.#desc = "Toggle pause for the current queue";
		this.#helpDesc = "Pause or resume the player";
		this.#cType = "music";
		this.#id = "1032296352316657669";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await PlayerHandler.pauseGuildPlayer(interaction);
	}
}
module.exports = pause;
