const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");
const ClientHandler = require("../../Components/ClientHandler");
const PlayerHandler = require("../../Components/PlayerHandler");
class stop {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new stop(client);
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
		this.#name = "stop";
		this.#desc = "Stop the queue and leave the voice channel";
		this.#helpDesc = "Stop playing songs from the queue and leave the voice channel";
		this.#cType = "music";
		this.#id = "1032296352371196019";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction) {
		await PlayerHandler.stopGuildPlayer(interaction);
	}
}
module.exports = stop;
