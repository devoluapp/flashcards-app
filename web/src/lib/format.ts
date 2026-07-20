export function formatInterval(from: Date, to: Date): string {
	const minutes = Math.round((to.getTime() - from.getTime()) / 60000);
	if (minutes < 1) return '<1min';
	if (minutes < 60) return `${minutes}min`;
	const hours = minutes / 60;
	if (hours < 24) return `${Math.round(hours)}h`;
	const days = hours / 24;
	if (days < 30) return `${Math.round(days)}d`;
	const months = days / 30;
	if (months < 12) return `${Math.round(months)}mo`;
	return `${(days / 365).toFixed(1)}a`;
}
