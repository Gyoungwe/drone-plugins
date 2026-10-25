import type { AnalysisNumericalComparatorPolicy } from "./analysis-contract.js";
import { scientificPlanHash } from "./canonical.js";

// Registered before candidate runs: changes require a new version and new frozen plans.
const contract = Object.freeze({
	keyColumns: Object.freeze(["feature_id"]),
	columns: Object.freeze([
		{ column: "baseMean", unit: "normalized-count", absoluteTolerance: 1e-8, relativeTolerance: 1e-8 },
		{ column: "log2FoldChange", unit: "log2-fold-change", absoluteTolerance: 1e-8, relativeTolerance: 1e-6 },
		{ column: "lfcSE", unit: "log2-fold-change-standard-error", absoluteTolerance: 1e-8, relativeTolerance: 1e-6 },
		{ column: "stat", unit: "Wald-statistic", absoluteTolerance: 1e-8, relativeTolerance: 1e-6 },
		{ column: "pvalue", unit: "probability", absoluteTolerance: 1e-12, relativeTolerance: 1e-6 },
		{ column: "padj", unit: "BH-adjusted-probability", absoluteTolerance: 1e-12, relativeTolerance: 1e-6 },
	].map((column) => Object.freeze(column))),
	endpoints: Object.freeze(["feature-key-set", "NA-locations", "frozen-design-and-method", "significant-feature-set", "significant-feature-direction"]),
});
export const DESEQ2_NUMERICAL_POLICY: AnalysisNumericalComparatorPolicy = Object.freeze({
	identity: Object.freeze({ id: "deseq2-wald-table", version: "1.0.0" }),
	sha256: scientificPlanHash(contract),
	contract,
});
