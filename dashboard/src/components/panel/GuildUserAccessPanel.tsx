import { Button, Card, DateHandler, PreviewCard, Tabs, TabsList, TabsPanel, TabsTab, Tag } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useState } from "react";
import { FiUser } from "react-icons/fi";

import APIHandler, {
	type GuildMemberAccessDetails,
	type GuildMemberPermissionSource,
	type GuildMemberRoleAccess,
} from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import RoleDisplay from "@jappan/components/display/RoleDisplay";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ErrorPage from "@jappan/components/ErrorPage";
import GuildRoleDetailsModal from "@jappan/components/panel/GuildRoleDetailsModal";
import GuildSectionLink from "@jappan/components/panel/GuildSectionLink";
import GuildMemberPicker from "@jappan/components/panel/GuildMemberPicker";
import LoadingIndicator from "@jappan/components/LoadingIndicator";

function getErrorMessage(error: unknown): string {
	if (axios.isAxiosError<{ error?: string }>(error) && typeof error.response?.data?.error === "string") {
		return error.response.data.error;
	}
	return "Could not evaluate this member's access. Please try again.";
}

function formatPermission(permission: string): string {
	return permission.replace(/([a-z])([A-Z])/gu, "$1 $2");
}

function PermissionList({
	permissions,
	emptyLabel,
	permissionSources,
	isOwner = false,
	onSelectRole,
}: {
	permissions: string[];
	emptyLabel: string;
	permissionSources?: GuildMemberPermissionSource[];
	isOwner?: boolean;
	onSelectRole?: (roleId: string) => void;
}) {
	if (permissions.length === 0) {
		return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
	}
	return (
		<ul className="flex flex-wrap gap-2">
			{permissions.map((permission) => {
				const label = formatPermission(permission);
				const source = permissionSources?.find((item) => item.permission === permission);
				const tag = (
					<Tag variant="secondary" size="xs">
						{label}
					</Tag>
				);
				return (
					<li key={permission}>
						{permissionSources ? (
							<PreviewCard
								trigger="click"
								triggerRender={
									<Button
										type="button"
										size="xs"
										variant="ghost"
										aria-label={`View source for ${label}`}
										className="h-auto p-0"
									/>
								}
								className="min-w-64 p-3"
								cardContent={
									<div className="max-w-72 space-y-3">
										<div className="border-b border-border pb-2">
											<p className="text-sm font-semibold">{label}</p>
										</div>
										<p className="text-xs text-muted-foreground">Granted by</p>
										{isOwner ? (
											<Tag variant="primary" size="sm">
												Server owner
											</Tag>
										) : source?.roles.length ? (
											<div className="space-y-2">
												<ul className="flex flex-col gap-2">
													{source.roles.map((role) => (
														<li key={role.id}>
															<RoleDisplay
																id={role.id}
																name={role.name}
																color={role.color}
																showId={false}
																onSelect={() => onSelectRole?.(role.id)}
															/>
														</li>
													))}
												</ul>
											</div>
										) : (
											<p className="text-sm text-muted-foreground">No source role identified.</p>
										)}
									</div>
								}
							>
								{tag}
							</PreviewCard>
						) : (
							tag
						)}
					</li>
				);
			})}
		</ul>
	);
}

function RoleList({
	roles,
	emptyLabel,
	onSelectRole,
}: {
	roles: GuildMemberRoleAccess[];
	emptyLabel: string;
	onSelectRole: (roleId: string) => void;
}) {
	if (roles.length === 0) {
		return <p className="text-sm text-muted-foreground">{emptyLabel}</p>;
	}
	return (
		<ul className="flex flex-wrap gap-2">
			{roles.map((role) => (
				<li key={role.id}>
					<RoleDisplay
						id={role.id}
						name={role.name}
						color={role.color}
						showId={false}
						onSelect={() => onSelectRole(role.id)}
					/>
				</li>
			))}
		</ul>
	);
}

