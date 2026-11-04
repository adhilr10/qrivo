import type { Business } from '../types';

/** Locality + road in a single human-readable line. */
export function businessLocationLine(business?: Business | null): string {
  return [business?.place_name, business?.road]
    .map(part => (part || '').trim())
    .filter(Boolean)
    .join(' · ');
}

/** New shops store `category`; fall back to the old `tagline` column for legacy rows. */
export function businessCategory(business?: Business | null): string {
  return (business?.category || business?.tagline || '').trim();
}

/**
 * Map a free-text shop category to a schema.org LocalBusiness subtype so Google
 * understands what kind of place this is.
 */
export function schemaTypeForCategory(category: string): string {
  const value = category.toLowerCase();
  const rules: Array<[RegExp, string]> = [
    [/restaurant|dhaba|eatery|food court|biryani|pizza|dining/, 'Restaurant'],
    [/cafe|coffee/, 'CafeOrCoffeeShop'],
    [/bakery/, 'Bakery'],
    [/sweet|mithai|dessert|ice cream/, 'DessertShop'],
    [/grocery|kirana|supermarket|provision/, 'GroceryStore'],
    [/salon|barber|hair|beauty parlour|beauty parlor/, 'HairSalon'],
    [/spa|massage/, 'DaySpa'],
    [/gym|fitness|yoga/, 'HealthClub'],
    [/clinic|doctor|dental|dentist|hospital/, 'MedicalClinic'],
    [/pharmacy|chemist|medical store/, 'Pharmacy'],
    [/hotel|lodge|guest house|resort/, 'Hotel'],
    [/book|stationery/, 'BookStore'],
    [/clothing|boutique|fashion|apparel/, 'ClothingStore'],
    [/electronics|mobile|computer/, 'ElectronicsStore'],
    [/store|shop|mart|retail/, 'Store'],
  ];

  for (const [pattern, type] of rules) {
    if (pattern.test(value)) return type;
  }
  return 'LocalBusiness';
}

/** Capitalise lowercase place/road/category text without touching mixed-case names. */
function displayLabel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed || trimmed !== trimmed.toLowerCase()) return trimmed;
  return trimmed
    .split(/\s+/)
    .map(word => (word ? word.charAt(0).toUpperCase() + word.slice(1) : word))
    .join(' ');
}

export interface BusinessSeo {
  title: string;
  description: string;
  location: string;
  category: string;
  jsonLd?: Record<string, unknown>;
}

/**
 * Build the page title, meta description and LocalBusiness JSON-LD from the
 * shop name, category, place and road. Manual `seo_title` / `seo_description`
 * overrides win when they are present in the database.
 */
export function buildBusinessSeo(business?: Business | null, pageUrl?: string): BusinessSeo {
  const name = (business?.name || 'Qrivo Counter Card').trim();
  const category = businessCategory(business);
  const place = (business?.place_name || '').trim();
  const road = (business?.road || '').trim();
  const location = [place, road].filter(Boolean).join(', ');
  const categoryLabel = displayLabel(category);
  const locationLabel = [displayLabel(place), displayLabel(road)].filter(Boolean).join(', ');

  const titleParts = [name];
  if (categoryLabel && locationLabel) titleParts.push(`${categoryLabel} at ${locationLabel}`);
  else if (categoryLabel) titleParts.push(categoryLabel);
  else if (locationLabel) titleParts.push(`at ${locationLabel}`);
  const generatedTitle = `${titleParts.join(' · ')} | Google Reviews`;

  const intro = categoryLabel
    ? `${name} is a ${categoryLabel.toLowerCase()}${locationLabel ? ` at ${locationLabel}` : ''}.`
    : `${name}${locationLabel ? ` is located at ${locationLabel}` : ''}.`;
  const generatedDescription =
    `${intro} Scan the Qrivo counter QR code to rate your experience and leave a Google review in seconds.`;

  const title = (business?.seo_title || '').trim() || generatedTitle;
  const description = (business?.seo_description || '').trim() || generatedDescription;

  let jsonLd: Record<string, unknown> | undefined;
  if (business) {
    const phone = (business.phone_number || business.whatsapp_number || '').replace(/\D/g, '');
    const address: Record<string, string> = { '@type': 'PostalAddress' };
    if (road) address.streetAddress = displayLabel(road);
    if (place) address.addressLocality = displayLabel(place);
    address.addressCountry = 'IN';

    const sameAs = [...new Set(
      [business.instagram_url, business.facebook_url]
        .map(url => (url || '').trim())
        .filter(Boolean),
    )];

    const localBusiness: Record<string, unknown> = {
      '@type': schemaTypeForCategory(category),
      name,
      description,
      ...(pageUrl ? { '@id': `${pageUrl}#business`, url: pageUrl } : {}),
      ...(business.logo_url ? { image: business.logo_url } : {}),
      ...(phone ? { telephone: `+${phone}` } : {}),
      ...(Object.keys(address).length > 1 ? { address } : {}),
      ...(category ? { knowsAbout: category } : {}),
      ...(place ? { areaServed: displayLabel(place) } : {}),
      ...(sameAs.length ? { sameAs } : {}),
    };

    if (pageUrl) {
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          localBusiness,
          {
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: new URL('/', pageUrl).href },
              { '@type': 'ListItem', position: 2, name, item: pageUrl },
            ],
          },
        ],
      };
    } else {
      jsonLd = { '@context': 'https://schema.org', ...localBusiness };
    }
  }

  return { title, description, location, category, jsonLd };
}
