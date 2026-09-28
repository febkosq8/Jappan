import type { ButtonInteraction } from "discord.js";
import { handleHelpCategory } from "../helpers/buttonCategory.js";
import type { ButtonData, ButtonModule } from "../services/buttonLoader.js";
import type { Config } from "../services/config.js";

const buttonData = { id: "MusicHelp" } satisfies ButtonData;

export function handleMusicHelp({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}): Promise<void> {
	return handleHelpCategory({ interaction, config, category: "music" });
}

const button: ButtonModule = { buttonData, execute: handleMusicHelp };

export default button;
