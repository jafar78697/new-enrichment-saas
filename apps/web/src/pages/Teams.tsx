import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import teamsApi, { Team } from '../services/teamsApi';
import employeesApi from '../services/employeesApi';
import { toast } from 'sonner';

export default function TeamsPage() {
  const queryClient = useQueryClient();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<Team | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '', leader_id: '' });

  const { data: teamsData, isLoading: isLoadingTeams } = useQuery({
    queryKey: ['teams'],
    queryFn: () => teamsApi.list(),
  });

  const { data: employeesData } = useQuery({
    queryKey: ['employees'],
    queryFn: () => employeesApi.list(),
  });

  const mutation = useMutation({
    mutationFn: (data: { id?: number; name: string; description: string; leader_id: number | null }) => {
      if (data.id) return teamsApi.update(data.id, data);
      return teamsApi.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      setIsModalOpen(false);
    },
    onError: (err: any) => toast.error(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => teamsApi.remove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const handleOpenModal = (team?: Team) => {
    if (team) {
      setEditingTeam(team);
      setFormData({ name: team.name, description: team.description || '', leader_id: team.leader_id ? String(team.leader_id) : '' });
    } else {
      setEditingTeam(null);
      setFormData({ name: '', description: '', leader_id: '' });
    }
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    mutation.mutate({
      id: editingTeam?.id,
      name: formData.name,
      description: formData.description,
      leader_id: formData.leader_id ? Number(formData.leader_id) : null,
    });
  };

  const teams = teamsData?.teams || [];
  const employees = employeesData?.employees || [];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            👥 Teams
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            Organize employees into teams and assign Team Leaders.
          </p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          style={{
            background: '#0F766E',
            color: '#fff',
            border: 'none',
            padding: '10px 20px',
            borderRadius: 8,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Create Team
        </button>
      </div>

      {isLoadingTeams ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading teams...</div>
      ) : teams.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7B8794', background: '#fff', borderRadius: 12, border: '1px solid #D8E1D7' }}>
          No teams created yet. Click "Create Team" to get started.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
          {teams.map((team) => (
            <div key={team.id} style={{ background: '#fff', border: '1px solid #D8E1D7', borderRadius: 12, padding: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 18, color: '#14202B' }}>{team.name}</h3>
                  <div style={{ fontSize: 13, color: '#7B8794' }}>{team.description || 'No description'}</div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => handleOpenModal(team)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>✏️</button>
                  <button onClick={() => { if(confirm('Are you sure?')) deleteMutation.mutate(team.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16 }}>🗑️</button>
                </div>
              </div>
              
              <div style={{ background: '#F8FAF9', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#52606D', textTransform: 'uppercase', marginBottom: 4 }}>Team Leader</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {team.leader_id ? (
                    <>
                      <div style={{ width: 24, height: 24, background: '#0F766E', color: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10 }}>👑</div>
                      <span style={{ fontWeight: 600, color: '#0F766E' }}>{team.leader_name}</span>
                    </>
                  ) : (
                    <span style={{ color: '#9CA3AF', fontStyle: 'italic' }}>No leader assigned</span>
                  )}
                </div>
              </div>
              
              <div style={{ marginTop: 16, fontSize: 13, color: '#52606D' }}>
                <strong>{employees.filter(e => (e as any).team_id === team.id).length}</strong> Members
              </div>
            </div>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <div style={{ background: '#fff', width: 400, borderRadius: 16, padding: 24 }}>
            <h2 style={{ margin: '0 0 20px', fontSize: 20 }}>{editingTeam ? 'Edit Team' : 'Create Team'}</h2>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Team Name</label>
                <input required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #D8E1D7' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Description</label>
                <textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} rows={3} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #D8E1D7' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Team Leader (Optional)</label>
                <select value={formData.leader_id} onChange={e => setFormData({...formData, leader_id: e.target.value})} style={{ width: '100%', padding: '8px 12px', borderRadius: 6, border: '1px solid #D8E1D7' }}>
                  <option value="">-- None --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
                <button type="button" onClick={() => setIsModalOpen(false)} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #D8E1D7', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#0F766E', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>{mutation.isPending ? 'Saving...' : 'Save'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
