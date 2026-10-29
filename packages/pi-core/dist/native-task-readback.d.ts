import type { PiCoreContext } from "./index";
interface TaskJournal {
    scope(): string;
    snapshot(): {
        id: string;
    } | null;
    readRoots(): string[];
}
/** Native Pi reuses the current task's approved output scope for host readback.
 * Desktop's permission engine remains authoritative when it announces its runtime.
 * The event seam also supports pi-knowledge 0.2.1 / pi-research 0.2.0 journals,
 * whose configure method predates native readback options. */
export declare function registerNativeTaskReadback(pi: any, journal: TaskJournal, currentContext: () => PiCoreContext | undefined): void;
export {};
