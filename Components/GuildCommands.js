const fs = require("node:fs");

class GuildCommands {
	#guildCommands;
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new GuildCommands(client);
		}
		return this.instance;
	}
	constructor(client) {
		this.processGuildCommands(client);
	}
	getGuildCommands() {
		return this.#guildCommands;
	}
	processGuildCommands(client) {
		const guildCommandFiles = fs.readdirSync("./slashCommands/guild").filter((file) => file.endsWith(".js"));
		this.#guildCommands = guildCommandFiles.map((file) =>
			require(`../slashCommands/guild/${file}`).getInstance(client).getCommand(),
		);
	}
}
module.exports = GuildCommands;
