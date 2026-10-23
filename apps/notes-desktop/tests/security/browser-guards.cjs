// Deterministic final-stage DNS rebinding: attacker.test resolves to loopback in real Chromium.
// No intercepted requests or simulated fetches. Uses only a fresh throwaway core.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
(async () => {
  assert.ok(process.env.PWNOTES_CORE_BIN, 'PWNOTES_CORE_BIN is required');
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-w3-security-browser-'));
  const db = path.join(data, 'notes.db');
  const core = spawn(process.env.PWNOTES_CORE_BIN, ['-db',db,'serve','--listen','127.0.0.1:0'], { stdio:'ignore' });
  let browser, malicious;
  try {
    const stateFile = path.join(data,'run/core.json');
    for(let i=0;!fs.existsSync(stateFile)&&i<100;i++) await new Promise(resolve=>setTimeout(resolve,100));
    const state = JSON.parse(fs.readFileSync(stateFile));
    assert.equal(state.dbPath,db);
    const call = async (service,method,body={}) => {
      const r=await fetch(`${state.endpoint}/notes.v1.${service}/${method}`,{method:'POST',headers:{Authorization:`Bearer ${state.token}`,'Content-Type':'application/json'},body:JSON.stringify(body)});
      assert.equal(r.status,200,`${service}/${method}`);return r.json();
    };
    await call('SettingsService','Set',{keys:['agents.mcpEnabled'],settings:{agentsMcpEnabled:true}});
    const health=await call('HealthService','Check');
    const port=health.mcp.port;
    const info=await call('AgentAccessService','GetInfo');
    assert.equal(info.mcpPort,port);
    const token=fs.readFileSync(path.join(data,'run/mcp-token'),'utf8').trim();
    const endpoint=`http://127.0.0.1:${port}/mcp`;
    const body=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'security-poc',version:'1'}}});
    // Positive control proves that this core and bearer are functional.
    const control=await fetch(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'},body});
    assert.equal(control.status,200);
    await control.text();
    // Server-side denial controls, including leaked bearer, separate Host from Origin.
    const probe = (headers) => new Promise((resolve,reject)=>{
      const r=http.request(endpoint,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream',...headers}},res=>{res.resume();res.on('end',()=>resolve(res.statusCode));});r.on('error',reject);r.end(body);
    });
    assert.equal(await probe({Host:`attacker.test:${port}`}),403);
    assert.equal(await probe({Origin:'http://attacker.test:8080'}),403);
    malicious=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Throwaway malicious page</title>');});
    await new Promise(resolve=>malicious.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({headless:true,args:['--no-proxy-server','--host-resolver-rules=MAP attacker.test 127.0.0.1']});
    const page=await browser.newPage();
    await page.goto(`http://attacker.test:${malicious.address().port}/`);
    const outcomes=await page.evaluate(async ({port,token,body,coreEndpoint})=>{
      const run=async (url,withBearer,mode='cors')=>{try{const r=await fetch(url,{method:'POST',mode,headers:withBearer?{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json, text/event-stream'}:{'Content-Type':'text/plain'},body});return {resolved:true,status:r.status,type:r.type};}catch{return {resolved:false};}};
      return {
        rebinding:await run(`http://attacker.test:${port}/mcp`,true),
        csrf:await run(`http://127.0.0.1:${port}/mcp`,false),
        leakedBearer:await run(`http://127.0.0.1:${port}/mcp`,true),
        connect:await run(`${coreEndpoint}/notes.v1.NoteService/Create`,false),
      };
    },{port,token,body,coreEndpoint:state.endpoint});
    for(const [name,result] of Object.entries(outcomes)) assert.equal(result.resolved,false,`${name} fetch unexpectedly succeeded`);
    console.log(JSON.stringify({data,positiveControl:200,hostDenial:403,originDenial:403,browser:outcomes}));
  } finally {
    if(browser) await browser.close();
    if(malicious) await new Promise(resolve=>malicious.close(resolve));
    core.kill('SIGTERM');
    await new Promise(resolve=>core.exitCode!==null?resolve():core.once('exit',resolve));
  }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
