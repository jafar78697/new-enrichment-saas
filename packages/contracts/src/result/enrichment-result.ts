import { ConfidenceLevel } from '../enums';

export interface EnrichmentResult {
  id: string;
  job_item_id: string;
  tenant_id: string;
  domain: string;

  // Contact fields
  contact: {
    primary_email?: string;
    additional_emails: string[];
    primary_phone?: string;
    additional_phones: string[];
    contact_page_url?: string;
    contact_form_url?: string;
  };

  // Social fields
  social: {
    linkedin_url?: string;
    facebook_url?: string;
    instagram_url?: string;
    twitter_url?: string;
    youtube_url?: string;
    tiktok_url?: string;
    whatsapp_link?: string;
    telegram_link?: string;
  };

  // Company intelligence
  company: {
    name?: string;
    brand_name?: string;
    page_title?: string;
    meta_description?: string;
    one_line_pitch?: string;
    long_summary?: string;
    services_list: string[];
    products_list: string[];
    industry_guess?: string;
    target_audience?: string;
    language?: string;
    address?: string;
    city?: string;
    country?: string;
    about_page_url?: string;
    careers_page_url?: string;
    support_page_url?: string;
  };

  // Technical signals
  technical: {
    cms_guess?: string;
    framework_guess?: string;
    ecommerce_signal: boolean;
    saas_signal: boolean;
    booking_signal: boolean;
    analytics_hints: string[];
    cta_type?: string;
  };

  // Metadata & Quality
  quality: {
    confidence_level: ConfidenceLevel;
    enrichment_lane?: 'http' | 'browser';
    verified_data: Record<string, any>;
    inferred_data: Record<string, any>;
  };

  created_at: string;
  expires_at: string;
}
