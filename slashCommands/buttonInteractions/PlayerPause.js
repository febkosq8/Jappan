const PlayerHandler = require("../../Components/PlayerHandler");
class PlayerPause {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new PlayerPause(client);
		}
		return this.instance;
	}
	constructor() {}
	async execute(interaction) {
		await PlayerHandler.pauseGuildPlayer(interaction);
	}
}
module.exports = PlayerPause;
