export interface ShortLink {
  code: string;
  business_id: string | null;
  last_label?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Business {
  id: string;
  name: string;
  slug: string;
  /** Permanent QR shortener code. Never changes when the business slug is replaced. */
  short_code?: string;
  /** Set by the client when the saved business could not be linked to a QR. */
  short_link_error?: string;
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
  /** Email of the admin who created this business. Stored at creation time. */
  owner_email?: string;
}
