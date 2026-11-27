import { fireEvent, render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { ArtifactRerunList } from "../../ui/artifact-rerun.js";
import { copy } from "../../ui/copy.js";

function fixture(unavailable: readonly string[] = [], busy = false) {
	return {
		artifacts: [{ id: "artifact", path: "figure.png", status: "valid" as const, sha256: "digest" }],
		status: { unavailable },
		act: vi.fn(async (_input: unknown) => undefined),
		readProvenance: vi.fn(async (_id: string): Promise<{ value: unknown } | undefined> => undefined),
		busy,
		t: copy.en,
	};
}

test("disables reruns with a reason when the executor is unavailable", () => {
	const input = fixture(["rerun-executor"]);
	render(<ArtifactRerunList {...input} />);
	const button = screen.getByRole<HTMLButtonElement>("button", { name: "Re-run" });
	expect(button.disabled).toBe(true);
	expect(screen.getByText("Re-run executor is not connected.")).toBeDefined();
	fireEvent.click(button);
	expect(input.act).not.toHaveBeenCalled();
});

test("requests a rerun through the panel action", () => {
	const input = fixture();
	render(<ArtifactRerunList {...input} />);
	fireEvent.click(screen.getByRole("button", { name: "Re-run" }));
	expect(input.act).toHaveBeenCalledExactlyOnceWith({ action: "rerunArtifact", id: "artifact" });
});

test("disables reruns while the panel is busy", () => {
	const input = fixture([], true);
	render(<ArtifactRerunList {...input} />);
	const button = screen.getByRole<HTMLButtonElement>("button", { name: "Re-run" });
	expect(button.disabled).toBe(true);
	fireEvent.click(button);
	expect(input.act).not.toHaveBeenCalled();
});

test("reads provenance on request and shows when the record is missing", async () => {
	const input = fixture();
	input.readProvenance
		.mockResolvedValueOnce({ value: { artifact: "artifact" } })
		.mockResolvedValueOnce({ value: null });
	render(<ArtifactRerunList {...input} />);
	const button = screen.getByRole("button", { name: "Read provenance" });
	expect(screen.queryByText("No records.")).toBeNull();
	fireEvent.click(button);
	expect(input.readProvenance).toHaveBeenCalledExactlyOnceWith("artifact");
	await screen.findByText(/"artifact": "artifact"/);
	fireEvent.click(button);
	await screen.findByText("No records.");
	expect(screen.queryByText(/"artifact": "artifact"/)).toBeNull();
});
