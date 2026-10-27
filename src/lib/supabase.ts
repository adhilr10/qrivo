import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AnalyticsEvent, AnalyticsSummary, Business, EventType } from '../types';

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}

export class SupabaseConfigurationError extends Error {
  constructor() {
    super('Supabase is not configured. Add PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY to .env and restart Astro.');
    this.name = 'SupabaseConfigurationError';
  }
}

/** Public browser credentials only. Never expose a service-role key here. */
export function getSupabaseConfig(): SupabaseConfig {
  const url = import.meta.env.PUBLIC_SUPABASE_URL?.trim() || '';
  const anonKey = import.meta.env.PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey && !url.includes('placeholder') && !url.includes('example.supabase.co')),
  };
}

const config = getSupabaseConfig();

export const supabase: SupabaseClient | null = config.isConfigured
  ? createClient(config.url, config.anonKey)
  : null;

function requireSupabase(): SupabaseClient {
  if (!supabase) throw new SupabaseConfigurationError();
  return supabase;
}

async function requireAuthenticatedUserId(): Promise<string> {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must sign in to manage businesses.');
  return data.user.id;
}

function toSummary(businessId: string, slug: string, events: AnalyticsEvent[]): AnalyticsSummary {
  const count = (eventType: EventType) => events.filter((event) => event.event_type === eventType).length;
  const page_views = count('page_view');
  const google_review_clicks = count('google_review_click');
  const whatsapp_clicks = count('whatsapp_click');
  const call_clicks = count('call_click');
  const instagram_clicks = count('instagram_click');
  const facebook_clicks = count('facebook_click');
  const total_clicks = google_review_clicks + whatsapp_clicks + call_clicks + instagram_clicks + facebook_clicks;

  return {
    business_id: businessId,
    slug,
    page_views,
    google_review_clicks,
    whatsapp_clicks,
    call_clicks,
    instagram_clicks,
    facebook_clicks,
    total_clicks,
    conversion_rate: page_views ? Math.round((google_review_clicks / page_views) * 100) : 0,
    recent_events: events.slice(0, 20),
  };
}

/** All application persistence goes through Supabase. */
export const DatabaseService = {
  isConfigured(): boolean {
    return getSupabaseConfig().isConfigured;
  },

  async getBusinesses(): Promise<Business[]> {
    const { data, error } = await requireSupabase()
      .from('businesses')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return (data ?? []) as Business[];
  },

  async getBusinessBySlug(slug: string): Promise<Business | null> {
    const { data, error } = await requireSupabase()
      .from('businesses')
      .select('*')
      .eq('slug', slug.toLowerCase())
      .maybeSingle();

    if (error) throw error;
    return (data as Business | null) ?? null;
  },

  async saveBusiness(business: Partial<Business> & { name: string; slug: string }): Promise<Business> {
    const database = requireSupabase();
    const userId = await requireAuthenticatedUserId();
    const values = {
      name: business.name.trim(),
      slug: business.slug.trim().toLowerCase(),
      logo_url: business.logo_url || '',
      brand_color: business.brand_color || '#2563eb',
      tagline: business.tagline || '',
      google_review_url: business.google_review_url || '',
      whatsapp_number: business.whatsapp_number || '',
      whatsapp_message: business.whatsapp_message || '',
      phone_number: business.phone_number || '',
      instagram_url: business.instagram_url || '',
      facebook_url: business.facebook_url || '',
      custom_message: business.custom_message || '',
      is_active: business.is_active ?? true,
      user_id: userId,
      updated_at: new Date().toISOString(),
    };

    const query = business.id
      ? database.from('businesses').update(values).eq('id', business.id)
      : database.from('businesses').insert(values);
    let { data, error } = await query.select().single();

    // Fallback if PostgREST schema cache hasn't refreshed for whatsapp_message yet
    if (error && error.message && error.message.includes('whatsapp_message')) {
      console.warn('Retrying save without whatsapp_message due to Supabase schema cache delay:', error.message);
      const { whatsapp_message, ...fallbackValues } = values;
      const fallbackQuery = business.id
        ? database.from('businesses').update(fallbackValues).eq('id', business.id)
        : database.from('businesses').insert(fallbackValues);
      const fallbackRes = await fallbackQuery.select().single();
      if (!fallbackRes.error) {
        return fallbackRes.data as Business;
      }
    }

    if (error) throw error;
    return data as Business;
  },

  async deleteBusiness(id: string): Promise<boolean> {
    const { error } = await requireSupabase().from('businesses').delete().eq('id', id);
    if (error) throw error;
    return true;
  },

  async trackEvent(data: {
    business_id: string;
    slug: string;
    event_type: EventType;
    user_agent?: string;
    referrer?: string;
  }): Promise<void> {
    const { error } = await requireSupabase().from('analytics_events').insert({
      business_id: data.business_id,
      slug: data.slug,
      event_type: data.event_type,
      user_agent: data.user_agent || (typeof navigator !== 'undefined' ? navigator.userAgent : ''),
      referrer: data.referrer || (typeof document !== 'undefined' ? document.referrer : ''),
    });

    if (error) throw error;
  },

  async getAnalytics(businessId: string, slug: string): Promise<AnalyticsSummary> {
    const { data, error } = await requireSupabase()
      .from('analytics_events')
      .select('*')
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) throw error;
    return toSummary(businessId, slug, (data ?? []) as AnalyticsEvent[]);
  },
};
