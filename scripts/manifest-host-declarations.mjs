export const HOST_EVENT_TOPICS = Object.freeze([
	"inquiry.compute",
	"inquiry.task-terminal",
	"inquiry.local-execution",
	"inquiry.decision",
]);

const allowedTopics = new Set(HOST_EVENT_TOPICS);

export function hostDeclarationFailures(manifest) {
	const failures = [],
		drone = manifest?.drone;
	if (drone?.hostEvents !== undefined) {
		if (!manifest.entrypoints?.desktopRuntime)
			failures.push("drone.hostEvents requires desktopRuntime ownership");
		const topics = drone.hostEvents;
		if (!Array.isArray(topics) || topics.length === 0) {
			failures.push("drone.hostEvents must be a nonempty array of unique topic strings");
		} else {
			const seen = new Set();
			for (const topic of topics) {
				if (typeof topic !== "string") failures.push("drone.hostEvents entries must be strings");
				else if (!allowedTopics.has(topic)) failures.push(`unknown host event topic ${topic}`);
				if (seen.has(topic)) failures.push("drone.hostEvents must be unique");
				seen.add(topic);
			}
		}
	}
	if (drone?.inquiryRerun !== undefined) {
		if (!manifest.entrypoints?.desktopRuntime)
			failures.push("drone.inquiryRerun requires desktopRuntime ownership");
		if (drone.inquiryRerun !== "request") failures.push('drone.inquiryRerun must be "request" when declared');
	}
	return failures;
}
