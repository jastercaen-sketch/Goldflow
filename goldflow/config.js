// Goldflow settings for the website.
// The anon key is meant to be public: your data is protected by the login and row level security.
// Leave supabaseUrl empty to run the site in demo mode with synthetic prices.
window.GOLDFLOW_CONFIG = {
  supabaseUrl: 'https://skwskaygywgvlctczhhs.supabase.co',
  supabaseAnonKey: 'sb_publishable_TpiNwciGWDD6x2xQfWOIeQ_gdM589a3',
  // The two seats at the table. Each name signs in to its own account (the address is never shown).
  players: [
    { name: 'Mordain', email: 'mordain@goldflow.app' },
    { name: 'Wulfgar', email: 'wulfgar@goldflow.app' },
  ],
};
