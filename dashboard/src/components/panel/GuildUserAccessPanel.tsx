import { Button, Card, DateHandler, PreviewCard, Tabs, TabsList, TabsPanel, TabsTab, Tag } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { useEffect, useState } from "react";
import { FiLock, FiRefreshCw, FiUser } from "react-icons/fi";

import APIHandler, {
	type GuildMemberAccessDetails,
	type GuildMemberChannelAccess,
	type GuildMemberPermissionSource,
	type GuildMemberRoleAccess,
} from "@jappan/handlers/APIHandler";
import { AccessRedirect, accessErrorStatus } from "@jappan/components/AuthRoute";
import ChannelDisplay from "@jappan/components/display/ChannelDisplay";
import RoleDisplay from "@jappan/components/display/RoleDisplay";
import UserDisplay from "@jappan/components/display/UserDisplay";
import ErrorPage from "@jappan/components/ErrorPage";
import formatPermission from "@jappan/helpers/formatPermission";
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

type AccessSection = "overview" | "roles" | "channels";

function isAccessSection(value: string): value is AccessSection {
	return value === "overview" || value === "roles" || value === "channels";
}

function isAccessPanelActiveInUrl(): boolean {
	return window.location.hash.slice(1).split("?")[0] === "evaluate-user";
}

function getMemberIdFromUrl(): string {
	if (!isAccessPanelActiveInUrl()) return "";
	const searchParams = new URLSearchParams(window.location.search);
	return searchParams.get("userId") ?? searchParams.get("userAccessMemberId") ?? "";
}

function getAccessSectionFromUrl(): AccessSection {
	if (!isAccessPanelActiveInUrl()) return "overview";
	const section = new URLSearchParams(window.location.search).get("userAccessTab");
	return section && isAccessSection(section) ? section : "overview";
}

