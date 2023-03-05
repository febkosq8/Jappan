class Help {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new Help(client);
		}
		return this.instance;
	}
	constructor() {}
	async execute(interaction, client) {
		require(`../../slashCommands/global/help.js`).getInstance(client).execute(interaction);
	}
}
module.exports = Help;
