import { ScriptDefinition, NodeDefinition, EdgeDefinition } from './script-schema.js';
import {
  ALLOWED_TEMPLATE_VARS,
  TEMPLATE_VAR_REGEX,
  isDeclaredHandle,
  getHandleSemantic,
  NODE_DECLARED_HANDLES,
  normalizeHandle
} from './template-registry.js';

export interface ValidationIssue {
  nodeId?: string;
  field?: string;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  issues: ValidationIssue[];
}

export const ALLOWED_OUTCOMES = [
  'called',
  'interested',
  'not_interested',
  'followup',
  'meeting_booked',
  'dnc',
  'completed'
];

export { ALLOWED_TEMPLATE_VARS };

export function validateScriptGraph(script: ScriptDefinition): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const issues: ValidationIssue[] = [];

  const addError = (message: string, code: string, nodeId?: string, field?: string) => {
    errors.push(message);
    issues.push({ nodeId, field, code, message });
  };

  const addWarning = (message: string, code: string, nodeId?: string, field?: string) => {
    warnings.push(message);
  };

  if (!script) {
    addError('Script definition is missing or null.', 'MISSING_SCRIPT');
    return { valid: false, errors, warnings, issues };
  }

  const nodes = script.nodes || [];
  // Normalize edges immediately
  const nodeTypeMap = new Map(nodes.map(n => [n.id, n.type]));
  const edges = (script.edges || []).map(e => ({
    ...e,
    sourceHandle: normalizeHandle(nodeTypeMap.get(e.source) || 'node', e.sourceHandle)
  }));

  if (!Array.isArray(nodes) || nodes.length === 0) {
    addError('Script must contain at least one node.', 'EMPTY_NODES');
    return { valid: false, errors, warnings, issues };
  }

  // Maximum 25 editable nodes (excluding start and end)
  const editableNodes = nodes.filter(n => n.type !== 'start' && n.type !== 'end');
  if (editableNodes.length > 25) {
    addError(
      `Script exceeds maximum limit of 25 editable nodes (found ${editableNodes.length}).`,
      'MAX_NODES_EXCEEDED'
    );
  }

  // 1. Duplicate Node IDs & Node Map
  const nodeMap = new Map<string, NodeDefinition>();
  const duplicateNodeIds = new Set<string>();

  for (const node of nodes) {
    if (!node.id || typeof node.id !== 'string') {
      addError('All nodes must have a valid string ID.', 'INVALID_NODE_ID', node.id);
      continue;
    }
    if (nodeMap.has(node.id)) {
      duplicateNodeIds.add(node.id);
    } else {
      nodeMap.set(node.id, node);
    }
  }

  if (duplicateNodeIds.size > 0) {
    duplicateNodeIds.forEach(id => {
      addError(`Duplicate node ID found: "${id}".`, 'DUPLICATE_NODE_ID', id);
    });
  }

  // 2. Start, Opening, End Contract
  const startNodes = nodes.filter(n => n.type === 'start');
  if (startNodes.length === 0) {
    addError('Script must have exactly one Start Node.', 'MISSING_START_NODE');
  } else if (startNodes.length > 1) {
    startNodes.forEach(n => addError(`Multiple Start nodes found: "${n.id}".`, 'MULTIPLE_START_NODES', n.id));
  }

  const openingNodes = nodes.filter(n => n.type === 'opening');
  if (openingNodes.length === 0) {
    addError('Script must have exactly one Opening Node.', 'MISSING_OPENING_NODE');
  } else if (openingNodes.length > 1) {
    openingNodes.forEach(n => addError(`Multiple Opening nodes found: "${n.id}".`, 'MULTIPLE_OPENING_NODES', n.id));
  }

  const endNodes = nodes.filter(n => n.type === 'end');
  if (endNodes.length === 0) {
    addError('Script must have exactly one End Node.', 'MISSING_END_NODE');
  } else if (endNodes.length > 1) {
    endNodes.forEach(n => addError(`Multiple End nodes found: "${n.id}".`, 'MULTIPLE_END_NODES', n.id));
  }

  const startNode = startNodes[0];
  const openingNode = openingNodes[0];
  const endNode = endNodes[0];

  // 3. Edges Integrity & Handle Checking
  const edgeMap = new Map<string, EdgeDefinition>();
  const duplicateEdgeIds = new Set<string>();
  const handleOutgoingCount = new Map<string, number>();
  const nodeOutgoingEdges = new Map<string, EdgeDefinition[]>();

  for (const edge of edges) {
    if (!edge.id) {
      addError('Edge is missing an ID.', 'MISSING_EDGE_ID');
      continue;
    }

    if (edgeMap.has(edge.id)) {
      duplicateEdgeIds.add(edge.id);
    } else {
      edgeMap.set(edge.id, edge);
    }

    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);

    if (!srcNode) {
      addError(`Edge "${edge.id}" references non-existent source node "${edge.source}".`, 'BAD_EDGE_SOURCE');
    }
    if (!tgtNode) {
      addError(`Edge "${edge.id}" references non-existent target node "${edge.target}".`, 'BAD_EDGE_TARGET');
    }

    if (edge.source === edge.target) {
      addError(`Edge "${edge.id}" forms an invalid self-loop on node "${edge.source}".`, 'SELF_LOOP', edge.source);
    }

    // Check declared handle validity on source node
    if (srcNode) {
      if (!isDeclaredHandle(srcNode.type, edge.sourceHandle)) {
        addError(
          `Node "${edge.source}" (${srcNode.type}) does not declare output handle "${edge.sourceHandle || 'default'}".`,
          'UNDECLARED_HANDLE',
          edge.source
        );
      }
    }

    // Single edge per source handle
    const handleKey = `${edge.source}:${edge.sourceHandle || 'default'}`;
    const currentCount = handleOutgoingCount.get(handleKey) || 0;
    if (currentCount >= 1) {
      addError(
        `Node "${edge.source}" has multiple outgoing connections on handle "${edge.sourceHandle || 'default'}".`,
        'MULTIPLE_EDGES_ON_HANDLE',
        edge.source
      );
    }
    handleOutgoingCount.set(handleKey, currentCount + 1);

    if (!nodeOutgoingEdges.has(edge.source)) {
      nodeOutgoingEdges.set(edge.source, []);
    }
    nodeOutgoingEdges.get(edge.source)!.push(edge);
  }

  if (duplicateEdgeIds.size > 0) {
    duplicateEdgeIds.forEach(id => {
      addError(`Duplicate edge ID found: "${id}".`, 'DUPLICATE_EDGE_ID');
    });
  }

  // 4. Start & End connection constraints
  if (startNode) {
    const hasIncomingToStart = edges.some(e => e.target === startNode.id);
    if (hasIncomingToStart) {
      addError('Start Node cannot have incoming connections.', 'START_HAS_INCOMING', startNode.id);
    }

    // Expected route: Start must connect directly to Opening
    if (openingNode) {
      const connectsStartToOpening = edges.some(e => e.source === startNode.id && e.target === openingNode.id);
      if (!connectsStartToOpening) {
        addError(
          `Start Node must connect directly to the Opening Node ("${openingNode.id}").`,
          'START_NOT_CONNECTED_TO_OPENING',
          startNode.id
        );
      }
    }
  }

  if (endNode) {
    const hasOutgoingFromEnd = edges.some(e => e.source === endNode.id);
    if (hasOutgoingFromEnd) {
      addError(`End Node "${endNode.id}" cannot have outgoing connections.`, 'END_HAS_OUTGOING', endNode.id);
    }
  }

  // 5. Template Variables & Content Validation
  const checkTemplateVariables = (str: string, nodeId: string, field: string) => {
    if (!str || typeof str !== 'string') return;
    const regex = new RegExp(TEMPLATE_VAR_REGEX.source, 'g');
    let match: RegExpExecArray | null;
    while ((match = regex.exec(str)) !== null) {
      const varName = match[1].trim().toLowerCase();
      if (!ALLOWED_TEMPLATE_VARS.includes(varName as any)) {
        addError(
          `Unsupported template variable "{{${match[1]}}}" in node "${nodeId}". Allowed variables: ${ALLOWED_TEMPLATE_VARS.join(', ')}`,
          'INVALID_TEMPLATE_VARIABLE',
          nodeId,
          field
        );
      }
    }
  };

  for (const node of nodes) {
    if (node.type === 'start' || node.type === 'end') continue;

    const data = node.data || {};
    const textContent = (data.text || '').toString().trim();

    if (textContent) {
      checkTemplateVariables(textContent, node.id, 'text');
    }
    if (data.pricingText) {
      checkTemplateVariables(data.pricingText.toString(), node.id, 'pricingText');
    }
    if (data.instructions) {
      checkTemplateVariables(data.instructions.toString(), node.id, 'instructions');
    }
    if (data.genericText) {
      checkTemplateVariables(data.genericText.toString(), node.id, 'genericText');
    }
    if (data.askDateText) {
      checkTemplateVariables(data.askDateText.toString(), node.id, 'askDateText');
    }
    if (data.askTimeText) {
      checkTemplateVariables(data.askTimeText.toString(), node.id, 'askTimeText');
    }
    if (data.confirmationText) {
      checkTemplateVariables(data.confirmationText.toString(), node.id, 'confirmationText');
    }
    if (data.note) {
      checkTemplateVariables(data.note.toString(), node.id, 'note');
    }

    switch (node.type) {
      case 'opening':
      case 'offer':
      case 'meeting_cta':
      case 'send_information':
      case 'goodbye':
        if (!textContent) {
          addError(`Node "${node.id}" (${node.type}) is missing script text content.`, 'MISSING_TEXT', node.id, 'text');
        } else if (textContent.length > 2000) {
          addError(`Node "${node.id}" text exceeds maximum limit of 2000 characters.`, 'TEXT_TOO_LONG', node.id, 'text');
        }
        break;

      case 'pricing':
        const pricingText = (data.pricingText || textContent).toString().trim();
        if (!pricingText) {
          addError(`Pricing Node "${node.id}" is missing pricing text content.`, 'MISSING_PRICING_TEXT', node.id, 'pricingText');
        }
        break;

      case 'additional_instructions':
        const instructions = (data.instructions || textContent).toString().trim();
        if (!instructions) {
          addError(`Instructions Node "${node.id}" is missing instruction details.`, 'MISSING_INSTRUCTIONS', node.id, 'instructions');
        }
        break;

      case 'followup':
        const askDateText = (data.askDateText || textContent).toString().trim();
        if (!askDateText) {
          addError(`Follow-up Node "${node.id}" is missing date/time question text.`, 'MISSING_FOLLOWUP_TEXT', node.id, 'askDateText');
        }
        break;

      case 'qualifying_questions':
        if (Array.isArray(data.questions) && data.questions.length > 0) {
          data.questions.forEach((q: any, i: number) => {
            const qText = (q?.text || '').toString().trim();
            if (!qText) {
              addError(`Qualifying Questions Node "${node.id}" question #${i + 1} is empty.`, 'EMPTY_QUESTION', node.id, 'questions');
            } else {
              checkTemplateVariables(qText, node.id, `questions[${i}]`);
            }
          });
        } else if (!textContent) {
          addError(
            `Qualifying Questions Node "${node.id}" must have either questions or text instructions.`,
            'MISSING_QUALIFYING_QUESTIONS',
            node.id,
            'questions'
          );
        }
        break;

      case 'objection_router':
        if (Array.isArray(data.cases) && data.cases.length > 0) {
          data.cases.forEach((c: any, i: number) => {
            const intent = (c?.intent || '').toString().trim();
            const resp = (c?.response || '').toString().trim();
            if (!intent || !resp) {
              addError(
                `Objection Router Node "${node.id}" case #${i + 1} is incomplete (intent and response required).`,
                'INCOMPLETE_OBJECTION_CASE',
                node.id,
                'cases'
              );
            } else {
              checkTemplateVariables(intent, node.id, `cases[${i}].intent`);
              checkTemplateVariables(resp, node.id, `cases[${i}].response`);
            }
          });
        } else if (!textContent) {
          addError(
            `Objection Router Node "${node.id}" must have either objection cases or text instructions.`,
            'MISSING_OBJECTION_CASES',
            node.id,
            'cases'
          );
        }
        break;

      case 'outcome_action':
        if (!data.outcome) {
          addError(
            `Outcome Action Node "${node.id}" must specify an explicit outcome (${ALLOWED_OUTCOMES.join(', ')}).`,
            'MISSING_OUTCOME',
            node.id,
            'outcome'
          );
        } else if (!ALLOWED_OUTCOMES.includes(data.outcome)) {
          addError(
            `Outcome Action Node "${node.id}" has invalid outcome "${data.outcome}". Allowed: ${ALLOWED_OUTCOMES.join(', ')}`,
            'INVALID_OUTCOME',
            node.id,
            'outcome'
          );
        }
        break;

      default:
        if (!textContent) {
          addWarning(`Node "${node.id}" (${node.type}) has no text label or script.`, 'EMPTY_GENERIC_NODE', node.id);
        }
    }
  }

  // 6. Cycle Detection (DAG enforcement)
  const adjForward = new Map<string, string[]>();
  for (const edge of edges) {
    if (!adjForward.has(edge.source)) adjForward.set(edge.source, []);
    adjForward.get(edge.source)!.push(edge.target);
  }

  // Status: 0 = unvisited (white), 1 = visiting (gray), 2 = visited (black)
  const visitStatus = new Map<string, number>();
  const parentMap = new Map<string, string>();

  const dfsCycle = (curr: string, path: string[]) => {
    visitStatus.set(curr, 1);
    path.push(curr);

    const neighbors = adjForward.get(curr) || [];
    for (const nbr of neighbors) {
      if (!nodeMap.has(nbr)) continue;
      const status = visitStatus.get(nbr) || 0;
      if (status === 1) {
        // Cycle found
        const cycleStartIndex = path.indexOf(nbr);
        const cyclePath = path.slice(cycleStartIndex).concat(nbr);
        addError(
          `Cycle detected in script graph: ${cyclePath.join(' -> ')}. Script must be a Directed Acyclic Graph (DAG).`,
          'CYCLE_DETECTED',
          curr
        );
      } else if (status === 0) {
        parentMap.set(nbr, curr);
        dfsCycle(nbr, path);
      }
    }

    path.pop();
    visitStatus.set(curr, 2);
  };

  for (const node of nodes) {
    if ((visitStatus.get(node.id) || 0) === 0) {
      dfsCycle(node.id, []);
    }
  }

  // 7. Reachability from Start
  const reachableFromStart = new Set<string>();
  if (startNode) {
    const queue = [startNode.id];
    reachableFromStart.add(startNode.id);

    while (queue.length > 0) {
      const curr = queue.shift()!;
      const neighbors = adjForward.get(curr) || [];
      for (const nbr of neighbors) {
        if (!reachableFromStart.has(nbr) && nodeMap.has(nbr)) {
          reachableFromStart.add(nbr);
          queue.push(nbr);
        }
      }
    }

    for (const node of nodes) {
      if (!reachableFromStart.has(node.id)) {
        addError(
          `Node "${node.id}" (${node.type}) is disconnected and cannot be reached from Start.`,
          'DISCONNECTED_NODE',
          node.id
        );
      }
    }
  }

  // 8. Termination Enforcement: Every reachable node MUST reach End Node!
  if (endNode) {
    const adjReverse = new Map<string, string[]>();
    for (const edge of edges) {
      if (!adjReverse.has(edge.target)) adjReverse.set(edge.target, []);
      adjReverse.get(edge.target)!.push(edge.source);
    }

    const canReachEnd = new Set<string>();
    const revQueue = [endNode.id];
    canReachEnd.add(endNode.id);

    while (revQueue.length > 0) {
      const curr = revQueue.shift()!;
      const predecessors = adjReverse.get(curr) || [];
      for (const pred of predecessors) {
        if (!canReachEnd.has(pred) && nodeMap.has(pred)) {
          canReachEnd.add(pred);
          revQueue.push(pred);
        }
      }
    }

    for (const node of nodes) {
      if (reachableFromStart.has(node.id) && !canReachEnd.has(node.id)) {
        addError(
          `Node "${node.id}" (${node.type}) is a dead-end and cannot reach the End node.`,
          'CANNOT_REACH_END',
          node.id
        );
      }
    }
  }

  // 9. Semantic Branch Route Enforcement
  for (const edge of edges) {
    const srcNode = nodeMap.get(edge.source);
    const tgtNode = nodeMap.get(edge.target);
    if (!srcNode || !tgtNode) continue;

    const semantic = getHandleSemantic(srcNode.type, edge.sourceHandle);

    // Refusal paths must not route into sales pitch or meeting booking
    if (semantic === 'refusal') {
      const queue = [tgtNode.id];
      const visitedRefusalPath = new Set<string>([tgtNode.id]);
      while (queue.length > 0) {
        const currId = queue.shift()!;
        const currNode = nodeMap.get(currId);
        if (currNode) {
          if (currNode.type === 'offer' || currNode.type === 'meeting_cta' || currNode.type === 'pricing' || currNode.type === 'send_information' || currNode.type === 'followup' || (currNode.type === 'outcome_action' && ['interested', 'meeting_booked', 'followup'].includes(currNode.data?.outcome || ''))) {
            addError(
              `Refusal branch from "${srcNode.id}" (${srcNode.type}) cannot route into "${currNode.id}" (${currNode.type}). Refusal paths must lead to Not Interested outcome or Goodbye.`,
              'REFUSAL_ROUTED_TO_PITCH',
              srcNode.id
            );
            break;
          }
        }
        for (const nxt of adjForward.get(currId) || []) {
          if (!visitedRefusalPath.has(nxt)) {
            visitedRefusalPath.add(nxt);
            queue.push(nxt);
          }
        }
      }
    }
  }

  // 10. Meeting / Follow-up Collection Route Validation
  const meetingActionNodes = nodes.filter(
    n => n.type === 'outcome_action' && (n.data?.outcome === 'meeting_booked' || n.data?.outcome === 'followup')
  );

  for (const outcomeNode of meetingActionNodes) {
    // Traverse backwards from this outcome node to verify date/time collection exists on ALL reachable incoming paths
    const adjReverseEdges = new Map<string, EdgeDefinition[]>();
    for (const edge of edges) {
      if (!adjReverseEdges.has(edge.target)) adjReverseEdges.set(edge.target, []);
      adjReverseEdges.get(edge.target)!.push(edge);
    }

    let allPathsCollect = true;
    const memo = new Map<string, boolean>();

    const checkAllPathsHaveCollection = (currId: string, visited: Set<string>, incomingEdge?: EdgeDefinition): boolean => {
      const memoKey = currId + (incomingEdge ? '-' + incomingEdge.id : '');
      if (memo.has(memoKey)) return memo.get(memoKey)!;
      
      const curr = nodeMap.get(currId);
      if (curr) {
        let isCollector = false;
        if (curr.type === 'followup') isCollector = true;
        if (curr.type === 'meeting_cta' && curr.data?.collectDate && curr.data?.collectTime && incomingEdge?.sourceHandle === 'accepted') isCollector = true;
        
        if (isCollector) {
          if (incomingEdge) {
            const semantic = getHandleSemantic(curr.type, incomingEdge.sourceHandle);
            if (semantic === 'negative' || semantic === 'refusal' || incomingEdge.sourceHandle === 'declined') {
               // A declined edge from a collector does NOT carry the collected date/time.
               isCollector = false;
            }
          }
          if (isCollector) {
            memo.set(memoKey, true);
            return true;
          }
        }
        
        if (curr.type === 'start' || curr.type === 'opening') {
          // Hit the start without finding a collector
          memo.set(memoKey, false);
          return false;
        }
      }
      
      const predEdges = adjReverseEdges.get(currId) || [];
      if (predEdges.length === 0) {
        memo.set(memoKey, false);
        return false; // Dead end backwards without a collector
      }

      visited.add(currId);
      let allIncomingCollect = true;
      for (const predEdge of predEdges) {
        if (visited.has(predEdge.source)) continue; // avoid cycles in check
        const pathCollects = checkAllPathsHaveCollection(predEdge.source, new Set(visited), predEdge);
        if (!pathCollects) {
          allIncomingCollect = false;
          break;
        }
      }
      
      memo.set(memoKey, allIncomingCollect);
      return allIncomingCollect;
    };

    allPathsCollect = checkAllPathsHaveCollection(outcomeNode.id, new Set<string>());

    if (!allPathsCollect) {
      addError(
        `Meeting/Follow-up outcome node "${outcomeNode.id}" requires a preceding node that collects appointment date and time on ALL incoming paths (e.g. Follow-up node or Meeting CTA with date/time collection enabled).`,
        'MISSING_MEETING_DATE_COLLECTION',
        outcomeNode.id,
        'outcome'
      );
    }
  }

  // 11. Prompt Size Limit Pre-check (Guarantees Validate matches Publish)
  if (errors.length === 0) {
    let estimatedLength = (script.settings?.agentDisplayName?.length || 5) + 400;
    for (const node of nodes) {
      const text = (node.data?.text || node.data?.label || node.data?.pricingText || node.data?.instructions || node.data?.genericText || node.data?.askDateText || '').toString();
      estimatedLength += text.length + 180;
      if (Array.isArray(node.data?.questions)) {
        node.data.questions.forEach((q: any) => { estimatedLength += (q?.text || '').length + 30; });
      }
      if (Array.isArray(node.data?.cases)) {
        node.data.cases.forEach((c: any) => { estimatedLength += (c?.intent || '').length + (c?.response || '').length + 50; });
      }
    }
    if (estimatedLength > 18000) {
      addError(
        `Estimated script prompt length (${estimatedLength} characters) exceeds the maximum limit of 18,000 characters.`,
        'PROMPT_TOO_LARGE'
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    issues
  };
}
