import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';
import { nichesApi } from '../../services/nichesApi';

export const exampleScript = {
  name: 'Plumbing demo invitation',
  agent_name: 'David',
  opening: 'Hi, this is David, an AI assistant calling for Jento AI. Am I speaking with the person who handles your customer calls?',
  engagement: 'We help plumbing businesses answer customer calls when the team is busy or after hours. How do you handle those calls today?',
  meeting: 'Would you have 10 minutes this week for a quick demo? You can hear how it handles a customer call. If they agree, collect their preferred day, time, timezone and email one at a time. Save their interest and requested details. Do not claim the meeting is booked.',
  objections: [
    { customer: 'We have a receptionist', answer: 'That makes sense. We could cover calls when they are busy or unavailable. Would you be open to a short demo?' },
    { customer: 'Not interested', answer: 'Save not_interested, say: No problem. Thanks for your time. Then end the call.' }
  ],
  information: 'Only if they request information, collect and confirm their email. Save the request for the team. Do not claim an email was sent.',
  instructions: 'Ask one question at a time. Listen fully. Keep replies short. Respect a refusal immediately. Save clear interest as interested and refusal as not_interested. Use mark_do_not_call for opt-out. Wait silently during hold and recording announcements; let the server handle voicemail and keypad menus. Never invent prices or capabilities.',
  goodbye: 'Thanks for your time. Have a good day.'
};
const EXAMPLE_JSON = JSON.stringify(exampleScript, null, 2);
const required = ['name','agent_name','opening','engagement','meeting','instructions','goodbye'];
export function parseScript(text: string) {
  let script: any;
  try { script = JSON.parse(text); } catch (e: any) { throw new Error(`Invalid JSON: ${e.message}. Use double quotes and check commas.`); }
  if (!script || Array.isArray(script) || typeof script !== 'object') throw new Error('The script must be one JSON object inside { }.');
  const allowed = new Set([...required,'objections','information']);
  for (const key of Object.keys(script)) if (!allowed.has(key)) throw new Error(`Unknown section "${key}". Use the keys shown in the example.`);
  for (const key of required) {
    if (typeof script[key] !== 'string' || !script[key].trim()) throw new Error(`"${key}" must contain non-empty text.`);
    if (script[key].length > (['name','agent_name'].includes(key) ? 100 : 2000)) throw new Error(`"${key}" is too long.`);
  }
  if (script.information !== undefined && (typeof script.information !== 'string' || script.information.length > 2000)) throw new Error('"information" must be text up to 2000 characters.');
  if (script.objections !== undefined) {
    if (!Array.isArray(script.objections) || script.objections.length > 30) throw new Error('"objections" must be an array with at most 30 entries.');
    script.objections.forEach((o: any, i: number) => {
      if (!o || typeof o !== 'object' || Array.isArray(o) || Object.keys(o).some(k => !['customer','answer'].includes(k)) || typeof o.customer !== 'string' || !o.customer.trim() || o.customer.length > 500 || typeof o.answer !== 'string' || !o.answer.trim() || o.answer.length > 2000) throw new Error(`Objection ${i+1} needs "customer" and "answer" text (limits: 500 / 2000 characters).`);
    });
  }
  return script;
}
export function scriptDefinition(script: any, nicheId: number | null) {
  const nodes: any[] = [];
  const edges: any[] = [];
  const add = (id: string, type: string, data: any = {}) => nodes.push({id,type,position:{x:200,y:nodes.length*140},data:{label:id,...data}});
  const link = (source: string,target: string,sourceHandle='default') => edges.push({id:`${source}_${sourceHandle}`,source,target,sourceHandle,kind:sourceHandle==='default'?'default':'condition'});
  add('start','start'); add('opening','opening',{text:script.opening,waitForReply:true});
  add('engagement','offer',{text:script.engagement});
  const path = ['start','opening','engagement'];
  if (script.objections?.length) { add('objections','objection_router',{cases:script.objections.map((o: any)=>({intent:o.customer,response:o.answer}))});path.push('objections'); }
  add('meeting','meeting_cta',{text:script.meeting,collectDate:true,collectTime:true});path.push('meeting');
  if (script.information?.trim()) {add('information','send_information',{text:script.information});path.push('information');}
  add('instructions','additional_instructions',{text:script.instructions});path.push('instructions');
  add('goodbye','goodbye',{text:script.goodbye});add('end','end');path.push('goodbye','end');
  for(let i=0;i<path.length-1;i++)link(path[i],path[i+1]);
  add('refusal','outcome_action',{outcome:'not_interested',note:'Prospect clearly refused the offer.'});link('refusal','goodbye');
  link('opening','refusal','refusal');link('engagement','refusal','not_interested');link('meeting','refusal','declined');
  if(script.objections?.length)link('objections','refusal','unresolved');
  return {schemaVersion:1,name:script.name,nicheId,settings:{agentDisplayName:script.agent_name,tone:'friendly and concise',meetingDuration:'10',maxSentencesPerTurn:2,maxObjectionAttempts:1},nodes,edges};
}

