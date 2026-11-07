import { Avatar, Button, DateHandler, GridLoader, Table, TextLink, type TableColumnDef } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";

import APIHandler, { type AdminGuild } from "@jappan/handlers/APIHandler";
import { isAdminSession, useSessionQuery } from "@jappan/handlers/auth";

function Unavailable() {
	return <span className="text-muted-foreground">Unavailable</span>;
}

const columns: TableColumnDef<AdminGuild>[] = [
	{
		accessorKey: "name",
		header: "Guild",
		mobileFullWidth: true,
		size: 170,
		filterFn: "includesString",
		cell: ({ row }) => {
			const guild = row.original;
			return (
				<div className="flex items-center gap-2">
					<Avatar name={guild.name} image={guild.icon} size="sm" aria-hidden="true" />
					<span className="min-w-0">
						<TextLink
							href={`https://discord.com/channels/${encodeURIComponent(guild.id)}`}
							text={guild.name}
							title={guild.name}
							target="_blank"
							rel="noopener noreferrer"
							className="block truncate font-medium"
						/>
						<span className="block text-xs text-muted-foreground">{guild.id}</span>
					</span>
				</div>
			);
		},
	},
	{
		id: "membership",
		accessorFn: (guild) => (guild.isActiveMember ? "Yes" : "No"),
		header: "Member",
		size: 100,
		filterSelectOptions: [
			{ value: "Yes", label: "Yes" },
			{ value: "No", label: "No" },
		],
	},
	{
		id: "ownerName",
		accessorFn: (guild) => guild.owner?.username ?? "Unavailable",
		header: "Owner",
		size: 170,
		filterFn: "includesString",
		cell: ({ row }) => {
			const owner = row.original.owner;
			return owner ? (
				<div className="flex items-center gap-2">
					<Avatar name={owner.username} image={owner.avatarUrl} size="sm" aria-hidden="true" />
					<span className="min-w-0">
						<TextLink
							href={`https://discord.com/users/${encodeURIComponent(owner.userId)}`}
							text={owner.username}
							title={owner.username}
							target="_blank"
							rel="noopener noreferrer"
							className="block truncate"
						/>
						<span className="block text-xs text-muted-foreground">{owner.userId}</span>
					</span>
				</div>
			) : (
				<Unavailable />
			);
		},
	},
	{
		accessorKey: "memberCount",
		header: "Members",
		filterFn: "includesString",
		cell: ({ row }) =>
			row.original.memberCount === undefined ? <Unavailable /> : row.original.memberCount.toLocaleString(),
	},
	{
		id: "permissions",
		accessorFn: (guild) =>
			guild.hasRequiredPermissions === undefined ? "Unavailable" : guild.hasRequiredPermissions ? "All" : "Some",
		header: "Permission Coverage",
		size: 185,
		filterSelectOptions: [
			{ value: "All", label: "All" },
			{ value: "Some", label: "Some" },
			{ value: "Unavailable", label: "Unavailable" },
		],
		cell: ({ row, getValue }) =>
			row.original.hasRequiredPermissions === undefined ? <Unavailable /> : String(getValue()),
	},
	{
		id: "joined",
		accessorFn: (guild) =>
			guild.joinedTimestamp === undefined
				? "Unavailable"
				: DateHandler.getFormattedTime(guild.joinedTimestamp, "$ISO$\n($RELATIVE$)"),
		header: "Joined",
		size: 185,
		filterFn: "includesString",
		sortingFn: (first, second) => {
			const firstTimestamp = first.original.joinedTimestamp;
			const secondTimestamp = second.original.joinedTimestamp;
			if (firstTimestamp === undefined) return secondTimestamp === undefined ? 0 : 1;
			if (secondTimestamp === undefined) return -1;
			return firstTimestamp - secondTimestamp;
		},
		cell: ({ row }) => {
			const joinedTimestamp = row.original.joinedTimestamp;
			return joinedTimestamp === undefined ? (
				<Unavailable />
			) : (
				<span>
					<span className="block">{DateHandler.getDateTime(joinedTimestamp)}</span>
					<span className="block text-xs text-muted-foreground">
						{DateHandler.getRelativeTime(joinedTimestamp)}
					</span>
				</span>
			);
		},
	},
	{
		id: "systemChannelName",
		accessorFn: (guild) =>
			guild.systemChannel === undefined ? "Unavailable" : (guild.systemChannel?.name ?? "None"),
		header: "System channel",
		filterFn: "includesString",
		cell: ({ row }) => {
			const guild = row.original;
			return guild.systemChannel ? (
				<span className="min-w-0">
					<TextLink
						href={`https://discord.com/channels/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.systemChannel.id)}`}
						text={guild.systemChannel.name}
						title={guild.systemChannel.name}
						target="_blank"
						rel="noopener noreferrer"
						className="block truncate"
					/>
					<span className="block text-xs text-muted-foreground">{guild.systemChannel.id}</span>
				</span>
			) : guild.systemChannel === null ? (
				"None"
			) : (
				<Unavailable />
			);
		},
	},
	{
		id: "permissionNames",
		accessorFn: (guild) =>
			guild.permissions === undefined ? "Unavailable" : guild.permissions.join(", ") || "None",
		header: "Bot permissions",
		filterFn: "includesString",
		mobileFullWidth: true,
		cell: ({ row }) => {
			const permissions = row.original.permissions;
			return permissions === undefined ? (
				<Unavailable />
			) : permissions.length === 0 ? (
				"None"
			) : (
				<details className="whitespace-normal">
					<summary className="cursor-pointer">
						{permissions.length} {permissions.length === 1 ? "permission" : "permissions"}
					</summary>
					<span className="block wrap-break-word">{permissions.join(", ")}</span>
				</details>
			);
		},
	},
];

export default function AdminGuilds() {
	const sessionQuery = useSessionQuery();
	const isAdmin = !sessionQuery.isError && isAdminSession(sessionQuery.data);
	const guildsQuery = useQuery({
		queryKey: ["admin", "list-guilds"],
		queryFn: APIHandler.getAdminGuilds,
		enabled: isAdmin,
	});

	let content;
	if (sessionQuery.isPending) {
		content = (
			<div className="flex justify-center py-12">
				<GridLoader label="Checking session" size={48} />
			</div>
		);
	} else if (sessionQuery.isError) {
		content = (
			<div role="alert">
				<p>Session unavailable.</p>
				<Button size="sm" variant="outline-primary" onClick={() => void sessionQuery.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else if (!isAdmin) {
		content = <p>Sign in with an admin account to view this page.</p>;
	} else if (guildsQuery.isPending) {
		content = (
			<div className="flex justify-center py-12">
				<GridLoader label="Loading guilds" size={48} />
			</div>
		);
	} else if (guildsQuery.isError) {
		content = (
			<div role="alert">
				<p>Could not load guilds. Check your access and try again.</p>
				<Button size="sm" variant="outline-primary" onClick={() => void guildsQuery.refetch()}>
					Retry
				</Button>
			</div>
		);
	} else if (guildsQuery.data.length === 0) {
		content = <p>No stored guilds found.</p>;
	} else {
		content = <Table data={guildsQuery.data} columnDef={columns} />;
	}

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<h1 className="text-3xl font-bold tracking-tight">List - Guilds</h1>
			{content}
		</main>
	);
}
