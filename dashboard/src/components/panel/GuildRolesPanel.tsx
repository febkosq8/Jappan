import { Button, Card, DateHandler, Modal, Tag } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";

import APIHandler, { type GuildRoleDetails } from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import ErrorPage from "@jappan/components/ErrorPage";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildSectionLink from "@jappan/components/panel/GuildSectionLink";

function RoleDetails({ role }: { role: GuildRoleDetails }) {
	return (
		<>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					{role.iconUrl ? (
						<img src={role.iconUrl} alt="" className="size-5 shrink-0 rounded-sm" />
					) : role.unicodeEmoji ? (
						<span aria-hidden="true" className="shrink-0">
							{role.unicodeEmoji}
						</span>
					) : null}
					{role.color && (
						<span
							aria-hidden="true"
							className="size-3 shrink-0 rounded-full border border-border"
							style={{ backgroundColor: role.color }}
						/>
					)}
				</div>
				<div className="ml-auto flex flex-wrap justify-end gap-1">
					{role.isBotRole && (
						<Tag variant="warning" size="xs">
							Bot role
						</Tag>
					)}
					<Tag variant="secondary" size="xs">
						Position: {role.position}
					</Tag>
				</div>
			</div>
			<dl className="grid gap-x-3 gap-y-2 text-sm sm:grid-cols-2">
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Color:</dt>
					<dd className="inline-flex items-center gap-1">
						{role.color && (
							<span
								aria-hidden="true"
								className="size-3 rounded-full border border-border"
								style={{ backgroundColor: role.color }}
							/>
						)}
						{role.color ?? "Default"}
					</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Members:</dt>
					<dd>{role.memberCount.toLocaleString()}</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Managed:</dt>
					<dd>{role.managed ? "Yes" : "No"}</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Can assign:</dt>
					<dd className={role.assignable ? "font-medium text-success" : "font-medium text-destructive"}>
						{role.assignable ? "Yes" : "No"}
					</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Displayed separately:</dt>
					<dd>{role.hoisted ? "Yes" : "No"}</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Mentionable:</dt>
					<dd>{role.mentionable ? "Yes" : "No"}</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1 sm:col-span-2">
					<dt className="text-muted-foreground">Created:</dt>
					<dd>{DateHandler.getDateTime(role.createdTimestampMs)}</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1 sm:col-span-2">
					<dt className="text-muted-foreground">Role ID:</dt>
					<dd className="break-all">{role.id}</dd>
				</div>
			</dl>
			<details className="mt-3 min-w-0 text-sm">
				<summary className="cursor-pointer font-medium text-foreground">
					Permissions ({role.permissions.length})
				</summary>
				{role.permissions.length > 0 ? (
					<ul className="mt-2 flex flex-wrap gap-1">
						{role.permissions.map((permission) => (
							<li key={permission}>
								<Tag variant="secondary" size="xs">
									{permission.replace(/([a-z])([A-Z])/g, "$1 $2")}
								</Tag>
							</li>
						))}
					</ul>
				) : (
					<p className="mt-2 text-muted-foreground">No permissions.</p>
				)}
			</details>
		</>
	);
}

