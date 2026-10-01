import { spawnSync } from 'node:child_process';
import { readdirSync,readFileSync } from 'node:fs';
import { join } from 'node:path';
const marker='GRIMOIRE_BUILD_MARKER_NOT_A_CREDENTIAL';
const result=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{stdio:'inherit',env:{...process.env,GEMINI_API_KEY:marker,API_KEY:marker}});
if(result.status!==0) process.exit(result.status ?? 1);
function scan(dir) { for(const entry of readdirSync(dir,{withFileTypes:true})) {const path=join(dir,entry.name);if(entry.isDirectory())scan(path);else if(readFileSync(path).includes(marker))throw new Error(`Build injected environment marker: ${path}`);} }
scan('dist');console.log('Build check passed: no Gemini environment marker in dist.');
