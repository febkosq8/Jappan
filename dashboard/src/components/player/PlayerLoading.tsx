import { Card, Tabs, TabsList, TabsPanel, TabsTab } from "@febkosq8/arc";
import LoadingIndicator from "@jappan/components/LoadingIndicator";
import { playerSections } from "@jappan/helpers/playerSections";

function LoadingCard({ title, label, className }: { title: string; label: string; className?: string }) {
	return (
		<Card hoverable={false} className={`rounded-md border-border ${className ?? ""}`}>
			<Card.Content className="p-4!">
				<h2 className="text-sm font-semibold text-muted-foreground">{title}</h2>
				<LoadingIndicator label={label} size={60} rows={1} columns={5} />
			</Card.Content>
		</Card>
	);
}

export default function PlayerLoading({
	section,
	onSectionChange,
}: {
	section: string;
	onSectionChange: (value: string) => void;
}) {
	return (
		<main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
			<div className="mb-4 grid gap-4 sm:grid-cols-2">
				<LoadingCard title="Server" label="Loading server" />
				<LoadingCard title="Voice channel" label="Loading voice channel" />
				<LoadingCard title="Session" label="Loading session" className="sm:col-span-2" />
			</div>
			<Tabs value={section} onValueChange={onSectionChange} className="gap-5">
				<TabsList aria-label="Player sections">
					{playerSections.map(({ id, label }) => (
						<TabsTab key={id} value={id} size="sm">
							{label}
						</TabsTab>
					))}
				</TabsList>
				<TabsPanel value="now-playing" className="flex flex-col gap-4">
					<LoadingCard title="Now playing" label="Loading now playing" />
					<LoadingCard title="Add to queue" label="Loading queue controls" />
				</TabsPanel>
				<TabsPanel value="queue">
					<LoadingCard title="Up next" label="Loading queue" />
				</TabsPanel>
			</Tabs>
		</main>
	);
}
