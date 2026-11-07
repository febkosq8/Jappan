import Header from "@jappan/components/jappan/Header";
import Jappan from "@jappan/pages/Jappan";
import AuthError from "@jappan/pages/auth/AuthError";
import ListGuilds from "@jappan/pages/admin/ListGuilds";
import ViewGuild from "@jappan/pages/admin/ViewGuild";
import WrongPage from "@jappan/pages/WrongPage";
import { updateHashOnScroll } from "@febkosq8/arc";
import { useEffect, useRef, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Toaster } from "sonner";

const sectionIds = ["about", "features", "team"];

function App() {
	const containerRef = useRef<HTMLDivElement>(null);
	const location = useLocation();
	const [activeSectionId, setActiveSectionId] = useState("");

	useEffect(() => {
		const container = containerRef.current;
		if (!container || location.pathname !== "/") {
			setActiveSectionId("");
			return;
		}

		return updateHashOnScroll({
			container,
			sectionIds,
			onActiveChange: (activeIndex) => setActiveSectionId(sectionIds[activeIndex] ?? ""),
		});
	}, [location.pathname]);

	return (
		<div ref={containerRef} className="h-dvh overflow-y-auto scroll-smooth bg-background text-foreground">
			<Header activeSectionId={activeSectionId} />
			<Routes>
				<Route path="/" element={<Jappan />} />
				<Route path="/auth/error" element={<AuthError />} />
				<Route path="/admin/guilds" element={<ListGuilds />} />
				<Route path="/admin/guild/:guildId?" element={<ViewGuild />} />
				<Route path="*" element={<WrongPage />} />
			</Routes>
			<Toaster className="jappan-toaster" position="bottom-right" richColors closeButton />
		</div>
	);
}

export default App;
