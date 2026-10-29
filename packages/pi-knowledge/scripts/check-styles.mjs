import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const root = resolve(import.meta.dirname,"..");
const source=readFileSync(join(root,"ui/styles/generated.ts"),"utf8");
const css=JSON.parse(source.match(/export const knowledgeStyles = (.*);\n$/s)[1]);
const browser = process.env.DRONE_UI_TEST_BROWSER || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const dir=mkdtempSync(join(tmpdir(),"knowledge-css-browser-"));
const hostCss = process.env.DRONE_UI_TEST_HOST_CSS ? readFileSync(process.env.DRONE_UI_TEST_HOST_CSS,"utf8") : "";
const fixture=`<!doctype html><html><head><style>${hostCss}</style><style>
@layer theme,base,components,utilities;
:root{--color-ink:rgb(33,44,55);--color-border:rgb(188,199,210);--color-surface:rgb(247,248,249);--color-canvas:rgb(250,250,250);--color-ink-dim:rgb(77,88,99);--color-ink-faint:rgb(111,122,133);--color-hover:rgb(230,231,232);--color-border-strong:rgb(160,170,180);--shadow-dialog:0px 2px 4px rgb(0 0 0 / .3)}
[data-theme=dark]{--color-ink:rgb(221,222,223);--color-border:rgb(70,80,90);--color-surface:rgb(27,28,29)}
/* Host and plugin may use different Tailwind versions. A plugin must never redefine this registration. */
@property --tw-ring-offset-width{syntax:"<length>";inherits:false;initial-value:3px}
.host-market{display:grid;grid-template-columns:80px 90px;gap:12px;color:var(--color-ink);background:var(--color-surface);border:var(--tw-ring-offset-width) solid var(--color-border);padding:16px}
</style></head><body><section class=host-market id=market><article>One</article><article>Two</article></section>
<div class=drone-knowledge-ui><section class="knowledge-view"><input id=search class="border border-border bg-surface text-ink" value=Search><div id=list class="grid grid-cols-2 gap-3"><article>Note</article><article>Method</article></div><p id=text class=text-ink-dim>Details</p></section></div>
<pre id=result></pre><script>
const css=${JSON.stringify(css).replaceAll("</script","<\\/script")};
const snapshot=id=>{const s=getComputedStyle(document.getElementById(id));return {color:s.color,background:s.backgroundColor,borderColor:s.borderTopColor,borderWidth:s.borderTopWidth,display:s.display,grid:s.gridTemplateColumns,gap:s.gap,padding:s.padding}};
const result={};
for(const theme of ['light','dark']){
 document.documentElement.dataset.theme=theme;
 const before=snapshot('market');
 const style=document.createElement('style');style.textContent=css;document.head.append(style);
 const after=snapshot('market');const search=snapshot('search');const list=snapshot('list');const text=snapshot('text');
 style.remove();const removed=snapshot('market');
 result[theme]={before,after,removed,search,list,text};
}
document.getElementById('result').textContent=JSON.stringify(result);
</script></body></html>`;
try {
	const page=join(dir,"fixture.html");writeFileSync(page,fixture);
	const html=execFileSync(browser,["--headless=new","--no-first-run","--disable-extensions","--disable-background-networking",`--user-data-dir=${join(dir,"profile")}`,"--dump-dom",pathToFileURL(page).href],{encoding:"utf8",maxBuffer:4*1024*1024,timeout:30000,stdio:["ignore","pipe","pipe"]});
	const result=JSON.parse(html.match(/<pre id="result">([\s\S]*?)<\/pre>/)[1]);
	for(const theme of ['light','dark']){
		const r=result[theme];
		assert.deepEqual(r.after,r.before,`${theme}: enabling the knowledge UI changed host layout/colors`);
		assert.deepEqual(r.removed,r.before,`${theme}: disabling the knowledge UI changed host layout/colors`);
		assert.equal(r.search.color,theme==='light'?'rgb(33, 44, 55)':'rgb(221, 222, 223)',`${theme}: plugin must inherit host ink`);
		assert.equal(r.search.borderColor,theme==='light'?'rgb(188, 199, 210)':'rgb(70, 80, 90)',`${theme}: plugin must inherit host border`);
		assert.equal(r.search.background,theme==='light'?'rgb(247, 248, 249)':'rgb(27, 28, 29)',`${theme}: plugin must inherit host surface`);
		assert.equal(r.list.display,"grid");assert.equal(r.list.gap,"12px");
		assert.equal(r.text.color,"rgb(77, 88, 99)");
	}
	console.log(JSON.stringify({status:"PASS",browser:"isolated headless Chromium",hostStyles:process.env.DRONE_UI_TEST_HOST_CSS?"provided compiled CSS":"contract fixture",themes:result}));
} finally {rmSync(dir,{recursive:true,force:true});}
