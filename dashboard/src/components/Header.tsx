import { Avatar, Menu, ThemeSwitcher } from "@febkosq8/arc";
import { Link, useLocation } from "react-router-dom";

import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";
import AdminMenu from "./header/AdminMenu";
import AuthHeaderControls from "./header/AuthMenu";
import GuildMenu from "./header/GuildMenu";

export default function Header() {
	const { data: session, isError } = useSessionQuery();
	const location = useLocation();
	const isHomePage = location.pathname === "/";
	const isCommandsPage = location.pathname === "/commands";
	const isAdmin = !isError && isAdminSession(session);
	const isAuthenticated = !isError && !!session;
	const currentPage = isHomePage ? "Home" : isCommandsPage ? "Commands" : "Pages";
	const mobilePage =
		isAdmin && location.pathname === "/admin/bot"
			? "Manage Bot"
			: isAdmin && (location.pathname === "/admin/guild" || location.pathname.startsWith("/admin/guild/"))
				? "View Guild"
				: isAdmin && location.pathname === "/admin/guilds"
					? "List Guilds"
					: isAuthenticated && location.pathname === "/guilds"
						? "My Guilds"
						: isAuthenticated && (location.pathname === "/guild" || location.pathname.startsWith("/guild/"))
							? "View Guild"
							: currentPage;
	const homeItem = (
		<Menu.Item asChild nativeButton={false} active={isHomePage}>
			<Link to="/" aria-current={isHomePage ? "page" : undefined}>
				Home
			</Link>
		</Menu.Item>
	);
	const commandsItem = (
		<Menu.Item asChild nativeButton={false} active={isCommandsPage}>
			<Link to="/commands" aria-current={isCommandsPage ? "page" : undefined}>
				Commands
			</Link>
		</Menu.Item>
	);
	return (
		<header className="sticky top-0 z-50 w-full border-b border-border bg-background/90 backdrop-blur">
			<div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-3 py-2 sm:px-6">
				<a href="/" className="flex items-center gap-2 text-xl font-bold tracking-tight text-foreground">
					<Avatar name="Jappan" image="/logo/profile.png" size="md" aria-hidden="true" />
					Jappan
				</a>
				<div className="flex shrink-0 items-center gap-1">
					<nav aria-label="Main navigation" className="flex items-center gap-1 sm:hidden">
						<Menu buttonText={mobilePage}>
							{homeItem}
							{commandsItem}
							{isAuthenticated && <GuildMenu asSubmenu />}
							{isAdmin && <AdminMenu asSubmenu />}
						</Menu>
					</nav>
					<nav aria-label="Main navigation" className="hidden items-center gap-1 sm:flex">
						<Menu buttonText={currentPage}>
							{homeItem}
							{commandsItem}
						</Menu>
						{isAuthenticated && <GuildMenu />}
						{isAdmin && <AdminMenu />}
					</nav>
					<AuthHeaderControls />
					<ThemeSwitcher variant="toggle" />
				</div>
			</div>
		</header>
	);
}
