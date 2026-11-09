import type { AdminGuildDetails } from "@jappan/handlers/APIHandler";

type Deployment = AdminGuildDetails["guildCommandDeploymentState"];

export function getGuildCommandDeploymentStatus(deployment: Deployment) {
	if (deployment == null) return "Unavailable";
	if (deployment.total === 0) return "No guild commands configured";
	if (deployment.deployed === 0) return "Not deployed";
	if (deployment.deployed === deployment.total) return "Deployed";
	return "Partially deployed";
}

export default function GuildCommandDeployment({ deployment }: { deployment: Deployment }) {
	return (
		<>
			{getGuildCommandDeploymentStatus(deployment)}
			{deployment && deployment.total > 0 && (
				<span className="block text-sm text-muted-foreground">
					{deployment.deployed} of {deployment.total} registered
				</span>
			)}
		</>
	);
}
