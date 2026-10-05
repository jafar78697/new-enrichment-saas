import crypto from 'crypto';
import { ScriptDefinition, NodeDefinition, EdgeDefinition } from './script-schema.js';
import { validateScriptGraph } from './script-validator.js';
import { getHandleLabel } from './template-registry.js';

export function compileScript(script: ScriptDefinition): { prompt: string; hash: string } {
  const validation = validateScriptGraph(script);
  if (!validation.valid) {
    throw new Error(`Script graph validation failed:\n- ${validation.errors.join('\n- ')}`);
  }

  const startNode = script.nodes.find(n => n.type === 'start');
  if (!startNode) throw new Error("Missing start node");

  const nodeMap = new Map<string, NodeDefinition>();
  for (const n of script.nodes) {
    nodeMap.set(n.id, n);
  }

  const adjList = new Map<string, EdgeDefinition[]>();
  for (const edge of script.edges) {
    if (!adjList.has(edge.source)) adjList.set(edge.source, []);
    adjList.get(edge.source)!.push(edge);
  }

  const getNodeTitle = (node: NodeDefinition) => {
    switch (node.type) {
      case 'start': return 'Start Call';
      case 'opening': return 'Opening';
      case 'offer': return 'Core Offer';
      case 'qualifying_questions': return 'Qualifying Questions';
      case 'objection_router': return 'Objection Handling';
      case 'pricing': return 'Pricing';
      case 'meeting_cta': return 'Meeting CTA';
      case 'followup': return 'Follow-up Scheduling';
      case 'send_information': return 'Send Information';
      case 'additional_instructions': return 'Additional Instructions';
      case 'outcome_action': return `Outcome Action (${node.data?.outcome || 'called'})`;
      case 'goodbye': return 'Goodbye';
      case 'end': return 'End of Call';
      default: return node.data?.label || node.id;
    }
  };

  const getNodeText = (node: NodeDefinition) => (node.data?.text || node.data?.label || '').toString().trim();

  let prompt = `You are ${script.settings.agentDisplayName}, a professional AI phone agent.\n`;
  prompt += `Your tone should be ${script.settings.tone || 'professional, helpful, and concise'}.\n`;
  prompt += `CRITICAL POLICIES:\n`;
  prompt += `- Speak in short turns. No more than ${script.settings.maxSentencesPerTurn} sentences at a time.\n`;
  prompt += `- Do not interrupt a human speaking. Listen completely before speaking.\n`;
  prompt += `- If asked to hold or transferred to voicemail/IVR, follow system safeguards.\n\n`;

  // --- SECTION 1: ROUTING MAP ---
  prompt += `=== CONVERSATION ROUTING & BRANCH MAP ===\n`;
  for (const node of script.nodes) {
    if (node.type === 'start' || node.type === 'end') continue;
    const outgoing = adjList.get(node.id) || [];
    const title = getNodeTitle(node);
    prompt += `Step [${title}] (ID: ${node.id}):\n`;
    if (outgoing.length === 0) {
      prompt += `  -> End conversation.\n`;
    } else {
      outgoing.forEach(edge => {
        const tgt = nodeMap.get(edge.target);
        const tgtTitle = tgt ? getNodeTitle(tgt) : edge.target;
        const conditionLabel = getHandleLabel(node.type, edge.sourceHandle);
        prompt += `  - If ${conditionLabel} => Proceed to [${tgtTitle}] (ID: ${edge.target})\n`;
      });
    }
  }

  // --- SECTION 2: TOPOLOGICAL / REACHABILITY STEP DEFINITIONS ---
  prompt += `\n=== STEP-BY-STEP DIALOGUE & ACTIONS ===\n`;

  // Compute topological sort of nodes so steps appear in natural conversational order
  const inDegree = new Map<string, number>();
  for (const n of script.nodes) inDegree.set(n.id, 0);
  for (const edge of script.edges) {
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
  }

  const queue: string[] = [startNode.id];
  const sortedNodeIds: string[] = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const curr = queue.shift()!;
    if (processed.has(curr)) continue;
    processed.add(curr);
    sortedNodeIds.push(curr);

    const outgoing = adjList.get(curr) || [];
    for (const edge of outgoing) {
      const currentIn = (inDegree.get(edge.target) || 1) - 1;
      inDegree.set(edge.target, currentIn);
      if (currentIn <= 0 && !processed.has(edge.target)) {
        queue.push(edge.target);
      }
    }
  }

  // Add any remaining reachable nodes
  for (const n of script.nodes) {
    if (!processed.has(n.id)) {
      sortedNodeIds.push(n.id);
    }
  }

  // Render node dialogue and transitions
  for (const nodeId of sortedNodeIds) {
    const node = nodeMap.get(nodeId);
    if (!node || node.type === 'start' || node.type === 'end') continue;

    const title = getNodeTitle(node);
    const text = getNodeText(node);
    prompt += `\n[STEP: ${title} (ID: ${node.id})]\n`;

    switch (node.type) {
      case 'opening':
        prompt += `When the call starts and a human answers, say: "${text}"\n`;
        if (node.data?.waitForReply) {
          prompt += `Wait for the prospect's reply before continuing.\n`;
        }
        break;

      case 'offer':
        prompt += `Present the core offer: "${text}"\n`;
        break;

      case 'qualifying_questions':
        if (Array.isArray(node.data?.questions) && node.data.questions.length > 0) {
          prompt += `Ask the following questions one at a time. Listen carefully to each answer:\n`;
          node.data.questions.forEach((q: any, i: number) => {
            prompt += `  Q${i + 1}: "${q.text}"\n`;
          });
        } else if (text) {
          prompt += `${text}\n`;
        }
        break;

      case 'objection_router':
        if (Array.isArray(node.data?.cases) && node.data.cases.length > 0) {
          prompt += `Handle prospect objections and questions according to these guidelines:\n`;
          node.data.cases.forEach((c: any) => {
            prompt += `  - If objection matches "${c.intent}": Say "${c.response}".\n`;
          });
        } else if (text) {
          prompt += `${text}\n`;
        }
        break;

      case 'pricing':
        prompt += `Provide pricing details: "${node.data?.pricingText || text}"\n`;
        break;

      case 'send_information':
        prompt += `Say: "${text}"\n`;
        prompt += `You MUST call the "save_call_note" tool with outcome="interested" and include the prospect's confirmed email.\n`;
        break;

      case 'additional_instructions':
        prompt += `Instructions: ${node.data?.instructions || text}\n`;
        break;

      case 'meeting_cta':
        prompt += `Say: "${text}"\n`;
        if (node.data?.collectDate || node.data?.collectTime) {
          prompt += `You MUST confirm a specific date, time, and timezone before booking follow-up.\n`;
        }
        break;

      case 'followup':
        prompt += `Ask for date and time: "${node.data?.askDateText || text}" and "${node.data?.askTimeText || 'preferred time'}".\n`;
        prompt += `Confirm: "${node.data?.confirmationText || 'Thank you, confirmed.'}".\n`;
        prompt += `You MUST call the "save_call_note" tool with outcome="followup" with confirmed followup_at (ISO 8601 UTC) and followup_timezone.\n`;
        break;

      case 'outcome_action':
        const rawOutcome = (node.data?.outcome || 'called').toLowerCase();
        let toolCallInstruction = '';
        if (rawOutcome === 'dnc' || rawOutcome === 'do_not_call') {
          toolCallInstruction = `You MUST call the "mark_do_not_call" tool with reason="${node.data?.note || 'Prospect requested do not call'}" and then call "end_call".`;
        } else if (rawOutcome === 'meeting_booked' || rawOutcome === 'followup') {
          toolCallInstruction = `You MUST confirm an exact future date, time, and timezone with the prospect, then call the "save_call_note" tool with outcome="followup", followup_at="<confirmed ISO date/time>", followup_timezone="<confirmed timezone>", and note="${node.data?.note || 'Meeting / Follow-up scheduled'}".`;
        } else if (rawOutcome === 'not_interested') {
          toolCallInstruction = `You MUST call the "save_call_note" tool with outcome="not_interested" and note="${node.data?.note || 'Prospect not interested'}", then call "end_call".`;
        } else if (rawOutcome === 'interested') {
          toolCallInstruction = `You MUST call the "save_call_note" tool with outcome="interested" and note="${node.data?.note || 'Prospect expressed interest'}".`;
        } else {
          // 'called' or 'completed'
          toolCallInstruction = `You MUST call the "save_call_note" tool with outcome="called" and note="${node.data?.note || 'Call completed normally'}".`;
        }
        prompt += `${toolCallInstruction}\n`;
        break;

      case 'goodbye':
        prompt += `Conclude the conversation politely: "${node.data?.genericText || text || 'Thank you for your time. Have a great day.'}"\n`;
        prompt += `You MUST call the "end_call" tool to hang up.\n`;
        break;
    }

    // Explicit Next Steps / Transitions for this step
    const outgoing = adjList.get(node.id) || [];
    prompt += `TRANSITIONS FROM THIS STEP:\n`;
    if (outgoing.length === 0) {
      prompt += `  -> Conclude call.\n`;
    } else {
      outgoing.forEach(edge => {
        const tgt = nodeMap.get(edge.target);
        const tgtTitle = tgt ? getNodeTitle(tgt) : edge.target;
        const conditionLabel = getHandleLabel(node.type, edge.sourceHandle);
        prompt += `  * If ${conditionLabel} => Proceed to [${tgtTitle}] (ID: ${edge.target})\n`;
      });
    }
  }

  prompt += `\n=== PROTECTED SAFEGUARDS ===\n`;
  prompt += `If you hear "press 1" or keypad menu options, it is an IVR. Call the end_call tool immediately.\n`;
  prompt += `If you hear "please leave a message", it is a voicemail. Mark it and hang up.\n`;
  prompt += `If the user asks not to be called, call the "mark_do_not_call" tool.\n`;

  if (prompt.length > 18000) {
    throw new Error(
      `Compiled prompt length (${prompt.length} characters) exceeds the maximum limit of 18,000 characters.`
    );
  }

  const hash = crypto.createHash('sha256').update(prompt).digest('hex');
  return { prompt, hash };
}
