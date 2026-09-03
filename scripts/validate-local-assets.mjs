import fs from "node:fs";
import path from "node:path";

const root=path.resolve(import.meta.dirname,"..");
const index=fs.readFileSync(path.join(root,"index.html"),"utf8");
const cssFiles=[
  "assets/css/nalvi-design-system.css",
  "assets/css/kuaa-activity-components.css"
];
const references=new Set();

for(const match of index.matchAll(/\bsrc=["']([^"']+)["']/g))references.add(match[1]);
for(const match of index.matchAll(/<link\b[^>]*\bhref=["']([^"']+)["'][^>]*>/g))references.add(match[1]);
for(const cssFile of cssFiles){
  const css=fs.readFileSync(path.join(root,cssFile),"utf8");
  for(const match of css.matchAll(/url\((?:["']?)([^"')]+)(?:["']?)\)/g))references.add(match[1]);
}

const skipped=[];
const checked=[];
const missing=[];
for(const rawReference of references){
  const reference=rawReference.trim();
  if(!reference||reference.includes("${")||reference.startsWith("#")||/^(?:https?:|data:|mailto:|tel:|javascript:)/i.test(reference)){
    skipped.push(reference);
    continue;
  }
  const clean=reference.split("?")[0].split("#")[0].replace(/^\//,"");
  if(!clean){skipped.push(reference);continue;}
  const candidate=path.resolve(root,clean);
  if(!candidate.startsWith(root+path.sep)){missing.push(reference);continue;}
  if(fs.existsSync(candidate))checked.push(reference);else missing.push(reference);
}

if(missing.length){
  console.error(JSON.stringify({status:"FAIL",missing,checked:checked.length,skipped:skipped.length},null,2));
  process.exitCode=1;
}else{
  console.log(JSON.stringify({status:"PASS",localAssetsChecked:checked.length,missing:0,skippedExternalOrInline:skipped.length},null,2));
}
