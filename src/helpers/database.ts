import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function loadModels(): Promise<void> {
	const modelDirectory = fileURLToPath(new URL("../models", import.meta.url));
	const entries = await readdir(modelDirectory, { withFileTypes: true });

	for (const entry of entries) {
		if (
			!entry.isFile() ||
			entry.name.endsWith(".d.ts") ||
			!(entry.name.endsWith(".ts") || entry.name.endsWith(".js"))
		) {
			continue;
		}

		const modelPath = join(modelDirectory, entry.name);
		await import(pathToFileURL(modelPath).href);
	}
}
