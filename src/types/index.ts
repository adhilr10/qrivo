export type EventType =
  | 'page_view'
  | 'google_review_click'
  | 'whatsapp_click'
  | 'call_click'
  | 'instagram_click'
  | 'facebook_click';

export interface Business {
  id: string;
  name: string;
  slug: string;
  logo_url?: string;
  brand_color: string;
  tagline?: string;
  google_review_url: string;
  whatsapp_number?: string;
  whatsapp_message?: string;
  phone_number?: string;
  instagram_url?: string;
  facebook_url?: string;
  custom_message?: string;
  is_active: boolean;
  created_at: string;
  updated_at?: string;
  user_id?: string;
}

export interface AnalyticsEvent {
  id?: string;
  business_id: string;
  slug: string;
  event_type: EventType;
  user_agent?: string;
  referrer?: string;
  ip_hash?: string;
  created_at?: string;
}

export interface AnalyticsSummary {
  business_id: string;
  slug: string;
  page_views: number;
  google_review_clicks: number;
  whatsapp_clicks: number;
  call_clicks: number;
  instagram_clicks: number;
  facebook_clicks: number;
  total_clicks: number;
  conversion_rate: number; // review clicks / page views %
  recent_events?: AnalyticsEvent[];
}
