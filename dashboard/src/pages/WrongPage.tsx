import { PillLink } from "@febkosq8/arc";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

export default function WrongPage() {
	useDocumentTitle(formatTitle("Page Not Found"));
	return (
		<main className="app-page-min-height flex flex-col items-center justify-center px-4 text-center">
			<p className="text-7xl font-bold tracking-tight text-primary">404</p>
			<h1 className="mt-3 text-3xl font-bold text-foreground">Page not found</h1>
			<p className="mt-2 text-muted-foreground">The page you are looking for doesn't exist.</p>
			<PillLink variant="primary" href="/" className="mt-6">
				Back home
			</PillLink>
		</main>
	);
}
