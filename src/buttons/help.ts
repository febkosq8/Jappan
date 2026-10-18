import type { ButtonInteraction } from "discord.js";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags } from "discord.js";

import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";
import { getCommands } from "../services/commandLoader.js";
import type { Config } from "../services/config.js";

const buttonData = { id: "Help" } satisfies ButtonData;

export async function handleHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	const helpSections = [
		{ id: "GeneralHelp", label: "General Commands", category: "general" },
		{ id: "MusicHelp", label: "Music Commands", category: "music" },
		{ id: "LevelHelp", label: "Level Commands", category: "level" },
		{ id: "FunHelp", label: "Fun Commands", category: "fun" },
		{ id: "ModHelp", label: "Moderator Commands", category: "moderator" },
	].filter(({ category }) => getCommands().some((command) => command.commandData.category === category));
	const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
		helpSections.map(({ id, label }) =>
			new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(ButtonStyle.Primary),
		),
	);
	const embed = new EmbedBuilder()
		.setColor("Blue")
		.setTitle(`Find help regarding ${config.BOT_NAME} here`)
		.setAuthor({ name: `${config.BOT_NAME} : Docs`, iconURL: config.BOT_PFP, url: config.BOT_WEBSITE })
		.setDescription("Select a topic below to proceed.")
		.setTimestamp();
	await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [embed], components: [buttons] });
}

const button: ButtonModule = { buttonData, execute: handleHelp };

export default button;
