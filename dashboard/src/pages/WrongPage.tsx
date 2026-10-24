import { PillLink } from "@febkosq8/arc";

export default function WrongPage() {
	return (
		<main className="flex min-h-[calc(100dvh-4rem)] flex-col items-center justify-center px-4 text-center">
			<p className="text-7xl font-bold tracking-tight text-primary">404</p>
			<h1 className="mt-3 text-3xl font-bold text-foreground">Page not found</h1>
			<p className="mt-2 text-muted-foreground">The page you are looking for doesn't exist.</p>
			<PillLink variant="primary" href="/" className="mt-6">
				Back home
			</PillLink>
		</main>
	);
}
