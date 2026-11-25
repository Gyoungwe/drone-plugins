import { type ConsentTask, MAX_AUTO_RESUMES } from "./consent.ts";

interface ContinuationTask extends Pick<ConsentTask, "executionConsent"> {
	state: string;
	milestones?: readonly { state: string }[];
	actions?: readonly { state: string }[];
	budget?: { autoResumes?: number };
	progressCount?: number;
	lastResumeProgress?: number;
}

function shouldAskToContinue(task: ContinuationTask | null | undefined) {
	if (!task?.executionConsent) return false;
	if (["completed", "cancelled", "archived"].includes(task.state)) return false;
	const milestones = task.milestones || [];
	if (!milestones.length) return false;
	if (!milestones.some((m) => m.state !== "completed")) return false;
	if ((task.actions || []).some((a) => a.state === "pending")) return false;
	if ((task.budget?.autoResumes || 0) >= MAX_AUTO_RESUMES) return false;
	return (task.progressCount || 0) > (task.lastResumeProgress || 0);
}

export { shouldAskToContinue };
