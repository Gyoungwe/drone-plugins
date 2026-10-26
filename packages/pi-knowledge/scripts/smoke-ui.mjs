import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import vm from "node:vm";
import { build } from "esbuild";

const execFileAsync = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const smokeRoot = await mkdtemp(join(tmpdir(), "drone-desktop-ui-pack-"));
try {
	const packed = JSON.parse((await execFileAsync("npm", ["pack", "--json", "--ignore-scripts", "--pack-destination", smokeRoot], { cwd: root })).stdout)[0];
	const tarball = join(smokeRoot, packed.filename);
	await writeFile(join(smokeRoot,"package.json"), JSON.stringify({private:true,name:"knowledge-ui-clean-consumer",version:"0.0.0"}));
	await execFileAsync("npm", ["install","--ignore-scripts","--no-audit","--no-fund",tarball,resolve(root,"../../vendor/gyoungwe-plugin-api-1.2.0.tgz")],{cwd:smokeRoot,maxBuffer:4*1024*1024});
	const installed = join(smokeRoot,"node_modules/@gyoungwe/desktop-ui-pack");
	const manifest = JSON.parse(await readFile(join(installed,"ui/plugin.json"),"utf8"));
	assert.equal(manifest.version,"0.2.0");
	assert.deepEqual(manifest.contributions.map(c=>c.region),["panel.tab","knowledge.page","knowledge.surface","app.overlay"]);
	const result=await build({entryPoints:[join(installed,"ui",manifest.main)],bundle:true,write:false,format:"iife",globalName:"PluginUI",platform:"browser",plugins:[{name:"host-react",setup(b){
		b.onResolve({filter:/^react(?:\/jsx-runtime|-dom)?$/},a=>({path:a.path,namespace:"host"}));
		b.onLoad({filter:/.*/,namespace:"host"},a=>({contents:a.path==="react/jsx-runtime" ? "export const {jsx,jsxs,Fragment}=window.DroneUI.jsxRuntime" : a.path==="react-dom" ? "export const {createPortal}=window.DroneUI.ReactDOM" : "export const {createElement,useState,useEffect,useRef,useCallback,useMemo}=window.DroneUI.React",loader:"js"}));
	}}]});
	const element=(type,props,...children)=>({type,props,children});
	const context={window:{DroneUI:{React:{createElement:element},ReactDOM:{},jsxRuntime:{jsx:element,jsxs:element},components:{},hooks:{useLanguage:()=>"en"},helpers:{},stores:{},knowledge:{}}}};
	vm.runInNewContext(result.outputFiles[0].text,context,{timeout:5000});
	for(const contribution of manifest.contributions) assert.equal(typeof context.PluginUI[contribution.export],"function",contribution.export);
	assert.equal(context.PluginUI.ResearchStatusPanel().props["data-drone-ui-pack"],"research-status");
	assert.equal(context.PluginUI.KnowledgePage().props.className,"drone-knowledge-ui");
	const body=await readFile(join(installed,"ui/bundle.js"),"utf8");
	assert.ok(!body.includes("window.pi"));
	assert.ok(body.includes("drone-knowledge-ui"));
	console.log(JSON.stringify({package:"@gyoungwe/desktop-ui-pack",version:manifest.version,tarball:packed.filename,cleanInstall:true,exports:manifest.contributions.map(c=>c.export),hostReact:true,gui:"NOT_RUN"}));
} finally { await rm(smokeRoot,{recursive:true,force:true}); }
