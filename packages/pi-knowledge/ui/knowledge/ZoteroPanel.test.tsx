import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { services } from "../../test/setup";
import { ZoteroPanel } from "./ZoteroPanel";
import { zoteroZh } from "./zotero-copy";

afterEach(cleanup);

it.each([
	{ version: "9.0.0", supported: false, writeMode: zoteroZh.writeModeWeb },
	{ version: "10.0.6", supported: true, writeMode: zoteroZh.writeModeLocal },
])(
	"shows local writes and the plugin credentials hint on Zotero $version",
	async ({ version, supported, writeMode }) => {
		services.getZoteroStatus = async () => ({
			command: null,
			version,
			localApiReachable: true,
			desktopDetected: true,
			desktopPath: null,
			docsUrl: "https://www.zotero.org/support/",
			downloadUrl: "https://www.zotero.org/download/",
		});
		services.getZoteroLocalWrite = async () => ({
			reachable: true,
			supported,
			authorized: false,
			source: null,
			staleServer: false,
		});
		services.getZoteroWebApi = vi.fn(async () => ({ configured: false, source: null }));
		const { container } = render(<ZoteroPanel />);
		await screen.findByTestId("zotero-local-write");
		expect(screen.queryByTestId(/web-api$/)).toBeNull();
		expect(container.querySelector("details, input")).toBeNull();
		expect(
			screen.getByText(
				"群组库或 Zotero 未打开时需要 Zotero 网页 API 密钥：在 设置 → 插件 → pi-research → 凭据 中填写。",
			),
		).toBeTruthy();
		expect(screen.getByText(writeMode)).toBeTruthy();
		expect(screen.getByText(`· 版本 ${version}`)).toBeTruthy();
		expect(screen.getByText(zoteroZh.crossHint)).toBeTruthy();
		expect(services.getZoteroWebApi).not.toHaveBeenCalled();
	},
);
