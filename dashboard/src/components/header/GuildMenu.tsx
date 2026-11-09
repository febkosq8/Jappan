import { Menu } from "@febkosq8/arc";
import { Link, useLocation } from "react-router-dom";

interface GuildMenuProps {
	asSubmenu?: boolean;
}

export default function GuildMenu({ asSubmenu = false }: GuildMenuProps) {
	const { pathname } = useLocation();
	const isListPage = pathname === "/guilds";
	const isViewPage = pathname === "/guild" || pathname.startsWith("/guild/");
	const isGuildPage = pathname.startsWith("/guild");

	const items = (
		<>
			<Menu.Item asChild nativeButton={false} active={isListPage}>
				<Link to="/guilds" aria-current={isListPage ? "page" : undefined}>
					My Guilds
				</Link>
			</Menu.Item>
			<Menu.Item asChild nativeButton={false} active={isViewPage}>
				<Link to="/guild" aria-current={isViewPage ? "page" : undefined}>
					View Guild
				</Link>
			</Menu.Item>
		</>
	);

	return asSubmenu ? (
		<Menu.Sub buttonText="Guilds" active={isGuildPage}>
			{items}
		</Menu.Sub>
	) : (
		<Menu buttonText="Guilds" active={isGuildPage}>
			{items}
		</Menu>
	);
}
