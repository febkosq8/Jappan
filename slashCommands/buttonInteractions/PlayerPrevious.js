const PlayerHandler = require("../../Components/PlayerHandler");
class PlayerPrevious {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new PlayerPrevious(client);
		}
		return this.instance;
	}
	constructor() {}
	async execute(interaction) {
		await PlayerHandler.previousGuildPlayer(interaction);
	}
}
module.exports = PlayerPrevious;
