import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import leaderboardApi, { LeaderboardEntry } from '../services/leaderboardApi';

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export default function LeaderboardPage() {
  const [period, setPeriod] = useState<'today' | 'week' | 'month'>('today');

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', period],
    queryFn: () => leaderboardApi.getRankings(period)
  });

  const leaderboard = data?.leaderboard || [];
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  // Reorder top 3 for podium (2nd, 1st, 3rd)
  const podium = [
    top3[1] || null,
    top3[0] || null,
    top3[2] || null
  ];

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontFamily: 'Space Grotesk, sans-serif', fontSize: 28, fontWeight: 700, color: '#14202B', margin: '0 0 8px' }}>
            🏆 Leaderboard
          </h1>
          <p style={{ color: '#52606D', fontSize: 15, margin: 0 }}>
            Top performers based on leads generated and connected calls.
          </p>
        </div>
        
        <div style={{ display: 'flex', background: '#F3F4F6', padding: 4, borderRadius: 8 }}>
          {(['today', 'week', 'month'] as const).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              style={{
                background: period === p ? '#fff' : 'transparent',
                border: 'none',
                padding: '6px 16px',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                color: period === p ? '#0F766E' : '#7B8794',
                boxShadow: period === p ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                cursor: 'pointer',
                textTransform: 'capitalize'
              }}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7B8794' }}>Loading rankings...</div>
      ) : leaderboard.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#7B8794', background: '#fff', borderRadius: 12, border: '1px solid #D8E1D7' }}>
          No data available for this period.
        </div>
      ) : (
        <>
          {/* Podium */}
          {top3.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', gap: 16, marginBottom: 40, height: 280 }}>
              {podium.map((agent, index) => {
                if (!agent) return <div key={index} style={{ width: 140 }} />;
                
                // Index 0 is 2nd place, Index 1 is 1st place, Index 2 is 3rd place
                const place = index === 0 ? 2 : index === 1 ? 1 : 3;
                const height = place === 1 ? 200 : place === 2 ? 160 : 120;
                const colors = {
                  1: { bg: '#FEF3C7', border: '#F59E0B', text: '#B45309', medal: '🥇' },
                  2: { bg: '#F1F5F9', border: '#94A3B8', text: '#475569', medal: '🥈' },
                  3: { bg: '#FFEDD5', border: '#FDBA74', text: '#C2410C', medal: '🥉' }
                };

                return (
                  <div key={agent.id} style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', width: 160 }}>
                    <div style={{ textAlign: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 32, marginBottom: 4 }}>{colors[place].medal}</div>
                      <div style={{ fontWeight: 700, color: '#14202B', fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 150 }}>{agent.name}</div>
                      <div style={{ fontSize: 12, color: '#0F766E', fontWeight: 600 }}>{agent.leads_generated} Leads</div>
                    </div>
                    <div style={{ 
                      width: '100%', 
                      height, 
                      background: colors[place].bg,
                      borderTop: `4px solid ${colors[place].border}`,
                      borderTopLeftRadius: 12,
                      borderTopRightRadius: 12,
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: colors[place].text,
                      boxShadow: '0 -4px 12px rgba(0,0,0,0.05)'
                    }}>
                      <div style={{ fontSize: 48, fontWeight: 800, opacity: 0.3 }}>{place}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #D8E1D7', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F8FAF9', borderBottom: '2px solid #D8E1D7' }}>
                  <th style={{ padding: '16px', textAlign: 'center', width: 60, color: '#7B8794', fontSize: 13 }}>Rank</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#7B8794', fontSize: 13 }}>Agent</th>
                  <th style={{ padding: '16px', textAlign: 'left', color: '#7B8794', fontSize: 13 }}>Team</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#7B8794', fontSize: 13 }}>Leads</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#7B8794', fontSize: 13 }}>Connected</th>
                  <th style={{ padding: '16px', textAlign: 'center', color: '#7B8794', fontSize: 13 }}>Talk Time</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((agent, i) => (
                  <tr key={agent.id} style={{ borderBottom: '1px solid #E5E7EB' }}>
                    <td style={{ padding: '16px', textAlign: 'center', fontWeight: 700, color: i < 3 ? '#0F766E' : '#9CA3AF' }}>
                      #{i + 1}
                    </td>
                    <td style={{ padding: '16px', fontWeight: 600, color: '#14202B' }}>{agent.name}</td>
                    <td style={{ padding: '16px', color: '#52606D', fontSize: 14 }}>{agent.team_name || '-'}</td>
                    <td style={{ padding: '16px', textAlign: 'center', fontWeight: 700, color: '#0F766E' }}>{agent.leads_generated}</td>
                    <td style={{ padding: '16px', textAlign: 'center', color: '#52606D' }}>{agent.connected_calls}</td>
                    <td style={{ padding: '16px', textAlign: 'center', color: '#52606D' }}>{formatDuration(agent.total_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
