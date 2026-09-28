import type { ButtonInteraction } from "discord.js";
import {
	ApplicationCommandOptionType,
	EmbedBuilder,
	MessageFlags,
	chatInputApplicationCommandMention,
} from "discord.js";

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
	const fields = [...commands.values()].flatMap((command) => {
		const commandId = getCommandId(command.commandData.name);
		if (!commandId) {
			return [];
		}

		const commandDefinition = command.data.toJSON();
		const subcommands = (commandDefinition.options ?? []).flatMap((option) => {
			if (option.type === ApplicationCommandOptionType.Subcommand) {
				return [
					{
						name: chatInputApplicationCommandMention(commandDefinition.name, option.name, commandId),
						value: option.description,
					},
				];
			}
			if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
				return (option.options ?? [])
					.filter((subcommand) => subcommand.type === ApplicationCommandOptionType.Subcommand)
					.map((subcommand) => ({
						name: chatInputApplicationCommandMention(
							commandDefinition.name,
							option.name,
							subcommand.name,
							commandId,
						),
						value: subcommand.description,
					}));
			}
			return [];
		});

		return subcommands.length > 0
			? subcommands
			: [
					{
						name: chatInputApplicationCommandMention(commandDefinition.name, commandId),
						value: commandDefinition.description,
					},
				];
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
