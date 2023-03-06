const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
const PlayerHandler = require("../../Components/PlayerHandler");
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
	async execute(interaction) {
		await PlayerHandler.queueGuildPlayer(interaction);
	}
}
module.exports = queue;
