import type { ButtonInteraction } from "discord.js";
import { handleHelpCategory } from "../helpers/buttonCategory.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";
import type { Config } from "../services/config.js";

const buttonData = { id: "ModHelp" } satisfies ButtonData;

export function handleModHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	return handleHelpCategory({ interaction, config, category: "moderator" });
}

const button: ButtonModule = { buttonData, execute: handleModHelp };

export default button;
