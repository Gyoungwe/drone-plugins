/** Scientific/operational acceptance vocabulary comes from the installed extensions. */
export interface MilestoneAcceptanceCatalog {
    readonly kinds: readonly string[];
    readonly fields: Readonly<Record<string, readonly string[]>>;
}
export interface TaskMilestoneInput {
    readonly id: string;
    readonly title: string;
    readonly dependsOn?: readonly string[];
    readonly acceptance: Readonly<Record<string, unknown>> & {
        readonly kind: string;
    };
}
export interface TaskPlanMilestone {
    readonly id: string;
    readonly title: string;
    readonly dependsOn: readonly string[];
    readonly acceptance: Readonly<Record<string, unknown>>;
    readonly state: "pending";
    readonly evidence: null;
}
/** Normalize a model-authored plan before the host opens or mutates a task. */
export declare function normalizeTaskMilestones(input: readonly TaskMilestoneInput[], catalog: MilestoneAcceptanceCatalog): readonly TaskPlanMilestone[];
