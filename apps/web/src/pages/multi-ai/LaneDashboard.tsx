import { useState, useEffect } from 'react';
import api from '../../services/api';
import { Settings, Play, Pause, AlertCircle, Phone, Edit, Activity, List } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { deepgramAgentsApi, type DeepgramAgent } from '../../services/deepgramAgentsApi';
import { nichesApi, type Niche } from '../../services/nichesApi';
import LaneCard from './components/LaneCard';
import { CallHistory } from './CallHistory';


export default function LaneDashboard() {
  const navigate = useNavigate();
  const [lanes, setLanes] = useState<any[]>([]);
  const [integrationsStatus, setIntegrationsStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);

  // Modal data
  const [agents, setAgents] = useState<DeepgramAgent[]>([]);
  const [numbers, setNumbers] = useState<any[]>([]);
  const [niches, setNiches] = useState<Niche[]>([]);
  const [scripts, setScripts] = useState<any[]>([]);

  // Form state
  const [formAgentId, setFormAgentId] = useState('');
  const [formScriptId, setFormScriptId] = useState('');
  const [formNumber1, setFormNumber1] = useState('');
  const [formNumber2, setFormNumber2] = useState('');
  const [formNicheId, setFormNicheId] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  useEffect(() => {
    loadLanes();
    const interval = setInterval(() => {
      loadLanes(true);
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function loadLanes(silent = false) {
    if (!silent) setLoading(true);
    try {
      const res = await api.get(`/multi-calling/lanes`);
      const statusRes = await api.get(`/multi-calling/integrations/status`).catch(() => null);
      
      if (statusRes?.data) {
        setIntegrationsStatus(statusRes.data);
      }

      // Ensure we always have 4 slots to render
      const fetchedLanes = res.data.lanes || [];
      const slots = [1, 2, 3, 4].map(slot => {
        const existing = fetchedLanes.find((l: any) => l.slot_number === slot);
        return existing || { slot_number: slot, status: 'empty' };
      });
      setLanes(slots);
      setErrorMsg(null);
    } catch (err) {
      console.error(err);
      setErrorMsg('Lost connection to server. Retrying...');
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function handleToggleStatus(laneId: string, currentStatus: string) {
    const action = currentStatus === 'running' ? 'pause' : 'start';
    try {
      await api.post(`/multi-calling/lanes/${laneId}/${action}`, {});
      loadLanes();
    } catch (err) {
      console.error(err);
      alert('Failed to change lane status');
    }
  }

  async function openAssignModal(slot: number, lane?: any) {
    setSelectedSlot(slot);
    setFormAgentId(lane?.agent_config_id || '');
    setFormScriptId(lane?.active_script_version_id || '');
    
    // Numbers: position 0 is Number1, position 1 is Number2
    const num1 = lane?.numbers?.find((n: any) => n.position === 0)?.phone_number_id || '';
    const num2 = lane?.numbers?.find((n: any) => n.position === 1)?.phone_number_id || '';
    
    setFormNumber1(num1);
    setFormNumber2(num2);
    setFormNicheId(lane?.niche_id?.toString() || '');
    setIsModalOpen(true);

    try {
      if (agents.length === 0) {
        const agRes = await deepgramAgentsApi.list();
        setAgents(agRes.agents || []);
      }
      // Fetch numbers - don't filter out numbers assigned to the current lane
      const numRes = await api.get('/multi-calling/available-numbers');
      const currentLaneId = lane?.id;
      setNumbers((numRes.data.numbers || []).filter((n: any) => !n.lane_id || n.lane_id === currentLaneId));

      if (niches.length === 0) {
        const nRes = await nichesApi.list();
        setNiches(nRes.niches || []);
      }
      if (scripts.length === 0) {
        const sRes = await api.get('/multi-calling/scripts');
        // Only show scripts that have a published version
        setScripts((sRes.data.scripts || []).filter((s: any) => s.published_version_id != null));
      }
    } catch (e) {
      console.error('Failed to load dropdown data', e);
    }
  }

  async function handleAssignSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedSlot) return;
    if (formNumber1 === formNumber2) {
      return alert('Please select two distinct phone numbers.');
    }
    
    setFormSubmitting(true);
    try {
      await api.post(`/multi-calling/lanes/${selectedSlot}/assign`, {
        agentConfigId: formAgentId,
        scriptVersionId: formScriptId,
        phoneNumberIds: [formNumber1, formNumber2],
        nicheId: formNicheId || null,
        name: `Lane ${selectedSlot}`,
      });
      setIsModalOpen(false);
      loadLanes();
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.message || err.response?.data?.error || 'Failed to assign lane.');
    } finally {
      setFormSubmitting(false);
    }
  }

  if (loading) return <div className="p-8 text-center text-gray-500">Loading lanes...</div>;

  return (
    <div className="w-full space-y-5">
      {errorMsg && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-md">
          <div className="flex">
            <div className="flex-shrink-0">
              <AlertCircle className="h-5 w-5 text-red-500" aria-hidden="true" />
            </div>
            <div className="ml-3">
              <p className="text-sm text-red-700 font-medium">{errorMsg}</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900 m-0">Multi-AI Calling Lanes</h2>
          <p className="text-sm text-gray-500 mt-1">Manage your 4 independent concurrent AI calling slots.</p>
        </div>
        <button
          onClick={() => navigate('/multi-ai-calling/scripts')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition flex items-center"
        >
          <Edit className="w-4 h-4 mr-2" />
          Script Builder
        </button>
      </div>

      {/* Integration & Campaign Summary Panels */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center"><Phone className="w-4 h-4 mr-2 text-indigo-500"/> SignalWire Voice</h3>
            {integrationsStatus?.signalwire ? (
              <div className="mt-2 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Status:</span> <span className={integrationsStatus.signalwire.verified ? 'text-green-600 font-medium' : (integrationsStatus.signalwire.configured ? 'text-amber-500 font-medium' : 'text-red-500 font-medium')}>{integrationsStatus.signalwire.verified ? 'Verified' : (integrationsStatus.signalwire.configured ? 'Invalid Credentials' : 'Missing')}</span></div>
                {integrationsStatus.signalwire.expectedSpace && <div className="flex justify-between"><span>Space:</span> <span className="font-mono">{integrationsStatus.signalwire.expectedSpace}</span></div>}
              </div>
            ) : <div className="mt-2 text-xs text-gray-400">Loading...</div>}
          </div>
        </div>
        
        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center"><Activity className="w-4 h-4 mr-2 text-purple-500"/> Deepgram AI</h3>
            {integrationsStatus?.deepgram ? (
              <div className="mt-2 text-xs text-gray-600 space-y-1">
                <div className="flex justify-between"><span>Status:</span> <span className={integrationsStatus.deepgram.verified ? 'text-green-600 font-medium' : (integrationsStatus.deepgram.configured ? 'text-amber-500 font-medium' : 'text-red-500 font-medium')}>{integrationsStatus.deepgram.verified ? 'Verified' : (integrationsStatus.deepgram.configured ? 'Invalid Token' : 'Missing')}</span></div>
                <div className="flex justify-between"><span>Connection:</span> <span className="text-gray-500">Live Streaming API</span></div>
              </div>
            ) : <div className="mt-2 text-xs text-gray-400">Loading...</div>}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 flex items-center"><List className="w-4 h-4 mr-2 text-blue-500"/> Campaign Summary</h3>
            <div className="mt-2 text-xs text-gray-600 space-y-1">
              <div className="flex justify-between"><span>Active Lanes:</span> <span className="font-medium text-gray-900">{lanes.filter(l => l.status === 'running').length} / 4</span></div>
              <div className="flex justify-between"><span>Total Queued:</span> <span className="font-medium text-gray-900">{lanes.reduce((acc, l) => acc + (l.queue?.queued || 0), 0)}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {lanes.map((lane) => (
          <LaneCard
            key={lane.slot_number}
            lane={lane}
            handleToggleStatus={handleToggleStatus}
            openAssignModal={(slot) => openAssignModal(slot, lane.id ? lane : undefined)}
          />
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
              <h3 className="text-lg font-bold text-gray-900 m-0">Assign Lane {selectedSlot}</h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            
            <form onSubmit={handleAssignSubmit} className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Target Niche (Optional)</label>
                <select
                  value={formNicheId}
                  onChange={e => setFormNicheId(e.target.value)}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white px-3 py-2 border text-sm"
                >
                  <option value="">All available leads</option>
                  {niches.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                <p className="mt-1 text-xs text-gray-500">If selected, this lane will only call leads matching this niche.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Calling Script</label>
                  <select
                    required
                    value={formScriptId}
                    onChange={e => setFormScriptId(e.target.value)}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white px-3 py-2 border text-sm"
                  >
                    <option value="" disabled>Select a published script...</option>
                    {scripts.map(s => <option key={s.id} value={s.published_version_id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Voice Agent Profile</label>
                  <select
                    required
                    value={formAgentId}
                    onChange={e => setFormAgentId(e.target.value)}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white px-3 py-2 border text-sm"
                  >
                    <option value="" disabled>Select a voice config...</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number A</label>
                  <select
                    required
                    value={formNumber1}
                    onChange={e => setFormNumber1(e.target.value)}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white px-3 py-2 border text-sm"
                  >
                    <option value="" disabled>Select number...</option>
                    {numbers.filter(n => n.id !== formNumber2).map(n => <option key={n.id} value={n.id}>{n.phone_number}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number B</label>
                  <select
                    required
                    value={formNumber2}
                    onChange={e => setFormNumber2(e.target.value)}
                    className="w-full rounded-lg border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white px-3 py-2 border text-sm"
                  >
                    <option value="" disabled>Select number...</option>
                    {numbers.filter(n => n.id !== formNumber1).map(n => <option key={n.id} value={n.id}>{n.phone_number}</option>)}
                  </select>
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-1 flex items-center">
                <AlertCircle className="w-3 h-3 mr-1 inline" /> 
                Two unique numbers are required for rotation to prevent carrier blocking.
              </p>

              <div className="pt-4 border-t border-gray-100 flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                  disabled={formSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? 'Assigning...' : 'Assign Configuration'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Analytics and History Tab */}
      <CallHistory />
    </div>
  );
}
