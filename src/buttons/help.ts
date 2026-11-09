import type { ButtonInteraction } from "discord.js";
import { MessageFlags } from "discord.js";

import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";
import { createHelpMessage } from "../helpers/help.js";
import type { Config } from "../services/config.js";

const buttonData = { id: "Help" } satisfies ButtonData;

export async function handleHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	await interaction.reply({ flags: MessageFlags.Ephemeral, ...createHelpMessage(config) });
}

const button: ButtonModule = { buttonData, execute: handleHelp };

export default button;
