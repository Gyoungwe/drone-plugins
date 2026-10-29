import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
export { nativeDiscoveryExtension } from "./native-runtime.js";
import { nativeDiscoveryExtension } from "./native-runtime.js";
/** Same-package native adapter. Node state stays workspace-local unless an explicit adapter supplies a selected root. */
export default function discoveryExtension(pi: ExtensionAPI): Promise<void> {
	return nativeDiscoveryExtension(pi);
}