export default function JsonScriptEditor() {
  const {scriptId}=useParams(); const navigate=useNavigate();
  const [text,setText]=useState('');
  const [scriptName,setScriptName]=useState('');
  const [nicheId,setNicheId]=useState<number|null>(null);const [niches,setNiches]=useState<any[]>([]);
  const [loading,setLoading]=useState(Boolean(scriptId && scriptId!=='new'));const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');const [message,setMessage]=useState('');const [preview,setPreview]=useState('');
  const identity=useRef<{id?:string;draftId?:string;revision?:number}>({});const lock=useRef(false);
  useEffect(()=>{nichesApi.list().then(r=>setNiches(r.niches||[])).catch(()=>setError('Could not load niches. Reload to try again.'));},[]);
  useEffect(()=>{
    let alive=true;identity.current={};
    if(!scriptId || scriptId==='new'){setScriptName('');setText('');setLoading(false);return;}
    setLoading(true);
    api.get(`/multi-calling/scripts/${scriptId}`).then(r=>{
      if(!alive)return;const version=r.data.version;const d=version?.definition;
      if(!d)throw Error('No saved script definition found.');
      const nodes=d.nodes||[];const find=(type:string)=>nodes.filter((n:any)=>n.type===type);
      const value=(type:string)=>find(type).map((n:any)=>n.data?.text||n.data?.instructions||'').filter(Boolean).join('\n\n');
      const migrated={name:r.data.script.name,agent_name:d.settings?.agentDisplayName||'David',opening:value('opening'),engagement:value('offer'),meeting:value('meeting_cta'),objections:find('objection_router').flatMap((n:any)=>(n.data?.cases||[]).map((c:any)=>({customer:c.intent,answer:c.response}))),information:value('send_information'),instructions:value('additional_instructions')||exampleScript.instructions,goodbye:value('goodbye')};
      setScriptName(migrated.name||'');setText(JSON.stringify(migrated,null,2));setNicheId(d.nicheId||r.data.script.niche_id||null);
      identity.current={id:scriptId,draftId:version?.status==='draft'?version.id:undefined,revision:version?.draft_revision};
      const advanced=nodes.some((n:any)=>['pricing','followup','qualifying_questions'].includes(n.type));
      if(advanced)setMessage('Existing advanced sections are outside this format. Saving replaces the draft with the JSON sections shown here. Published calls change only after Publish.');
    }).catch(e=>{if(alive)setError(e.message||'Could not load script.');}).finally(()=>{if(alive)setLoading(false);});
    return()=>{alive=false;};
  },[scriptId]);
  const run=async(action:'preview'|'save'|'publish')=>{
    if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');
    try {
      if(!scriptName.trim())throw Error('Enter a script name before saving or publishing.');
      let input:any;try{input=JSON.parse(text);}catch{parseScript(text);}
      const script=parseScript(JSON.stringify(input && typeof input==='object' && !Array.isArray(input)?{...input,name:scriptName.trim()}:input));const definition=scriptDefinition(script,nicheId);
      const validated=await api.post('/multi-calling/scripts/validate',{definition});
      if(!validated.data.valid)throw Error((validated.data.errors||['Validation failed']).join('\n'));
      if(action==='preview'){setPreview(validated.data.prompt);setMessage('JSON and script checks passed.');return;}
      const old=identity.current;
      const res=old.id?await api.put(`/multi-calling/scripts/${old.id}`,{name:script.name,nicheId,definition,expectedDraftId:old.draftId,expectedRevision:old.revision}):await api.post('/multi-calling/scripts',{name:script.name,nicheId,definition});
      const id=old.id||res.data.scriptId;
      identity.current={id,draftId:res.data.draftId,revision:res.data.revision};
      if(action==='publish'){
        const published=await api.post(`/multi-calling/scripts/${id}/publish`,{expectedDraftId:res.data.draftId,expectedRevision:res.data.revision});
        identity.current={id,draftId:published.data.draftId,revision:published.data.revision};
      }
      if(scriptId==='new')navigate(`/multi-ai-calling/builder/${id}`,{replace:true});
      setMessage(action==='publish'?'Script published. Assigned lanes use it on their next call.':'Script saved as a draft. Publish when ready for calls.');
    }catch(e:any){setError((e.response?.data?.details||e.response?.data?.errors)?.join('\n')||e.response?.data?.error||e.message);}
    finally{lock.current=false;setBusy(false);}
  };
  if(loading)return <p className="p-6">Loading script…</p>;
  return <div className="max-w-5xl mx-auto p-5 space-y-4">
    <div className="flex justify-between"><h1 className="text-2xl font-bold">Script Writer — JSON</h1><button onClick={()=>navigate('/multi-ai-calling/scripts')}>Back</button></div>
    <div><label htmlFor="script-name" className="block font-semibold mb-2">Script name <span className="text-red-600">*</span></label><input id="script-name" required maxLength={100} disabled={busy} value={scriptName} placeholder="For example: Plumbing demo calls" onChange={e=>{const name=e.target.value;setScriptName(name);setError('');setPreview('');setMessage('');try{const json=JSON.parse(text);if(json && typeof json==='object' && !Array.isArray(json))setText(JSON.stringify({...json,name},null,2));}catch{}}} className="w-full border rounded px-3 py-2" /><p className="text-sm text-gray-500 mt-1">Required. This name appears in your saved scripts list.</p></div>
    <p>Copy the example, ask your AI to fill each section, then paste its JSON here. Keep the section names unchanged.</p>
    <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={async()=>{try{await navigator.clipboard.writeText(EXAMPLE_JSON);setError('');setMessage('Example copied.');}catch{setError('Copy failed. Allow clipboard access in your browser and try again.');}}} className="border rounded px-3 py-2">Copy Example</button><select aria-label="Niche" disabled={busy} value={nicheId||''} onChange={e=>setNicheId(e.target.value?Number(e.target.value):null)} className="border rounded px-3 py-2"><option value="">Choose niche</option>{niches.map(n=><option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
    <label className="block font-semibold" htmlFor="script-json">Your script JSON</label><textarea id="script-json" placeholder="Paste your script JSON here…" spellCheck={false} disabled={busy} value={text} onChange={e=>{setText(e.target.value);try{const json=JSON.parse(e.target.value);if(typeof json?.name==='string')setScriptName(json.name);}catch{}setError('');setPreview('');setMessage('');}} className="w-full min-h-[480px] font-mono text-sm bg-gray-950 text-gray-100 rounded-xl p-4" />
    {error&&<pre role="alert" className="bg-red-50 text-red-700 p-4 rounded whitespace-pre-wrap">{error}</pre>}{message&&<p role="status" className="bg-green-50 text-green-800 p-4 rounded">{message}</p>}
    <div className="flex gap-3">{(['preview','save','publish'] as const).map(action=><button key={action} disabled={busy||!scriptName.trim()} onClick={()=>run(action)} className="bg-teal-700 text-white px-5 py-2 rounded disabled:opacity-50">{action==='preview'?'Check & Preview':action==='save'?'Save Draft':'Save & Publish'}</button>)}</div>
    {preview&&<details open><summary>Compiled script preview</summary><pre className="p-4 bg-gray-100 whitespace-pre-wrap">{preview}</pre></details>}
  </div>;
}
