import { Router, type RequestHandler, type Router as ExpressRouter } from "express";
import swaggerUi from "swagger-ui-express";

import { getConfig } from "../services/config.js";

export const DOCS_ROUTE = "/swagger";

const authorizationStatusScript = String.raw`
(() => {
	const scheme = "sessionBearer";
	const verificationInterval = 30_000;
	const startupGracePeriod = 1_500;
	const startedAt = Date.now();
	let verifiedToken = "";
	let verifiedAt = 0;
	let pendingToken = "";
	let lastAttemptedToken = "";
	let lastAttemptAt = 0;
	let allowNextAuthorizeClick = false;
	let validationInProgress = false;
	let currentStatus = { state: "checking", message: "Checking auth status…", detail: "" };

	function getToken() {
		const authorization = window.ui?.authSelectors?.authorized?.().get?.(scheme);
		const value = authorization?.get?.("value") ?? authorization?.value;
		return typeof value === "string" ? value.replace(/^Bearer\s+/iu, "").trim() : "";
	}

	function getStatusElement() {
		const wrapper = document.querySelector(".auth-wrapper");
		if (!wrapper) return null;
		let status = wrapper.querySelector(".swagger-auth-status");
		if (!status) {
			status = document.createElement("span");
			status.className = "swagger-auth-status";
			status.setAttribute("role", "status");
			status.setAttribute("aria-live", "polite");
		}
		const authorizeButton = wrapper.querySelector(".authorize");
		if (authorizeButton && status.nextElementSibling !== authorizeButton) {
			wrapper.insertBefore(status, authorizeButton);
		}
		status.dataset.state = currentStatus.state;
		status.textContent = currentStatus.message;
		status.title = currentStatus.detail;
		return status;
	}

	function setStatus(state, message, detail = "") {
		currentStatus = { state: state, message: message, detail: detail };
		getStatusElement();
	}

	function setModalFeedback(message, state) {
		const modal = document.querySelector(".modal-ux");
		if (!modal) return;
		let feedback = modal.querySelector(".swagger-auth-feedback");
		if (!feedback) {
			feedback = document.createElement("p");
			feedback.className = "swagger-auth-feedback";
			feedback.setAttribute("role", "status");
			feedback.setAttribute("aria-live", "polite");
			const anchor = modal.querySelector("button.authorize")?.parentElement ?? modal.querySelector(".wrapper") ?? modal;
			anchor.before(feedback);
		}
		feedback.dataset.state = state;
		feedback.textContent = message;
	}

	async function validateToken(token) {
		let response;
		try {
			response = await fetch("/api/v1/auth/get-session", {
				headers: { Accept: "application/json", Authorization: "Bearer " + token },
				cache: "no-store",
				credentials: "omit",
			});
		} catch {
			return { valid: false, invalid: false, message: "Could not reach the authentication endpoint." };
		}
		if (response.status === 401) {
			return { valid: false, invalid: true, message: "Token is invalid or expired." };
		}
		if (!response.ok) {
			return {
				valid: false,
				invalid: false,
				message: "Could not verify token (HTTP " + response.status + ").",
			};
		}
		try {
			const session = await response.json();
			if (session?.session && session?.user) return { valid: true, invalid: false, message: "" };
		} catch {
			return { valid: false, invalid: false, message: "Could not read the validation response." };
		}
		return { valid: false, invalid: true, message: "Token is invalid or expired." };
	}

	async function refreshStatus() {
		if (!window.ui?.authSelectors?.authorized) {
			setStatus("checking", "Checking auth status…");
			return;
		}
		const token = getToken();
		if (!token) {
			if (validationInProgress) {
				setStatus("checking", "Checking auth status…");
				return;
			}
			const specLoadingStatus = window.ui.specSelectors?.loadingStatus?.();
			if (Date.now() - startedAt < startupGracePeriod || specLoadingStatus === "loading") {
				setStatus("checking", "Checking auth status…");
				return;
			}
			verifiedToken = "";
			pendingToken = "";
			lastAttemptedToken = "";
			setStatus("unauthenticated", "Not authenticated");
			return;
		}
		if (token === verifiedToken && Date.now() - verifiedAt < verificationInterval) {
			setStatus("authenticated", "Authenticated");
			return;
		}
		if (pendingToken === token) {
			setStatus("checking", "Checking auth status…");
			return;
		}
		if (lastAttemptedToken === token && Date.now() - lastAttemptAt < 5_000) return;

		pendingToken = token;
		lastAttemptedToken = token;
		lastAttemptAt = Date.now();
		setStatus("checking", "Checking auth status…");
		const result = await validateToken(token);
		if (pendingToken === token) pendingToken = "";
		if (getToken() !== token) return;
		if (result.valid) {
			verifiedToken = token;
			verifiedAt = Date.now();
			setStatus("authenticated", "Authenticated");
			return;
		}
		verifiedToken = "";
		setStatus(result.invalid ? "unauthenticated" : "error", result.invalid ? "Not authenticated" : "Could not verify", result.message);
		if (result.invalid) window.ui.authActions.logout([scheme]);
	}

	document.addEventListener(
		"click",
		(event) => {
			const target = event.target;
			if (!(target instanceof Element)) return;
			const button = target.closest(".modal-ux button.authorize");
			if (!button) return;
			if (allowNextAuthorizeClick) {
				allowNextAuthorizeClick = false;
				return;
			}
			event.preventDefault();
			event.stopImmediatePropagation();
			if (validationInProgress) return;

			const input = document.querySelector(".modal-ux input");
			const token = input instanceof HTMLInputElement ? input.value.trim().replace(/^Bearer\s+/iu, "") : "";
			if (!token) {
				setModalFeedback("Enter a bearer token to validate.", "error");
				return;
			}

			validationInProgress = true;
			button.disabled = true;
			setModalFeedback("Checking token…", "checking");
			setStatus("checking", "Checking auth status…");
			void validateToken(token).then((result) => {
				if (result.valid) {
					verifiedToken = token;
					verifiedAt = Date.now();
					document.querySelector(".modal-ux .swagger-auth-feedback")?.remove();
					button.disabled = false;
					allowNextAuthorizeClick = true;
					button.click();
					return;
				}
				setModalFeedback(result.message, "error");
				if (!getToken()) {
					setStatus(result.invalid ? "unauthenticated" : "error", result.invalid ? "Not authenticated" : "Could not verify", result.message);
				}
			}).finally(() => {
				validationInProgress = false;
				button.disabled = false;
			});
		},
		true,
	);

	window.setInterval(() => {
		void refreshStatus();
	}, 500);
	window.addEventListener("focus", () => void refreshStatus());
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") void refreshStatus();
	});
	const statusObserver = new MutationObserver(() => {
		if (!getStatusElement()) return;
		statusObserver.disconnect();
	});
	statusObserver.observe(document.documentElement, { childList: true, subtree: true });
	setStatus("checking", "Checking auth status…");
})();
`;

