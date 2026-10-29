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

/**
 * Sessionless client for public reads (counter pages, the admin business list).
 * Business rows are public data, so reads must not inherit the signed-in
 * admin's row-level security scope — otherwise an admin only sees the rows
 * they personally created.
 */
const supabasePublic: SupabaseClient | null = config.isConfigured
  ? createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
  : null;

function requireSupabase(): SupabaseClient {
  if (!supabase) throw new SupabaseConfigurationError();
  return supabase;
}

function requirePublicSupabase(): SupabaseClient {
  if (!supabasePublic) throw new SupabaseConfigurationError();
  return supabasePublic;
}

async function requireAuthenticatedUserId(): Promise<string> {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must sign in to manage businesses.');
  return data.user.id;
}

async function getAuthenticatedUser(): Promise<{ id: string; email: string }> {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('You must sign in to manage businesses.');
  return { id: data.user.id, email: data.user.email || '' };
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

/**
 * Applies the QR choice made in the business form after the row is saved.
 * A missing code means the business intentionally has no printed stand yet.
 */
async function applyShortLinkAssignment(
  saved: Business,
  requestedCode: string,
  wantsUnassign: boolean,
): Promise<Business> {
  if (requestedCode) {
    try {
      saved.short_code = await DatabaseService.assignShortLink(saved.id, requestedCode, saved.name);
    } catch (error) {
      saved.short_link_error = error instanceof Error ? error.message : String(error);
    }
    return saved;
  }

  if (!wantsUnassign) return saved;

  try {
    const { data } = await requireSupabase()
      .from('short_links')
      .select('code')
      .eq('business_id', saved.id)
      .maybeSingle();
    if (data?.code) {
      await DatabaseService.releaseShortLink(data.code as string, saved.name);
    }
    saved.short_code = undefined;
  } catch (error) {
    saved.short_link_error = error instanceof Error ? error.message : String(error);
  }
  return saved;
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
    // Public read: every admin must see the full shared workspace.
    const database = requirePublicSupabase();
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
    // Public read: a signed-in admin must resolve the same row a visitor sees.
    const database = requirePublicSupabase();
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
    // Public read: scanned counter codes resolve identically for everyone.
    const { data, error } = await requirePublicSupabase()
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
      .order('created_at', { ascending: false });

    if (error) {
      if (/short_links/i.test(error.message) || error.code === 'PGRST205') return [];
      throw error;
    }
    return (data ?? []) as ShortLink[];
  },

  /**
   * Bulk-create blank QR codes that are not attached to any business yet.
   * They are printed as physical stands first and assigned later, so a
   * rejected business never forces a reprint.
   */
  async createShortLinks(count: number, label = ''): Promise<ShortLink[]> {
    const database = requireSupabase();
    const total = Math.min(Math.max(Math.floor(count) || 1, 1), 500);
    const created: ShortLink[] = [];
    const now = new Date().toISOString();
    let remaining = total;

    for (let attempt = 0; attempt < 8 && remaining > 0; attempt++) {
      const batchSize = Math.min(remaining, 100);
      const rows = Array.from({ length: batchSize }, () => ({
        code: generateShortCode(),
        business_id: null,
        last_label: label.trim(),
        updated_at: now,
      }));

      const { data, error } = await database
        .from('short_links')
        .insert(rows)
        .select('code, business_id, last_label, created_at, updated_at');

      if (error) {
        // A duplicate code collision aborts the whole batch; retry with new codes.
        if (/duplicate|unique/i.test(error.message)) continue;
        throw error;
      }

      created.push(...((data ?? []) as ShortLink[]));
      remaining -= rows.length;
    }

    if (remaining > 0) {
      throw new Error('Unable to allocate enough unique QR codes. Try a smaller number.');
    }
    return created;
  },

  /**
   * Point an existing printed code at a business. A business owns at most one
   * code, so its previous code is released first; the old stand stays valid and
   * returns to the unassigned stock.
   */
  async assignShortLink(businessId: string, code: string, label: string): Promise<string> {
    const database = requireSupabase();
    const target = code.trim().toLowerCase();
    if (!/^[a-z0-9]{4,12}$/.test(target)) {
      throw new Error(`"${code}" is not a valid QR code.`);
    }
    const now = new Date().toISOString();

    // Verify the printed stand exists before touching the current assignment,
    // so a bad code cannot leave the business without a QR.
    const targetRow = await database
      .from('short_links')
      .select('code, business_id')
      .eq('code', target)
      .maybeSingle();

    if (targetRow.error) throw targetRow.error;
    if (!targetRow.data) {
      throw new Error(
        `QR code /s/${target} was not found. Create it in Bulk QR first, or scan the printed stand again.`,
      );
    }

    if (targetRow.data.business_id !== businessId) {
      const existing = await database
        .from('short_links')
        .select('code, last_label')
        .eq('business_id', businessId)
        .maybeSingle();

      if (existing.error) throw existing.error;

      if (existing.data?.code && existing.data.code !== target) {
        const released = await database
          .from('short_links')
          .update({
            business_id: null,
            last_label: existing.data.last_label || label,
            updated_at: now,
          })
          .eq('code', existing.data.code);
        if (released.error) throw released.error;
      }
    }

    const { data, error } = await database
      .from('short_links')
      .update({ business_id: businessId, last_label: label, updated_at: now })
      .eq('code', target)
      .select('code');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`QR code /s/${target} could not be assigned. Check the SQL policies in the Admin Portal.`);
    }
    return (data[0] as { code: string }).code;
  },

  /** Detach a code from its business and keep the last name for stock history. */
  async releaseShortLink(code: string, label = ''): Promise<void> {
    const database = requireSupabase();
    const target = code.trim().toLowerCase();
    const { data, error } = await database
      .from('short_links')
      .update({
        business_id: null,
        last_label: label || 'Unassigned QR',
        updated_at: new Date().toISOString(),
      })
      .eq('code', target)
      .select('code');

    if (error) throw error;
    if (!data || data.length === 0) {
      throw new Error(`QR code /s/${target} was not found.`);
    }
  },

  /** Metadata for the scanner: does this printed code exist, and where does it point? */
  async lookupShortLink(code: string): Promise<(ShortLink & { business: Business | null }) | null> {
    return this.getShortLink(code);
  },

  async saveBusiness(business: Partial<Business> & { name: string; slug: string }): Promise<Business> {
    const database = requireSupabase();
    const { id: userId, email: userEmail } = await getAuthenticatedUser();
    const isNew = !business.id;
    const requestedCode = (business.short_code || '').trim().toLowerCase();
    // On edit, an empty string means "explicitly remove the QR". Undefined means
    // "leave the current assignment alone".
    const wantsUnassign = !isNew && business.short_code === '';
    const values: Record<string, unknown> = {
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
      updated_at: new Date().toISOString(),
    };
    // Ownership is captured once, at creation time. Editing a business that
    // another admin created must not silently reassign it.
    if (isNew) {
      values.user_id = userId;
      if (userEmail) values.owner_email = userEmail;
    }

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
        return applyShortLinkAssignment(
          fallbackRes.data as Business,
          requestedCode,
          wantsUnassign,
        );
      }
    }

    if (error) {
      // PostgREST reports "no rows" when row-level security hides this business
      // from the current admin, which reads like a silent failure. Explain it.
      if (error.code === 'PGRST116') {
        throw new Error(
          'Supabase blocked this change because another admin created this business. ' +
            'Open SQL in the Admin Portal and run the shared-admin policies so every signed-in admin can edit any business.',
        );
      }
      throw error;
    }

    return applyShortLinkAssignment(data as Business, requestedCode, wantsUnassign);
  },

  async deleteBusiness(id: string): Promise<boolean> {
    const database = requireSupabase();
    // Read the code before the row disappears, so the printed stand keeps a
    // useful "last used by" label in the unassigned stock.
    const existing = await database
      .from('short_links')
      .select('code, last_label')
      .eq('business_id', id)
      .maybeSingle();
    const code = existing.data?.code as string | undefined;
    const lastLabel = (existing.data?.last_label as string | undefined) || 'Unassigned QR';

    const { data: deleted, error } = await database
      .from('businesses')
      .delete()
      .eq('id', id)
      .select('id');

    if (error) throw error;
    if (!deleted || deleted.length === 0) {
      throw new Error(
        'Supabase blocked this delete because another admin created this business. ' +
          'Open SQL in the Admin Portal and run the shared-admin policies so every signed-in admin can manage any business.',
      );
    }

    // The foreign key nulls business_id; make the release explicit and keep the
    // label so the stand is easy to find when it is reused.
    if (code) {
      const released = await database
        .from('short_links')
        .update({ business_id: null, last_label: lastLabel, updated_at: new Date().toISOString() })
        .eq('code', code);
      if (released.error) {
        console.warn('Business deleted but its QR code could not be released:', released.error.message);
      }
    }

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
