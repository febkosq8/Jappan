import { Button, Card } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";

import APIHandler from "@jappan/handlers/APIHandler";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import GuildSectionLink from "@jappan/components/panel/guild-section-link";

export default function CommandPermissionsPanel({ permissions }: { permissions?: string[] }) {
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
