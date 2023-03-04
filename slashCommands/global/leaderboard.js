const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");

const LevelHandler = require("../../Components/LevelHandler");
const ClientHandler = require("../../Components/ClientHandler");

class leaderboard {
	#command;
	#name;
	#desc;
	#cType;
	#helpDesc;
	#id;

	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new leaderboard(client);
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
		this.#name = "leaderboard";
		this.#desc = "Show the leaderboard for this server";
		this.#helpDesc = "Show the leaderboard for a server";
		this.#cType = "level";
		this.#id = "1037556895638102026";

		this.#command = new SlashCommandBuilder()
			.setName(this.#name)
			.setDescription(config.botName + " : " + this.#desc)
			.setDMPermission(false)
			.toJSON();
	}
	async execute(interaction, client) {
		await interaction.deferReply();
		LevelHandler.fetchLeaderboard(interaction);
	}
}
module.exports = leaderboard;
