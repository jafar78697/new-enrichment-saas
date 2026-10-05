import { useState, useCallback, useRef, useEffect } from 'react';
import { 
  ReactFlow, 
  Controls, 
  Background, 
  applyNodeChanges, 
  applyEdgeChanges, 
  addEdge,
  Node,
  Edge,
  ConnectionMode,
  Connection,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
  BaseEdge,
  getBezierPath,
  EdgeLabelRenderer
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { 
  Save, 
  ArrowLeft, 
  Plus, 
  X, 
  Undo, 
  Redo, 
  Trash2, 
  Edit, 
  Loader2, 
  AlertCircle, 
  CheckCircle2, 
  Send 
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import api from '../../services/api';


// --- Custom Edge with removal button ---
const CustomEdge = ({
  id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, sourceHandle
}: any) => {
  const { setEdges } = useReactFlow();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });

  const onEdgeClick = (evt: any) => {
    evt.stopPropagation();
    setEdges((edges) => edges.filter((e) => e.id !== id));
  };

  let strokeColor = '#3b82f6';
  let badgeLabel: string | null = null;
  let badgeColor = 'text-blue-400';

  if (['confirmed', 'interested', 'qualified', 'accepted', 'resolved'].includes(sourceHandle)) {
    strokeColor = '#22c55e';
    badgeColor = 'text-green-400';
    if (sourceHandle === 'confirmed') badgeLabel = 'Speaking / Owner';
    else if (sourceHandle === 'interested') badgeLabel = 'Interested';
    else if (sourceHandle === 'qualified') badgeLabel = 'Qualified';
    else if (sourceHandle === 'accepted') badgeLabel = 'Agreed to Meet';
    else if (sourceHandle === 'resolved') badgeLabel = 'Resolved';
  } else if (['not_owner', 'objection', 'unqualified'].includes(sourceHandle)) {
    strokeColor = '#f59e0b';
    badgeColor = 'text-amber-400';
    if (sourceHandle === 'not_owner') badgeLabel = 'Not Owner';
    else if (sourceHandle === 'objection') badgeLabel = 'Question / Objection';
    else if (sourceHandle === 'unqualified') badgeLabel = 'Not Qualified (No)';
  } else if (['refusal', 'not_interested', 'declined', 'unresolved'].includes(sourceHandle)) {
    strokeColor = '#ef4444';
    badgeColor = 'text-red-400';
    if (sourceHandle === 'refusal') badgeLabel = 'Refusal / Hangup';
    else if (sourceHandle === 'not_interested') badgeLabel = 'Not Interested';
    else if (sourceHandle === 'declined') badgeLabel = 'Declined';
    else if (sourceHandle === 'unresolved') badgeLabel = 'Refusal';
  } else if (sourceHandle && sourceHandle !== 'default') {
    badgeLabel = sourceHandle;
  }

  return (
    <>
      <BaseEdge path={edgePath} markerEnd={markerEnd} style={{ ...style, strokeWidth: 2.5, stroke: strokeColor }} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex items-center gap-1.5 bg-[#18181b]/95 backdrop-blur px-2 py-0.5 rounded-full border border-gray-700 shadow-md"
        >
          {badgeLabel && (
            <span className={`text-[10px] font-semibold tracking-wide ${badgeColor}`}>
              {badgeLabel}
            </span>
          )}
          <button
            className="w-4 h-4 bg-red-500/80 hover:bg-red-500 text-white rounded-full flex items-center justify-center text-xs cursor-pointer transition"
            onClick={onEdgeClick}
            title="Remove Connection"
          >
            <X size={10} strokeWidth={3} />
          </button>
        </div>
      </EdgeLabelRenderer>
    </>
  );
};

// --- Custom Node with Multiple Branch Handles ---
const CustomNode = ({ id, data, selected }: any) => {
  const { setNodes, setEdges } = useReactFlow();
  
  const onDelete = (evt: any) => {
    evt.stopPropagation();
    setNodes((nds) => nds.filter(n => n.id !== id));
    setEdges((eds) => eds.filter(e => e.source !== id && e.target !== id));
  };

  const isStart = data.nodeType === 'start';
  const isEnd = data.nodeType === 'end';
  const hasError = !!data.hasError;
  const nodeType = data.nodeType || 'node';
  
  const bgClass = hasError
    ? 'bg-red-950/70 border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.5)]'
    : isStart 
      ? 'bg-green-900/30 border-green-500' 
      : isEnd 
        ? 'bg-red-900/30 border-red-500' 
        : data.nodeType === 'outcome_action'
          ? 'bg-purple-900/30 border-purple-500'
          : 'bg-gray-800 border-gray-600';

  const displayText = data.label || data.text || (
    data.nodeType === 'outcome_action' ? `Outcome: ${data.outcome || 'Not set'}` : ''
  );

  const renderHandles = () => {
    if (isEnd) return null;

    if (nodeType === 'opening') {
      return (
        <div className="mt-3 pt-2 border-t border-gray-700/60">
          <div className="flex justify-between items-center text-[8px] font-semibold text-gray-400 px-0.5 mb-1">
            <span className="text-green-400">● Speaking</span>
            <span className="text-blue-400">● Next</span>
            <span className="text-amber-400">● Not Owner</span>
            <span className="text-red-400">● Refusal</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="confirmed" style={{ left: '15%' }} className="w-3.5 h-3.5 bg-green-500 hover:scale-125 transition-transform" title="Prospect is owner / speaking" />
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: '40%' }} className="w-3.5 h-3.5 bg-blue-500 hover:scale-125 transition-transform" title="Default / Next" />
          <Handle type="source" position={Position.Bottom} id="not_owner" style={{ left: '65%' }} className="w-3.5 h-3.5 bg-amber-500 hover:scale-125 transition-transform" title="Not the owner / wrong person" />
          <Handle type="source" position={Position.Bottom} id="refusal" style={{ left: '90%' }} className="w-3.5 h-3.5 bg-red-500 hover:scale-125 transition-transform" title="Immediate refusal / hangup" />
        </div>
      );
    }

    if (nodeType === 'offer') {
      return (
        <div className="mt-3 pt-2 border-t border-gray-700/60">
          <div className="flex justify-between items-center text-[8px] font-semibold text-gray-400 px-0.5 mb-1">
            <span className="text-green-400">● Interested</span>
            <span className="text-blue-400">● Next</span>
            <span className="text-amber-400">● Objection</span>
            <span className="text-red-400">● Refusal</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="interested" style={{ left: '15%' }} className="w-3.5 h-3.5 bg-green-500 hover:scale-125 transition-transform" title="Prospect is interested in offer" />
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: '40%' }} className="w-3.5 h-3.5 bg-blue-500 hover:scale-125 transition-transform" title="Default / Next" />
          <Handle type="source" position={Position.Bottom} id="objection" style={{ left: '65%' }} className="w-3.5 h-3.5 bg-amber-500 hover:scale-125 transition-transform" title="Prospect raises objection / question" />
          <Handle type="source" position={Position.Bottom} id="not_interested" style={{ left: '90%' }} className="w-3.5 h-3.5 bg-red-500 hover:scale-125 transition-transform" title="Prospect rejects offer" />
        </div>
      );
    }

    if (nodeType === 'qualifying_questions') {
      return (
        <div className="mt-3 pt-2 border-t border-gray-700/60">
          <div className="flex justify-between items-center text-[8px] font-semibold text-gray-400 px-1 mb-1">
            <span className="text-green-400">● Qualified</span>
            <span className="text-blue-400">● Next</span>
            <span className="text-amber-400">● Not Qualified</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="qualified" style={{ left: '20%' }} className="w-3.5 h-3.5 bg-green-500 hover:scale-125 transition-transform" title="Answers positively / qualifies" />
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: '50%' }} className="w-3.5 h-3.5 bg-blue-500 hover:scale-125 transition-transform" title="Default / Next" />
          <Handle type="source" position={Position.Bottom} id="unqualified" style={{ left: '80%' }} className="w-3.5 h-3.5 bg-amber-500 hover:scale-125 transition-transform" title="Factual no / does not qualify" />
        </div>
      );
    }

    if (nodeType === 'meeting_cta') {
      return (
        <div className="mt-3 pt-2 border-t border-gray-700/60">
          <div className="flex justify-between items-center text-[8px] font-semibold text-gray-400 px-1 mb-1">
            <span className="text-green-400">● Agreed</span>
            <span className="text-blue-400">● Next</span>
            <span className="text-red-400">● Declined</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="accepted" style={{ left: '20%' }} className="w-3.5 h-3.5 bg-green-500 hover:scale-125 transition-transform" title="Agrees to meeting / call" />
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: '50%' }} className="w-3.5 h-3.5 bg-blue-500 hover:scale-125 transition-transform" title="Default / Next" />
          <Handle type="source" position={Position.Bottom} id="declined" style={{ left: '80%' }} className="w-3.5 h-3.5 bg-red-500 hover:scale-125 transition-transform" title="Declines meeting" />
        </div>
      );
    }

    if (nodeType === 'objection_router') {
      return (
        <div className="mt-3 pt-2 border-t border-gray-700/60">
          <div className="flex justify-between items-center text-[8px] font-semibold text-gray-400 px-1 mb-1">
            <span className="text-green-400">● Resolved</span>
            <span className="text-blue-400">● Default</span>
            <span className="text-red-400">● Refusal</span>
          </div>
          <Handle type="source" position={Position.Bottom} id="resolved" style={{ left: '20%' }} className="w-3.5 h-3.5 bg-green-500 hover:scale-125 transition-transform" title="Objection addressed / resolved" />
          <Handle type="source" position={Position.Bottom} id="default" style={{ left: '50%' }} className="w-3.5 h-3.5 bg-blue-500 hover:scale-125 transition-transform" title="Default" />
          <Handle type="source" position={Position.Bottom} id="unresolved" style={{ left: '80%' }} className="w-3.5 h-3.5 bg-red-500 hover:scale-125 transition-transform" title="Still refuses" />
        </div>
      );
    }

    return (
      <Handle 
        type="source" 
        position={Position.Bottom} 
        id="default" 
        className="w-3.5 h-3.5 bg-blue-400 hover:scale-125 transition-transform" 
      />
    );
  };

  return (
    <div className={`p-3 rounded-lg border-2 ${selected ? 'border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.5)]' : bgClass} min-w-[210px] max-w-[310px] transition-all relative`}>
      {!isStart && <Handle type="target" position={Position.Top} className="w-3 h-3 bg-blue-400" />}
      
      <div className="flex justify-between items-center mb-2">
        <span className="text-xs font-bold text-gray-300 uppercase tracking-wider flex items-center">
          {data.nodeType || 'Node'}
          {selected && !isStart && !isEnd && <Edit size={12} className="ml-2 text-blue-400" />}
        </span>
        {!isStart && !isEnd && (
          <button onClick={onDelete} className="text-gray-500 hover:text-red-400 transition-colors">
            <X size={14} />
          </button>
        )}
      </div>
      
      <div className="w-full bg-gray-900/50 text-sm text-gray-100 p-2 rounded border border-gray-700 break-words whitespace-pre-wrap min-h-[40px]">
        {displayText || <span className="text-gray-500 italic">Select node to configure...</span>}
      </div>

      {hasError && data.errorMessage && (
        <div className="mt-2 text-xs text-red-300 bg-red-900/50 px-2 py-1 rounded border border-red-700 flex items-center gap-1.5">
          <AlertCircle size={12} className="shrink-0 text-red-400" />
          <span className="truncate" title={data.errorMessage}>{data.errorMessage}</span>
        </div>
      )}

      {renderHandles()}
    </div>
  );
};

