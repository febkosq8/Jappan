import { Avatar, Menu, PillLink, ThemeSwitcher } from "@febkosq8/arc";
import { useLocation, useNavigate } from "react-router-dom";

import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";
import AuthControls from "./AuthControls";

export default function Header({ activeSectionId }: { activeSectionId: string }) {
	const { data: session, isError } = useSessionQuery();
	const location = useLocation();
	const navigate = useNavigate();
	const sectionHref = (section: string) => `${location.pathname === "/" ? "" : "/"}#${section}`;

	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur">
			<div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:gap-4 sm:px-6">
				<a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
					<Avatar name="Jappan" image="/logo/profile.png" size="md" aria-hidden="true" />
					Jappan
				</a>
				<nav aria-label="Main navigation" className="flex flex-wrap items-center gap-1 sm:gap-2">
					<PillLink size="sm" active={activeSectionId === "about"} href={sectionHref("about")}>
						About
					</PillLink>
					<PillLink size="sm" active={activeSectionId === "features"} href={sectionHref("features")}>
						Features
					</PillLink>
					<PillLink
						size="sm"
						active={activeSectionId === "team"}
						href={sectionHref("team")}
						className="hidden sm:inline-flex"
					>
						Team
					</PillLink>
					{!isError && isAdminSession(session) && (
						<Menu buttonText="Admin" active={location.pathname.startsWith("/admin")}>
							<Menu.Item onClick={() => navigate("/admin/guilds")}>List Guilds</Menu.Item>
						</Menu>
					)}
					<AuthControls />
					<ThemeSwitcher variant="toggle" />
				</nav>
			</div>
		</header>
	);
}
