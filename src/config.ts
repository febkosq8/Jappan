export interface Config {
	readonly DISCORD_TOKEN: string;
}

let loadedConfig: Config | undefined;

const configTemplate = {
	DISCORD_TOKEN: undefined as string | undefined,
} as const;

function readConfigValue(name: keyof typeof configTemplate): string | undefined {
	const value = process.env[name]?.trim();

	return value || configTemplate[name];
}

export function loadConfig(): Config {
	const DISCORD_TOKEN = readConfigValue("DISCORD_TOKEN");
	if (!DISCORD_TOKEN || DISCORD_TOKEN.length === 0) {
		throw new Error("DISCORD_TOKEN is required");
	}

	loadedConfig = { DISCORD_TOKEN };
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