function updateUserAccessUrl(memberId: string, section: AccessSection) {
	const url = new URL(window.location.href);
	url.searchParams.delete("userAccessMemberId");
	if (memberId) {
		url.searchParams.set("userId", memberId);
	} else {
		url.searchParams.delete("userId");
	}
	if (memberId) {
		url.searchParams.set("userAccessTab", section);
	} else {
		url.searchParams.delete("userAccessTab");
	}
	window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function PermissionList({
	permissions,
	emptyLabel,
	permissionSources,
	channelOverrides,
	member,
	isOwner = false,
	onSelectRole,
}: {
	permissions: string[];
	emptyLabel: string;
	permissionSources?: GuildMemberPermissionSource[];
	channelOverrides?: GuildMemberChannelAccess["overrides"];
	member?: GuildMemberAccessDetails["member"];
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
				const overrideSources =
					channelOverrides?.filter((override) => override.allow.includes(permission)) ?? [];
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
										) : (
											<div className="space-y-3">
												{source?.roles.length ? (
													<div className="space-y-1">
														<p className="text-xs text-muted-foreground">Roles</p>
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
												) : null}
												{overrideSources.length > 0 ? (
													<div className="space-y-1">
														<p className="text-xs text-muted-foreground">
															Channel overrides
														</p>
														<ul className="flex flex-col gap-2">
															{overrideSources.map((override) => (
																<li key={`${override.targetType}-${override.targetId}`}>
																	{override.targetType === "role" ? (
																		<RoleDisplay
																			id={override.targetId}
																			name={override.targetName}
																			color={override.targetColor}
																			showId={false}
																			onSelect={() =>
																				onSelectRole?.(override.targetId)
																			}
																		/>
																	) : member ? (
																		<UserDisplay
																			user={member}
																			size="sm"
																			showId={false}
																		/>
																	) : (
																		<span className="text-sm">
																			{override.targetName}
																		</span>
																	)}
																</li>
															))}
														</ul>
													</div>
												) : null}
												{!source?.roles.length && overrideSources.length === 0 && (
													<p className="text-sm text-muted-foreground">
														No source role or channel override identified.
													</p>
												)}
											</div>
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
		return (
			<div
				role="status"
				className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2"
			>
				<FiLock className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
				<p className="text-sm font-medium text-foreground">{emptyLabel}</p>
			</div>
		);
	}
	return (
		<div className="rounded-md border border-dashed border-border bg-muted/30 p-3">
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
		</div>
	);
}

function AccessDetails({
	access,
	guildId,
	initialSection,
	onSectionChange,
	onRefresh,
	refreshDisabled,
}: {
	access: GuildMemberAccessDetails;
	guildId: string;
	initialSection: AccessSection;
	onSectionChange: (section: AccessSection) => void;
	onRefresh: () => void;
	refreshDisabled: boolean;
}) {
	const [section, setSection] = useState(initialSection);
	const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

	const changeSection = (value: string) => {
		if (!isAccessSection(value)) return;
		setSection(value);
		onSectionChange(value);
	};

	return (
		<div className="space-y-5">
			<div className="flex flex-wrap items-center gap-3 border-y border-border py-4">
				<UserDisplay user={access.member} size="md" />
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
				<div className="ml-auto flex items-center gap-2">
					<Button
						type="button"
						size="icon-sm"
						variant="outline-primary"
						className="group/refetch"
						aria-label="Refresh member access"
						disabled={refreshDisabled}
						onClick={onRefresh}
					>
						<FiRefreshCw className="size-4 group-hover/refetch:animate-spin" aria-hidden="true" />
					</Button>
					{access.member.joinedTimestampMs !== null && (
						<p className="text-sm text-muted-foreground">
							Joined {DateHandler.getDateTime(access.member.joinedTimestampMs)}
						</p>
					)}
				</div>
			</div>

			<Tabs value={section} onValueChange={changeSection} className="gap-4">
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
					<Card hoverable={false} className="min-w-0 space-y-3 rounded-md border-border p-3">
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
					</Card>
				</TabsPanel>
				<TabsPanel value="roles">
					<div className="space-y-3">
						<Card hoverable={false} className="min-w-0 space-y-3 rounded-md border-border p-3">
							<div>
								<h4 className="font-semibold">Assigned roles</h4>
								<p className="mt-1 text-sm text-muted-foreground">
									Click a role tag to explore its details.
								</p>
							</div>
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
									<p className="mt-1 text-sm text-muted-foreground">
										Click a role tag to explore its details.
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
									<p className="mt-1 text-sm text-muted-foreground">
										Click a role tag to explore its details.
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
					<Card hoverable={false} className="min-w-0 space-y-3 rounded-md border-border p-3">
						<div>
							<h4 className="font-semibold">Channel access and permissions</h4>
							<p className="mt-1 text-sm text-muted-foreground">
								Effective permissions include role permissions and channel overrides.
							</p>
						</div>
						{access.channels.length === 0 ? (
							<p className="text-sm text-muted-foreground">No guild channels were found.</p>
						) : (
							<ul className="mt-3 columns-1 gap-3 sm:columns-2">
								{access.channels.map((channel) => (
									<li key={channel.id} className="mb-3 inline-block w-full break-inside-avoid">
										<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
											<div className="flex flex-wrap items-start justify-between gap-2">
												<div className="min-w-0 wrap-break-word">
													<ChannelDisplay
														guildId={guildId}
														id={channel.id}
														name={channel.name}
													/>
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
											<div className="mt-3 space-y-3">
												{channel.canAccess && channel.permissions && (
													<Card
														hoverable={false}
														className="min-w-0 space-y-2 rounded-md border-border p-3"
													>
														<div className="flex flex-wrap items-center justify-between gap-2">
															<h5 className="font-semibold">Effective permissions</h5>
															<Tag variant="secondary" size="xs">
																{channel.permissions.length} permission
																{channel.permissions.length === 1 ? "" : "s"}
															</Tag>
														</div>
														<PermissionList
															permissions={channel.permissions}
															emptyLabel="No effective permissions."
															permissionSources={access.permissionSources}
															channelOverrides={channel.overrides}
															member={access.member}
															isOwner={access.member.isOwner}
															onSelectRole={setSelectedRoleId}
														/>
													</Card>
												)}
												{channel.overrides.length > 0 && (
													<Card
														hoverable={false}
														className="min-w-0 space-y-2 rounded-md border-border p-3"
													>
														<h5 className="font-semibold">Applicable channel overrides</h5>
														<ul className="space-y-2">
															{channel.overrides.map((override) => (
																<li
																	key={`${override.targetType}-${override.targetId}`}
																	className="rounded-md border border-dashed border-border bg-muted/30 p-2"
																>
																	{override.targetType === "role" ? (
																		<RoleDisplay
																			id={override.targetId}
																			name={override.targetName}
																			color={override.targetColor}
																		/>
																	) : (
																		<UserDisplay
																			user={access.member}
																			size="sm"
																			showId={false}
																		/>
																	)}
																	{(override.allow.length > 0 ||
																		override.deny.length > 0) && (
																		<div className="mt-2 grid w-full gap-2">
																			{override.allow.length > 0 && (
																				<div className="rounded-md border border-dashed border-success/40 bg-success/5 p-2">
																					<div className="flex flex-wrap items-center justify-between gap-2">
																						<p className="text-xs font-semibold text-success">
																							Allows
																						</p>
																						<Tag variant="secondary" size="xs">
																							{override.allow.length}{" "}
																							permission
																							{override.allow.length === 1
																								? ""
																								: "s"}
																						</Tag>
																					</div>
																					<ul className="mt-1 flex flex-wrap gap-1.5">
																						{override.allow.map(
																							(permission) => (
																								<li key={permission}>
																									<Tag
																										variant="success"
																										size="xs"
																									>
																										{formatPermission(
																											permission,
																										)}
																									</Tag>
																								</li>
																							),
																						)}
																					</ul>
																				</div>
																			)}
																			{override.deny.length > 0 && (
																				<div className="rounded-md border border-dashed border-destructive/40 bg-destructive/5 p-2">
																					<div className="flex flex-wrap items-center justify-between gap-2">
																						<p className="text-xs font-semibold text-destructive">
																							Denies
																						</p>
																						<Tag variant="secondary" size="xs">
																							{override.deny.length}{" "}
																							permission
																							{override.deny.length === 1
																								? ""
																								: "s"}
																						</Tag>
																					</div>
																					<ul className="mt-1 flex flex-wrap gap-1.5">
																						{override.deny.map(
																							(permission) => (
																								<li key={permission}>
																									<Tag
																										variant="destructive"
																										size="xs"
																									>
																										{formatPermission(
																											permission,
																										)}
																									</Tag>
																								</li>
																							),
																						)}
																					</ul>
																				</div>
																			)}
																		</div>
																	)}
																</li>
															))}
														</ul>
													</Card>
												)}
											</div>
										</Card>
									</li>
								))}
							</ul>
						)}
					</Card>
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
	const [memberId, setMemberId] = useState(getMemberIdFromUrl);
	const [accessSection, setAccessSection] = useState(getAccessSectionFromUrl);
	useEffect(() => {
		if (!active) {
			if (memberId) setMemberId("");
			if (accessSection !== "overview") setAccessSection("overview");
			return;
		}
		updateUserAccessUrl(memberId, accessSection);
	}, [active, accessSection, memberId]);

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
		<Card id="evaluate-user" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h2 className="flex items-center gap-1 text-lg font-semibold">
						Evaluate user access <GuildSectionLink id="evaluate-user" label="evaluate user" />
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
						<AccessDetails
							key={memberQuery.data.member.id}
							access={memberQuery.data}
							guildId={guildId}
							initialSection={accessSection}
							onSectionChange={setAccessSection}
							onRefresh={() => void memberQuery.refetch()}
							refreshDisabled={!active || !isActiveMember || memberQuery.isFetching}
						/>
					)}
				</div>
			)}
		</Card>
	);
}
