const fs = require("node:fs");
class GlobalCommands {
	#generalFiles = [];
	#musicFiles = [];
	#levelFiles = [];
	#funFiles = [];
	#modFiles = [];
	#globalCommands;
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new GlobalCommands(client);
		}
		return this.instance;
	}
	constructor(client) {
		this.processGlobalCommands(client);
	}
	getGlobalCommands() {
		return this.#globalCommands;
	}
	processGlobalCommands(client) {
		const globalCommandFiles = fs.readdirSync("./slashCommands/global").filter((file) => file.endsWith(".js"));
		this.#globalCommands = globalCommandFiles.map((file) => {
			const globalCommand = require(`../slashCommands/global/${file}`);
			const globalCmd = globalCommand.getInstance(client).getCommand();
			return globalCmd;
		});
		globalCommandFiles.map((file) => {
			const globalCommand = require(`../slashCommands/global/${file}`);
			const globalCmd = globalCommand.getInstance(client).getDetails();
			if (globalCmd.cType === "general") {
				this.#generalFiles.push(globalCmd);
			}
			if (globalCmd.cType === "music") {
				this.#musicFiles.push(globalCmd);
			}
			if (globalCmd.cType === "level") {
				this.#levelFiles.push(globalCmd);
			}
			if (globalCmd.cType === "fun") {
				this.#funFiles.push(globalCmd);
			}
			if (globalCmd.cType === "mod") {
				this.#modFiles.push(globalCmd);
			}
		});
	}
	getGeneralFiles() {
		return this.#generalFiles;
	}
	getMusicFiles() {
		return this.#musicFiles;
	}
	getLevelFiles() {
		return this.#levelFiles;
	}
	getFunFiles() {
		return this.#funFiles;
	}
	getModFiles() {
		return this.#modFiles;
	}
}
module.exports = GlobalCommands;
