import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getCallUser } from '../services/employeesApi';
import api from '../services/api';
import { toast } from 'sonner';

export default function AgentSettings() {
  const user = getCallUser();
  const queryClient = useQueryClient();
  const [cookie, setCookie] = useState('');
  const [dailyLimit, setDailyLimit] = useState(25);
  const [connectionTemplate, setConnectionTemplate] = useState('Hi {name}, I would love to connect.');
  
  const [redditCookie, setRedditCookie] = useState('');
  const [redditDailyLimit, setRedditDailyLimit] = useState(25);
  const [redditTemplate, setRedditTemplate] = useState('Hi {name}, I saw your post and wanted to connect.');

  const [success, setSuccess] = useState('');

  const { data: agents } = useQuery({
    queryKey: ['agent_settings', user?.id],
    queryFn: async () => {
      const res = await api.get('/agents');
      return res.data;
    },
    enabled: !!user?.id
  });

  useEffect(() => {
    if (agents && agents.length > 0) {
      const me = agents[0];
      if (me.linkedin_daily_limit) setDailyLimit(me.linkedin_daily_limit);
      if (me.linkedin_connection_template) setConnectionTemplate(me.linkedin_connection_template);
      if (me.reddit_daily_limit) setRedditDailyLimit(me.reddit_daily_limit);
      if (me.reddit_connection_template) setRedditTemplate(me.reddit_connection_template);
    }
  }, [agents]);

  const updateLinkedinMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.patch(`/agents/${user?.id}/linkedin`, payload);
    },
    onSuccess: () => {
      setSuccess('linkedin');
      setTimeout(() => setSuccess(''), 3000);
      setCookie(''); // clear cookie input for security
      queryClient.invalidateQueries({ queryKey: ['agent_settings'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update settings');
    }
  });

  const handleSave = () => {
    updateLinkedinMutation.mutate({
      cookie: cookie ? cookie : undefined,
      daily_limit: Number(dailyLimit),
      connection_template: connectionTemplate
    });
  };

  const updateRedditMutation = useMutation({
    mutationFn: async (payload: any) => {
      await api.patch(`/agents/${user?.id}/reddit`, payload);
    },
    onSuccess: () => {
      setSuccess('reddit');
      setTimeout(() => setSuccess(''), 3000);
      setRedditCookie(''); // clear cookie input
      queryClient.invalidateQueries({ queryKey: ['agent_settings'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to update Reddit settings');
    }
  });

  const handleRedditSave = () => {
    updateRedditMutation.mutate({
      session: redditCookie ? redditCookie : undefined,
      daily_limit: Number(redditDailyLimit),
      connection_template: redditTemplate
    });
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', paddingTop: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 24, color: '#14202B' }}>Agent Settings</h1>
      
      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #E5E7EB' }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#111827' }}>LinkedIn Automation</h2>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
          To unlock automatic profile scraping and auto-connect features, you must provide your LinkedIn session cookie (li_at).
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            li_at Cookie
          </label>
          <input
            type="password"
            placeholder="Paste your li_at cookie here (Leave blank to keep existing)"
            value={cookie}
            onChange={(e) => setCookie(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
          <p style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
            You can find this by logging into LinkedIn, opening Developer Tools {'>'} Application {'>'} Cookies.
          </p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Daily Connection Limit
          </label>
          <input
            type="number"
            value={dailyLimit}
            onChange={(e) => setDailyLimit(Number(e.target.value))}
            min={1}
            max={100}
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Connection Note Template
          </label>
          <textarea
            value={connectionTemplate}
            onChange={(e) => setConnectionTemplate(e.target.value)}
            rows={4}
            placeholder="Hi {name}, I'd love to connect!"
            style={{
              width: '100%',
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #D1D5DB',
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
              resize: 'vertical'
            }}
          />
        </div>

        <button
          onClick={handleSave}
          disabled={updateLinkedinMutation.isPending}
          style={{
            background: '#0F766E',
            color: '#fff',
            fontWeight: 600,
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: updateLinkedinMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: updateLinkedinMutation.isPending ? 0.7 : 1
          }}
        >
          {updateLinkedinMutation.isPending ? 'Saving...' : 'Save LinkedIn Settings'}
        </button>

        {success === 'linkedin' && (
          <div style={{ marginTop: 16, padding: 12, background: '#D1FAE5', color: '#065F46', borderRadius: 8, fontSize: 14 }}>
            ✅ LinkedIn settings securely saved!
          </div>
        )}
      </div>

      <div style={{ background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid #E5E7EB', marginTop: 24 }}>
        <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#111827' }}>Reddit Automation</h2>
        <p style={{ fontSize: 14, color: '#6B7280', marginBottom: 20 }}>
          Provide your Reddit session cookie to enable automated DMs and profile outreach on Reddit.
        </p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            reddit_session Cookie
          </label>
          <input
            type="password"
            placeholder="Paste your reddit_session cookie here (Leave blank to keep existing)"
            value={redditCookie}
            onChange={(e) => setRedditCookie(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Daily DM Limit
          </label>
          <input
            type="number"
            value={redditDailyLimit}
            onChange={(e) => setRedditDailyLimit(Number(e.target.value))}
            min={1}
            max={100}
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            Initial Message Template
          </label>
          <textarea
            value={redditTemplate}
            onChange={(e) => setRedditTemplate(e.target.value)}
            rows={4}
            placeholder="Hi {name}, saw your post..."
            style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #D1D5DB', fontSize: 14, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }}
          />
        </div>

        <button
          onClick={handleRedditSave}
          disabled={updateRedditMutation.isPending}
          style={{
            background: '#ff4500',
            color: '#fff',
            fontWeight: 600,
            padding: '10px 20px',
            borderRadius: 8,
            border: 'none',
            cursor: updateRedditMutation.isPending ? 'not-allowed' : 'pointer',
            opacity: updateRedditMutation.isPending ? 0.7 : 1
          }}
        >
          {updateRedditMutation.isPending ? 'Saving...' : 'Save Reddit Settings'}
        </button>

        {success === 'reddit' && (
          <div style={{ marginTop: 16, padding: 12, background: '#FFEDD5', color: '#9A3412', borderRadius: 8, fontSize: 14 }}>
            ✅ Reddit settings securely saved!
          </div>
        )}
      </div>

    </div>
  );
}
