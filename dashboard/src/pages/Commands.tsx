import { Button, Card, PillLink, Tag } from "@febkosq8/arc";
import { useQuery } from "@tanstack/react-query";
import { FiCopy } from "react-icons/fi";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import LoadingIndicator from "@jappan/components/jappan/LoadingIndicator";
import APIHandler, { type GlobalCommand } from "@jappan/handlers/APIHandler";

function CopyCommandButton({ command }: { command: GlobalCommand }) {
	const copyCommand = async () => {
		if (!command.id) {
			toast.error("Command ID is unavailable.");
			return;
		}
		try {
			await navigator.clipboard.writeText(`</${command.name}:${command.id}>`);
			toast.success("Command copied.");
		} catch {
			toast.error("Could not copy command. Please try again.");
		}
	};

	return (
		<Button
			type="button"
			variant="ghost"
			size="icon-xs"
			className="shrink-0"
			aria-label={`Copy ${command.name} command`}
			title={command.id ? "Copy command" : "Command ID unavailable"}
			disabled={!command.id}
			onClick={() => void copyCommand()}
		>
			<FiCopy className="size-4" aria-hidden="true" />
		</Button>
	);
}

function ValueTags({ values }: { values: string[] }) {
	return (
		<ul className="flex flex-wrap gap-1">
			{values.map((value) => (
				<li key={value} className="max-w-full">
					<Tag variant="secondary" size="xs" className="max-w-full wrap-break-word">
						{value}
					</Tag>
				</li>
			))}
		</ul>
	);
}

function CommandDetails({ command }: { command: GlobalCommand }) {
	return (
		<>
			<p className="mt-2 text-muted-foreground">{command.description}</p>
			<dl className="mt-4 space-y-3 text-sm">
				{command.type === "command" && (
					<div>
						<dt className="text-muted-foreground">Command ID</dt>
						<dd className="mt-1 wrap-break-word font-medium">
							<ValueTags values={[command.id ?? "Unavailable"]} />
						</dd>
					</div>
				)}
				<div>
					<dt className="text-muted-foreground">Default user access</dt>
					<dd className="mt-1 wrap-break-word font-medium">
						<ValueTags
							values={
								command.requiredUserPermissions.length > 0
									? command.requiredUserPermissions
									: ["Everyone"]
							}
						/>
					</dd>
				</div>
				{command.requiredBotPermissions.length > 0 && (
					<div>
						<dt className="text-muted-foreground">Required bot permissions</dt>
						<dd className="mt-1 wrap-break-word font-medium">
							<ValueTags values={command.requiredBotPermissions} />
						</dd>
					</div>
				)}
			</dl>
		</>
	);
}

function CommandCard({
	command,
	subcommands,
	hasSubcommands,
}: {
	command: GlobalCommand;
	subcommands: GlobalCommand[];
	hasSubcommands: boolean;
}) {
	return (
		<li className="mb-3 inline-block w-full min-w-0 break-inside-avoid align-top">
			<Card hoverable={true} hoverLift={false} className="p-5">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div className="flex min-w-0 items-center gap-1">
						<h2 className="min-w-0 wrap-break-word text-lg font-semibold">/{command.name}</h2>
						{!hasSubcommands && <CopyCommandButton command={command} />}
					</div>
					<Tag
						variant="secondary"
						size="sm"
						className="capitalize"
						aria-label={`Category: ${command.category}`}
					>
						{command.category}
					</Tag>
				</div>
				<CommandDetails command={command} />
				{subcommands.length > 0 && (
					<section className="mt-5 border-t border-border pt-4" aria-label={`${command.name} subcommands`}>
						<h3 className="font-semibold">Subcommands</h3>
						<ul className="mt-3 space-y-3">
							{subcommands.map((subcommand) => (
								<li key={subcommand.name} className="rounded-md border border-border p-3">
									<div className="flex flex-wrap items-center justify-between gap-2">
										<div className="flex min-w-0 items-center gap-1">
											<h4 className="min-w-0 wrap-break-word font-medium">/{subcommand.name}</h4>
											<CopyCommandButton command={subcommand} />
										</div>
										<Tag
											variant="secondary"
											size="sm"
											className="capitalize"
											aria-label={`Category: ${subcommand.category}`}
										>
											{subcommand.category}
										</Tag>
									</div>
									<CommandDetails command={subcommand} />
								</li>
							))}
						</ul>
					</section>
				)}
			</Card>
		</li>
	);
}

