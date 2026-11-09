import type { Server as HttpServer } from "node:http";
import { fromNodeHeaders } from "better-auth/node";
import { Server } from "socket.io";
import { isBotConnected } from "../bot.js";
import { registerWebsocketHandlers } from "../handlers/websocket.js";
import { WEBSOCKET_PATH, type WebsocketServer, type WebsocketSocket } from "../helpers/websocket.js";
import AuthUserModel from "../models/authUser.js";
import { getAuth, onAuthSessionEnded, type AuthSession } from "./auth.js";
import { getConfig } from "./config.js";
import { isDatabaseConnected } from "./database.js";
import { logger } from "./logger.js";
import { stopPlayerWebsocket } from "./playerWebsocket.js";

/** How often connected sessions are checked again, so signing out or suspending an account ends open sockets. */
const SESSION_REVALIDATION_INTERVAL_MS = 60_000;
const CONNECT_TIMEOUT_MS = 10_000;
/** Events are small JSON payloads; anything larger is not a legitimate client. */
const MAX_PAYLOAD_BYTES = 16 * 1024;

let websocketServer: WebsocketServer | undefined;
let revalidationTimer: NodeJS.Timeout | undefined;
let revalidating = false;
let stopListeningForEndedSessions: (() => void) | undefined;

function connectError(status: number, message: string): Error {
	return Object.assign(new Error(message), { data: { status } });
}

function isActiveSession(session: AuthSession): boolean {
	return session.user.status === "active" || session.user.status === undefined;
}

/** Requires the same signed-in, active user the HTTP routes require, using the cookie sent with the handshake. */
async function authenticateSocket(socket: WebsocketSocket, next: (error?: Error) => void): Promise<void> {
	if (!isDatabaseConnected()) {
		next(connectError(503, "Database is unavailable"));
		return;
	}
	if (!isBotConnected()) {
		next(connectError(503, "Discord is unavailable"));
		return;
	}
	const auth = getAuth();
	if (!auth) {
		next(connectError(503, "Authentication is unavailable"));
		return;
	}
	try {
		const session = await auth.api.getSession({ headers: fromNodeHeaders(socket.request.headers) });
		if (!session) {
			next(connectError(401, "Authentication required"));
			return;
		}
		if (!isActiveSession(session)) {
			next(connectError(403, "Login required"));
			return;
		}
		const user = await AuthUserModel.findById(session.user.id).select({ discordAccountId: 1 }).exec();
		socket.data.authSession = session;
		socket.data.discordAccountId = user?.discordAccountId ?? null;
		socket.data.rateWindowStartMs = Date.now();
		socket.data.rateWindowCount = 0;
		next();
	} catch (error: unknown) {
		logger.error("WEBSOCKET", "Socket session validation failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		next(connectError(500, "Session validation failed"));
	}
}

/** Drops a user's connections the moment their session ends, instead of waiting for the next revalidation round. */
function disconnectUserSockets({
	server,
	userId,
	exceptSessionId,
}: {
	server: WebsocketServer;
	userId: string;
	exceptSessionId: string | undefined;
}): void {
	for (const socket of server.sockets.sockets.values()) {
		const { user, session } = socket.data.authSession;
		if (user.id === userId && session.id !== exceptSessionId) {
			logger.debug("WEBSOCKET", "Disconnecting socket after its session ended", { user: userId });
			socket.disconnect(true);
		}
	}
}

async function revalidateSockets(server: WebsocketServer): Promise<void> {
	const auth = getAuth();
	if (revalidating || !auth) {
		return;
	}
	revalidating = true;
	try {
		for (const socket of server.sockets.sockets.values()) {
			try {
				const session = await auth.api.getSession({ headers: fromNodeHeaders(socket.request.headers) });
				if (!session || !isActiveSession(session)) {
					logger.debug("WEBSOCKET", "Disconnecting socket with an ended session");
					socket.disconnect(true);
					continue;
				}
				socket.data.authSession = session;
			} catch (error: unknown) {
				// A temporary failure must not drop everyone; the next round tries again
				logger.warn("WEBSOCKET", "Socket session revalidation failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
	} finally {
		revalidating = false;
	}
}

export function startWebsocket(httpServer: HttpServer): WebsocketServer {
	if (websocketServer) {
		return websocketServer;
	}
	const allowedOrigins = getConfig("ALLOWED_ORIGINS");
	const server: WebsocketServer = new Server(httpServer, {
		path: WEBSOCKET_PATH,
		serveClient: false,
		// WebSocket only: polling would need sticky sessions and extra requests for no benefit here
		transports: ["websocket"],
		connectTimeout: CONNECT_TIMEOUT_MS,
		maxHttpBufferSize: MAX_PAYLOAD_BYTES,
		// Browsers always send Origin on a WebSocket handshake, so this blocks cross-site hijacking of the cookie
		allowRequest: (request, callback) => {
			const { origin } = request.headers;
			callback(null, origin === undefined || allowedOrigins.includes(origin));
		},
	});
	server.use((socket, next) => void authenticateSocket(socket, next));
	registerWebsocketHandlers(server);
	revalidationTimer = setInterval(() => void revalidateSockets(server), SESSION_REVALIDATION_INTERVAL_MS);
	revalidationTimer.unref();
	stopListeningForEndedSessions = onAuthSessionEnded(({ userId, exceptSessionId }) =>
		disconnectUserSockets({ server, userId, exceptSessionId }),
	);
	websocketServer = server;
	logger.info("WEBSOCKET", "WebSocket server attached", { path: WEBSOCKET_PATH });
	return server;
}

/** Disconnects every client. The HTTP server is closed separately by `stopApp`. */
export function stopWebsocket(): void {
	const server = websocketServer;
	websocketServer = undefined;
	if (revalidationTimer) {
		clearInterval(revalidationTimer);
		revalidationTimer = undefined;
	}
	stopListeningForEndedSessions?.();
	stopListeningForEndedSessions = undefined;
	stopPlayerWebsocket();
	if (!server) {
		return;
	}
	server.disconnectSockets(true);
	server.engine.close();
	logger.info("WEBSOCKET", "WebSocket server stopped");
}
