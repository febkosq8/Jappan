import assert from "node:assert/strict";
import { after, before, test } from "node:test";

import { DiscordAPIError, PermissionFlagsBits, RESTJSONErrorCodes } from "discord.js";
import express from "express";

import { createDiscordClient } from "../src/bot.ts";
import {
	isBotAdmin,
	isGuildManager,
	requireAdmin,
	requireAnyAuthorization,
	requireGuildManager,
	requireValidGuildId,
} from "../src/handlers/auth.ts";
import { getMiddlewareResponses } from "../src/helpers/middleware.ts";
import AuthUserModel from "../src/models/authUser.ts";
import guildRouter from "../src/routes/api/guild/index.ts";

const guildId = "732124687051784284";
const otherGuildId = "732124687051784285";
const client = createDiscordClient();
const originalFindById = AuthUserModel.findById;
let lookup;
let session;
let server;
let baseUrl;

before(async () => {
	AuthUserModel.findById = () => ({ select: () => ({ exec: () => lookup() }) });
	const app = express();
	app.use((_request, response, next) => {
		response.locals.authSession = session;
		next();
	});
	const guildMiddleware = guildRouter.routes[0].middleware;
	assert.equal(guildMiddleware[3], requireValidGuildId);
	for (const route of guildRouter.routes) {
		assert.equal(route.middleware, guildMiddleware);
	}
	app.get("/guild/:guildId", ...guildMiddleware.slice(3), (_request, response) => response.sendStatus(204));
	app.get("/manager/:guildId", requireGuildManager, (_request, response) => response.sendStatus(204));
	app.get("/admin", requireAdmin, (_request, response) => response.sendStatus(204));
	app.get("/admin-first/:guildId", requireAnyAuthorization([isBotAdmin, isGuildManager]), (_request, response) =>
		response.sendStatus(204),
	);
	app.get(
		"/custom/:guildId",
		requireAnyAuthorization([isBotAdmin, isGuildManager], "Custom access required"),
		(_request, response) => response.sendStatus(204),
	);
	await new Promise((resolve) => {
		server = app.listen(0, "127.0.0.1", resolve);
	});
	baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
	AuthUserModel.findById = originalFindById;
	client.destroy();
	await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
});

function setSession(role = "user", status = "active") {
	session = { user: { id: "user-id", role, status } };
}

function setGuild(memberFetch, id = guildId) {
	client.guilds.cache.set(id, { available: true, members: { fetch: memberFetch } });
}

async function status(path) {
	return (await fetch(`${baseUrl}${path}`)).status;
}

test("guild authorization grants either active bot admins or guild managers", async () => {
	let lookups = 0;
	lookup = async () => {
		lookups++;
		return { discordAccountId: "discord-user" };
	};
	setGuild(async (id) => {
		assert.equal(id, "discord-user");
		return { permissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild } };
	});

	setSession("admin");
	assert.equal(await status(`/guild/${guildId}`), 204);
	assert.equal(lookups, 1);
	assert.equal(await status("/admin"), 204);

	setSession();
	assert.equal(await status(`/guild/${guildId}`), 204);
	assert.equal(await status(`/manager/${guildId}`), 204);
	assert.equal(await status("/admin"), 403);
	assert.equal(await status(`/guild/${otherGuildId}`), 403);

	setGuild(async () => ({ permissions: { has: () => false } }));
	assert.equal(await status(`/guild/${guildId}`), 403);
	setSession("admin");
	assert.equal(await status(`/manager/${guildId}`), 403);
	lookup = async () => null;
	assert.equal(await status(`/guild/${guildId}`), 204);
});

test("authorization defaults to the first check's rejection and supports an override", async () => {
	setSession();
	lookup = async () => null;
	for (const [path, message] of [
		[`/guild/${guildId}`, "Manage Server access required"],
		[`/admin-first/${guildId}`, "Admin access required"],
		[`/custom/${guildId}`, "Custom access required"],
	]) {
		const response = await fetch(`${baseUrl}${path}`);
		assert.equal(response.status, 403);
		assert.deepEqual(await response.json(), { error: message });
	}
	setSession("user", "blocked");
	const response = await fetch(`${baseUrl}/guild/${guildId}`);
	assert.equal(response.status, 403);
	assert.deepEqual(await response.json(), { error: "Manage Server access required" });
	const customResponse = await fetch(`${baseUrl}/custom/${guildId}`);
	assert.equal(customResponse.status, 403);
	assert.deepEqual(await customResponse.json(), { error: "Custom access required" });
	assert.equal(
		getMiddlewareResponses(requireAnyAuthorization([isGuildManager, isBotAdmin]))[403],
		"Manage Server access required",
	);
	assert.equal(
		getMiddlewareResponses(requireAnyAuthorization([isBotAdmin, isGuildManager]))[403],
		"Admin access required",
	);
	assert.equal(
		getMiddlewareResponses(requireAnyAuthorization([isBotAdmin], "Custom access required"))[403],
		"Custom access required",
	);
});

test("authorization rejects missing sessions, blocked accounts, and invalid guild IDs", async () => {
	session = undefined;
	assert.equal(await status(`/guild/${guildId}`), 401);
	setSession("admin", "blocked");
	assert.equal(await status(`/guild/${guildId}`), 403);
	assert.equal(await status("/admin"), 403);
	setSession("admin");
	assert.equal(await status("/guild/invalid"), 400);
	assert.equal(await status("/manager/invalid"), 400);
	setSession();
	lookup = async () => null;
	assert.equal(await status(`/guild/${guildId}`), 403);
});

test("guild authorization distinguishes non-members from lookup failures", async () => {
	setSession();
	lookup = async () => ({ discordAccountId: "discord-user" });
	setGuild(async () => {
		throw new DiscordAPIError(
			{ message: "Unknown Member", code: RESTJSONErrorCodes.UnknownMember },
			RESTJSONErrorCodes.UnknownMember,
			404,
			"GET",
			"https://discord.test",
			{ body: undefined, files: undefined },
		);
	});
	assert.equal(await status(`/guild/${guildId}`), 403);
	setGuild(async () => {
		throw new Error("Discord unavailable");
	});
	assert.equal(await status(`/guild/${guildId}`), 500);
	lookup = async () => {
		throw new Error("Database unavailable");
	};
	assert.equal(await status(`/guild/${guildId}`), 500);
});
