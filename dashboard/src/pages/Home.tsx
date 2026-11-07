import About from "@jappan/components/home/About";
import Features from "@jappan/components/home/Features";

export default function Jappan() {
	return (
		<div className="jappan flex flex-col items-center justify-center">
			<About />
			<Features />
		</div>
	);
}
