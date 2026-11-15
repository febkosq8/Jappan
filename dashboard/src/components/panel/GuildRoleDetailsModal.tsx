import { Button, Card, DateHandler, Modal, Tag } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";

import APIHandler, { type GuildRoleDetails } from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import ErrorPage from "@jappan/components/ErrorPage";
import formatPermission from "@jappan/helpers/formatPermission";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import RoleDisplay from "@jappan/components/display/RoleDisplay";

function RoleDetails({ role }: { role: GuildRoleDetails }) {
	return (
		<>
			<div className="mb-3">
				<RoleDisplay id={role.id} name={role.name} color={role.color} />
			</div>
			<div className="mb-3 flex flex-wrap items-center justify-between gap-2">
				<div className="flex min-w-0 items-center gap-2">
					{role.iconUrl ? (
						<img src={role.iconUrl} alt="" className="size-5 shrink-0 rounded-sm" />
					) : role.unicodeEmoji ? (
						<span aria-hidden="true" className="shrink-0">
							{role.unicodeEmoji}
						</span>
					) : null}
				</div>
				{role.isBotRole && (
					<div className="ml-auto flex flex-wrap justify-end gap-1">
						<Tag variant="warning" size="xs">
							Bot role
						</Tag>
					</div>
				)}
			</div>
			<dl className="grid gap-x-3 gap-y-2 text-sm sm:grid-cols-2">
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Position:</dt>
					<dd>{role.position}</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Color:</dt>
					<dd className="inline-flex items-center gap-1">
						{role.color && (
							<span
								aria-hidden="true"
								className="size-4 shrink-0 rounded-full border border-border"
								style={{ backgroundColor: role.color }}
							/>
						)}
						{role.color ?? "Default"}
					</dd>
				</div>
				<div className="flex min-w-0 flex-wrap gap-x-1">
					<dt className="text-muted-foreground">Created:</dt>
					<dd>{DateHandler.getDateTime(role.createdTimestampMs)}</dd>
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
			</dl>
			<Card hoverable={false} className="mt-3 p-3">
				<h3 className="font-semibold">Permissions ({role.permissions.length})</h3>
				<div className="mt-2">
					{role.permissions.length > 0 ? (
						<ul className="flex flex-wrap gap-1">
							{role.permissions.map((permission) => (
								<li key={permission}>
									<Tag variant="secondary" size="xs">
										{formatPermission(permission)}
									</Tag>
								</li>
							))}
						</ul>
					) : (
						<p className="text-muted-foreground">No permissions.</p>
					)}
				</div>
			</Card>
		</>
	);
}

export default function GuildRoleDetailsModal({
	guildId,
	roleId,
	onClose,
}: {
	guildId: string;
	roleId: string | null;
	onClose: () => void;
}) {
	const roleDetailsQuery = useQuery({
		queryKey: ["user", "guild", guildId, "roles", roleId],
		queryFn: () => {
			if (roleId === null) throw new Error("A role must be selected to load its details.");
			return APIHandler.getGuildRoleDetails(guildId, roleId);
		},
		enabled: roleId !== null,
		retry: false,
	});
	const accessStatus = accessErrorStatus(roleDetailsQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;

	const errorStatus = axios.isAxiosError(roleDetailsQuery.error)
		? roleDetailsQuery.error.response?.status
		: undefined;
	const errorMessage =
		errorStatus === 404
			? "This role is no longer available."
			: errorStatus === 409
				? "The bot is no longer a member of this guild."
				: errorStatus === 503
					? "The guild or a required service is unavailable. Please try again."
					: "Could not load role details. Please try again.";

	return (
		<Modal
			open={roleId !== null}
			setOpen={(open) => {
				if (!open) onClose();
			}}
			headerContent={
				<span className="flex items-center justify-between gap-3">
					<span>Role details</span>
					<Button type="button" size="sm" variant="outline-secondary" onClick={onClose}>
						Close
					</Button>
				</span>
			}
			className="w-full max-w-2xl"
		>
			{roleDetailsQuery.isFetching ? (
				<LoadingIndicator label="Loading role details" />
			) : roleDetailsQuery.isError ? (
				<ErrorPage
					variant="inline"
					status={errorStatus ? String(errorStatus) : "Error"}
					title="Could not load role details"
					message={errorMessage}
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
	);
}