function AccessDetails({ access, guildId }: { access: GuildMemberAccessDetails; guildId: string }) {
	const [section, setSection] = useState("overview");
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
				<UserDisplay
					id={access.member.id}
					name={access.member.displayName}
					username={access.member.username}
					avatarUrl={access.member.avatarUrl}
					size="md"
				/>
				{(access.member.bot || access.member.isOwner) && (
					<div className="flex min-w-0 flex-1 flex-wrap items-center justify-center gap-1">
						{access.member.bot && (
							<Tag variant="secondary" size="xs">
								Bot
							</Tag>
						)}
						{access.member.isOwner && (
							<Tag variant="primary" size="xs">
								Server owner
							</Tag>
						)}
					</div>
				)}
				{access.member.joinedTimestampMs !== null && (
					<p className="ml-auto text-sm text-muted-foreground">
						Joined {DateHandler.getDateTime(access.member.joinedTimestampMs)}
					</p>
				)}
			</div>

			<Tabs value={section} onValueChange={setSection} className="gap-4">
				<TabsList aria-label="Member access details" className="flex-wrap">
					<TabsTab value="overview" size="sm">
						Overview
					</TabsTab>
					<TabsTab value="roles" size="sm">
						Roles
					</TabsTab>
					<TabsTab value="channels" size="sm">
						Channels
					</TabsTab>
				</TabsList>
				<TabsPanel value="overview">
					<section className="space-y-3">
						<div>
							<h4 className="font-semibold">Server permissions</h4>
							<p className="mt-1 text-sm text-muted-foreground">Select a permission to see its source.</p>
						</div>
						<PermissionList
							permissions={access.member.permissions}
							emptyLabel="No server permissions."
							permissionSources={access.permissionSources}
							isOwner={access.member.isOwner}
							onSelectRole={setSelectedRoleId}
						/>
					</section>
				</TabsPanel>
				<TabsPanel value="roles">
					<div className="space-y-3">
						<Card hoverable={false} className="min-w-0 space-y-3 rounded-md border-border p-3">
							<h4 className="font-semibold">Assigned roles</h4>
							<RoleList
								roles={access.roles.assigned}
								emptyLabel="No assigned roles."
								onSelectRole={setSelectedRoleId}
							/>
						</Card>

						<div className="grid gap-3 lg:grid-cols-2">
							<Card hoverable={false} className="min-w-0 space-y-3 rounded-md border-border p-3">
								<div>
									<h4 className="font-semibold">Roles they can manage</h4>
									<p className="mt-1 text-sm text-muted-foreground">
										Based on Manage Roles permission and role hierarchy.
									</p>
								</div>
								<RoleList
									roles={access.roles.manageable}
									emptyLabel="They cannot manage any roles."
									onSelectRole={setSelectedRoleId}
								/>
							</Card>
							<Card hoverable={false} className="min-w-0 space-y-3 rounded-md border-border p-3">
								<div>
									<h4 className="font-semibold">Roles they can assign</h4>
									<p className="mt-1 text-sm text-muted-foreground">
										Managed integration roles and roles at or above their highest role are excluded.
									</p>
								</div>
								<RoleList
									roles={access.roles.assignable}
									emptyLabel="They cannot assign any roles."
									onSelectRole={setSelectedRoleId}
								/>
							</Card>
						</div>
					</div>
				</TabsPanel>
				<TabsPanel value="channels">
					<section className="space-y-3">
						<div>
							<h4 className="font-semibold">Channel access and permissions</h4>
							<p className="mt-1 text-sm text-muted-foreground">
								Effective permissions include role permissions and channel overrides.
							</p>
						</div>
						{access.channels.length === 0 ? (
							<p className="text-sm text-muted-foreground">No guild channels were found.</p>
						) : (
							<ul className="mt-3 grid items-start gap-3 sm:grid-cols-2">
								{access.channels.map((channel) => (
									<li key={channel.id}>
										<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
											<div className="flex flex-wrap items-start justify-between gap-2">
												<div className="min-w-0 wrap-break-word">
													<ChannelDisplay
														guildId={guildId}
														id={channel.id}
														name={channel.name}
													/>
													{channel.parentName && (
														<p className="mt-1 text-xs text-muted-foreground">
															Category: {channel.parentName}
														</p>
													)}
												</div>
												<div className="ml-auto flex flex-wrap justify-end gap-1">
													<Tag variant="secondary" size="xs">
														{formatPermission(channel.typeName)}
													</Tag>
													<Tag
														variant={
															channel.canAccess === null
																? "warning"
																: channel.canAccess
																	? "success"
																	: "destructive"
														}
														size="xs"
													>
														{channel.canAccess === null
															? "Permission data unavailable"
															: channel.canAccess
																? "Can access"
																: "Cannot access"}
													</Tag>
												</div>
											</div>
											<dl className="mt-3 space-y-3 text-sm">
												{channel.canAccess && channel.permissions && (
													<div>
														<dt className="text-muted-foreground">
															Effective permissions:
														</dt>
														<dd className="mt-1">
															<PermissionList
																permissions={channel.permissions}
																emptyLabel="No effective permissions."
															/>
														</dd>
													</div>
												)}
												{channel.overrides.length > 0 && (
													<div>
														<dt className="text-muted-foreground">
															Applicable channel overrides:
														</dt>
														<dd>
															<ul className="mt-1 space-y-1 text-xs text-muted-foreground">
																{channel.overrides.map((override) => (
																	<li
																		key={`${override.targetType}-${override.targetName}`}
																	>
																		{override.targetName}:{" "}
																		{[
																			...(override.allow.length > 0
																				? [
																						`allows ${override.allow.map(formatPermission).join(", ")}`,
																					]
																				: []),
																			...(override.deny.length > 0
																				? [
																						`denies ${override.deny.map(formatPermission).join(", ")}`,
																					]
																				: []),
																		].join("; ")}
																	</li>
																))}
															</ul>
														</dd>
													</div>
												)}
											</dl>
										</Card>
									</li>
								))}
							</ul>
						)}
					</section>
				</TabsPanel>
			</Tabs>
			<GuildRoleDetailsModal guildId={guildId} roleId={selectedRoleId} onClose={() => setSelectedRoleId(null)} />
		</div>
	);
}

