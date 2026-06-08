import type { LeadEvent } from '../types';

interface Props {
  events: LeadEvent[];
}

const eventColors: Record<string, string> = {
  scraped: '#94a3b8',
  enriched: '#10b981',
  enrichment_failed: '#ef4444',
  enriching: '#f59e0b',
  imported: '#94a3b8',
  campaign_assigned: '#6366f1',
  email_sent: '#6366f1',
  followed_up: '#8b5cf6',
  replied: '#10b981',
  bounced: '#ef4444',
  failed: '#ef4444',
  skipped_no_email: '#94a3b8',
};

const eventLabels: Record<string, string> = {
  scraped: '🔍 Scraped',
  enriched: '✅ Enriched',
  enrichment_failed: '❌ Enrichment Failed',
  enriching: '⚡ Enriching',
  imported: '📥 Imported',
  campaign_assigned: '📋 Assigned to Campaign',
  email_sent: '📤 Email Sent',
  followed_up: '🔁 Follow-up Sent',
  followup_1: '🔁 Follow-up #1 (Day 3)',
  followup_2: '🔁 Follow-up #2 (Day 7)',
  followup_3: '🔚 Breakup Email (Day 14)',
  replied: '💬 Replied',
  bounced: '⚠️ Bounced',
  failed: '❌ Failed',
  skipped_no_email: '⏭ Skipped (no email)',
};

export default function Timeline({ events }: Props) {
  if (!events.length) {
    return <p style={{ color: 'var(--text-muted)', fontSize: 12 }}>No events yet.</p>;
  }

  return (
    <div className="timeline">
      {events.map(e => {
        let meta: Record<string, string> = {};
        try { meta = JSON.parse(e.metadata || '{}'); } catch {}

        return (
          <div key={e.id} className="timeline-item">
            <div
              className="timeline-dot"
              style={{ background: eventColors[e.event_type] ?? 'var(--accent-primary)' }}
            />
            <div className="timeline-content">
              <div className="timeline-event">
                {eventLabels[e.event_type] ?? e.event_type.replace(/_/g, ' ')}
              </div>
              {meta.subject && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Subject: {meta.subject}
                </div>
              )}
              {(e.sender_email || meta.from) && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>
                  From: {e.sender_email || meta.from}
                </div>
              )}
              <div className="timeline-time">
                {new Date(e.created_at).toLocaleString()}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
