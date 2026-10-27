import type { DroneUiRuntime } from "@gyoungwe/plugin-api/ui";

declare global {
	interface Window {
		DroneUI: DroneUiRuntime;
	}
}
