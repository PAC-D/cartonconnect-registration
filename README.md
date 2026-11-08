# Carton Connect registration

A responsive registration portal for Carton Connect, the PAC-D portal for the Primark carton supply timeline (cartonconnect.pac-d.com). Its look follows the Carton Connect portal. It uses the PACD and Primark assets in `assets/`, filters factories in the browser using the mappings from `factory-supplier pair.xlsx`, and submits only completed registrations to Supabase.

## What is included

- Searchable supplier dropdown containing all 68 suppliers from the workbook
- Supplier-dependent multi-select containing the assigned factories only
- Required registration-type chooser for supplier, factory, or packaging supplier onboarding
- Factory-first registration: one factory, multiple suppliers restricted to that factory's allocations. Factories without allocated suppliers show a contact message instead.
- Packaging supplier registration: one packaging supplier, multiple factories from `assignments.xlsx` (factories shared between packaging suppliers appear for each; allocation % is ignored)
- `/admin` dashboard with separate Supplier, Factory, and Packaging supplier sections, per-section analytics, and Excel export
- Supplier and factory codes retained as stable identifiers
- Responsive layout for mobile, tablet, laptop, and desktop
- Accessible labels, keyboard-friendly controls, inline validation, and status messages
- Direct Supabase REST submission without a framework or SDK
- Demo mode when Supabase has not been configured
- A repeatable PowerShell data-generation script for workbook updates

## Project structure

```text
.
├── assets/
│   ├── assignments.xlsx         # factory to packaging supplier allocations
│   ├── factory-supplier pair.xlsx
│   ├── favicon.png
│   ├── pacd.png
│   └── primark-logo.png
├── data/
│   └── supplier-factories.js    # generated frontend mapping
├── scripts/
│   └── generate-data.ps1        # reads the xlsx and rebuilds the mapping
├── app.js                       # dynamic controls, validation, submission
├── multiselect.js               # shared searchable multi-select (form and admin)
├── index.html
├── styles.css
├── supabase-config.js           # public browser configuration
└── supabase-schema.sql          # table and RLS policy
```

## Run locally

No package install or build step is required. Start any static file server from this directory. For example:

```powershell
python -m http.server 8080
```

Then open `http://localhost:8080`. The form works in demo mode immediately; a valid submission is logged to the browser console but is not stored until Supabase is configured.

## Connect Supabase

1. Create a Supabase project.
2. Open the Supabase SQL Editor and run `supabase-schema.sql` once.
3. In Supabase, open the project's **Connect** dialog and choose **Framework**, or open **Settings → API Keys**. Do not use the database connection string shown under **Direct**.
4. Copy the project URL and the **Publishable key** (`sb_publishable_...`) into `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://YOUR_PROJECT.supabase.co",
  publishableKey: "sb_publishable_YOUR_KEY"
};
```

5. Serve the site and submit a test registration. Supplier and factory rows appear in `registrations`; packaging supplier rows appear in `packaging_registrations`.

The admin login is available at `/admin/` and redirects authenticated users to `/admin-dashboard/`. Each section shows how many people (unique emails) registered as that type, how many suppliers/factories/packaging suppliers are covered, and which ones have not registered. Only the registering entity counts: a factory selected inside a supplier registration does not mark that factory as registered. **Export Excel** downloads one workbook with Suppliers, Factories, Packaging suppliers, Not registered, and Summary sheets (SheetJS loaded from cdnjs). Its initial password is `event_admin`. Login creates a revocable 30-day browser session, and the dashboard provides search, edit, delete, refresh, logout, and password-change controls. Direct browser table reads remain blocked by Row Level Security.

The publishable key is intended for public browser use when Row Level Security is enabled. Never place a secret key or legacy service-role key in this project. The included grants and policies permit anonymous inserts only; public visitors cannot read registration records. The schema script is safe to run again if the tables, policies, and indexes already exist. A legacy `anon` key also works, but new projects should use the publishable key.

## Update supplier and factory data

Replace `assets/factory-supplier pair.xlsx` with a workbook using these columns:

| Column | Header |
| --- | --- |
| A | Supplier Code |
| B | Supplier |
| C | Factory Code |
| D | Factory |

Replace `assets/assignments.xlsx` with a workbook using columns A Factory Code, B Factory Name, C Primary Allocation, D Allocation %, E Shared With (for example `Reflex (40%)`). Short packaging names (Epyllion, MR, Reflex, Uniglory, Union, Youngshine) map to the full names in the generator.

Then regenerate the browser data:

```powershell
.\scripts\generate-data.ps1
```

The generator reads the XLSX file directly, groups rows by supplier code, deduplicates factories by factory code, sorts names, and rewrites `data/supplier-factories.js`. It does not require Excel, Node.js, or an external PowerShell module.

## Data flow

```text
Workbook → generated browser mapping → supplier selection → filtered factories
                                    └→ factory selection → allocated suppliers
                                                        ↓
                                  completed registration → Supabase
```

The supplier/factory mapping is static in the browser, so changing selections creates no Supabase traffic. Supplier rows store the supplier code/name and selected `factories`; factory rows store their own factory in `factories` and the selected `suppliers`; packaging rows store the packaging supplier and selected `factories`.

After pulling this version, run `supabase-schema.sql` again. It adds the new columns and moves each existing factory registration's supplier into `suppliers`. If the unique index step fails, one email registered the same factory under several suppliers; delete the duplicates and run it again.

## Deployment

This is a static website and can be deployed to Cloudflare Pages, Netlify, Vercel, GitHub Pages, or any standard web server. Publish the repository root as-is; there is no build command or output directory.

For production, add rate limiting or a bot-protection layer at the hosting edge, and consider a Supabase Edge Function if you need server-side validation that the submitted factories still match the selected supplier.
