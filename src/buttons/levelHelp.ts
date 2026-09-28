import type { ButtonInteraction } from "discord.js";
import { handleHelpCategory } from "../helpers/buttonCategory.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";
import type { Config } from "../services/config.js";

const buttonData = { id: "LevelHelp" } satisfies ButtonData;

export function handleLevelHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	return handleHelpCategory({ interaction, config, category: "level" });
}

const button: ButtonModule = { buttonData, execute: handleLevelHelp };

export default button;
