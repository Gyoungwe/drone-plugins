import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { nativeInquiryExtension } from "./native-runtime.js";

export { nativeInquiryExtension } from "./native-runtime.js";
export default function inquiryExtension(pi: ExtensionAPI): Promise<void> {
	return nativeInquiryExtension(pi);
}
