import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiKeysApi } from '../services/api';

export default function ApiKeysPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);

  const { data } = useQuery({ queryKey: ['api-keys'], queryFn: () => apiKeysApi.list().then(r => r.data) });

  const createMutation = useMutation({
    mutationFn: () => apiKeysApi.create(newKeyName),
    onSuccess: (res) => {
      setRevealedKey(res.data.key);
      setNewKeyName('');
      setShowCreate(false);
      qc.invalidateQueries({ queryKey: ['api-keys'] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: string) => apiKeysApi.revoke(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['api-keys'] }),
  });

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-text-primary">API Keys</h1>
        <button onClick={() => setShowCreate(true)} className="bg-brand-primary hover:bg-brand-hover text-white px-4 py-2 rounded-lg text-sm font-medium">+ Create Key</button>
      </div>

      {/* Revealed key — show once */}
      {revealedKey && (
        <div className="bg-amber-50 border border-signal rounded-xl p-4">
          <p className="text-sm font-medium text-amber-800 mb-2">⚠ Copy this key now — you will only see it once.</p>
          <code className="block font-mono text-xs bg-white border border-border-soft rounded p-3 break-all select-all">{revealedKey}</code>
          <button onClick={() => { navigator.clipboard.writeText(revealedKey); }} className="mt-2 text-xs text-brand-primary hover:underline">Copy to clipboard</button>
          <button onClick={() => setRevealedKey(null)} className="ml-4 text-xs text-text-muted hover:text-text-primary">Dismiss</button>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div className="bg-surface border border-border-soft rounded-xl p-5">
          <p className="font-heading font-semibold text-text-primary mb-3">Create New API Key</p>
          <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name (e.g. Production)"
            className="w-full border border-border-soft rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-primary mb-3" />
          <div className="flex gap-2">
            <button onClick={() => createMutation.mutate()} disabled={!newKeyName || createMutation.isPending}
              className="bg-brand-primary text-white px-4 py-2 rounded-lg text-sm hover:bg-brand-hover disabled:opacity-50">Create</button>
            <button onClick={() => setShowCreate(false)} className="px-4 py-2 rounded-lg text-sm border border-border-soft text-text-secondary">Cancel</button>
          </div>
        </div>
      )}

      {/* Keys table */}
      <div className="bg-surface border border-border-soft rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-subtle border-b border-border-soft">
            <tr>
              {['Name', 'Key', 'Last Used', 'Created', ''].map(h => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-text-secondary">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border-soft">
            {data?.keys?.map((key: any) => (
              <tr key={key.id} className="hover:bg-subtle">
                <td className="px-4 py-3 text-text-primary">{key.name || 'Unnamed'}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-muted">{key.key_prefix}...****</td>
                <td className="px-4 py-3 text-xs text-text-muted">{key.last_used_at ? new Date(key.last_used_at).toLocaleDateString() : 'Never'}</td>
                <td className="px-4 py-3 text-xs text-text-muted">{new Date(key.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => revokeMutation.mutate(key.id)} className="text-xs text-danger hover:underline">Revoke</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
