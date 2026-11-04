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
  /** Legacy tagline column. New data uses `category`. */
  tagline?: string;
  /** Type of shop, e.g. "Restaurant", "Salon", "Bakery". Used for SEO. */
  category?: string;
  /** Locality used for local SEO, e.g. "Connaught Place". */
  place_name?: string;
  /** Road or street used for local SEO, e.g. "MG Road". */
  road?: string;
  /** Optional override for the search/social title. */
  seo_title?: string;
  /** Optional override for the meta description. */
  seo_description?: string;
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
  /** Set when the database is missing a newer optional column. */
  schema_warning?: string;
}

/** One QR stand sold to a business. Price/cost are snapshotted at sale time. */
export interface QrSale {
  id: string;
  business_id?: string | null;
  business_name: string;
  quantity: number;
  /** Price charged per QR stand, in rupees. */
  unit_price: number;
  /** What one stand cost to make, in rupees. */
  unit_cost: number;
  /** quantity * unit_price, stored so history never changes. */
  amount: number;
  /** quantity * unit_cost, stored so history never changes. */
  cost: number;
  status: 'paid' | 'pending';
  /** ISO date (YYYY-MM-DD). */
  sale_date: string;
  note?: string;
  owner_email?: string;
  created_at?: string;
  updated_at?: string;
}

/** A business expense outside an individual sale (printing, travel, ads). */
export interface QrExpense {
  id: string;
  title: string;
  category?: string;
  amount: number;
  /** ISO date (YYYY-MM-DD). */
  expense_date: string;
  note?: string;
  owner_email?: string;
  created_at?: string;
  updated_at?: string;
}
