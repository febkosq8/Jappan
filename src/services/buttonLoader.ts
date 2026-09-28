import type { ButtonInteraction } from "discord.js";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Config } from "./config.js";

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

type ButtonModuleImport = {
	readonly default?: unknown;
};

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
	const buttonDirectory = fileURLToPath(new URL("../buttons", import.meta.url));
	const entries = await readdir(buttonDirectory, { withFileTypes: true });
	const buttons = new Map<string, ButtonHandler>();

	for (const entry of entries) {
		if (
			!entry.isFile() ||
			entry.name.endsWith(".d.ts") ||
			!(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))
		) {
			continue;
		}

		const buttonPath = join(buttonDirectory, entry.name);
		const buttonModule = (await import(pathToFileURL(buttonPath).href)) as ButtonModuleImport;
		if (!isButtonModule(buttonModule.default)) {
			throw new Error(`Invalid button module: ${entry.name}`);
		}

		if (buttons.has(buttonModule.default.buttonData.id)) {
			throw new Error(`Duplicate button: ${buttonModule.default.buttonData.id}`);
		}

		buttons.set(buttonModule.default.buttonData.id, buttonModule.default.execute);
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
