import { Card } from "@febkosq8/arc";
import type { ReactNode } from "react";
import { FiAlertTriangle } from "react-icons/fi";

interface ErrorPageProps {
	status: string;
	title: string;
	message: ReactNode;
	errorCode?: string;
	actions?: ReactNode;
	children?: ReactNode;
}

export default function ErrorPage({ status, title, message, errorCode, actions, children }: ErrorPageProps) {
	return (
		<main className="app-page-min-height flex items-center justify-center px-4 py-10">
			<Card className="w-full max-w-lg" aria-labelledby="error-page-title" hoverLift={false}>
				<Card.Content className="flex flex-col items-center p-6 text-center sm:p-8">
					<span
						className="mb-4 grid size-14 place-items-center rounded-full bg-destructive/10 text-destructive"
						aria-hidden="true"
					>
						<FiAlertTriangle className="size-7" />
					</span>
					<p className="text-sm font-semibold uppercase tracking-wide text-destructive">{status}</p>
					<h1 id="error-page-title" className="mt-2 text-2xl font-bold tracking-tight">
						{title}
					</h1>
					<div className="mt-3 whitespace-pre-line text-muted-foreground">{message}</div>
					{children && <div className="mt-4 w-full">{children}</div>}
					{errorCode && (
						<div className="mt-5 w-full rounded-md border border-border bg-muted px-3 py-2 text-left">
							<p className="text-xs text-muted-foreground">Error code</p>
							<p className="mt-1 break-all font-mono text-sm">{errorCode}</p>
						</div>
					)}
					{actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-2">{actions}</div>}
				</Card.Content>
			</Card>
		</main>
	);
}
