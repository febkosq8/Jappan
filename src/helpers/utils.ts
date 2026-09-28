import { setTimeout } from "node:timers/promises";

export async function wait(milliseconds: number): Promise<void> {
	await setTimeout(milliseconds);
}
