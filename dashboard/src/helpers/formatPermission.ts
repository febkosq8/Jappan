export default function formatPermission(permission: string): string {
	return permission.replace(/([a-z0-9])([A-Z])/gu, "$1 $2").replace(/([A-Z]{2,})([A-Z][a-z])/gu, "$1 $2");
}
