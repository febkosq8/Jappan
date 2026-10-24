import About from "@jappan/components/jappan/About";
import Features from "@jappan/components/jappan/Features";
import Team from "@jappan/components/jappan/Team";

export default function Jappan() {
	return (
		<div className="jappan flex flex-col items-center justify-center">
			<About />
			<Features />
			<Team />
		</div>
	);
}
