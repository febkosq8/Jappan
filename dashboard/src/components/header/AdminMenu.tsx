import { Menu } from "@febkosq8/arc";
import { Link, useLocation } from "react-router-dom";
import type { InboxStatus } from "@jappan/handlers/useDirectMessageInbox";

interface AdminMenuProps {
	asSubmenu?: boolean;
	inbox: InboxStatus;
}

export function InboxBadge({ inbox }: { inbox: InboxStatus }) {
	if (inbox.status === "connected" && inbox.unreadCount === 0) return null;
	const label =
		inbox.status === "connected"
			? `${inbox.unreadCount} unread ${inbox.unreadCount === 1 ? "conversation" : "conversations"}`
			: inbox.status === "connecting"
				? "Connecting to inbox updates"
				: "Inbox updates unavailable";
	return (
		<span
			className={`ml-1 inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-bold ${
				inbox.status === "connected"
					? "bg-primary text-primary-foreground"
					: "bg-warning text-warning-foreground"
			}`}
			aria-label={label}
			role="img"
			title={label}
		>
			{inbox.status === "connected" ? inbox.unreadCount : inbox.status === "connecting" ? "…" : "!"}
		</span>
	);
}

export default function AdminMenu({ asSubmenu = false, inbox }: AdminMenuProps) {
	const { pathname } = useLocation();
	const isGuildsPage = pathname === "/admin/guilds" || pathname.startsWith("/admin/guild/");
	const isViewBotPage = pathname === "/admin/bot";
	const isDirectMessagesPage = pathname === "/admin/direct-messages";

	const items = (
		<>
			<Menu.Sub buttonText="Guild">
				<Menu.Item asChild nativeButton={false} active={isGuildsPage}>
					<Link to="/admin/guilds" aria-current={isGuildsPage ? "page" : undefined}>
						Guilds
					</Link>
				</Menu.Item>
			</Menu.Sub>
			<Menu.Sub
				buttonText={
					<>
						Bot <InboxBadge inbox={inbox} />
					</>
				}
			>
				<Menu.Item asChild nativeButton={false} active={isViewBotPage}>
					<Link to="/admin/bot" aria-current={isViewBotPage ? "page" : undefined}>
						Manage Bot
					</Link>
				</Menu.Item>
				<Menu.Item asChild nativeButton={false} active={isDirectMessagesPage}>
					<Link to="/admin/direct-messages" aria-current={isDirectMessagesPage ? "page" : undefined}>
						Direct messages
						<InboxBadge inbox={inbox} />
					</Link>
				</Menu.Item>
			</Menu.Sub>
		</>
	);

	return asSubmenu ? (
		<Menu.Sub
			buttonText={
				<>
					Admin <InboxBadge inbox={inbox} />
				</>
			}
			active={pathname.startsWith("/admin")}
		>
			{items}
		</Menu.Sub>
	) : (
		<Menu
			buttonText={
				<>
					Admin <InboxBadge inbox={inbox} />
				</>
			}
			active={pathname.startsWith("/admin")}
		>
			{items}
		</Menu>
	);
}
