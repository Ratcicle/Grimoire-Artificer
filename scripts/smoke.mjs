import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { existsSync } from 'node:fs';

// A fresh browser context has no access to the user's local reference library.
// Every non-local request is blocked before navigation, including auth/Firestore/CDN.
process.env.GEMINI_API_KEY = '';
process.env.API_KEY = '';
const server = await createServer({ server:{host:'127.0.0.1',port:4178,strictPort:true}, logLevel:'error' });
await server.listen();
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const executablePath = existsSync(edge) ? edge : existsSync(chrome) ? chrome : undefined;
const browser = await chromium.launch({headless:true,executablePath});
try {
  const context = await browser.newContext();
  const blocked=[];let modelCalls=0;
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/api/gemini/generate') {modelCalls++;return route.abort();}
    if (url.hostname !== '127.0.0.1') {blocked.push(url.hostname);return route.abort();}
    return route.continue();
  });
  const page = await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4178');
  await page.getByRole('button',{name:'Manifest Card'}).waitFor();
  if(await page.getByRole('button',{name:'API Key Connected'}).count()) throw new Error('False connected state');
  await page.getByRole('button',{name:/Artstyle Database/}).click();
  await page.getByText(/Art DNA database is empty/).waitFor();
  // Tiny synthetic PNG fixture, used only for local input preparation.
  await page.locator('input[type=file]').last().setInputFiles({name:'smoke.v1.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l9sAAAAASUVORK5CYII=','base64')});
  await page.getByRole('button',{name:'Analyze',exact:true}).waitFor();
  await page.getByRole('button',{name:'Grimoire',exact:true}).click();
  await page.getByRole('button',{name:/Artstyle Database/}).click();
  await page.getByRole('button',{name:'Analyze',exact:true}).waitFor();
  await page.getByRole('button',{name:'Dismiss finished'}).click();
  await page.getByRole('button',{name:'Analyze',exact:true}).waitFor();
  if(modelCalls!==0) throw new Error(`Unexpected model calls: ${modelCalls}`);
  if(errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({smoke:'passed',checks:['local key state','empty isolated library','PNG preparation','queue persists across tabs','dismiss preserves pending','zero model calls'],modelCalls,blockedExternalHosts:[...new Set(blocked)]},null,2));
} finally { await browser.close(); await server.close(); }
