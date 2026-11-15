import { Button, Card, PreviewCard, Table, type TableColumnDef } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { FiInfo, FiRefreshCw } from "react-icons/fi";

import APIHandler, { type GuildRole } from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import ErrorPage from "@jappan/components/ErrorPage";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import RoleDisplay from "@jappan/components/display/RoleDisplay";
import GuildSectionLink from "@jappan/components/panel/GuildSectionLink";
import GuildRoleDetailsModal from "@jappan/components/panel/GuildRoleDetailsModal";

function getRoleColumns(onSelectRole: (roleId: string) => void): TableColumnDef<GuildRole>[] {
	return [
		{
			accessorKey: "name",
			header: "Role",
			mobileFullWidth: true,
			size: 280,
			filterFn: "includesString",
			cell: ({ row }) => {
				const role = row.original;
				return <RoleDisplay id={role.id} name={role.name} color={role.color} />;
			},
		},
		{
			accessorKey: "position",
			header: (
				<span className="inline-flex items-center gap-1">
					Position
					<PreviewCard
						trigger="click"
						side="bottom"
						align="start"
						triggerRender={
							<Button
								type="button"
								size="icon-xs"
								variant="ghost"
								aria-label="About role position"
								className="shrink-0 text-muted-foreground hover:text-primary"
								onClick={(event) => event.stopPropagation()}
							/>
						}
						cardContent={
							<p className="max-w-56 text-sm">
								A bigger number means a higher position in the role hierarchy.
							</p>
						}
					>
						<FiInfo className="size-3.5" aria-hidden="true" />
					</PreviewCard>
				</span>
			),
			size: 100,
			enableColumnFilter: false,
			sortingFn: "basic",
		},
		{
			id: "assignable",
			accessorFn: (role) => (role.assignable ? "Yes" : "No"),
			header: "Can assign",
			size: 120,
			filterSelectOptions: [
				{ value: "Yes", label: "Yes" },
				{ value: "No", label: "No" },
			],
			cell: ({ row }) => (
				<span className={row.original.assignable ? "font-medium text-success" : "font-medium text-destructive"}>
					{row.original.assignable ? "Yes" : "No"}
				</span>
			),
		},
		{
			id: "details",
			accessorKey: "id",
			header: "Details",
			size: 140,
			enableColumnFilter: false,
			enableSorting: false,
			cell: ({ row }) => (
				<Button
					type="button"
					size="xs"
					variant="outline-primary"
					aria-haspopup="dialog"
					onClick={() => onSelectRole(row.original.id)}
				>
					View details
				</Button>
			),
		},
	];
}

export default function GuildRolesPanel({ guild }: { guild: { id: string; isActiveMember: boolean } }) {
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
	const rolesQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "roles"],
		queryFn: () => APIHandler.getGuildRoles(guild.id),
		enabled: false,
		retry: false,
	});
	const roles = rolesQuery.data;
	const accessStatus = accessErrorStatus(rolesQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const errorStatus = axios.isAxiosError(rolesQuery.error) ? rolesQuery.error.response?.status : undefined;
	const errorMessage =
		errorStatus === 409
			? "The bot is no longer a member of this guild."
			: errorStatus === 404
				? "This guild is no longer registered."
				: errorStatus === 503
					? "The guild or a required service is unavailable. Please try again."
					: "Could not load roles. Please try again.";
	return (
		<>
			<Card id="roles" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Roles <GuildSectionLink id="roles" label="roles" />
					</h2>
					<div className="flex shrink-0 items-center gap-2">
						{rolesQuery.data && (
							<Button
								type="button"
								size="icon-sm"
								variant="outline-primary"
								className="group/refetch"
								aria-label="Refresh roles"
								disabled={rolesQuery.isFetching || !guild.isActiveMember}
								onClick={() => void rolesQuery.refetch()}
							>
								<FiRefreshCw className="size-4 group-hover/refetch:animate-spin" aria-hidden="true" />
							</Button>
						)}
						{roles && (
							<span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
								Total: {roles.length} {roles.length === 1 ? "role" : "roles"}
							</span>
						)}
						{!rolesQuery.data && !rolesQuery.isError && (
							<Button
								type="button"
								size="sm"
								variant="outline-primary"
								disabled={rolesQuery.isFetching || !guild.isActiveMember}
								onClick={() => void rolesQuery.refetch()}
							>
								Load roles
							</Button>
						)}
					</div>
				</div>
				<p className="mt-1 text-sm text-muted-foreground">Load the current roles in this guild.</p>
				{!guild.isActiveMember && (
					<p className="mt-3 text-muted-foreground">The bot is not a member of this guild.</p>
				)}
				{rolesQuery.isFetching ? (
					<div className="mt-3">
						<LoadingIndicator label="Loading roles" inline size={80} rows={1} columns={5} />
					</div>
				) : rolesQuery.isError ? (
					<div className="mt-3">
						<ErrorPage
							variant="inline"
							status={errorStatus ? String(errorStatus) : "Error"}
							title="Could not load roles"
							message={errorMessage}
							actions={
								<Button
									type="button"
									size="sm"
									variant="outline-primary"
									onClick={() => void rolesQuery.refetch()}
								>
									Retry
								</Button>
							}
						/>
					</div>
				) : roles?.length === 0 ? (
					<p className="mt-3 text-muted-foreground">No roles found.</p>
				) : roles ? (
					<div className="mt-4">
						<Table data={roles} columnDef={getRoleColumns((roleId) => setSelectedRoleId(roleId))} />
					</div>
				) : null}
			</Card>
			<GuildRoleDetailsModal guildId={guild.id} roleId={selectedRoleId} onClose={() => setSelectedRoleId(null)} />
		</>
	);
}
