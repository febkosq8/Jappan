import febProfile from "@jappan/assets/jappan/febkosq8.gif";
import inconProfile from "@jappan/assets/jappan/inconsistent.jpg";
import rinProfile from "@jappan/assets/jappan/rinzai.png";
import { Avatar, Card, PillLink } from "@febkosq8/arc";
import { FiUsers } from "react-icons/fi";

const teamMembers = [
	{ role: "Lead Developer", name: "febkosq8", image: febProfile, href: "https://febkosq8.me" },
	{ role: "Senior Developer", name: "rinzai", image: rinProfile, href: "https://rinzai.dev" },
	{
		role: "QA Tester",
		name: "akhilpv2334768",
		image: inconProfile,
		href: "https://discord.com/users/290033269821407235",
	},
];

export default function Team() {
	return (
		<section id="team" className="scroll-mt-20 px-4 py-20 sm:px-6 lg:py-24">
			<div className="mx-auto max-w-6xl">
				<div className="mb-10">
					<p className="mb-3 text-sm font-semibold uppercase tracking-wider text-primary">
						The people behind the bot
					</p>
					<h2 className="typography-heading-2 flex items-center gap-3 text-4xl">
						Team <FiUsers className="size-8 text-primary" aria-hidden="true" />
					</h2>
				</div>
				<div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
					{teamMembers.map((member) => (
						<Card className="flex flex-col items-center gap-5 p-6 text-center" key={member.name}>
							<Card.Content className="flex w-full flex-col items-center gap-5">
								<Avatar
									name={`${member.name} profile`}
									image={member.image}
									size="8xl"
									variant={"ring"}
									ringColor={"accent"}
								/>
								<div>
									<p className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
										{member.role}
									</p>
									<PillLink
										className="w-full"
										variant="outline"
										href={member.href}
										target="_blank"
										rel="noreferrer"
									>
										{member.name}
									</PillLink>
								</div>
							</Card.Content>
						</Card>
					))}
				</div>
			</div>
		</section>
	);
}
