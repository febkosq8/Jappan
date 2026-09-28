import type { ButtonInteraction } from "discord.js";
import { EmbedBuilder, MessageFlags, bold, underline } from "discord.js";

import { formatCommandPermissions, formatCommandUserPermissions, getCommandDisplayEntries } from "./command.js";
import type { CommandCategory } from "../services/commandLoader.js";
import { getCommandId, getCommands } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";

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
	const fields = [...commands.values()].flatMap((command, commandIndex) => {
		const commandId = getCommandId(command.commandData.name);
		if (!commandId) {
			return [];
		}

		return getCommandDisplayEntries(command, commandId).map((entry) => ({
			name: `${commandIndex + 1}. ${underline(entry.mention ?? entry.name)}`,
			value: `${bold("Description:")} ${entry.description}${formatCommandUserPermissions(entry.requiredUserPermissions)}${formatCommandPermissions(entry.requiredBotPermissions)}${
				entry.subCommands.length > 0
					? `\n\n${bold("Subcommands:")}\n${entry.subCommands
							.map(
								(subcommand, subcommandIndex) =>
									`• ${commandIndex + 1}.${subcommandIndex + 1} ${underline(subcommand.mention ?? subcommand.name)}\n  ${bold("Description:")} ${subcommand.description}${formatCommandUserPermissions(subcommand.requiredUserPermissions)}${formatCommandPermissions(subcommand.requiredBotPermissions)}`,
							)
							.join("\n\n")}`
					: ""
			}`,
		}));
	});
	const categoryName = category.charAt(0).toUpperCase() + category.slice(1);
	const embed = new EmbedBuilder()
		.setColor("Blue")
		.setTitle(`Find help regarding ${config.BOT_NAME} here`)
		.setAuthor({ name: `${config.BOT_NAME} : Docs`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setDescription(`${categoryName} Commands`)
		.addFields(
			fields.length > 0
				? fields
				: [{ name: "No commands available", value: "There are no commands in this category yet." }],
		)
		.setTimestamp();
	await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed] });
}
