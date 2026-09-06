/* CONFIG VITRINE — clé « anon » PUBLIQUE par design : elle ne donne accès
   qu'à ce que les règles RLS de Supabase autorisent (lectures sélections /
   combinés). La clé maîtresse d'écriture reste dans GitHub Secrets du robot. */
window.VITRINE_CONFIG = {
  SUPABASE_URL: "https://xqogordfcqymkmvzhrby.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhxb2dvcmRmY3F5bWttdnpocmJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg3MDAwNjcsImV4cCI6MjEwNDI3NjA2N30.Ud6CWJV_BSrJYLHi-wp2HLRGGTUXx2v_O10R-bPGOps",   // ← clé « anon public » du dashboard Supabase
  OPERATEUR_EMAIL: "operateur@pronos-foot.bj",  // compte caché dont le mot de passe est ton code secret
};
