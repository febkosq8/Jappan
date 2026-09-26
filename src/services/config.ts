export interface Config {
	readonly ENVIRONMENT: string;
	readonly DISCORD_TOKEN: string;
	BOT_NAME: string;
	BOT_PFP: string;
	readonly BOT_WEBSITE: string;
	readonly DB_URL: string;
}

let loadedConfig: Config | undefined;

const configTemplate: Partial<Record<keyof Config, string>> = {
	ENVIRONMENT: "PRODUCTION",
	BOT_NAME: "Jappan",
	BOT_PFP: "https://jappan.febkosq8.me/assets/Profile-FDHZtz5Q.png",
	BOT_WEBSITE: "https://jappan.febkosq8.me",
};

function readConfigValue(name: keyof Config, required = false): string {
	const value = process.env[name]?.trim();
	if (value) {
		return value;
	}

	const defaultValue = configTemplate[name];
	if (defaultValue !== undefined) {
		return defaultValue;
	} else if (required) {
		throw new Error(`${name} is required`);
	}

	throw new Error(`${name} has no value or default`);
}

export function loadConfig(): Config {
	const DISCORD_TOKEN = readConfigValue("DISCORD_TOKEN", true);
	const ENVIRONMENT = readConfigValue("ENVIRONMENT");
	const BOT_NAME = readConfigValue("BOT_NAME");
	const BOT_PFP = readConfigValue("BOT_PFP");
	const BOT_WEBSITE = readConfigValue("BOT_WEBSITE");
	const DB_URL = readConfigValue("DB_URL", true);

	loadedConfig = { DISCORD_TOKEN, ENVIRONMENT, BOT_NAME, BOT_PFP, BOT_WEBSITE, DB_URL };
	return loadedConfig;
}

export function getConfig(): Config;
export function getConfig<Key extends keyof Config>(property: Key): Config[Key];
export function getConfig(property?: keyof Config): Config | Config[keyof Config] {
	if (!loadedConfig) {
		throw new Error("Configuration has not been loaded");
	} else if (property === undefined) {
		return loadedConfig;
	} else if (!(property in loadedConfig)) {
		throw new Error(`Configuration property "${String(property)}" does not exist`);
	}

	return loadedConfig[property];
}
