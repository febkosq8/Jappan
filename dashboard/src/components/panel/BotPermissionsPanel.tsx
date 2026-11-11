import { Card } from "@febkosq8/arc";

import GuildSectionLink from "@jappan/components/panel/GuildSectionLink";

export default function BotPermissionsPanel({ permissions }: { permissions?: string[] }) {
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
