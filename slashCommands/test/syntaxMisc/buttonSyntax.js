const { SlashCommandBuilder } = require("discord.js");
const config = require("../../config.json");

class play {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new play(client);
		}
		return this.instance;
	}
	constructor(client) {
		this.processCommand(client);
	}
	async execute(interaction, client) {}
}
module.exports = play;
