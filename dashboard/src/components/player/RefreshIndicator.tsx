import LoadingIndicator from "@jappan/components/LoadingIndicator";

export default function RefreshIndicator({ active, className }: { active: boolean; className?: string }) {
	return active ? (
		<span className={className}>
			<LoadingIndicator label="Refreshing player" inline decorative size={20} columns={3} rows={1} />
		</span>
	) : null;
}