function groupCommands(commands: GlobalCommand[]) {
	const roots = new Map(
		commands.filter((command) => command.type === "command").map((command) => [command.name, command]),
	);
	const subcommands = new Map<string, GlobalCommand[]>();
	const standalone: GlobalCommand[] = [];

	for (const command of commands) {
		if (command.type === "command") {
			standalone.push(command);
			continue;
		}
		const rootName = command.name.split(" ")[0] ?? "";
		if (!roots.has(rootName)) {
			standalone.push(command);
			continue;
		}
		const siblings = subcommands.get(rootName) ?? [];
		siblings.push(command);
		subcommands.set(rootName, siblings);
	}

	return standalone.map((command) => ({ command, subcommands: subcommands.get(command.name) ?? [] }));
}

export default function Commands() {
	document.title = "Commands - Jappan";
	const [searchParams, setSearchParams] = useSearchParams();
	const category = searchParams.get("category") || "all";
	const commandsQuery = useQuery({ queryKey: ["public", "commands"], queryFn: APIHandler.getGlobalCommands });
	const categories = [...new Set((commandsQuery.data ?? []).map((command) => command.category))].sort();
	const groups = groupCommands(commandsQuery.data ?? [])
		.map(({ command, subcommands }) => ({
			command,
			hasSubcommands: subcommands.length > 0,
			subcommands:
				category === "all" ? subcommands : subcommands.filter((subcommand) => subcommand.category === category),
		}))
		.filter(
			({ command, subcommands }) => category === "all" || command.category === category || subcommands.length,
		);

	return (
		<main className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6">
			<h1 className="typography-heading-2 text-3xl font-bold tracking-tight">Commands</h1>
			<p className="mt-2 text-muted-foreground whitespace-pre-wrap">
				{`Global commands and their declared permissions.\nServer settings and channel overrides may affect access.`}
			</p>
			<div className="mt-6">
				<p id="command-category-label" className="mb-2 text-sm font-medium">
					Category
				</p>
				<div role="group" aria-labelledby="command-category-label" className="flex flex-wrap gap-2">
					{["all", ...categories].map((name) => {
						const params = new URLSearchParams(searchParams);
						if (name === "all") params.delete("category");
						else params.set("category", name);

						return (
							<PillLink
								key={name}
								href={`?${params.toString()}`}
								variant={category === name ? "outline-primary" : "outline-secondary"}
								className="w-auto capitalize"
								onClick={(event) => {
									if (
										event.defaultPrevented ||
										event.button !== 0 ||
										event.metaKey ||
										event.ctrlKey ||
										event.shiftKey ||
										event.altKey
									)
										return;
									event.preventDefault();
									setSearchParams(params);
								}}
							>
								{name === "all" ? "All categories" : name}
							</PillLink>
						);
					})}
				</div>
			</div>
			{commandsQuery.isPending ? (
				<LoadingIndicator label="Loading commands" />
			) : commandsQuery.isError ? (
				<div role="alert" className="mt-6">
					<p>Could not load commands. Please try again.</p>
					<Button size="sm" variant="outline-primary" onClick={() => void commandsQuery.refetch()}>
						Retry
					</Button>
				</div>
			) : commandsQuery.data.length === 0 ? (
				<p className="mt-6 text-muted-foreground">No commands available.</p>
			) : groups.length === 0 ? (
				<p className="mt-6 text-muted-foreground">No commands found in this category.</p>
			) : (
				<ul className="mt-6 columns-1 gap-3 sm:columns-2 lg:columns-3">
					{groups.map(({ command, subcommands, hasSubcommands }) => (
						<CommandCard
							key={command.name}
							command={command}
							subcommands={subcommands}
							hasSubcommands={hasSubcommands}
						/>
					))}
				</ul>
			)}
		</main>
	);
}
