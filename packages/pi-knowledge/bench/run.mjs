import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { cpus, tmpdir, totalmem } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageVitest = join(packageDirectory, "node_modules", ".bin", "vitest");
const vitest = existsSync(packageVitest)
	? packageVitest
	: resolve(packageDirectory, "../../node_modules/.bin/vitest");
const usage =
	"Usage: npm run bench:semantic -- [--sizes N,N] [--dims N,N] [--queries N] [--repeat N] [--chunks-per-note N] [--seed N] [--out FILE]";

function positiveInteger(value, name) {
	if (!/^[1-9]\d*$/.test(value)) throw new Error(`${name} must be a positive integer`);
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a safe positive integer`);
	return parsed;
}

function integerList(value, name) {
	return value.split(",").map((part) => positiveInteger(part, name));
}

function parseArguments(argv) {
	const options = {
		sizes: [1000],
		dims: [384],
		queries: 20,
		repeat: 3,
		chunksPerNote: 4,
		seed: 1,
		out: join(tmpdir(), `pi-knowledge-semantic-bench-${Date.now()}.json`),
	};
	for (let index = 0; index < argv.length; index++) {
		const flag = argv[index];
		const value = argv[index + 1];
		if (!value || value.startsWith("--")) throw new Error(`Missing value for ${flag}`);
		if (flag === "--sizes") options.sizes = integerList(value, flag);
		else if (flag === "--dims") options.dims = integerList(value, flag);
		else if (flag === "--queries") options.queries = positiveInteger(value, flag);
		else if (flag === "--repeat") options.repeat = positiveInteger(value, flag);
		else if (flag === "--chunks-per-note") options.chunksPerNote = positiveInteger(value, flag);
		else if (flag === "--seed") options.seed = positiveInteger(value, flag);
		else if (flag === "--out") options.out = value;
		else throw new Error(`Unknown option: ${flag}`);
		index++;
	}
	return options;
}

function childEnvironment(options, size, dims, resultPath) {
	return {
		...process.env,
		PI_KNOWLEDGE_BENCH_SIZE: String(size),
		PI_KNOWLEDGE_BENCH_DIMS: String(dims),
		PI_KNOWLEDGE_BENCH_QUERIES: String(options.queries),
		PI_KNOWLEDGE_BENCH_REPEAT: String(options.repeat),
		PI_KNOWLEDGE_BENCH_CHUNKS_PER_NOTE: String(options.chunksPerNote),
		PI_KNOWLEDGE_BENCH_SEED: String(options.seed),
		PI_KNOWLEDGE_BENCH_RESULT: resultPath,
	};
}

async function runMatrix(options) {
	const startedAt = new Date().toISOString();
	const temporaryRoot = await mkdtemp(join(tmpdir(), "pi-knowledge-semantic-bench-"));
	const results = [];
	try {
		for (const size of options.sizes) {
			for (const dims of options.dims) {
				const resultPath = join(temporaryRoot, `result-${results.length}.json`);
				const child = spawnSync(vitest, ["run", "--config", "bench/vitest.bench.config.ts"], {
					cwd: packageDirectory,
					env: childEnvironment(options, size, dims, resultPath),
					stdio: "inherit",
				});
				if (child.error) throw child.error;
				if (child.status !== 0) return child.status ?? 1;
				results.push(JSON.parse(await readFile(resultPath, "utf8")));
			}
		}
		const report = {
			node: process.version,
			platform: process.platform,
			arch: process.arch,
			cpus: cpus().length,
			totalMemBytes: totalmem(),
			startedAt,
			args: options,
			results,
		};
		const contents = `${JSON.stringify(report, null, 2)}\n`;
		const outputPath = resolve(packageDirectory, options.out);
		await mkdir(dirname(outputPath), { recursive: true });
		await writeFile(outputPath, contents);
		process.stdout.write(contents);
		return 0;
	} finally {
		await rm(temporaryRoot, { recursive: true, force: true });
	}
}

try {
	const options = parseArguments(process.argv.slice(2));
	process.exitCode = await runMatrix(options);
} catch (error) {
	console.error(error instanceof Error ? error.message : String(error));
	console.error(usage);
	process.exitCode = 2;
}
