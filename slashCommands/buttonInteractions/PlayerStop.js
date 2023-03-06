const PlayerHandler = require("../../Components/PlayerHandler");
class PlayerStop {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new PlayerStop(client);
		}
		return this.instance;
	}
	constructor() {}
	async execute(interaction) {
		await PlayerHandler.stopGuildPlayer(interaction);
	}
}
module.exports = PlayerStop;