export default function GuildUserAccessPanel({
	guildId,
	active,
	isActiveMember,
}: {
	guildId: string;
	active: boolean;
	isActiveMember: boolean;
}) {
	const [memberId, setMemberId] = useState("");
	const memberQuery = useQuery({
		queryKey: ["user", "guild", guildId, "member-access", memberId],
		queryFn: () => APIHandler.getGuildMemberAccess(guildId, memberId),
		enabled: active && isActiveMember && memberId !== "",
		retry: false,
	});
	const accessStatus = accessErrorStatus(memberQuery.error);
	if (accessStatus) return <AccessRedirect status={accessStatus} />;
	const errorStatus = axios.isAxiosError(memberQuery.error) ? memberQuery.error.response?.status : undefined;

	return (
		<Card id="user-access" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Evaluate user access <GuildSectionLink id="user-access" label="evaluate user access" />
					</h2>
					<p className="mt-1 text-sm text-muted-foreground">
						Review a member's effective permissions, channel access, and role capabilities.
					</p>
				</div>
				<div className="w-full sm:max-w-sm">
					<GuildMemberPicker
						id="user-access-member-search"
						guildId={guildId}
						enabled={active && isActiveMember}
						selectedMemberId={memberId}
						onSelect={(member) => setMemberId(member.id)}
					/>
				</div>
			</div>
			{!isActiveMember && (
				<p role="alert" className="mt-4 text-sm text-destructive">
					The bot is not a member of this guild. User access details are unavailable.
				</p>
			)}
			{!memberId ? (
				<div className="mt-5 flex flex-col items-center rounded-md border border-dashed border-border px-3 py-8 text-center">
					<FiUser className="size-6 text-muted-foreground" aria-hidden="true" />
					<p className="mt-3 font-medium">Select a member to evaluate their access</p>
					<p className="mt-1 text-sm text-muted-foreground">
						Search by username or nickname to see their permissions and role hierarchy.
					</p>
				</div>
			) : (
				<div className="mt-5 space-y-4">
					{memberQuery.isFetching && (
						<LoadingIndicator label="Evaluating member access" inline size={80} rows={1} columns={5} />
					)}
					{memberQuery.isError && (
						<div className="mt-4">
							<ErrorPage
								variant="inline"
								status={errorStatus ? String(errorStatus) : "Error"}
								title="Could not evaluate user access"
								message={getErrorMessage(memberQuery.error)}
								actions={
									<Button
										size="sm"
										variant="outline-primary"
										disabled={memberQuery.isFetching}
										onClick={() => void memberQuery.refetch()}
									>
										Retry
									</Button>
								}
							/>
						</div>
					)}
					{memberQuery.data && (
						<AccessDetails key={memberQuery.data.member.id} access={memberQuery.data} guildId={guildId} />
					)}
				</div>
			)}
		</Card>
	);
}
