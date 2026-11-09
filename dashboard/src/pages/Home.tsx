import About from "@jappan/components/home/About";
import Features from "@jappan/components/home/Features";
import useDocumentTitle from "@jappan/helpers/useDocumentTitle";

// Matches the title in index.html, so coming back to the home page restores it
const HOME_TITLE = "Jappan | Discord Bot Dashboard";

export default function Jappan() {
	useDocumentTitle(HOME_TITLE);
	return (
		<div className="jappan flex flex-col items-center justify-center">
			<About />
			<Features />
		</div>
	);
}
