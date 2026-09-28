import { blue, bold, cyan, dim, gray, green, magenta, red, white, yellow } from "colorette";
import { getConfig } from "../services/config.js";

export type LogDetails = Record<string, unknown>;
export type LogLevel = "debug" | "info" | "success" | "warn" | "error";
export type LogCategory =
	| "AUTOCOMPLETE"
	| "ADMIN"
	| "BOT"
	| "BUTTONS"
	| "DATABASE"
	| "DISCORD"
	| "DOPPELGANGER"
	| "PLAYER"
	| "SLASH_COMMANDS";

const levelColors: Record<LogLevel, (value: string) => string> = {
	debug: gray,
	info: blue,
	success: green,
	warn: yellow,
	error: red,
};

const categoryColors: Record<LogCategory, (value: string) => string> = {
	AUTOCOMPLETE: white,
	ADMIN: red,
	BOT: magenta,
	BUTTONS: yellow,
	DATABASE: cyan,
	DISCORD: blue,
	DOPPELGANGER: red,
	PLAYER: cyan,
	SLASH_COMMANDS: green,
};

function formatDetails(details: LogDetails | undefined): string {
	if (!details) {
		return "";
	}

	const values = Object.entries(details)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => `${key}=${String(value)}`);

	return values.length > 0 ? ` ${gray(`(${values.join("; ")})`)}` : "";
}

export function writeLog({
	level,
	category,
	message,
	details,
}: {
	level: LogLevel;
	category: LogCategory;
	message: string;
	details?: LogDetails;
}): void {
	let timestampEnabled: boolean;
	try {
		timestampEnabled = getConfig("LOG_TIMESTAMP");
	} catch {
		timestampEnabled = process.env.LOG_TIMESTAMP === "true";
	}

	const timestamp = timestampEnabled ? dim(new Date().toISOString().slice(11, 19)) : undefined;
	const label = levelColors[level](bold(level.toUpperCase()));
	const categoryLabel = categoryColors[category](bold(category));
	const timestampLabel = timestamp ? `[${timestamp}] ` : "";
	const output = `${timestampLabel}[${label}] [${categoryLabel}] ${message}${formatDetails(details)}`;
	const consoleLevel = level === "success" ? "log" : level;

	if ((level === "debug" || level === "error") && details) {
		console[consoleLevel](output, details);
	} else {
		console[consoleLevel](output);
	}
}
