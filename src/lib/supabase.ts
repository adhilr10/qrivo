import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { generateShortCode } from './short-links';
import type { AnalyticsEvent, AnalyticsSummary, Business, EventType, ShortLink } from '../types';

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

type BusinessRow = Business & { short_links?: { code: string } | { code: string }[] | null };

function attachShortCode(row: BusinessRow | null): Business | null {
  if (!row) return null;
  const linked = Array.isArray(row.short_links) ? row.short_links[0] : row.short_links;
  const { short_links: _links, ...business } = row;
  return {
    ...business,
    short_code: linked?.code || business.short_code,
  };
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
    const database = requireSupabase();
    let { data, error } = await database
      .from('businesses')
      .select('*, short_links(code)')
      .order('created_at', { ascending: false });

    if (error && /short_links/i.test(error.message)) {
      const fallback = await database.from('businesses').select('*').order('created_at', { ascending: false });
      if (fallback.error) throw fallback.error;
      return (fallback.data ?? []) as Business[];
    }

    if (error) throw error;
    return ((data ?? []) as BusinessRow[]).map((row) => attachShortCode(row) as Business);
  },

  async getBusinessBySlug(slug: string): Promise<Business | null> {
    const database = requireSupabase();
    let { data, error } = await database
      .from('businesses')
      .select('*, short_links(code)')
      .eq('slug', slug.toLowerCase())
      .maybeSingle();

    if (error && /short_links/i.test(error.message)) {
      const fallback = await database.from('businesses').select('*').eq('slug', slug.toLowerCase()).maybeSingle();
      if (fallback.error) throw fallback.error;
      return (fallback.data as Business | null) ?? null;
    }

    if (error) throw error;
    return attachShortCode(data as BusinessRow | null);
  },

  async getShortLink(code: string): Promise<(ShortLink & { business: Business | null }) | null> {
    const { data, error } = await requireSupabase()
      .from('short_links')
      .select('*, businesses(*)')
      .eq('code', code.toLowerCase())
      .maybeSingle();

    if (error) {
      if (/short_links/i.test(error.message) || error.code === 'PGRST205') return null;
      throw error;
    }
    if (!data) return null;

    const businessRow = data.businesses as BusinessRow | BusinessRow[] | null;
    const business = attachShortCode(Array.isArray(businessRow) ? businessRow[0] : businessRow);

    return {
      code: data.code,
      business_id: data.business_id,
      last_label: data.last_label,
      created_at: data.created_at,
      updated_at: data.updated_at,
      business: business ? { ...business, short_code: data.code } : null,
    };
  },

  async getBusinessByShortCode(code: string): Promise<Business | null> {
    const link = await this.getShortLink(code);
    return link?.business ?? null;
  },

  async getUnassignedShortLinks(): Promise<ShortLink[]> {
    const { data, error } = await requireSupabase()
      .from('short_links')
      .select('code, business_id, last_label, created_at, updated_at')
      .is('business_id', null)
      .order('updated_at', { ascending: false });

    if (error) {
      if (/short_links/i.test(error.message) || error.code === 'PGRST205') return [];
      throw error;
    }
    return (data ?? []) as ShortLink[];
  },

  async ensureShortLink(businessId: string, label: string, reuseCode?: string): Promise<string> {
    const database = requireSupabase();
    const now = new Date().toISOString();

    const existing = await database
      .from('short_links')
      .select('code')
      .eq('business_id', businessId)
      .maybeSingle();

    if (existing.data?.code) {
      await database
        .from('short_links')
        .update({ last_label: label, updated_at: now })
        .eq('code', existing.data.code);
      return existing.data.code as string;
    }

    if (reuseCode) {
      const assigned = await database
        .from('short_links')
        .update({ business_id: businessId, last_label: label, updated_at: now })
        .eq('code', reuseCode.toLowerCase())
        .is('business_id', null)
        .select('code')
        .maybeSingle();

      if (assigned.error) throw assigned.error;
      if (assigned.data?.code) return assigned.data.code as string;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateShortCode();
      const inserted = await database
        .from('short_links')
        .insert({ code, business_id: businessId, last_label: label, updated_at: now })
        .select('code')
        .single();

      if (!inserted.error && inserted.data?.code) return inserted.data.code as string;
      if (inserted.error && !/duplicate|unique/i.test(inserted.error.message)) throw inserted.error;
    }

    throw new Error('Unable to allocate a unique QR short link.');
  },

  async ensureShortLinks(businesses: Business[]): Promise<Business[]> {
    const next: Business[] = [];
    for (const business of businesses) {
      if (business.short_code) {
        next.push(business);
        continue;
      }
      try {
        const code = await this.ensureShortLink(business.id, business.name);
        next.push({ ...business, short_code: code });
      } catch (error) {
        console.warn('Unable to create short link for business', business.id, error);
        next.push(business);
      }
    }
    return next;
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
      if (!fallbackRes.error && fallbackRes.data) {
        // Still ensure a short link is created/assigned on the fallback path
        const fallbackSaved = fallbackRes.data as Business;
        try {
          const shortCode = await this.ensureShortLink(
            fallbackSaved.id,
            fallbackSaved.name,
            business.short_code
          );
          fallbackSaved.short_code = shortCode;
        } catch (shortLinkError) {
          console.warn('Business saved (fallback) but short link could not be created:', shortLinkError);
        }
        return fallbackSaved;
      }
    }

    if (error) throw error;
    const saved = data as Business;
    try {
      const shortCode = await this.ensureShortLink(
        saved.id,
        saved.name,
        business.short_code
      );
      saved.short_code = shortCode;
    } catch (shortLinkError) {
      console.warn('Business saved but short link could not be created:', shortLinkError);
    }
    return saved;
  },

  async deleteBusiness(id: string): Promise<boolean> {
    const database = requireSupabase();
    const existing = await database.from('short_links').select('code, last_label').eq('business_id', id).maybeSingle();
    if (existing.data?.code) {
      await database
        .from('short_links')
        .update({
          last_label: existing.data.last_label || 'Unassigned QR',
          updated_at: new Date().toISOString(),
        })
        .eq('code', existing.data.code);
    }

    const { error } = await database.from('businesses').delete().eq('id', id);
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
