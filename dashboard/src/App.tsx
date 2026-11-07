import Header from "@jappan/components/jappan/Header";
import AdminRoute from "@jappan/components/jappan/AdminRoute";
import Home from "@jappan/pages/Home";
import Commands from "@jappan/pages/Commands";
import AuthError from "@jappan/pages/auth/AuthError";
import ListGuilds from "@jappan/pages/admin/ListGuilds";
import ViewGuild from "@jappan/pages/admin/ViewGuild";
import WrongPage from "@jappan/pages/WrongPage";
import { updateHashOnScroll } from "@febkosq8/arc";
import { useEffect, useRef } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

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

	return (
		<div ref={containerRef} className="h-dvh overflow-y-auto scroll-smooth bg-background text-foreground">
			<Header />
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/commands" element={<Commands />} />
				<Route path="/auth/error" element={<AuthError />} />
				<Route element={<AdminRoute />}>
					<Route path="/admin/guilds" element={<ListGuilds />} />
					<Route path="/admin/guild/:guildId?" element={<ViewGuild />} />
				</Route>
				<Route path="*" element={<WrongPage />} />
			</Routes>
			<Toaster className="jappan-toaster" position="bottom-right" richColors closeButton />
		</div>
	);
}

export default App;
