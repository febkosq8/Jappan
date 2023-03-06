const PlayerHandler = require("../../Components/PlayerHandler");
class PlayerQueue {
	static instance;
	static getInstance(client) {
		if (!this.instance) {
			this.instance = new PlayerQueue(client);
		}
		return this.instance;
	}
	constructor() {}
	async execute(interaction) {
		await PlayerHandler.queueGuildPlayer(interaction);
	}
}
module.exports = PlayerQueue;