const nodeTypes = { custom: CustomNode };
const edgeTypes = { custom: CustomEdge };

const initialNodes: Node[] = [
  { id: 'start', type: 'custom', position: { x: 250, y: 50 }, data: { label: 'Start Call', nodeType: 'start' } },
  { id: 'opening', type: 'custom', position: { x: 250, y: 150 }, data: { label: 'Hello, this is David with Jento AI. How are you today?', nodeType: 'opening', text: 'Hello, this is David with Jento AI. How are you today?' } },
  { id: 'end', type: 'custom', position: { x: 250, y: 350 }, data: { label: 'End Call', nodeType: 'end' } }
];

const initialEdges: Edge[] = [
  { id: 'e_start_opening', source: 'start', target: 'opening', type: 'custom' }
];

function BuilderFlow() {
  const navigate = useNavigate();
  const { scriptId } = useParams();
  
  const [nodes, setNodes] = useState<Node[]>(initialNodes);
  const [edges, setEdges] = useState<Edge[]>(initialEdges);
  const [scriptName, setScriptName] = useState('New Script Template');
  const [nicheId, setNicheId] = useState<number | null>(null);
  const [settings, setSettings] = useState<any>({
    agentDisplayName: 'Agent',
    tone: 'professional and concise',
    maxSentencesPerTurn: 2,
    maxObjectionAttempts: 1
  });
  
  const [loading, setLoading] = useState(!!(scriptId && scriptId !== 'new'));
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [validating, setValidating] = useState(false);

  // Undo/Redo State
  const [history, setHistory] = useState<{nodes: Node[], edges: Edge[]}[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const isUndoRedoAction = useRef(false);

  // Save history on changes
  useEffect(() => {
    if (isUndoRedoAction.current) {
      isUndoRedoAction.current = false;
      return;
    }
    const currentState = { nodes, edges };
    setHistory((prev) => {
      const newHistory = prev.slice(0, historyIndex + 1);
      newHistory.push(currentState);
      if (newHistory.length > 50) newHistory.shift();
      return newHistory;
    });
    setHistoryIndex((prev) => (prev >= 49 ? 49 : prev + 1));
  }, [nodes, edges]);

  const undo = useCallback(() => {
    if (historyIndex > 0) {
      isUndoRedoAction.current = true;
      const prevState = history[historyIndex - 1];
      setNodes(prevState.nodes);
      setEdges(prevState.edges);
      setHistoryIndex(historyIndex - 1);
    }
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isUndoRedoAction.current = true;
      const nextState = history[historyIndex + 1];
      setNodes(nextState.nodes);
      setEdges(nextState.edges);
      setHistoryIndex(historyIndex + 1);
    }
  }, [history, historyIndex]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      if (e.key === 'Backspace' || e.key === 'Delete') {
        if ((e.target as HTMLElement).tagName === 'TEXTAREA' || (e.target as HTMLElement).tagName === 'INPUT') return;
        setNodes(nds => nds.filter(n => !n.selected));
        setEdges(eds => eds.filter(e => !e.selected));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    if (scriptId && scriptId !== 'new') {
      fetchScript();
    }
  }, [scriptId]);

  async function fetchScript() {
    try {
      const res = await api.get(`/multi-calling/scripts/${scriptId}`);
      setScriptName(res.data.script.name);
      if (res.data.script?.niche_id) {
        setNicheId(res.data.script.niche_id);
      }
      if (res.data.version?.id && res.data.version?.status === 'draft') {
        setDraftId(res.data.version.id);
      }
      
      const def = res.data.version.definition;
      if (def?.settings) {
        setSettings(def.settings);
      }
      
      // Remap backend 'type' back to 'custom' for React Flow rendering
      if (def?.nodes) {
        setNodes(def.nodes.map((n: any) => ({
          ...n,
          type: 'custom',
          data: { 
            ...n.data, 
            nodeType: n.type,
            label: n.data?.label || n.data?.text || ''
          }
        })));
      }
      if (def?.edges) {
        setEdges(def.edges.map((e: any) => ({
          ...e,
          type: 'custom',
          sourceHandle: e.sourceHandle || undefined,
          targetHandle: e.targetHandle || undefined,
          kind: e.kind || 'default'
        })));
      }
    } catch (err) {
      console.error(err);
      alert('Failed to load script');
      navigate('/multi-ai-calling/scripts');
    } finally {
      setLoading(false);
    }
  }

  const onNodesChange = useCallback(
    (changes: any) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes: any) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  const onConnect = useCallback(
    (params: Connection) => {
      const existingOutgoing = edges.find(
        e => e.source === params.source && (e.sourceHandle || null) === (params.sourceHandle || null)
      );
      if (existingOutgoing) {
        alert('Nodes can only have one outgoing connection per handle.');
        return;
      }
      setEdges((eds) => addEdge({ 
        ...params, 
        type: 'custom',
        data: {
          kind: params.sourceHandle ? 'condition' : 'default'
        }
      }, eds));
    },
    [edges]
  );

  const getScriptDefinition = () => ({
    schemaVersion: 1,
    name: scriptName,
    nicheId: nicheId || null,
    settings: settings || {
      agentDisplayName: 'Agent',
      tone: 'professional and concise',
      maxSentencesPerTurn: 2,
      maxObjectionAttempts: 1
    },
    nodes: nodes.map(n => {
      const textVal = (n.data?.text || n.data?.label || '').toString().trim();
      return { 
        id: n.id, 
        type: n.data.nodeType,
        position: n.position,
        data: {
          ...n.data,
          text: textVal || (n.data.nodeType === 'outcome_action' ? n.data.outcome : undefined),
          label: n.data?.label || textVal,
          hasError: false,
          errorMessage: null
        }
      };
    }),
    edges: edges.map(e => ({ 
      id: e.id, 
      source: e.source, 
      target: e.target, 
      sourceHandle: e.sourceHandle || null,
      targetHandle: e.targetHandle || null,
      kind: (e.sourceHandle || (e as any).kind === 'condition' || (e.data as any)?.kind === 'condition') ? 'condition' : 'default'
    }))
  });

  const handleValidateClick = async () => {
    setValidating(true);
    try {
      const definition = getScriptDefinition();
      const res = await api.post('/multi-calling/scripts/validate', { definition });
      
      const nodeErrorMap: Record<string, string> = {};
      if (res.data.issues && Array.isArray(res.data.issues)) {
        res.data.issues.forEach((iss: any) => {
          if (iss.nodeId && !nodeErrorMap[iss.nodeId]) {
            nodeErrorMap[iss.nodeId] = iss.message;
          }
        });
      }

      setNodes(nds => nds.map(n => ({
        ...n,
        data: {
          ...n.data,
          hasError: !!nodeErrorMap[n.id],
          errorMessage: nodeErrorMap[n.id] || null
        }
      })));

      if (res.data.valid) {
        alert('✓ Script graph is completely valid and ready to publish!');
      } else {
        alert(`Validation issues found:\n\n${res.data.errors.map((e: string) => `• ${e}`).join('\n')}`);
      }
    } catch (err: any) {
      console.error(err);
      const errors = err?.response?.data?.errors || [err?.response?.data?.error || err.message];
      alert(`Validation Error:\n\n${errors.map((e: string) => `• ${e}`).join('\n')}`);
    } finally {
      setValidating(false);
    }
  };

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const definition = getScriptDefinition();
      let resId = scriptId;
      if (scriptId && scriptId !== 'new') {
        await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId
        });
      } else {
        const res = await api.post('/multi-calling/scripts', {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
        resId = res.data.scriptId;
      }
      alert('Draft saved successfully!');
      if (scriptId === 'new') {
        navigate(`/multi-ai-calling/builder/${resId}`, { replace: true });
      }
    } catch (err: any) {
      console.error(err);
      alert('Error saving draft: ' + (err?.response?.data?.message || err?.response?.data?.error || err.message));
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    setPublishing(true);
    try {
      const definition = getScriptDefinition();
      let resId = scriptId;
      if (scriptId && scriptId !== 'new') {
        await api.put(`/multi-calling/scripts/${scriptId}`, {
          name: scriptName,
          definition,
          nicheId: nicheId || null,
          expectedDraftId: draftId
        });
      } else {
        const res = await api.post('/multi-calling/scripts', {
          name: scriptName,
          definition,
          nicheId: nicheId || null
        });
        resId = res.data.scriptId;
      }

      await api.post(`/multi-calling/scripts/${resId}/publish`);

      setNodes(nds => nds.map(n => ({
        ...n,
        data: { ...n.data, hasError: false, errorMessage: null }
      })));

      alert('✓ Script saved and published successfully! It is now active for calling.');
      if (scriptId === 'new') {
        navigate(`/multi-ai-calling/builder/${resId}`, { replace: true });
      }
    } catch (err: any) {
      console.error(err);
      const issues = err?.response?.data?.issues;
      if (issues && Array.isArray(issues)) {
        const nodeErrorMap: Record<string, string> = {};
        issues.forEach((iss: any) => {
          if (iss.nodeId && !nodeErrorMap[iss.nodeId]) {
            nodeErrorMap[iss.nodeId] = iss.message;
          }
        });
        setNodes(nds => nds.map(n => ({
          ...n,
          data: {
            ...n.data,
            hasError: !!nodeErrorMap[n.id],
            errorMessage: nodeErrorMap[n.id] || null
          }
        })));
      }

      const serverDetails = err?.response?.data?.details;
      const errorMsg = serverDetails && Array.isArray(serverDetails)
        ? `Graph Validation Failed:\n\n${serverDetails.map((d: string) => `• ${d}`).join('\n')}`
        : (err?.response?.data?.message || err?.response?.data?.error || err.message);
      alert('Error publishing script:\n\n' + errorMsg);
    } finally {
      setPublishing(false);
    }
  };

  const addNode = (typeId: string, label: string) => {
    if (typeId === 'start' && nodes.some(n => n.data?.nodeType === 'start')) {
      alert('A start node already exists.');
      return;
    }
    if (typeId === 'opening' && nodes.some(n => n.data?.nodeType === 'opening')) {
      alert('An opening node already exists.');
      return;
    }
    if (typeId === 'end' && nodes.some(n => n.data?.nodeType === 'end')) {
      alert('An end node already exists.');
      return;
    }
    const newNode: Node = {
      id: typeId === 'start' ? 'start' : typeId === 'end' ? 'end' : `node_${Date.now()}`,
      type: 'custom',
      position: { x: Math.random() * 200 + 100, y: Math.random() * 200 + 100 },
      data: { 
        label, 
        nodeType: typeId,
        outcome: typeId === 'outcome_action' ? 'called' : undefined
      }
    };
    setNodes((nds) => [...nds, newNode]);
  };

  if (loading) {
    return (
      <div className="h-[calc(100vh-100px)] flex items-center justify-center bg-[#121212] rounded-xl border border-gray-800">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col bg-[#121212] rounded-xl overflow-hidden border border-gray-800">
      <div className="bg-[#1a1a1a] p-4 flex justify-between items-center border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate('/multi-ai-calling/scripts')}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center group relative">
            <input 
              type="text" 
              value={scriptName}
              onChange={(e) => setScriptName(e.target.value)}
              className="bg-transparent border border-transparent hover:border-gray-700 hover:bg-gray-800/50 text-xl font-bold text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-gray-800 rounded px-2 py-1 w-64 md:w-96 transition-all"
              placeholder="Enter Script Name..."
            />
            <Edit className="w-4 h-4 text-gray-500 absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
          </div>
        </div>
        <div className="flex space-x-3 items-center">
          <div className="flex items-center space-x-1 mr-4 border-r border-gray-700 pr-4">
             <button onClick={undo} disabled={historyIndex <= 0} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30" title="Undo (Ctrl+Z)">
               <Undo className="w-4 h-4" />
             </button>
             <button onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 text-gray-400 hover:text-white disabled:opacity-30" title="Redo (Ctrl+Y)">
               <Redo className="w-4 h-4" />
             </button>
          </div>
          <button 
            onClick={handleValidateClick}
            disabled={validating}
            className="flex items-center px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-200 text-sm rounded-lg transition border border-gray-700 hover:border-gray-600 disabled:opacity-50"
            title="Check Graph Validity via Server"
          >
            {validating ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1.5 text-green-400" />}
            Validate
          </button>
          <button 
            onClick={handleSaveDraft}
            disabled={saving}
            className="flex items-center px-3.5 py-1.5 bg-gray-800 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition border border-gray-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Save className="w-4 h-4 mr-1.5 text-blue-400" />}
            Save Draft
          </button>
          <button 
            onClick={handlePublish}
            disabled={publishing}
            className="flex items-center px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-md hover:shadow-blue-500/20 disabled:opacity-50"
          >
            {publishing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Publish
          </button>
        </div>
      </div>

      <div className="flex-1 w-full h-full relative flex">
        <div className="flex-1 h-full relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            connectionMode={ConnectionMode.Loose}
            fitView
            className="bg-[#121212]"
          >
            <Background color="#333" gap={16} />
            <Controls className="bg-gray-800 border-gray-700 text-white fill-white" />
          </ReactFlow>

          <div className="absolute left-4 top-4 w-56 bg-[#1a1a1a]/95 backdrop-blur border border-gray-800 rounded-lg p-3 shadow-xl z-10">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Toolbox</h4>
            <div className="space-y-1.5 max-h-[70vh] overflow-y-auto pr-1">
              {[
                { id: 'start', label: 'Start Node' },
                { id: 'opening', label: 'Opening' },
                { id: 'offer', label: 'Offer' },
                { id: 'qualifying_questions', label: 'Qualifying Questions' },
                { id: 'objection_router', label: 'Objection Handling' },
                { id: 'pricing', label: 'Pricing Info' },
                { id: 'meeting_cta', label: 'Meeting CTA' },
                { id: 'send_information', label: 'Send Info' },
                { id: 'additional_instructions', label: 'Instructions' },
                { id: 'outcome_action', label: 'Outcome Action' },
                { id: 'goodbye', label: 'Goodbye' },
                { id: 'end', label: 'End Node' },
              ].map(tool => (
                <div 
                  key={tool.id}
                  onClick={() => addNode(tool.id, tool.label)}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs px-2.5 py-1.5 rounded cursor-pointer transition border border-gray-700 hover:border-gray-600"
                >
                  + {tool.label}
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-800">
               <p className="text-[11px] text-gray-500 flex items-center">
                 <Trash2 className="w-3 h-3 mr-1" />
                 Select node/edge & press Delete to remove.
               </p>
            </div>
          </div>
        </div>
        
        {/* Node Editor Sidebar */}
        <div className="w-80 h-full bg-[#1a1a1a] border-l border-gray-800 flex flex-col z-10">
          <div className="p-4 border-b border-gray-800 bg-[#1e1e1e]">
            <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider flex items-center">
              <Edit className="w-4 h-4 mr-2 text-blue-400" />
              Node Editor
            </h3>
          </div>
          
          <div className="p-4 flex-1 overflow-y-auto">
            {(() => {
              const selectedNode = nodes.find(n => n.selected);
              if (!selectedNode) {
                return (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-3 opacity-50">
                    <Edit className="w-12 h-12" />
                    <p className="text-sm text-center">Select a node on the canvas<br/>to edit its configuration.</p>
                  </div>
                );
              }
              
              const isStart = selectedNode.data.nodeType === 'start';
              const isEnd = selectedNode.data.nodeType === 'end';
              
              if (isStart || isEnd) {
                return (
                  <div className="text-gray-400 text-sm bg-gray-800/50 p-4 rounded-lg border border-gray-700">
                    This is a structural boundary node and does not contain conversational speech.
                  </div>
                );
              }

              if (selectedNode.data.nodeType === 'outcome_action') {
                return (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        Call Outcome
                      </label>
                      <select
                        className="w-full bg-gray-900 text-sm text-gray-100 p-2.5 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none"
                        value={(selectedNode.data.outcome as string) || 'called'}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes(nds => nds.map(n => {
                            if (n.id === selectedNode.id) {
                              return { ...n, data: { ...n.data, outcome: val, label: `Outcome: ${val}` } };
                            }
                            return n;
                          }));
                        }}
                      >
                        <option value="called">Called (Completed)</option>
                        <option value="interested">Interested</option>
                        <option value="not_interested">Not Interested</option>
                        <option value="followup">Follow-up</option>
                        <option value="meeting_booked">Meeting Booked</option>
                        <option value="dnc">Do Not Call (Opt-out)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-2">
                        Select the CRM business outcome recorded when the call reaches this step.
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                        Action Note / Summary
                      </label>
                      <textarea
                        className="w-full h-32 bg-gray-900 text-sm text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:outline-none resize-none font-mono"
                        value={(selectedNode.data.note as string) || ''}
                        onChange={(e) => {
                          const val = e.target.value;
                          setNodes(nds => nds.map(n => {
                            if (n.id === selectedNode.id) {
                              return { ...n, data: { ...n.data, note: val } };
                            }
                            return n;
                          }));
                        }}
                        placeholder="e.g. Prospect agreed to demo, confirm details..."
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
                      {String(selectedNode.data.nodeType)} Script Content
                    </label>
                    <textarea 
                      className="w-full h-64 bg-gray-900 text-sm text-gray-100 p-3 rounded-lg border border-gray-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none font-mono"
                      value={(selectedNode.data.label || selectedNode.data.text || '') as string}
                      onChange={(e) => {
                        const val = e.target.value;
                        setNodes(nds => nds.map(n => {
                          if (n.id === selectedNode.id) {
                            return { ...n, data: { ...n.data, label: val, text: val } };
                          }
                          return n;
                        }));
                      }}
                      placeholder={`Enter the instructions or speech for this ${selectedNode.data.nodeType} step...`}
                    />
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed">
                      Write what the AI should say or do at this point. Supported template variables: <code className="text-blue-400">&#123;&#123;first_name&#125;&#125;</code>, <code className="text-blue-400">&#123;&#123;company&#125;&#125;</code>, <code className="text-blue-400">&#123;&#123;phone&#125;&#125;</code>.
                    </p>
                  </div>

                  {selectedNode.data.nodeType === 'opening' && (
                    <div className="pt-2 border-t border-gray-800">
                      <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selectedNode.data.waitForReply}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNodes(nds => nds.map(n => {
                              if (n.id === selectedNode.id) {
                                return { ...n, data: { ...n.data, waitForReply: val } };
                              }
                              return n;
                            }));
                          }}
                          className="rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-0"
                        />
                        <span>Wait for prospect to reply before continuing</span>
                      </label>
                    </div>
                  )}

                  {selectedNode.data.nodeType === 'meeting_cta' && (
                    <div className="pt-2 border-t border-gray-800 space-y-2">
                      <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selectedNode.data.collectDate}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNodes(nds => nds.map(n => {
                              if (n.id === selectedNode.id) {
                                return { ...n, data: { ...n.data, collectDate: val } };
                              }
                              return n;
                            }));
                          }}
                          className="rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-0"
                        />
                        <span>Must confirm specific meeting date</span>
                      </label>
                      <label className="flex items-center space-x-2 text-xs text-gray-300 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={!!selectedNode.data.collectTime}
                          onChange={(e) => {
                            const val = e.target.checked;
                            setNodes(nds => nds.map(n => {
                              if (n.id === selectedNode.id) {
                                return { ...n, data: { ...n.data, collectTime: val } };
                              }
                              return n;
                            }));
                          }}
                          className="rounded border-gray-700 bg-gray-900 text-blue-600 focus:ring-0"
                        />
                        <span>Must confirm specific meeting time & timezone</span>
                      </label>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function VisualScriptBuilder() {
  return (
    <ReactFlowProvider>
      <BuilderFlow />
    </ReactFlowProvider>
  );
}
