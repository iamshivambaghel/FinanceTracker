/*
 * FinanceTracker configuration.
 *
 * LOCAL MODE (default): leave these blank. Data is saved in this browser
 * (localStorage) and survives refresh once the app is hosted on your own
 * domain (e.g. Vercel).
 *
 * CLOUD MODE: paste your Supabase project URL and anon key below. The app
 * then requires a quick email login and syncs your data across every device
 * you sign in on. Get these two values from your Supabase project:
 *   Project Settings -> API -> Project URL   and   anon / public key.
 *
 * The anon key is safe to expose in the browser — your data is protected by
 * Row Level Security (see supabase/schema.sql), so each user only ever reads
 * or writes their own row.
 *
 * On Vercel you can instead leave these blank here and inject them at build
 * time; see README. Editing this file directly is the simplest path.
 */
window.FT_CONFIG = {
  SUPABASE_URL: "",   // e.g. "https://abcdxyz.supabase.co"
  SUPABASE_ANON_KEY: "",
};
