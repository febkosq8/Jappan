import type { RequestHandler } from "express";

const responseErrors = new WeakMap<RequestHandler, Readonly<Record<number, string>>>();

export function documentMiddlewareResponses(
	handler: RequestHandler,
	responses: Readonly<Record<number, string>>,
): RequestHandler {
	responseErrors.set(handler, responses);
	return handler;
}

export function getMiddlewareResponses(handler: RequestHandler): Readonly<Record<number, string>> {
	return responseErrors.get(handler) ?? {};
}
