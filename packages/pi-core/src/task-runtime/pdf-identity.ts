import { Worker } from "node:worker_threads";

export interface PdfIdentity {
	text: string;
	pages: number;
	partial: boolean;
}

type PdfWorkerResult = (PdfIdentity & { error?: never }) | { error: string };
type PdfMeta = ImportMeta & { worker?: string };

async function readPdfIdentity(bytes: Buffer) {
	return new Promise<PdfIdentity>((resolve, reject) => {
		const worker = new Worker(new URL((import.meta as PdfMeta).worker ?? "pdf-worker.ts", import.meta.url), {
			workerData: { bytes },
			resourceLimits: { maxOldGenerationSizeMb: 128 },
		});
		const timer = setTimeout(() => {
			void worker.terminate();
			reject(new Error("PDF identity inspection timed out; no file was changed."));
		}, 3e4);
		worker.once("message", (result: PdfWorkerResult) => {
			clearTimeout(timer);
			void worker.terminate();
			if (result.error) reject(new Error(`PDF identity requires manual inspection: ${result.error}`));
			else resolve(result as PdfIdentity);
		});
		worker.once("error", () => {
			clearTimeout(timer);
			reject(new Error("PDF identity extractor unavailable; no identity claim was made."));
		});
		worker.once("exit", (code) => {
			clearTimeout(timer);
			if (code !== 0) reject(new Error("PDF identity worker stopped; no identity claim was made."));
		});
	});
}

export { readPdfIdentity };
