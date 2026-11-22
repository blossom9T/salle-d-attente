// ─────────────────────────────────────────────────────────────
//  Configuration du site
// ─────────────────────────────────────────────────────────────
//  Sans Supabase, le site marche quand même :
//   - les salons ne relient que les onglets d'un même navigateur,
//   - le classement est gardé dans ce navigateur (localStorage).
//
//  Pour jouer en ligne entre potes et avoir un classement commun,
//  crée un projet gratuit sur https://supabase.com, exécute
//  supabase/schema.sql dans l'éditeur SQL, puis colle ici :
//   - l'URL du projet     (Project Settings → API → Project URL)
//   - la clé publique     (clé « anon » ou « publishable »)
//
//  Ces deux valeurs sont faites pour être publiques : la base est
//  protégée par les règles RLS écrites dans schema.sql.
// ─────────────────────────────────────────────────────────────

export const SUPABASE_URL = "https://pqjcqwiqmrsqdhcunzux.supabase.co";
export const SUPABASE_CLE = "sb_publishable_KgRkvzlmcaviJB9Zbyu-DQ_ovt6SBWq";

// Nombre maximum de joueurs dans un salon.
export const MAX_JOUEURS = 10;
