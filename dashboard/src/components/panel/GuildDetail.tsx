import { Card } from "@febkosq8/arc";
import type { ReactNode } from "react";

export default function GuildDetail({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Card hoverable={false} className="min-w-0 rounded-md border-border p-3">
			<dt className="text-sm text-muted-foreground">{label}</dt>
			<dd className="mt-1 wrap-break-word font-medium">{children}</dd>
		</Card>
	);
}
