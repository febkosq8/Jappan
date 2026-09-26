import { blue, bold, cyan, dim, gray, green, red, yellow } from "colorette";

export type LogDetails = Record<string, unknown>;
export type LogLevel = "info" | "success" | "warn" | "error";

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

export function writeLog(level: LogLevel, category: string, message: string, details?: LogDetails): void {
	const timestamp = dim(new Date().toISOString().slice(11, 19));
	const label = levelColors[level](bold(level.toUpperCase()));
	const categoryLabel = cyan(bold(category));
	const output = `[${timestamp}] [${label}] [${categoryLabel}] ${message}${formatDetails(details)}`;

	if (level === "error") {
		console.error(output);
		return;
	}

	console.log(output);
}
