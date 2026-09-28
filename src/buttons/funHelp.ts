import type { ButtonInteraction } from "discord.js";
import { handleHelpCategory } from "../helpers/buttonCategory.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";
import type { Config } from "../services/config.js";

const buttonData = { id: "FunHelp" } satisfies ButtonData;

export function handleFunHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	return handleHelpCategory({ interaction, config, category: "fun" });
}

const button: ButtonModule = { buttonData, execute: handleFunHelp };

export default button;