const router: ExpressRouter = Router();
const setupSwagger: RequestHandler = (request, response, next) => {
	swaggerUi.setup(undefined, {
		customSiteTitle: `${getConfig("BOT_NAME")} - API Docs`,
		customCss: `
			.auth-wrapper { display: flex; align-items: center; gap: 12px; }
			.swagger-auth-status { font-size: 13px; font-weight: 600; white-space: nowrap; }
			.swagger-auth-status[data-state="authenticated"] { color: #237a3b; }
			.swagger-auth-status[data-state="checking"], .swagger-auth-feedback[data-state="checking"] { color: #8a6500; }
			.swagger-auth-status[data-state="error"], .swagger-auth-status[data-state="unauthenticated"], .swagger-auth-feedback[data-state="error"] { color: #b42318; }
			.modal-ux .auth-container h6 { display: none; }
			.swagger-auth-feedback { margin: 0 0 12px; font-size: 13px; }
			@media (max-width: 600px) { .auth-wrapper { flex-wrap: wrap; } }
		`,
		customJs: "/swagger-auth.js",
		swaggerOptions: { url: "/openapi.json", persistAuthorization: true },
	})(request, response, next);
};

router.get("/swagger-auth.js", (_request, response) => {
	response.set("Cache-Control", "no-store").type("application/javascript").send(authorizationStatusScript);
});
router.use(DOCS_ROUTE, swaggerUi.serve, setupSwagger);

export default router;
