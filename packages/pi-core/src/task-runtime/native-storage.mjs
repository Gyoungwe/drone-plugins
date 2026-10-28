import { readFileSync } from "node:fs";

/** Pinned Pi 1.1.0 public JSONL boundary. This never opens a manager or creates/flushes a file. */
export function readNativeSessionStorage(manager) {
  const branch=manager.getBranch();
  const file=manager.getSessionFile();
  const mode=file?"persistent":"memory";
  const deferred=()=>({mode,state:"deferred",entries:branch,code:null});
  const failed=(code,entries=[])=>({mode,state:"needs-reopen",entries,code});
  if(!file) return deferred();
  let content;
  try {content=readFileSync(file,"utf8");}
  catch(error) {
    if(error.code==="ENOENT" && !branch.some(entry=>entry.type==="message" && ["user","assistant"].includes(entry.message.role))) return deferred();
    return failed(error.code==="ENOENT"?"SESSION_FILE_MISSING":"SESSION_FILE_UNREADABLE");
  }
  const rows=new Map();
  for(const [index,line] of content.split("\n").entries()) {
    if(!line.length) continue;
    let row;
    try {row=JSON.parse(line);}
    catch {return failed(`SESSION_JSONL_INVALID_LINE_${index+1}`);}
    if(!row || typeof row!=="object" || typeof row.id!=="string") return failed(`SESSION_JSONL_INVALID_LINE_${index+1}`);
    rows.set(row.id,row);
  }
  if(rows.get(manager.getSessionId())?.type!=="session") return failed("SESSION_FILE_IDENTITY_MISMATCH");
  const entries=[];
  for(const entry of branch) {
    const row=rows.get(entry.id);
    if(JSON.stringify(row)!==JSON.stringify(entry)) return failed("SESSION_BRANCH_NOT_PERSISTED",entries);
    entries.push(row);
  }
  return {mode,state:"durable",entries,code:null};
}
