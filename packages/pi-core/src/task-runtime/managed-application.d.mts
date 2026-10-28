import type { PluginNativeSession, PluginNativeRuntimeInstance } from "@gyoungwe/plugin-api/native";
import type { PluginRuntimeFactoryContext } from "@gyoungwe/plugin-api/runtime";

/** Internal domain composition port, never serialized or exposed as caller-selected authority. */
interface ManagedTaskSession {
  readonly controller: {
    readonly journal: {
      plan(input: unknown): Promise<unknown>;
      begin(query: string, capabilities?: readonly string[], binding?: string | null): Promise<unknown>;
      requestReport(): Promise<unknown>;
    };
  };
}
export interface ManagedTaskApplication extends PluginNativeRuntimeInstance {
  createNativeSession(): PluginNativeSession;
  withCurrentSession<T>(signal: AbortSignal, operation: (session: ManagedTaskSession) => T | Promise<T>): Promise<T>;
}
export function createManagedTaskApplication(context: PluginRuntimeFactoryContext): ManagedTaskApplication;
