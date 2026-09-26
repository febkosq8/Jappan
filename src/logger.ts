import { blue, bold, gray, green, red, yellow } from "colorette";

type LogDetails = Record<string, unknown>;

type LogLevel = "info" | "success" | "warn" | "error";

const levelColors: Record<LogLevel, (value: string) => string> = {
	info: blue,
	success: green,
	warn: yellow,
	error: red,
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

function write(level: LogLevel, category: string, message: string, details?: LogDetails): void {
	const label = levelColors[level](bold(level.toUpperCase()));
	const output = `[${label}] [${category}] ${message}${formatDetails(details)}`;

	if (level === "error") {
		console.error(output);
		return;
	}

	console.log(output);
}

export const logger = {
	info: (category: string, message: string, details?: LogDetails): void => write("info", category, message, details),
	success: (category: string, message: string, details?: LogDetails): void =>
		write("success", category, message, details),
	warn: (category: string, message: string, details?: LogDetails): void => write("warn", category, message, details),
	error: (category: string, message: string, details?: LogDetails): void => write("error", category, message, details),
};
