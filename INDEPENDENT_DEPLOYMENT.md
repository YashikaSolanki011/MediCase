# MediKiosk — Independent Deployment

This branch removes the Hatchable runtime dependency and targets **Vercel + Supabase + Google Gemini**.

## Architecture

- Frontend: existing `public/` HTML/CSS/JS
- API: Vercel Node.js functions under `api/`
- Database: Supabase Postgres
- Auth: Supabase passwordless email OTP
- Private document storage: Supabase Storage bucket `clinical-documents`
- AI: Google Gemini API
- Admin authorization: `ADMIN_EMAILS` environment variable
- Deployment: Vercel

## 1. Create Supabase project

Create a Supabase project, then open SQL Editor and run:

`supabase/migrations/001_initial.sql`

This creates the clinical tables, benchmark tables, indexes, storage bucket and RLS defaults.

## 2. Configure Supabase Auth

In Supabase Auth settings:

- Enable Email provider.
- Enable email OTP / one-time-code login according to the current Supabase Auth settings.
- Add the deployed site's URL to the allowed redirect/site URLs.

## 3. Configure Vercel environment variables

Set these server-side variables:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `GEMINI_API_KEY`
- `ADMIN_EMAILS`
- optional `GEMINI_TEXT_MODEL`
- optional `GEMINI_VISION_MODEL`

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `GEMINI_API_KEY` to the browser.

## 4. Configure the public Supabase client

Edit `public/config.js`:

- `supabaseUrl` = Supabase project URL
- `supabaseAnonKey` = Supabase publishable/anon key

These values are designed to be public browser configuration values.

## 5. Deploy

Import this GitHub repository into Vercel and select branch:

`migration/supabase-vercel`

The project should deploy with the included `vercel.json`.

## 6. Verify

After deployment test:

- `/login` email OTP
- create patient session
- reload and restore patient history
- upload JPEG/PNG/WEBP/PDF
- OCR
- structured extraction
- physician summary
- admin portal
- ownership isolation with two different user accounts
- `/api/health`
- `/api/benchmark`

## Important

The existing Hatchable deployment is intentionally left untouched on `main`. Do not switch production traffic until the independent deployment passes the above checks.

The independent branch does not contain the Hatchable configuration file.
