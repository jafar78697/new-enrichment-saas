export type Screen = 'dashboard' | 'funnel' | 'gmail-accounts' | 'domains' | 'business-emails' | 'campaigns' | 'prospects' | 'inbox' | 'warmup';

export interface StatCard {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'neutral';
}

export interface GmailAccount {
  id: string;
  email: string;
  connectionType: 'App Password' | 'OAuth';
  dailyLimit: number;
  sentToday: number;
  status: 'verified' | 'unverified' | 'error';
}

export interface Domain {
  id: string;
  name: string;
  zoneId?: string;
  spf: boolean;
  dkim: boolean;
  dmarc: boolean;
}

export interface BusinessEmail {
  id: string;
  email: string;
  displayName: string;
  parentDomain: string;
  sendingAccount: string;
}

export interface Campaign {
  id: string;
  name: string;
  progress: number;
  status: 'Running' | 'Paused' | 'Draft';
  subject: string;
  body: string;
  followUpDelay: number;
}

export interface Prospect {
  id: string;
  name: string;
  salon: string;
  city: string;
  status: 'Pending' | 'Sent' | 'Replied' | 'Unsubscribed';
  campaignId: string;
}

export interface Message {
  id: string;
  senderName: string;
  senderEmail: string;
  subject: string;
  body: string;
  timestamp: string;
  repliedToAccount: string;
}

// ─── Funnel Types ─────────────────────────────────────────────────────
export type JobStatus = 'Running' | 'Completed' | 'Failed' | 'Paused' | 'Draft';

export type LeadStatus =
  | 'scraped'
  | 'enriching'
  | 'enriched'
  | 'enrichment_failed'
  | 'pending_enrichment'
  | 'imported'
  | 'replied'
  | 'blocked';

export type SendStatus =
  | 'pending'
  | 'sent'
  | 'opened'
  | 'replied'
  | 'bounced'
  | 'failed'
  | 'skipped_no_email'
  | 'followed_up';

export type FunnelStage =
  | 'scraped'
  | 'enriched'
  | 'qualified'
  | 'email_sent'
  | 'follow_up_1'
  | 'follow_up_2'
  | 'call_attempted'
  | 'voicemail_left'
  | 'replied'
  | 'booked'
  | 'closed'
  | 'lost'
  | 'dnc';

export interface Lead {
  id: string;
  bot_job_id?: string;
  salon_name: string;
  website?: string;
  phone?: string;
  address?: string;
  contact_email?: string;
  lead_status: LeadStatus;
  website_data?: string;
  personalization?: string;
  notes?: string;
  added_at: string;
  send_status?: SendStatus;
  campaign_name?: string;
}

export interface FunnelLead extends Lead {
  funnel_stage: FunnelStage;
  lead_score: number;
  niche?: string;
  campaign_id?: number;
  assigned_to?: number;
  call_count: number;
  last_call_outcome?: string;
  last_call_at?: string;
  last_call_notes?: string;
  last_call_recording_url?: string;
  instagram_dm_status: string;
  instagram_dm_at?: string;
  facebook_dm_status: string;
  facebook_dm_at?: string;
  linkedin_dm_status: string;
  linkedin_dm_at?: string;
  x_dm_status: string;
  x_dm_at?: string;
  whatsapp_status: string;
  whatsapp_sent_at?: string;
  sms_status: string;
  sms_sent_at?: string;
  sequence_day: number;
  next_followup_at?: string;
  sequence_paused: number;
  booked_at?: string;
  closed_at?: string;
  email_status?: string;
  email_open_count?: number;
  last_sent_at?: string;
}

export interface FunnelCampaign {
  id: number;
  name: string;
  niche?: string;
  city?: string;
  status: 'active' | 'paused' | 'completed';
  created_at: string;
}

export interface FunnelStats {
  stage_counts: Record<FunnelStage, number>;
  total_leads: number;
  email_sent_count: number;
  email_opened_count: number;
  email_replied_count: number;
  call_attempted_count: number;
  call_connected_count: number;
}

export interface LeadEvent {
  id: number;
  lead_id: string;
  event_type: string;
  campaign_id?: string;
  sender_email?: string;
  metadata?: string;
  created_at: string;
}
