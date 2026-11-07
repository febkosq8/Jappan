import type { RequestHandler } from "express";

const unavailableDescription = Symbol("unavailableDescription");

export function documentUnavailable(handler: RequestHandler, description: string): RequestHandler {
	return Object.assign(handler, { [unavailableDescription]: description });
}

export function getUnavailableDescription(handler: RequestHandler): string | undefined {
	if (unavailableDescription in handler && typeof handler[unavailableDescription] === "string") {
		return handler[unavailableDescription];
	}
	return undefined;
}
