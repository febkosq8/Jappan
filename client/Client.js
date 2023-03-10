const { Client, Collection, GatewayIntentBits, Partials } = require("discord.js");

module.exports = class extends Client {
	constructor(config) {
		super({
			intents: [
				GatewayIntentBits.Guilds,
				GatewayIntentBits.GuildMembers,
				GatewayIntentBits.GuildModeration,
				GatewayIntentBits.GuildInvites,
				GatewayIntentBits.GuildVoiceStates,
				GatewayIntentBits.GuildPresences,
				GatewayIntentBits.GuildMessages,
				GatewayIntentBits.DirectMessages,
				GatewayIntentBits.MessageContent,
			],
			partials: [Partials.Message, Partials.Channel, Partials.Reaction],
		});

		this.commands = new Collection();

		this.config = config;
	}
};
