import { PillLink } from "@febkosq8/arc";
import ErrorPage from "@jappan/components/ErrorPage";
import useDocumentTitle, { formatTitle } from "@jappan/helpers/useDocumentTitle";

export default function WrongPage() {
	useDocumentTitle(formatTitle("Page Not Found"));
	return (
		<ErrorPage
			status="404"
			title="Page not found"
			message="The page you are looking for doesn't exist."
			actions={
				<PillLink variant="outline-secondary" href="/">
					Back home
				</PillLink>
			}
		/>
	);
}
