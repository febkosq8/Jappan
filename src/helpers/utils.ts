import { setTimeout } from "node:timers/promises";
import packageJson from "../../package.json" with { type: "json" };

export function getBotVersion(): string {
	return packageJson.version;
}

export async function wait(milliseconds: number): Promise<void> {
	await setTimeout(milliseconds);
}
