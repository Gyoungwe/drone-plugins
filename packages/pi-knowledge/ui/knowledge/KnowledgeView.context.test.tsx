import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { knowledge, pluginEntries, services, sessions, ui } from "../../test/setup";
import { KnowledgeView } from "./KnowledgeView";

vi.mock("./KnowledgeHome",()=>({KnowledgeHome:({cwd}:{cwd:string})=><div>Overview {cwd}</div>}));
vi.mock("./KnowledgePanel",()=>({KnowledgePanel:()=>null}));
vi.mock("./KnowledgeNetwork",()=>({KnowledgeNetwork:()=>null}));
vi.mock("./KnowledgeNoteViewer",()=>({KnowledgeNoteViewer:({path}:{path:string})=><div>Note {path}</div>}));
afterEach(cleanup);

it("keeps an explicitly opened note, then clears it when the active session changes",async()=>{
	sessions.setState({cwd:"/vault-a",activeSessionId:"session-a"});
	knowledge.setState({dialog:{cwd:"/vault-a",sessionId:"session-a",note:"a.md",noteRevision:1}});
	services.getKnowledgeOverview=async()=>({binding:null});
	render(<KnowledgeView/>);
	expect(screen.getByText("Note a.md")).toBeTruthy();
	await act(async()=>{sessions.setState({cwd:"/vault-b",activeSessionId:"session-b"});});
	expect(screen.queryByText("Note a.md")).toBeNull();
	expect(screen.getByText("Overview /vault-b")).toBeTruthy();
	expect(knowledge.getState().dialog).toEqual({cwd:"/vault-b",sessionId:"session-b",tab:"reviews"});
});


it("renders other knowledge tabs and returns to a built-in tab without recursive page lookup", async () => {
 sessions.setState({cwd:"/vault-a",activeSessionId:"session-a"});
 knowledge.setState({dialog:{cwd:"/vault-a",sessionId:"session-a",tab:"reviews"}});
 ui.setState({knowledgeTab:"overview"});
 services.getKnowledgeOverview=async()=>({binding:null});
 pluginEntries.push({id:"third-party",title:"Extra tab",pluginName:"scientific-extension"});
 render(<KnowledgeView/>);
 await act(async()=>undefined);
 fireEvent.click(screen.getByRole("tab",{name:"Extra tab"}));
 expect(screen.getByText("Plugin Extra tab")).toBeTruthy();
 fireEvent.click(screen.getByRole("tab",{name:"总览"}));
 expect(screen.queryByText("Plugin Extra tab")).toBeNull();
 expect(screen.getByText("Overview /vault-a")).toBeTruthy();
});
