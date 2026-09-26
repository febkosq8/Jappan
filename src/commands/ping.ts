import { SlashCommandBuilder } from "discord.js";

import type { BotCommand } from "../commandLoader.js";

const commandData = {
	name: "ping",
	description: "Replies with Pong",
} as const;

const command: BotCommand = {
	data: new SlashCommandBuilder().setName(commandData.name).setDescription(commandData.description),
	execute: async (interaction) => {
		await interaction.reply("Pong!");
	},
};

export default command;
