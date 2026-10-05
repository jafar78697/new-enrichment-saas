import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { Clock, FileText, CheckCircle, XCircle, AlertCircle, PlayCircle } from 'lucide-react';

const formatDate = (dateString: string) => {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', 
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(dateString));
};

export function CallHistory() {
  const [history, setHistory] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const limit = 20;

  useEffect(() => {
    loadHistory();
  }, [page]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/multi-calling/history?limit=${limit}&offset=${(page - 1) * limit}`);
      setHistory(res.data.history);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="w-full space-y-5 mt-8">
      <div className="flex flex-wrap justify-between items-center gap-3 border-t pt-8">
        <div>
          <h2 className="text-xl font-bold text-gray-900 m-0">Call History & Analytics</h2>
          <p className="text-sm text-gray-500 mt-1">Deep-dive into the outcome of your multi-lane calling sessions.</p>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        {loading && history.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Loading history...</div>
        ) : history.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No calls found in history.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-gray-50 text-gray-700 border-b">
                <tr>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Lane</th>
                  <th className="px-4 py-3">Prospect</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(session => (
                  <tr key={session.session_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      {formatDate(session.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {session.lane_slot ? <span className="px-2 py-1 bg-gray-100 rounded-md text-xs font-mono border">Lane {session.lane_slot}</span> : <span className="text-gray-400">N/A</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{session.person_name || 'Unknown'}</div>
                      <div className="text-xs text-gray-500">{session.company_name || session.primary_phone || ''}</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {session.outcome === 'interested' ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium flex items-center w-max"><CheckCircle className="w-3 h-3 mr-1"/> Interested</span>
                      ) : session.outcome === 'not_interested' ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium flex items-center w-max"><XCircle className="w-3 h-3 mr-1"/> Not Interested</span>
                      ) : session.outcome === 'no_answer' ? (
                        <span className="px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium flex items-center w-max"><AlertCircle className="w-3 h-3 mr-1"/> No Answer</span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">{session.outcome || session.call_state || 'Pending'}</span>
                      )}
                      {session.hangup_reason && session.hangup_reason !== 'completed' && <div className="text-[10px] text-gray-400 mt-1 capitalize truncate max-w-[120px]">{session.hangup_reason.replace('_', ' ')}</div>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">
                      <div className="flex items-center"><Clock className="w-3 h-3 mr-1 text-gray-400"/> {session.duration_sec || 0}s</div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button 
                        onClick={() => setSelectedSession(session)}
                        className="text-blue-600 hover:text-blue-800 text-xs font-medium flex items-center"
                      >
                        <FileText className="w-3 h-3 mr-1"/> Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t bg-gray-50 flex items-center justify-between">
            <span className="text-sm text-gray-600">Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total}</span>
            <div className="flex gap-2">
              <button 
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 bg-white border rounded text-sm disabled:opacity-50 font-medium text-gray-700"
              >
                Previous
              </button>
              <button 
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 bg-white border rounded text-sm disabled:opacity-50 font-medium text-gray-700"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
              <div>
                <h3 className="text-lg font-bold">Call Details</h3>
                <p className="text-xs text-gray-500">SID: {selectedSession.signalwire_call_sid || selectedSession.session_id}</p>
              </div>
              <button onClick={() => setSelectedSession(null)} className="text-gray-400 hover:text-gray-600 text-2xl font-light">&times;</button>
            </div>
            
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block mb-1">Prospect Information</span>
                  <div className="font-medium text-base">{selectedSession.person_name || 'N/A'}</div>
                  <div className="text-gray-700 mt-1">{selectedSession.company_name || 'No company'}</div>
                  <div className="text-gray-600 mt-2 font-mono text-xs">{selectedSession.primary_phone || 'No phone'}</div>
                  <div className="text-gray-600 font-mono text-xs">{selectedSession.primary_email || 'No email'}</div>
                </div>
                <div>
                  <span className="text-gray-500 block mb-1">Call Details</span>
                  <div className="font-medium text-base">{selectedSession.lane_name || `Lane ${selectedSession.lane_slot}`}</div>
                  <div className="mt-1">Outcome: <span className="capitalize font-medium text-gray-800">{selectedSession.outcome?.replace('_', ' ') || selectedSession.call_state}</span></div>
                  <div>Duration: <span className="font-medium text-gray-800">{selectedSession.duration_sec || 0}s</span></div>
                  <div>Time: <span className="font-medium text-gray-800">{formatDate(selectedSession.created_at)}</span></div>
                </div>
              </div>

              {selectedSession.lead_notes && (
                <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 text-sm">
                  <strong className="text-amber-800 block mb-1">CRM Notes & Outcomes</strong>
                  <pre className="whitespace-pre-wrap font-sans text-amber-700">{selectedSession.lead_notes}</pre>
                </div>
              )}

              <div>
                <h4 className="font-semibold text-gray-800 mb-3 border-b pb-1">AI Transcript</h4>
                {selectedSession.transcript && selectedSession.transcript.length > 0 ? (
                  <div className="space-y-3 bg-gray-50 p-4 rounded-lg border h-[300px] overflow-y-auto shadow-inner">
                    {selectedSession.transcript.map((t: any, i: number) => (
                      <div key={i} className={`flex flex-col ${t.role === 'agent' ? 'items-start' : 'items-end'}`}>
                        <span className="text-[10px] text-gray-400 uppercase tracking-wider mb-1">{t.role}</span>
                        <div className={`px-3 py-2 rounded-lg max-w-[85%] text-sm ${t.role === 'agent' ? 'bg-white border text-gray-800 rounded-tl-none shadow-sm' : 'bg-blue-600 text-white rounded-tr-none shadow-sm'}`}>
                          {t.content}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500 italic p-6 bg-gray-50 rounded-lg border text-center">
                    No transcript available for this call.
                  </div>
                )}
              </div>
            </div>
            
            <div className="p-4 border-t bg-gray-50 rounded-b-xl flex justify-between items-center">
               <div className="text-xs text-gray-500 flex items-center bg-gray-200 px-3 py-1.5 rounded-full font-medium">
                 <PlayCircle className="w-4 h-4 mr-1.5 text-gray-600"/> 
                 {selectedSession.duration_sec > 0 ? 'Recording is stored in SignalWire' : 'Recording unavailable'}
               </div>
               <button 
                  onClick={() => setSelectedSession(null)}
                  className="px-4 py-2 bg-white border hover:bg-gray-50 text-gray-800 rounded-lg text-sm font-medium transition shadow-sm"
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
