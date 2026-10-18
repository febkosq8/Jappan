import type { ButtonInteraction } from "discord.js";

import type { Config } from "./config.js";
import deleteDoppelganger from "../buttons/deleteDoppelganger.js";
import funHelp from "../buttons/funHelp.js";
import generalHelp from "../buttons/generalHelp.js";
import help from "../buttons/help.js";
import leaderboardNext from "../buttons/leaderboardNext.js";
import leaderboardPrev from "../buttons/leaderboardPrev.js";
import levelHelp from "../buttons/levelHelp.js";
import modHelp from "../buttons/modHelp.js";
import musicHelp from "../buttons/musicHelp.js";
import ping from "../buttons/ping.js";
import playerControl from "../buttons/playerControl.js";

export type ButtonHandler = ({
	interaction,
	config,
}: {
	interaction: ButtonInteraction;
	config: Config;
}) => Promise<void>;

export interface ButtonData {
	readonly id: string;
}

export interface ButtonModule {
	readonly buttonData: ButtonData;
	readonly execute: ButtonHandler;
}

const buttonModules: readonly unknown[] = [
	deleteDoppelganger,
	funHelp,
	generalHelp,
	help,
	leaderboardNext,
	leaderboardPrev,
	levelHelp,
	modHelp,
	musicHelp,
	ping,
	playerControl,
];

let loadedButtons: Map<string, ButtonHandler> | undefined;

function isButtonModule(value: unknown): value is ButtonModule {
	if (!value || typeof value !== "object") return false;
	const button = value as Partial<ButtonModule>;
	return (
		!!button.buttonData &&
		typeof button.buttonData === "object" &&
		typeof button.buttonData.id === "string" &&
		button.buttonData.id.length > 0 &&
		typeof button.execute === "function"
	);
}

export async function loadButtons(): Promise<Map<string, ButtonHandler>> {
	const buttons = new Map<string, ButtonHandler>();

	for (const buttonModule of buttonModules) {
		if (!isButtonModule(buttonModule)) {
			throw new Error("Invalid button module");
		}

		if (buttons.has(buttonModule.buttonData.id)) {
			throw new Error(`Duplicate button: ${buttonModule.buttonData.id}`);
		}

		buttons.set(buttonModule.buttonData.id, buttonModule.execute);
	}

	loadedButtons = buttons;
	return loadedButtons;
}

export function getButtonHandler(customId: string): ButtonHandler | undefined {
	if (!loadedButtons) {
		throw new Error("Buttons have not been loaded");
	}

	const buttonId = customId.split("|", 1)[0];
	return buttonId ? loadedButtons.get(buttonId) : undefined;
}
