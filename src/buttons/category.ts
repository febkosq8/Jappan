import { EmbedBuilder, MessageFlags } from "discord.js";
import type { ButtonInteraction } from "discord.js";

import { getCommandId, getCommands } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";
import type { CommandCategory } from "../services/commandLoader.js";

export async function handleHelpCategory({
	interaction,
	config,
	category,
}: {
	interaction: ButtonInteraction;
	config: Config;
	category: CommandCategory;
}): Promise<void> {
	const commands = getCommands().filter((command) => command.commandData.category === category);
	const fields = commands.map((command) => {
		const commandId = getCommandId(command.commandData.name);
		return {
			name: commandId ? `</${command.commandData.name}:${commandId}>` : `/${command.commandData.name}`,
			value: command.commandData.description,
		};
	});
	const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
	const embed = new EmbedBuilder()
		.setColor("Blue")
		.setTitle(`Find help regarding ${config.BOT_NAME} here`)
		.setAuthor({ name: `${config.BOT_NAME} : Docs`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setDescription(`${categoryName} Commands`)
		.addFields(
			fields.length > 0 ? fields : [{ name: "No commands available", value: "There are no commands in this category yet." }],
		);
	await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
}
