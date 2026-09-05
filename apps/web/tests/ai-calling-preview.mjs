// Local-only UI fixture. Real API methods and sockets are replaced before render.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const { build } = require(require.resolve('esbuild', { paths: [require.resolve('vite')] }));
const result = await build({
  stdin: { resolveDir: root, loader: 'tsx', contents: `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { MemoryRouter } from 'react-router-dom';
    import AgentPipeline from './src/pages/AgentPipeline';
    import { leadsApi } from './src/services/crmApi';
    import { callsApi } from './src/services/callsApi';
    import { nichesApi } from './src/services/nichesApi';
    import { deepgramAgentsApi } from './src/services/deepgramAgentsApi';
    const contacts = [
      {id:1,name:'Sample Toronto Salon',company:'Sample Toronto Salon and Colour Studio',phone_number:'+14165550123',ai_voice_consent:true},
      {id:2,name:'Sample Seattle Salon',company:'Sample Seattle Salon',phone_number:'+12065550123',ai_voice_consent:true},
      {id:3,name:'Sample Consent Required',company:'Sample Consent Required',phone_number:'+12125550123',ai_voice_consent:false},
      {id:4,name:'Sample Do Not Call',company:'Sample Do Not Call',phone_number:'+16045550123',ai_voice_consent:true,do_not_call:true},
      {id:5,name:'Sample UK Excluded',company:'Sample UK Excluded',phone_number:'+442079460123',ai_voice_consent:true}
    ];
    let leads = [], running = false;
    if(location.pathname === '/active'){
      running=true;
      leads=[{id:'lead-1',company_name:contacts[0].company,domain:'example.test',primary_phone:contacts[0].phone_number,assigned_to_ai:true,lead_stage:'calling',last_contacted_at:new Date().toISOString(),raw_data:{source_contact_id:'1',niche_id:1}}];
    }
    let settings = {callsPerMinute:1,maxCallsPerDay:5,maxMinutesPerDay:10,maxCostUsdPerDay:1,callingTimezone:'America/New_York',callingWindowStartHour:9,callingWindowEndHour:17};
    const status = () => ({isRunning:running,queueCount:leads.filter(l=>l.lead_stage==='assigned').length,
      activeCallSid:running?'fixture-call-1':null,activeLeadId:running?leads[0]?.id:null,
      nextLead:leads.find(l=>l.lead_stage==='assigned')||null,lastCall:null,recentActivity:[],
      settings,serverCaps:{...settings,callsPerMinute:3},usageToday:{attempts:0,seconds:0,costUsd:0},
      withinCallingWindow:true,stageCounts:{assigned:leads.filter(l=>l.lead_stage==='assigned').length,calling:running?1:0}});
    Object.assign(nichesApi,{list:async()=>({niches:[{id:1,name:'Salon fixture',contact_count:5}]})});
    Object.assign(callsApi,{listContactsByNiche:async()=>({contacts})});
    Object.assign(deepgramAgentsApi,{
      list:async()=>({agents:[{id:'fixture-agent',name:'Sample Salon Outbound Agent',mode:'outbound',isActive:true}]}),
      status:async()=>({enabled:true,deepgramConfigured:true,outboundEnabled:true,dailyOutboundCallLimit:5})
    });
    Object.assign(leadsApi,{
      list:async()=>({leads:[...leads]}),activeCalls:async()=>({activeCalls:running?{[leads[0].id]:'fixture-call-1'}:{}}),callingStatus:async()=>status(),
      updateCallingSettings:async(input)=>({settings:settings=input}),
      setVoiceConsent:async(id)=>{contacts.find(c=>c.id===id).ai_voice_consent=true;return {ok:true};},
      queueAi:async(input)=>{for(const id of input.contact_ids){const c=contacts.find(c=>c.id===id);if(!c.ai_voice_consent||c.do_not_call)throw Error('Unsafe fixture assignment');leads.push({id:'lead-'+id,company_name:c.company,domain:'example.test',primary_phone:c.phone_number,assigned_to_ai:true,lead_stage:'assigned',raw_data:{source_contact_id:String(id),niche_id:1}});}return {totalQueued:input.contact_ids.length,invalidRegionCount:0,consentRequiredCount:0,blockedCount:0};},
      startCalling:async()=>{running=true;leads[0].lead_stage='calling';return{ok:true};},
      stopCalling:async()=>{running=false;return{ok:true,stoppedCalls:1};},
      skipActiveCall:async()=>{running=false;leads[0].lead_stage='no_answer';return{ok:true};}
    });
    createRoot(document.getElementById('root')).render(<MemoryRouter><main style={{padding:24,minWidth:0}}><AgentPipeline/></main></MemoryRouter>);
  ` },
  bundle: true, write: false, format: 'esm', jsx: 'automatic',
  define: { 'import.meta.env': '{}', 'process.env.NODE_ENV': '"development"' },
  plugins: [{name:'fixture-socket',setup(build){
    build.onResolve({filter:/^socket.io-client$/},()=>({path:'socket',namespace:'fixture'}));
    build.onLoad({filter:/.*/,namespace:'fixture'},()=>({loader:'js',contents:`
      export function io(){
        const handlers={},timers=[];let closed=false;
        const fire=(name,data)=>{if(!closed)handlers[name]?.(data)};
        const later=(fn,ms)=>timers.push(setTimeout(fn,ms));
        const socket={on:(name,fn)=>{handlers[name]=fn;return socket},
          emit:(name,data)=>{if(name==='subscribe_call'){
            later(()=>fire('monitor_subscribed',data),20);
            later(()=>fire('call_status',{...data,status:'in-progress'}),30);
            later(()=>fire('live_transcript',{...data,speaker:'prospect',text:'Hello, this is the sample salon.',timestamp:new Date().toISOString()}),40);
            later(()=>fire('live_transcript',{...data,speaker:'ai',text:'Hi, I am an AI assistant. Is this a good time for a brief conversation?',timestamp:new Date().toISOString()}),60);
            const pcm=new Int16Array(160).fill(0);const audio=btoa(String.fromCharCode(...new Uint8Array(pcm.buffer)));
            later(()=>fire('live_audio',{...data,speaker:'prospect',audio}),80);
            later(()=>fire('live_audio',{...data,speaker:'ai',audio}),85);
          }return socket},
          disconnect:()=>{closed=true;timers.forEach(clearTimeout);handlers.disconnect?.();return socket},
          connect:()=>{closed=false;later(()=>fire('connect'),10);return socket}};
        return socket.connect();
      }
    `}));
  }}],
});
const js = result.outputFiles[0].contents;
const html = await readFile(path.join(root,'dist/index.html'),'utf8');
const cssPath = html.match(/href="(\/assets\/[^" ]+\.css)"/)?.[1];
if (!cssPath) throw new Error('Build the frontend before running the fixture.');
const css = await readFile(path.join(root,'dist',cssPath));
const server = http.createServer((req,res)=>{
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:");
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(js);}
  else if(req.url==='/fixture.css'){res.setHeader('Content-Type','text/css');res.end(css);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Calling - local fixture only</title><link rel="stylesheet" href="/fixture.css"></head><body style="margin:0;background:#f8fafc"><div id="root"></div><script type="module" src="/fixture.js"></script></body></html>');}
});
server.listen(Number(process.env.PORT||4178),'127.0.0.1',()=>console.log('Local fixture: http://127.0.0.1:'+server.address().port));
