/* CONFIG VITRINE — clé « anon » PUBLIQUE par design : elle ne donne accès
   qu'à ce que les règles RLS de Supabase autorisent (lectures sélections /
   combinés). La clé maîtresse d'écriture reste dans GitHub Secrets du robot. */
window.VITRINE_CONFIG = {
  SUPABASE_URL: "https://xqogordfcqymkmvzhrby.supabase.co",
  SUPABASE_ANON_KEY: "A_COLLER",   // ← clé « anon public » du dashboard Supabase
};
