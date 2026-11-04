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

---

## 🛠 Tech Stack

* **Frontend**: [Astro 7](https://astro.build/)
  * Pure TypeScript & modern reactive UI components
  * Mobile-first responsive design with CSS custom properties
  * [qrcode](https://www.npmjs.com/package/qrcode) for QR matrices and [sharp](https://sharp.pixelplumbing.com/) for compositing them onto the branded counter-card artwork
  * [ImageKit](https://imagekit.io/) for business logo uploads and CDN delivery (signed browser uploads)
  * Instant static build generation with client-side dynamic slug resolution
* **Backend**: [Supabase](https://supabase.com/)
  * PostgreSQL database with Row Level Security (RLS)
  * Tables: `businesses`, `short_links`, `qr_sales`, and `qr_expenses`
  * Supabase is the single source of truth for business settings, QR assignments, sales, and expenses.

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
│   │   ├── supabase.ts     # Supabase client and database service
│   │   ├── imagekit.ts     # Browser-side logo upload to ImageKit
│   │   ├── qr-card.ts      # Counter-card geometry shared by server and browser
│   │   └── qr-card-client.ts # Canvas fallback for runtimes without sharp
│   ├── pages/
│   │   ├── index.astro     # Public homepage & live showcase
│   │   ├── [slug].astro    # Fast mobile-first customer counter landing page
│   │   ├── admin/
│   │   │   └── index.astro # Admin management portal & QR studio
│   │   ├── api/
│   │   │   ├── qr-card.ts  # sharp renderer for branded counter cards
│   │   │   └── upload-auth.ts # Signed ImageKit upload credentials for admins
│   │   └── 404.astro       # Dynamic slug resolver & friendly fallback
│   ├── styles/
│   │   └── global.css      # Design system & printable tent card styles
│   └── types/
│       └── index.ts        # TypeScript schemas for Business, ShortLink, QrSale & QrExpense
├── supabase/
│   ├── schema.sql          # Complete Supabase PostgreSQL migration script
│   └── migrations/         # Incremental migrations for existing projects
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

Qrivo stores businesses and QR assignments exclusively in Supabase. Run the included SQL migration once to create the required tables.

To connect your own cloud Supabase database:
1. Create a project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase dashboard and run the script in [`supabase/schema.sql`](supabase/schema.sql).
3. Create a `.env` file in the root directory:
```env
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
IMAGEKIT_PUBLIC_KEY=your-public-key
IMAGEKIT_PRIVATE_KEY=your-private-key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_imagekit_id
```
4. Restart your Astro server. Qrivo will display **"Supabase Connected"** in the Admin Portal.

Business creation, editing, deletion, and QR assignment follow the Row Level Security policies in the migration. Sign in an administrator before using those admin-only operations.

### Sales, expenses, and profit

The Money tab and the Sales & Expenses tab store their data in Supabase too, so every admin sees the same numbers:

* `qr_sales` — one row per QR sale. The price and making cost are **snapshotted** with the sale, so changing the default price later never rewrites past profit.
* `qr_expenses` — printing, QR making, travel, ads, packaging, and other running costs.

The **Money** tab is focused on the overview: summary cards and the revenue/cost/profit chart. The **Sales & Expenses** tab holds the records themselves — sales and expense lists, filters, edit/delete controls, and the **+ Add sale** / **+ Add expense** dialogs.

Creating blank QR stands in bulk also records an expense automatically, using `quantity × making cost` (category `QR Making`). Those records are counted under **Making cost**, not **Other expenses**, because they are production spend rather than general running costs.

If you generated QR stands before this automatic expense existed, run [`supabase/backfill_50_qr_making_expense.sql`](supabase/backfill_50_qr_making_expense.sql) once to add the missing 50-stand batch (adjust the amount there if your making cost is not ₹55).

If saving a sale or expense fails because the tables are missing, run [`supabase/migrations/20261104_add_sales_expenses.sql`](supabase/migrations/20261104_add_sales_expenses.sql) once in the Supabase SQL Editor (or re-run `supabase/schema.sql`). The migration is safe to re-run.

Default pricing starts at **₹400 per QR** with a **₹55 making cost**, both editable in the Money tab. Those two defaults are remembered in the browser; every saved sale keeps its own numbers.

### Per-business SEO

Each business page (`/[slug]`) is built with:

* A descriptive slug made from the shop name, category, area and road (e.g. `/chaya-kada-cafe-evp-bus-stand`).
* A generated title and meta description using the shop name, category, place and road.
* `LocalBusiness` JSON-LD with the matching schema subtype, address, phone, logo, social links, `areaServed` and a breadcrumb list.
* Canonical, Open Graph and Twitter tags for `https://qrivo.amazementtech521.workers.dev`.

The **Fix URLs** button in the Businesses tab rewrites existing name-only slugs. Printed `/s/CODE` links keep working because they redirect to the current slug.

Other SEO files and routes:

* `/businesses` — public directory that links every active business.
* `/sitemap-index.xml` — generated by `@astrojs/sitemap`.
* `/robots.txt` — allows public pages and blocks `/admin`, `/api/`, `/s/` and test routes.

If a project still has the old `tagline` column, run [`supabase/migrations/20261104_rename_tagline_to_category.sql`](supabase/migrations/20261104_rename_tagline_to_category.sql) once.

### Admin authentication

Create administrator email/password accounts in the Supabase dashboard, then sign in at `/admin/login`. This application does not expose account registration.

If the Supabase project already existed before admin authentication was added, run [`supabase/migrations/20261027_add_business_owner.sql`](supabase/migrations/20261027_add_business_owner.sql) once in the Supabase SQL Editor. It adds the ownership column required by the admin RLS policy.

### ImageKit setup (business logos)

Business logos are uploaded from the admin form straight to [ImageKit](https://imagekit.io) and only the resulting CDN URL is stored in `businesses.logo_url`.

1. Create an ImageKit account and open **Developer Options → API Keys**.
2. Copy the **Public key**, **Private key**, and your **URL endpoint** into `.env` (see `.env.example`).
3. Uploads are signed by [`src/pages/api/upload-auth.ts`](src/pages/api/upload-auth.ts), which refuses to issue credentials unless the request carries a valid Supabase admin session. The private key never reaches the browser.
4. Files are stored in the `/qrivo/logos` folder and served from your ImageKit URL endpoint. Saved logo URLs include `?tr=f-auto`, so ImageKit delivers WebP/AVIF to supporting browsers while the uploaded original is kept unchanged.

For Cloudflare deployments, set the private key as a worker secret instead of a plain variable:

```bash
npx wrangler secret put IMAGEKIT_PRIVATE_KEY
npx wrangler secret put IMAGEKIT_PUBLIC_KEY
```

`IMAGEKIT_PRIVATE_KEY` must **never** be committed to `wrangler.jsonc` or any other tracked file. For local `wrangler dev` / `npm run preview`, copy [`.dev.vars.example`](.dev.vars.example) to `.dev.vars` (git-ignored) and fill in the keys.

`IMAGEKIT_URL_ENDPOINT` is read at build time by the optional Astro ImageKit image service; leave it empty to build without the service, or set it to enable ImageKit-optimized `<Image />` delivery.

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
