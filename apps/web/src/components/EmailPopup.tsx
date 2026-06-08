import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { callsApi } from '../services/callsApi';
import { toast } from 'sonner';

interface EmailPopupProps {
  contactId: number;
  contactName: string;
  contactEmail: string;
  onClose: () => void;
}

export default function EmailPopup({ contactId, contactName, contactEmail, onClose }: EmailPopupProps) {
  const [subject, setSubject] = useState('Checking in');
  const [body, setBody] = useState(`Hi ${contactName.split(' ')[0]},\n\nI wanted to reach out regarding...\n\nBest,\nJentoAI Team`);
  const queryClient = useQueryClient();

  const sendMutation = useMutation({
    mutationFn: () => callsApi.sendContactEmail(contactId, { subject, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      onClose();
    },
    onError: (err) => {
      toast.error('Failed to send email: ' + err.message);
    }
  });

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 500,
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 20
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#111827', fontWeight: 700 }}>Send Email</h2>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6B7280' }}>To: {contactName} ({contactEmail})</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 24, height: 24 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Subject</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            style={{ padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14 }}
          />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>Message</label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            style={{ padding: '10px 14px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, minHeight: 150, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10 }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 16px', background: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={() => sendMutation.mutate()}
            disabled={sendMutation.isPending}
            style={{
              padding: '10px 20px', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: sendMutation.isPending ? 'wait' : 'pointer',
              opacity: sendMutation.isPending ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            {sendMutation.isPending ? 'Sending...' : 'Send Email'}
            {!sendMutation.isPending && (
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
