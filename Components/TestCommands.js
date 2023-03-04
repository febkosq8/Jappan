const fs = require("node:fs");
class TestCommands {
	#testCommands;
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new TestCommands(client);
		}
		return this.instance;
	}
	constructor(client) {
		this.processTestCommands(client);
	}
	getTestCommands() {
		return this.#testCommands;
	}
	processTestCommands(client) {
		const testCommandFiles = fs.readdirSync("./slashCommands/test").filter((file) => file.endsWith(".js"));
		this.#testCommands = testCommandFiles.map((file) => {
			const testCommand = require(`../slashCommands/test/${file}`);
			const testCmd = testCommand.getInstance(client).getCommand();
			return testCmd;
		});
	}
}
module.exports = TestCommands;
