# Qrivo 🚀
### Smart Reusable Counter QR Cards for Google Reviews & Multi-Channel Customer Engagement

**Qrivo** is a production-ready web application built with **Astro** and **Supabase** designed for physical counter checkouts (cafes, dental clinics, auto repair shops, salons, retail, restaurants).

A business places a QR code stand or sticker at its counter. When a customer scans it with their smartphone, they land on a fast, mobile-first branded page where they can:
1. **Leave a 5-star Google review with one tap**.
2. **Contact or follow the business** through WhatsApp, direct phone call, Instagram, and Facebook.
3. **See the business name, logo, custom brand color, short tagline, and special offer/message**.

---

## 💡 The Core Innovation: Permanent, Reusable Counter QR Codes

A physical QR code printed on acrylic stands or counter cards **must not point directly to Google**. It encodes a permanent short link:
```
https://qrivo.example.com/s/[code]
```

That shortener always stays the same. It redirects to the current business landing page (`/[slug]`), which can change if a business is rejected and replaced.

### Why this matters:
* **Zero Reprinting Costs**: If the business changes owners, updates its phone number, switches WhatsApp lines, or replaces its Google Place ID, the admin simply edits the destination links in the Admin Portal. The printed QR code on the counter continues working seamlessly!
* **Reject without reprinting**: If a business rejects or cancels, delete it in Admin. The `/s/[code]` short link stays unassigned. Create the next business and reuse that short link — the physical QR stand keeps working.
* **Anonymous Conversion Tracking**: Physical cards cannot track impressions. Qrivo tracks every page view, Google review tap, WhatsApp inquiry, and call click in real time.

---

## 🛠 Tech Stack

* **Frontend**: [Astro 7](https://astro.build/)
  * Pure TypeScript & modern reactive UI components
  * Mobile-first responsive design with CSS custom properties & glassmorphism
  * Built-in mathematical zero-dependency QR code engine (`src/utils/qrcode.ts`) capable of generating SVG vectors and high-res PNGs (1024x1024)
  * Instant static build generation with client-side dynamic slug resolution
* **Backend**: [Supabase](https://supabase.com/)
  * PostgreSQL database with Row Level Security (RLS)
  * Tables: `businesses` and `analytics_events`
  * Supabase is the single source of truth for business settings and analytics events.

---

## 📂 Project Structure

```
├── public/                 # Static assets and icons
├── src/
│   ├── components/
│   │   └── Icon.astro      # Crisp vector icons (Google, WhatsApp, Instagram, Facebook, etc.)
│   ├── layouts/
│   │   └── Layout.astro    # Base HTML shell with dynamic brand theming & navigation
│   ├── lib/
│   │   └── supabase.ts     # Supabase client and database service
│   ├── pages/
│   │   ├── index.astro     # Public homepage & live showcase
│   │   ├── [slug].astro    # Fast mobile-first customer counter landing page
│   │   ├── admin/
│   │   │   └── index.astro # Admin management portal & QR studio
│   │   └── 404.astro       # Dynamic slug resolver & friendly fallback
│   ├── styles/
│   │   └── global.css      # Design system, glassmorphism & printable tent card styles
│   ├── types/
│   │   └── index.ts        # TypeScript schemas for Business & Analytics
│   └── utils/
│       └── qrcode.ts       # Zero-dependency QR Code generator (SVG & Canvas PNG)
├── supabase/
│   └── schema.sql          # Complete Supabase PostgreSQL migration script
└── package.json
```

---

## 🚀 Quick Start

### 1. Development Server
To start the Astro dev server in the background:
```bash
astro dev --background
```
Manage the server using:
```bash
astro dev status
astro dev logs
astro dev stop
```

### 2. Production Build
Build optimized static assets and client bundles:
```bash
npm run build
```

---

## 🗄 Supabase Setup

Qrivo stores businesses and analytics exclusively in Supabase. The three demo cards are pre-rendered examples; run the included SQL migration to create the matching database records.

To connect your own cloud Supabase database:
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and run the script in [`supabase/schema.sql`](file:///a:/saas/supabase/schema.sql).
3. Create a `.env` file in the root directory:
```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```
4. Restart your Astro server. Qrivo will display **"Supabase Connected"** in the Admin Portal.

Business creation, editing, deletion, and analytics access follow the Row Level Security policies in the migration. Sign in an administrator before using those admin-only operations.

### Admin authentication

Create administrator email/password accounts in the Supabase dashboard, then sign in at `/admin/login`. This application does not expose account registration.

If the Supabase project already existed before admin authentication was added, run [`supabase/migrations/20261027_add_business_owner.sql`](supabase/migrations/20261027_add_business_owner.sql) once in the Supabase SQL Editor. It adds the ownership column required by the admin RLS policy.

---

## 🖨️ 1-Click Printable Counter Tent Stand

In the **Admin Portal** (`/admin`), switch to the **QR Studio & Counter Tent Card** tab:
1. Select any business destination.
2. Customize the QR code foreground color or match the brand color.
3. Click **"Print Counter Tent Stand"**.
4. The page opens a print-formatted view (A6 / 4x6" table tent format) displaying:
   * Business Logo & Name
   * 5 Gold Rating Stars
   * "Rate Us on Google" prompt
   * Crisp, high-contrast QR matrix
   * "Point your phone camera here" helper text
5. Place the printed stand at the checkout register!
