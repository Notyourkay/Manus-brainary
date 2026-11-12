import type { RunInput, ToolReceipt } from "./contracts.js";
import { runNode } from "./files.js";

export async function collectEvidence(directory: string): Promise<{
  input: RunInput | null;
  report: unknown;
  reportHash: string | null;
  receipts: ToolReceipt[];
}> {
  return JSON.parse(
    await runNode(`
import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
const directory=${JSON.stringify(directory)};
async function optional(name){try{return await readFile(directory+"/"+name,"utf8");}catch(error){if(error.code==="ENOENT")return null;throw error;}}
const reportText=await optional("report.json"), calls=await optional("tool-calls.jsonl"), inputText=await optional("input.json");
let report=null;
if(reportText!==null){try{report=JSON.parse(reportText);}catch{report={invalidJson:true};}}
console.log(JSON.stringify({input:inputText ? JSON.parse(inputText) : null,report,reportHash:reportText===null?null:createHash("sha256").update(reportText).digest("hex"),receipts:calls?calls.trim().split("\\n").filter(Boolean).map(line=>JSON.parse(line)):[]}));
`),
  );
}
