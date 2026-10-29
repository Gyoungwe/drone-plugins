import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { services } from "../../test/setup";
import { useKnowledgeOverview } from "./hooks";

afterEach(cleanup);
function Overview({cwd}:{cwd:string}) {
	const {data} = useKnowledgeOverview(cwd,"session");
	return <div>{data?.project ?? "loading"}</div>;
}
it("ignores a previous Vault's delayed result after context changes",async()=>{
	let finishA!: (value:unknown)=>void;
	let finishB!: (value:unknown)=>void;
	const a = new Promise(resolve=>{finishA=resolve;});
	const b = new Promise(resolve=>{finishB=resolve;});
	services.getKnowledgeOverview = (request)=> (request as {cwd:string}).cwd === "/a" ? a : b;
	const view=render(<Overview cwd="/a"/>);
	view.rerender(<Overview cwd="/b"/>);
	await act(async()=>finishB({project:"Project B"}));
	expect(screen.getByText("Project B")).toBeTruthy();
	await act(async()=>finishA({project:"Project A"}));
	expect(screen.queryByText("Project A")).toBeNull();
	expect(screen.getByText("Project B")).toBeTruthy();
});
