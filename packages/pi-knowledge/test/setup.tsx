import type { PluginUiRuntimeClient } from "@gyoungwe/plugin-api/ui";
import React, { useEffect, useSyncExternalStore } from "react";
import * as ReactDOM from "react-dom";
import { beforeEach } from "vitest";

/** Test-only host implementing the public UI contract, with no private host imports. */
export const pluginEntries: Array<{id:string;title:string;pluginName:string}> = [];
let pluginRuntime: PluginUiRuntimeClient | undefined;
export function setPluginRuntime(runtime: PluginUiRuntimeClient | undefined) { pluginRuntime = runtime; }

export const services: Record<string, (...args: unknown[]) => unknown> = {};
export function fixtureStore(initial: Record<string, unknown>) {
	let state = initial;
	const listeners = new Set<() => void>();
	return Object.assign((selector: (s: typeof state) => unknown) => useSyncExternalStore(
		(listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
		() => selector(state),
	), { getState: () => state, setState: (patch: typeof state) => { state = { ...state, ...patch }; for (const f of listeners) f(); } });
}
export const knowledge = fixtureStore({ revision: 0, dialog: null, review: null, reviewQueue: [], notice: null, open: () => undefined });
export const sessions = fixtureStore({ activeSessionId: null, cwd: "/p", sessions: [] });
export const settings = fixtureStore({ modelPrefs: null });
export const ui = fixtureStore({ knowledgeTab: "overview", setKnowledgeTab: (knowledgeTab: string) => ui.setState({ knowledgeTab }) });
knowledge.setState({ open: (dialog: unknown) => knowledge.setState({ dialog }), close: () => knowledge.setState({ dialog: null }) });
function ActionSurface({children, onEscape, ariaLabel, contentRef}: React.PropsWithChildren<{onEscape?:()=>void;ariaLabel:string;contentRef:React.Ref<HTMLDivElement>}>) {
	useEffect(()=>{const handle=(e:KeyboardEvent)=>{if(e.key==="Escape")onEscape?.();};document.addEventListener("keydown",handle);return()=>document.removeEventListener("keydown",handle);},[onEscape]);
	return <div role="dialog" aria-label={ariaLabel} ref={contentRef}>{children}</div>;
}
function Button({children, variant:_variant, size:_size, ...props}: React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?:string;size?:string}) {return <button {...props}>{children}</button>;}
Object.assign(window, { DroneUI: {
	React, ReactDOM, knowledge: services,
	components: { Button, ActionSurface, PluginEntryHost: ({entry}: {entry:{title:string}})=><div>Plugin {entry.title}</div>, PageHeader: ({title,tabs}: {title:string;tabs:React.ReactNode})=><header>{title}{tabs}</header>, StatePanel: ({children}:React.PropsWithChildren)=><div>{children}</div> },
	hooks: { usePluginRuntime: () => { if (!pluginRuntime) throw new Error("Plugin runtime is unavailable for this UI module"); return pluginRuntime; }, useLanguage:()=>"zh", useT:()=> (key:string)=>key, usePluginEntries:()=>pluginEntries },
	helpers: { isDraftSessionId: (id: string | null) => id?.startsWith("draft:") ?? false, taskArtifactLinks: (task:{milestones:Array<{state:string;evidence?:{kind:string;path:string}}>})=>task.milestones.filter(m=>m.state==="completed" && m.evidence?.kind==="file-observed").map(m=>({path:m.evidence!.path,state:"observed"})), pushToast:()=>undefined },
	stores: { useKnowledgeStore: knowledge, useSessionsStore:sessions, useSettingsStore:settings, useUiStore:ui },
} });
beforeEach(()=>{pluginRuntime = undefined;pluginEntries.splice(0);for(const key of Object.keys(services)) delete services[key];});
