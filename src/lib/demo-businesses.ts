import type { Business } from '../types';

/**
 * Prerendered examples only. Runtime reads and writes are always handled by
 * Supabase; the same records are inserted by supabase/schema.sql.
 */
export const DEMO_BUSINESSES: Business[] = [
  {
    id: 'demo-artisan-cafe', name: 'Artisan Roasters & Cafe', slug: 'artisan-cafe',
    logo_url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=200&auto=format&fit=crop&q=80', brand_color: '#d97706',
    tagline: 'Specialty Coffee, Fresh Bakes & Cozy Vibes', google_review_url: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    whatsapp_number: '+15550192834', whatsapp_message: 'Hello Artisan Cafe! I have a question about today’s specials.', phone_number: '+15550192834',
    instagram_url: 'https://instagram.com/artisanroasterscafe', facebook_url: 'https://facebook.com/artisancafespecialty',
    custom_message: 'We pour our passion into every cup! Your Google review helps fellow coffee lovers discover us.',
    is_active: true, created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-downtown-smiles', name: 'Downtown Smiles Dental Clinic', slug: 'downtown-smiles',
    logo_url: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?w=200&auto=format&fit=crop&q=80', brand_color: '#0284c7',
    tagline: 'Gentle, modern dentistry for the entire family', google_review_url: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    whatsapp_number: '+15550149201', whatsapp_message: 'Hi Downtown Smiles! I’d like to inquire about booking an appointment.', phone_number: '+15550149201',
    instagram_url: 'https://instagram.com/downtownsmilesclinic', facebook_url: 'https://facebook.com/downtownsmilesdental',
    custom_message: 'Thank you for visiting Downtown Smiles! How was your appointment today?',
    is_active: true, created_at: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'demo-apex-auto', name: 'Apex Auto & Performance', slug: 'apex-auto',
    logo_url: 'https://images.unsplash.com/photo-1486006920555-c77dce18193b?w=200&auto=format&fit=crop&q=80', brand_color: '#dc2626',
    tagline: 'Certified European & Domestic Auto Repair', google_review_url: 'https://search.google.com/local/writereview?placeid=ChIJN1t_tDeuEmsRUsoyG83frY4',
    whatsapp_number: '+15550183721', whatsapp_message: 'Hi Apex Auto, I want to follow up on my vehicle service.', phone_number: '+15550183721',
    instagram_url: 'https://instagram.com/apexautoperformance', facebook_url: 'https://facebook.com/apexautowerks',
    custom_message: 'Quality workmanship and honest pricing. If we took great care of your vehicle, please leave us a 5-star Google review!',
    is_active: true, created_at: '2026-01-01T00:00:00.000Z',
  },
];
