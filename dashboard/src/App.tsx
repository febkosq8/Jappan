import Header from "@jappan/components/Header";
import AdminRoute, { AuthRoute } from "@jappan/components/AdminRoute";
import Home from "@jappan/pages/Home";
import Commands from "@jappan/pages/Commands";
import AuthError from "@jappan/pages/auth/AuthError";
import AdminListGuilds from "@jappan/pages/admin/AdminListGuilds";
import AdminViewGuild from "@jappan/pages/admin/AdminViewGuild";
import ManageBot from "@jappan/pages/admin/ManageBot";
import UserListGuilds from "@jappan/pages/guilds/UserListGuilds";
import UserViewGuild from "@jappan/pages/guilds/UserViewGuild";
import PlayerView from "@jappan/pages/player/PlayerView";
import WrongPage from "@jappan/pages/WrongPage";
import { SIGN_OUT_FLASH_KEY } from "@jappan/handlers/auth";
import { updateHashOnScroll } from "@febkosq8/arc";
import { useEffect, useRef } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { toast, Toaster } from "sonner";

const sectionIds = ["about", "features", "team"];

function App() {
	const containerRef = useRef<HTMLDivElement>(null);
	const location = useLocation();

	useEffect(() => {
		const container = containerRef.current;
		if (!container || location.pathname !== "/") {
			return;
		}

		return updateHashOnScroll({
			container,
			sectionIds,
		});
	}, [location.pathname]);

	// Surface the sign-out success toast queued before the reload to home.
	useEffect(() => {
		try {
			if (sessionStorage.getItem(SIGN_OUT_FLASH_KEY) === "1") {
				sessionStorage.removeItem(SIGN_OUT_FLASH_KEY);
				toast.success("Signed out successfully.");
			}
		} catch {
			// sessionStorage unavailable; nothing to surface.
		}
	}, []);

	return (
		<div ref={containerRef} className="h-dvh overflow-y-auto scroll-smooth bg-background text-foreground">
			<Header />
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/commands" element={<Commands />} />
				<Route path="/auth/error" element={<AuthError />} />
				<Route element={<AdminRoute />}>
					<Route path="/admin/guilds" element={<AdminListGuilds />} />
					<Route path="/admin/guild/:guildId?" element={<AdminViewGuild />} />
					<Route path="/admin/bot" element={<ManageBot />} />
				</Route>
				<Route element={<AuthRoute />}>
					<Route path="/guilds" element={<UserListGuilds />} />
					<Route path="/guild/:guildId?" element={<UserViewGuild />} />
					<Route path="/player/:sessionId" element={<PlayerView />} />
				</Route>
				<Route path="*" element={<WrongPage />} />
			</Routes>
			<Toaster className="jappan-toaster" position="bottom-right" richColors closeButton />
		</div>
	);
}

export default App;