export default function GuildRolesPanel({ guild }: { guild: { id: string; isActiveMember: boolean } }) {
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
	const rolesQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "roles"],
		queryFn: () => APIHandler.getGuildRoles(guild.id),
		enabled: false,
		retry: false,
	});
	const roleDetailsQuery = useQuery({
		queryKey: ["user", "guild", guild.id, "roles", selectedRoleId],
		queryFn: () => {
			if (selectedRoleId === null) throw new Error("A role must be selected to load its details.");
			return APIHandler.getGuildRoleDetails(guild.id, selectedRoleId);
		},
		enabled: selectedRoleId !== null,
		retry: false,
	});
	const roles = rolesQuery.data;
	const accessStatus = accessErrorStatus(rolesQuery.error) ?? accessErrorStatus(roleDetailsQuery.error);
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
	const roleDetailsErrorStatus = axios.isAxiosError(roleDetailsQuery.error)
		? roleDetailsQuery.error.response?.status
		: undefined;
	const roleDetailsErrorMessage =
		roleDetailsErrorStatus === 404
			? "This role is no longer available."
			: roleDetailsErrorStatus === 409
				? "The bot is no longer a member of this guild."
				: roleDetailsErrorStatus === 503
					? "The guild or a required service is unavailable. Please try again."
					: "Could not load role details. Please try again.";

	return (
		<>
			<Card id="guild-roles" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
				<div className="flex items-center justify-between gap-3">
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Roles <GuildSectionLink id="guild-roles" label="roles" />
					</h2>
					{roles && (
						<span className="shrink-0 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
							Total: {roles.length} {roles.length === 1 ? "role" : "roles"}
						</span>
					)}
				</div>
				<p className="mt-1 text-sm text-muted-foreground">
					Load the current roles in this guild, highest position first.
				</p>
				{!rolesQuery.isError && (
					<Button
						type="button"
						size="sm"
						variant="outline-primary"
						className="mt-3"
						disabled={rolesQuery.isFetching || !guild.isActiveMember}
						onClick={() => void rolesQuery.refetch()}
					>
						{rolesQuery.data ? "Refresh roles" : "Load roles"}
					</Button>
				)}
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
					<ul className="mt-4 grid items-start gap-3 sm:grid-cols-2">
						{roles.map((role) => (
							<li key={role.id}>
								<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
									<div className="flex flex-wrap items-start justify-between gap-2">
										<div className="flex min-w-0 items-center gap-2">
											{role.iconUrl ? (
												<img src={role.iconUrl} alt="" className="size-5 shrink-0 rounded-sm" />
											) : role.unicodeEmoji ? (
												<span aria-hidden="true" className="shrink-0">
													{role.unicodeEmoji}
												</span>
											) : null}
											{role.color && (
												<span
													aria-hidden="true"
													className="size-3 shrink-0 rounded-full border border-border"
													style={{ backgroundColor: role.color }}
												/>
											)}
											<h3 className="min-w-0 wrap-break-word font-semibold">{role.name}</h3>
										</div>
										<div className="ml-auto flex flex-wrap justify-end gap-1">
											{role.isBotRole && (
												<Tag variant="warning" size="xs">
													Bot role
												</Tag>
											)}
											<Tag variant="secondary" size="xs">
												Position: {role.position}
											</Tag>
										</div>
									</div>
									<dl className="mt-2 grid gap-x-3 gap-y-1 text-sm sm:grid-cols-2">
										<div className="flex min-w-0 flex-wrap gap-x-1">
											<dt className="text-muted-foreground">Managed:</dt>
											<dd>{role.managed ? "Yes" : "No"}</dd>
										</div>
										<div className="flex min-w-0 flex-wrap gap-x-1">
											<dt className="text-muted-foreground">Can assign:</dt>
											<dd
												className={
													role.assignable
														? "font-medium text-success"
														: "font-medium text-destructive"
												}
											>
												{role.assignable ? "Yes" : "No"}
											</dd>
										</div>
									</dl>
									<div className="mt-3 flex justify-end">
										<Button
											type="button"
											size="sm"
											variant="outline-primary"
											aria-haspopup="dialog"
											onClick={() => setSelectedRoleId(role.id)}
										>
											View details
										</Button>
									</div>
								</Card>
							</li>
						))}
					</ul>
				) : null}
			</Card>
			<Modal
				open={selectedRoleId !== null}
				setOpen={(open) => {
					if (!open) setSelectedRoleId(null);
				}}
				headerContent={roles?.find((role) => role.id === selectedRoleId)?.name ?? "Role details"}
				footerContent={
					<div className="flex justify-end">
						<Button
							type="button"
							size="sm"
							variant="outline-secondary"
							onClick={() => setSelectedRoleId(null)}
						>
							Close
						</Button>
					</div>
				}
				className="w-full max-w-2xl"
			>
				{roleDetailsQuery.isFetching ? (
					<LoadingIndicator label="Loading role details" />
				) : roleDetailsQuery.isError ? (
					<ErrorPage
						variant="inline"
						status={roleDetailsErrorStatus ? String(roleDetailsErrorStatus) : "Error"}
						title="Could not load role details"
						message={roleDetailsErrorMessage}
						actions={
							<Button
								type="button"
								size="sm"
								variant="outline-primary"
								onClick={() => void roleDetailsQuery.refetch()}
							>
								Retry
							</Button>
						}
					/>
				) : roleDetailsQuery.data ? (
					<RoleDetails role={roleDetailsQuery.data} />
				) : null}
			</Modal>
		</>
	);
}
