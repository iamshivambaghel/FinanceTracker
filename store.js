/*
 * Persistence + auth layer.
 *
 * Two modes, chosen automatically from config.js:
 *   - "local": localStorage only. No login. Survives refresh on your domain.
 *   - "cloud": Supabase. Email magic-link login, one JSONB row per user,
 *              synced across devices. Falls back to a localStorage cache
 *              when offline.
 *
 * Public surface (all async where it matters):
 *   Store.boot()            -> initialises; resolves to { mode, user }
 *   Store.mode              -> "local" | "cloud"
 *   Store.user              -> { email } | null
 *   Store.onAuthChange(cb)  -> cb(user) whenever sign-in state changes
 *   Store.load()            -> saved state object | null
 *   Store.save(state)       -> debounced persist (local + cloud)
 *   Store.signIn(email)     -> sends magic link
 *   Store.signOut()
 */
const LOCAL_KEY = "financeTracker.v1";

const Store = (() => {
  let mode = "local";
  let supa = null;
  let user = null;
  let authCb = null;
  let saveTimer = null;

  function cfg() { return window.FT_CONFIG || {}; }

  async function boot() {
    const { SUPABASE_URL, SUPABASE_ANON_KEY } = cfg();
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
        supa = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        mode = "cloud";
        const { data } = await supa.auth.getSession();
        user = data?.session?.user ? { email: data.session.user.email, id: data.session.user.id } : null;
        supa.auth.onAuthStateChange((_e, session) => {
          user = session?.user ? { email: session.user.email, id: session.user.id } : null;
          if (authCb) authCb(user);
        });
      } catch (e) {
        console.warn("Supabase init failed, using local mode:", e);
        mode = "local";
      }
    }
    return { mode, user };
  }

  function onAuthChange(cb) { authCb = cb; }

  async function load() {
    if (mode === "cloud" && user) {
      try {
        const { data, error } = await supa.from("app_state").select("state").eq("user_id", user.id).maybeSingle();
        if (error) throw error;
        if (data?.state) { localStorage.setItem(LOCAL_KEY, JSON.stringify(data.state)); return data.state; }
        // no cloud row yet — seed from any local cache so nothing is lost
        const cached = localStorage.getItem(LOCAL_KEY);
        return cached ? JSON.parse(cached) : null;
      } catch (e) {
        console.warn("Cloud load failed, falling back to cache:", e);
      }
    }
    const cached = localStorage.getItem(LOCAL_KEY);
    return cached ? JSON.parse(cached) : null;
  }

  function save(state) {
    // Always cache locally & immediately.
    localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
    if (mode === "cloud" && user) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(async () => {
        try {
          await supa.from("app_state").upsert(
            { user_id: user.id, state, updated_at: new Date().toISOString() },
            { onConflict: "user_id" }
          );
        } catch (e) { console.warn("Cloud save failed (kept locally):", e); }
      }, 600);
    }
  }

  async function signIn(email) {
    if (mode !== "cloud") throw new Error("Cloud mode is not configured.");
    const { error } = await supa.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.href },
    });
    if (error) throw error;
  }

  async function signOut() { if (supa) await supa.auth.signOut(); }

  return { boot, onAuthChange, load, save, signIn, signOut,
    get mode() { return mode; }, get user() { return user; } };
})();

if (typeof module !== "undefined") module.exports = { Store };
