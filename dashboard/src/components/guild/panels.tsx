import { Avatar, Button, Card, DateHandler, Input, LabelField } from "@febkosq8/arc";
import { useForm } from "@tanstack/react-form";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { FiLink } from "react-icons/fi";

import APIHandler, { type AdminGuildDetails, type UserGuildDetails } from "@jappan/handlers/APIHandler";
import ExternalTextLink from "@jappan/components/ExternalTextLink";
import GuildCommandDeployment from "@jappan/components/guild/GuildCommandDeployment";
import LoadingIndicator from "@jappan/components/LoadingIndicator";

export const guildIdPattern = /^\d{17,20}$/u;

export function GuildSectionLink({ id, label }: { id: string; label: string }) {
	return (
		<a
			href={`#${id}`}
			aria-label={`Link to ${label}`}
			title={`Link to ${label}`}
			className="inline-flex shrink-0 rounded-md p-1 text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<FiLink className="size-4" aria-hidden="true" />
		</a>
	);
}

export function GuildLookup({ guildId, onLookup }: { guildId: string; onLookup: (guildId: string) => void }) {
	const form = useForm({
		defaultValues: { guildId },
		onSubmit: ({ value }) => onLookup(value.guildId.trim()),
	});

	return (
		<form
			onSubmit={(event) => {
				event.preventDefault();
				void form.handleSubmit();
			}}
			className="mb-6 max-w-xl"
		>
			<form.Field
				name="guildId"
				validators={{
					onSubmit: ({ value }) =>
						guildIdPattern.test(value.trim())
							? undefined
							: "Enter a valid Discord guild ID (17 to 20 digits).",
					onChange: ({ value }) =>
						guildIdPattern.test(value.trim())
							? undefined
							: "Enter a valid Discord guild ID (17 to 20 digits).",
				}}
			>
				{(field) => {
					const error = field.state.meta.errors[0];
					return (
						<>
							<LabelField id="guild-id" label="Guild ID" className="mb-2" />
							<div className="flex flex-col gap-2 sm:flex-row">
								<Input
									id="guild-id"
									name={field.name}
									value={field.state.value}
									onChange={(event) => field.handleChange(event.target.value)}
									onBlur={field.handleBlur}
									inputMode="numeric"
									placeholder="Enter a Discord guild ID"
									aria-invalid={!!error}
									aria-describedby={error ? "guild-id-error" : undefined}
									className="h-10 min-w-0 flex-1"
								/>
								<Button type="submit">View guild</Button>
							</div>
							{error && (
								<p id="guild-id-error" role="alert" className="mt-2 text-sm text-destructive">
									{error}
								</p>
							)}
						</>
					);
				}}
			</form.Field>
		</form>
	);
}

export function GuildDetail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd className="mt-1 wrap-break-word font-medium">{children}</dd>
		</Card>
	);
}

export function GuildOverview({ guild }: { guild: AdminGuildDetails | UserGuildDetails }) {
	return (
		<Card id="guild-overview" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Guild overview <GuildSectionLink id="guild-overview" label="guild overview" />
			</h2>
			<div className="mt-4 flex items-center gap-4">
				<Avatar name={guild.name} image={guild.icon} size="lg" aria-hidden="true" />
				<div className="min-w-0">
					<h3 className="wrap-break-word text-xl font-bold">
						<ExternalTextLink
							href={`https://discord.com/channels/${encodeURIComponent(guild.id)}`}
							text={guild.name}
						/>
					</h3>
					<p className="break-all text-sm text-muted-foreground">{guild.id}</p>
				</div>
			</div>
			<dl className="mt-5 grid gap-3 sm:grid-cols-2">
				{"isActiveMember" in guild && (
					<GuildDetail label="Bot membership">{guild.isActiveMember ? "Active" : "Inactive"}</GuildDetail>
				)}
				{"guildCommandDeploymentState" in guild && (
					<GuildDetail label="Guild commands">
						<GuildCommandDeployment deployment={guild.guildCommandDeploymentState} />
					</GuildDetail>
				)}
				{"memberCount" in guild && (
					<GuildDetail label="Members">{guild.memberCount?.toLocaleString() ?? "Unavailable"}</GuildDetail>
				)}
				{"channelCount" in guild && (
					<GuildDetail label="Channels">{guild.channelCount?.toLocaleString() ?? "Unavailable"}</GuildDetail>
				)}
				{"createdTimestampMs" in guild && (
					<GuildDateDetail label="Created" timestamp={guild.createdTimestampMs} />
				)}
				{"joinedTimestampMs" in guild && <GuildDateDetail label="Joined" timestamp={guild.joinedTimestampMs} />}
				{"discoveredTimestampMs" in guild && (
					<GuildDateDetail label="Discovered" timestamp={guild.discoveredTimestampMs} />
				)}
				{"owner" in guild && (
					<GuildDetail label="Owner">
						{guild.owner ? (
							<div className="flex items-center gap-2">
								<Avatar
									name={guild.owner.username}
									image={guild.owner.avatarUrl}
									size="sm"
									aria-hidden="true"
								/>
								<div className="min-w-0">
									<ExternalTextLink
										href={`https://discord.com/users/${encodeURIComponent(guild.owner.userId)}`}
										text={guild.owner.username}
									/>
									<p className="break-all text-xs text-muted-foreground">{guild.owner.userId}</p>
								</div>
							</div>
						) : (
							"Unavailable"
						)}
					</GuildDetail>
				)}
				{"systemChannel" in guild && (
					<GuildDetail label="System channel">
						{guild.systemChannel === undefined ? (
							"Unavailable"
						) : guild.systemChannel === null ? (
							"None"
						) : (
							<>
								<ExternalTextLink
									href={`https://discord.com/channels/${encodeURIComponent(guild.id)}/${encodeURIComponent(guild.systemChannel.id)}`}
									text={guild.systemChannel.name}
								/>
								<span className="block break-all text-xs text-muted-foreground">
									{guild.systemChannel.id}
								</span>
							</>
						)}
					</GuildDetail>
				)}
				{"hasRequiredPermissions" in guild && (
					<GuildDetail label="Required permissions">
						{guild.hasRequiredPermissions === undefined ? (
							"Unavailable"
						) : guild.hasRequiredPermissions ? (
							<span className="text-success">All granted</span>
						) : (
							<span className="text-destructive">Some missing</span>
						)}
					</GuildDetail>
				)}
				{"description" in guild && (
					<GuildDetail label="Description">
						{guild.description === undefined ? "Unavailable" : (guild.description ?? "None")}
					</GuildDetail>
				)}
			</dl>
		</Card>
	);
}

