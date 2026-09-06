import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const index=await readFile(new URL("../../index.html",import.meta.url),"utf8");
const briefing=index.match(/function gca81ShowBriefing\(\)[\s\S]*?function gca81PawTexture/)?.[0]||"";

test("Mundo Guaraní 3D never starts its synthetic narrator automatically",()=>{
  assert.ok(briefing);
  assert.doesNotMatch(briefing,/setTimeout\(\(\)=>gca81Speak\(spoken\)/);
  assert.match(briefing,/Escuchar misión/);
  assert.match(briefing,/querySelector\("#gca81Repeat"\)\.onclick=\(\)=>gca81Speak\(spoken\)/);
  assert.match(index,/automaticSpokenMissionBriefing:false/);
  assert.match(index,/optionalSpokenMissionBriefing:true/);
});
