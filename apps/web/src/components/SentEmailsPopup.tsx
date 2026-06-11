import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { callsApi } from '../services/callsApi';
import EmailPopup from './EmailPopup';

interface SentEmailsPopupProps {
  contactId: number;
  contactName: string;
  contactEmail: string;
  onClose: () => void;
}

export default function SentEmailsPopup({ contactId, contactName, contactEmail, onClose }: SentEmailsPopupProps) {
  const [showSendEmail, setShowSendEmail] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['contactEmails', contactId],
    queryFn: () => callsApi.getContactEmails(contactId),
  });

  if (showSendEmail) {
    return <EmailPopup contactId={contactId} contactName={contactName} contactEmail={contactEmail} onClose={() => { setShowSendEmail(false); onClose(); }} />;
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999,
      backgroundColor: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
      <div style={{
        background: '#fff', borderRadius: 16, padding: 32, width: '100%', maxWidth: 600, maxHeight: '80vh',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column', gap: 20, overflow: 'hidden'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, color: '#111827', fontWeight: 700 }}>Email History</h2>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#6B7280' }}>For: {contactName} ({contactEmail})</p>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9CA3AF' }}>
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 24, height: 24 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isLoading ? (
            <div style={{ textAlign: 'center', padding: 20, color: '#6B7280' }}>Loading emails...</div>
          ) : data?.emails && data.emails.length > 0 ? (
            data.emails.map((email: any) => (
              <div key={email.id} style={{ border: '1px solid #E5E7EB', borderRadius: 12, padding: 16, background: '#F9FAFB' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ fontWeight: 700, color: '#1F2937' }}>{email.subject}</div>
                  <div style={{ fontSize: 12, color: '#6B7280' }}>{new Date(email.sent_at).toLocaleString()}</div>
                </div>
                <div style={{ fontSize: 12, color: '#4B5563', marginBottom: 12 }}>From: {email.from_email}</div>
                <div 
                  style={{ fontSize: 14, color: '#374151', lineHeight: 1.5, background: '#fff', padding: 12, borderRadius: 8, border: '1px solid #E5E7EB' }}
                  dangerouslySetInnerHTML={{ __html: email.body }}
                />
              </div>
            ))
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#6B7280', background: '#F9FAFB', borderRadius: 12 }}>
              No emails sent to this contact yet.
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 10, paddingTop: 16, borderTop: '1px solid #E5E7EB' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 16px', background: '#F3F4F6', color: '#4B5563', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer' }}
          >
            Close
          </button>
          <button
            onClick={() => setShowSendEmail(true)}
            style={{
              padding: '10px 20px', background: '#0F766E', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 8
            }}
          >
            Send New Email
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style={{ width: 16, height: 16 }}><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
}
