import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import api from '../../services/api';

export default function ScriptManager() {
  const navigate = useNavigate();
  const [scripts, setScripts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchScripts();
  }, []);

  async function fetchScripts() {
    try {
      const res = await api.get('/multi-calling/scripts');
      setScripts(res.data.scripts || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function deleteScript(id: string, evt: React.MouseEvent) {
    evt.stopPropagation();
    if (!window.confirm('Are you sure you want to delete this script? This action cannot be undone.')) return;
    
    try {
      await api.delete(`/multi-calling/scripts/${id}`);
      setScripts(scripts.filter(s => s.id !== id));
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to delete script');
    }
  }

  return (
    <div className="h-[calc(100vh-100px)] flex flex-col bg-[#121212] rounded-xl overflow-hidden border border-gray-800">
      <div className="bg-[#1a1a1a] p-4 flex justify-between items-center border-b border-gray-800">
        <div className="flex items-center space-x-4">
          <button 
            onClick={() => navigate('/pipeline?mode=multi')}
            className="text-gray-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold text-white">Call Scripts</h1>
        </div>
        <button 
          onClick={() => navigate('/multi-ai-calling/builder/new')}
          className="flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition shadow-lg"
        >
          <Plus className="w-5 h-5 mr-2" />
          Create New Script
        </button>
      </div>

      <div className="flex-1 p-8 overflow-y-auto">
        {loading ? (
          <div className="flex justify-center mt-20">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          </div>
        ) : scripts.length === 0 ? (
          <div className="flex flex-col items-center justify-center mt-32 text-gray-500">
            <FileText className="w-16 h-16 mb-4 opacity-50" />
            <h2 className="text-xl font-semibold mb-2 text-gray-300">No Scripts Found</h2>
            <p className="mb-6">You haven't created any calling scripts yet.</p>
            <button 
              onClick={() => navigate('/multi-ai-calling/builder/new')}
              className="flex items-center px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white font-medium rounded-xl transition border border-gray-700"
            >
              <Plus className="w-5 h-5 mr-2" />
              Create your first script
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            <div 
              onClick={() => navigate('/multi-ai-calling/builder/new')}
              className="group flex flex-col items-center justify-center h-48 bg-blue-900/10 hover:bg-blue-900/20 border-2 border-dashed border-blue-500/30 hover:border-blue-500 rounded-xl cursor-pointer transition-all duration-200"
            >
              <div className="w-12 h-12 rounded-full bg-blue-500/20 flex items-center justify-center group-hover:scale-110 transition-transform mb-3">
                <Plus className="w-6 h-6 text-blue-400" />
              </div>
              <span className="font-medium text-blue-400">Create New Script</span>
            </div>

            {scripts.map((script) => (
              <div 
                key={script.id}
                onClick={() => navigate(`/multi-ai-calling/builder/${script.id}`)}
                className="group flex flex-col h-48 bg-[#1e1e1e] hover:bg-[#252525] border border-gray-800 hover:border-gray-600 rounded-xl p-5 cursor-pointer transition-all duration-200 shadow-md"
              >
                <div className="flex-1">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-lg text-white group-hover:text-blue-400 transition-colors line-clamp-2">
                      {script.name}
                    </h3>
                  </div>
                  {script.published_version_id ? (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-900/30 text-green-400 border border-green-800">
                      Published
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-gray-800 text-gray-400 border border-gray-700">
                      Draft
                    </span>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t border-gray-800 flex justify-between items-center text-sm text-gray-500">
                  <span className="flex-1">Click to edit</span>
                  <button 
                    onClick={(e) => deleteScript(script.id, e)}
                    className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-400/10 rounded mr-2 transition-colors"
                    title="Delete Script"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                  <ArrowLeft className="w-4 h-4 rotate-180 opacity-0 group-hover:opacity-100 transition-opacity text-blue-400" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
