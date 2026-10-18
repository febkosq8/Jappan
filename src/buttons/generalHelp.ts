import type { ButtonInteraction } from "discord.js";
import { handleHelpCategory } from "../helpers/buttonCategory.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";
import type { Config } from "../services/config.js";

const buttonData = { id: "GeneralHelp" } satisfies ButtonData;

export function handleGeneralHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	return handleHelpCategory({ interaction, config, category: "general" });
}

const button: ButtonModule = { buttonData, execute: handleGeneralHelp };

export default button;
