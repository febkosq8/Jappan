import { Menu } from "@febkosq8/arc";
import { Link, useLocation } from "react-router-dom";

interface AdminMenuProps {
	asSubmenu?: boolean;
}

export default function AdminMenu({ asSubmenu = false }: AdminMenuProps) {
	const { pathname } = useLocation();
	const isViewGuildPage = pathname === "/admin/guild" || pathname.startsWith("/admin/guild/");
	const isListGuildsPage = pathname === "/admin/guilds";
	const isViewBotPage = pathname === "/admin/bot";

	const items = (
		<>
			<Menu.Sub buttonText="Guild">
				<Menu.Item asChild nativeButton={false} active={isListGuildsPage}>
					<Link to="/admin/guilds" aria-current={isListGuildsPage ? "page" : undefined}>
						List Guilds
					</Link>
				</Menu.Item>
				<Menu.Item asChild nativeButton={false} active={isViewGuildPage}>
					<Link to="/admin/guild" aria-current={isViewGuildPage ? "page" : undefined}>
						View Guild
					</Link>
				</Menu.Item>
			</Menu.Sub>
			<Menu.Sub buttonText="Bot">
				<Menu.Item asChild nativeButton={false} active={isViewBotPage}>
					<Link to="/admin/bot" aria-current={isViewBotPage ? "page" : undefined}>
						Manage Bot
					</Link>
				</Menu.Item>
			</Menu.Sub>
		</>
	);

	return asSubmenu ? (
		<Menu.Sub buttonText="Admin" active={pathname.startsWith("/admin")}>
			{items}
		</Menu.Sub>
	) : (
		<Menu buttonText="Admin" active={pathname.startsWith("/admin")}>
			{items}
		</Menu>
	);
}