function GuildDateDetail({ label, timestamp }: { label: string; timestamp: number | null | undefined }) {
	return (
		<GuildDetail label={label}>
			{timestamp == null ? (
				"Unavailable"
			) : (
				<>
					<span className="block">{DateHandler.getDateTime(timestamp)}</span>
					<span className="text-sm text-muted-foreground">{DateHandler.getRelativeTime(timestamp)}</span>
				</>
			)}
		</GuildDetail>
	);
}

export function BotPermissionsPanel({ permissions }: { permissions?: string[] }) {
	return (
		<Card id="bot-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Bot permissions <GuildSectionLink id="bot-permissions" label="bot permissions" />
			</h2>
			{permissions === undefined ? (
				<p className="mt-3 text-muted-foreground">Unavailable</p>
			) : permissions.length === 0 ? (
				<p className="mt-3 text-muted-foreground">None</p>
			) : (
				<ul className="mt-3 flex flex-wrap gap-2">
					{permissions.map((permission) => (
						<li key={permission} className="rounded-md border border-border bg-muted px-3 py-1 text-sm">
							{permission}
						</li>
					))}
				</ul>
			)}
		</Card>
	);
}

export function CommandPermissionsPanel({ permissions }: { permissions?: string[] }) {
	const commandsQuery = useQuery({
		queryKey: ["public", "commands"],
		queryFn: APIHandler.getGlobalCommands,
		enabled: permissions !== undefined,
	});
	const grantedPermissions = new Set(permissions);
	const isAdministrator = grantedPermissions.has("Administrator");
	const commands = commandsQuery.data?.filter(
		(command, _index, all) => !all.some((other) => other.name.startsWith(`${command.name} `)),
	);

	return (
		<Card id="command-permissions" hoverable={false} className="scroll-mt-24 p-5 sm:p-6">
			<h2 className="flex items-center gap-1 text-lg font-semibold">
				Command permissions <GuildSectionLink id="command-permissions" label="command permissions" />
			</h2>
			<p className="mt-1 text-sm text-muted-foreground">
				Declared bot permissions at guild level. Channel overrides and other requirements can affect whether a
				command works.
			</p>
			{permissions === undefined ? (
				<p className="mt-3 text-muted-foreground">Unavailable</p>
			) : commandsQuery.isPending ? (
				<LoadingIndicator label="Loading commands" />
			) : commandsQuery.isError ? (
				<div role="alert" className="mt-3">
					<p>Could not load command permissions. Please try again.</p>
					<Button size="sm" variant="outline-primary" onClick={() => void commandsQuery.refetch()}>
						Retry
					</Button>
				</div>
			) : !commands?.length ? (
				<p className="mt-3 text-muted-foreground">No commands available</p>
			) : (
				<ul className="mt-3 grid gap-3 sm:grid-cols-2">
					{commands.map(({ name, requiredBotPermissions }) => {
						const permChecks = requiredBotPermissions.map(
							(permission) =>
								[permission, isAdministrator || grantedPermissions.has(permission)] as const,
						);
						const missing = permChecks.some(([, granted]) => !granted);
						return (
							<li key={name} className="min-w-0 rounded-md border border-border p-3">
								<div className="flex flex-wrap items-center justify-between gap-2">
									<h3 className="wrap-break-word font-medium">/{name}</h3>
									<span className={missing ? "text-destructive" : "text-success"}>
										{missing
											? "Some required permissions missing"
											: "All required permissions granted"}
									</span>
								</div>
								{permChecks.length === 0 ? (
									<p className="mt-2 text-sm text-muted-foreground">No declared permissions</p>
								) : (
									<ul className="mt-2 space-y-1 text-sm">
										{permChecks.map(([permission, granted]) => (
											<li key={permission} className="flex justify-between gap-3">
												<span className="min-w-0 wrap-break-word">{permission}</span>
												<span className={granted ? "text-success" : "text-destructive"}>
													{granted ? "Granted" : "Missing"}
												</span>
											</li>
										))}
									</ul>
								)}
							</li>
						);
					})}
				</ul>
			)}
		</Card>
	);
}
