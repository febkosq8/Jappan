const PlayerHandler = require("../../Components/PlayerHandler");
class PlayerSkip {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new PlayerSkip(client);
		}
		return this.instance;
	}
	constructor() {}
	async execute(interaction) {
		await PlayerHandler.skipGuildPlayer(interaction);
	}
}
module.exports = PlayerSkip;
