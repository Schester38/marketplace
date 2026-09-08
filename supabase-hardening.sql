-- ============================================================================
-- Mboppi — Durcissement Supabase (RLS + Storage) — à exécuter UNE FOIS dans le
-- SQL Editor de Supabase (Dashboard → SQL Editor).
--
-- IMPORTANT / SÛR pour l'application :
--   Le serveur Mboppi se connecte avec DATABASE_URL (rôle postgres, propriétaire
--   des tables) et SUPABASE_SERVICE_KEY (service_role = BYPASSRLS). Ces deux
--   rôles CONTOURNENT la RLS : l'application continue de fonctionner à
--   l'identique. Ce script bloque uniquement les accès "externes" (clé anon /
--   rôle authenticated via l'API REST Supabase).
--
-- Effet : si un jour l'anon key fuit, l'attaquant ne verra AUCUNE ligne.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. RLS deny-by-default sur TOUTES les tables du schéma public
--    (ENABLE sans policy = deny-all pour anon/authenticated ; le serveur,
--    propriétaire, n'est pas affecté).
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
      AND rowsecurity = FALSE          -- ne touche pas celles déjà protégées
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    RAISE NOTICE 'RLS activée sur %', t;
  END LOOP;
END $$;

-- Contrôle : toutes les lignes doivent afficher rls = true
SELECT c.relname AS table_name, c.relrowsecurity AS rls
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- ----------------------------------------------------------------------------
-- 2. Bucket "payment-proofs" en PRIVÉ (les preuves de paiement ne doivent pas
--    être lisibles publiquement). Le serveur génère désormais des URLs signées
--    (1 h) à la lecture (signedProofUrl dans server/storage.js).
--    ⚠️ Après cette commande, les anciennes URL publiques des preuves ne
--    fonctionnent plus — c'est voulu : l'espace vendeur/boutique passe par
--    l'API authentifiée qui signe à la volée.
-- ----------------------------------------------------------------------------
UPDATE storage.buckets SET public = FALSE WHERE id = 'payment-proofs';

-- Contrôle
SELECT id, public FROM storage.buckets;

-- ----------------------------------------------------------------------------
-- 3. Rotation / hygiène des identifiants (à faire manuellement, checklist) :
--    a. Supabase Dashboard → Settings → API : "Reset" de l'anon key si elle a
--       déjà circulé (elle est publique par design, mais une rotation propre
--       invalide d'anciens partages).
--    b. Supabase Dashboard → Database : rotation du mot de passe postgres si
--       la chaîne DATABASE_URL a déjà été partagée, puis mise à jour dans
--       Vercel (Environment Variables) + redéploiement.
--    c. Supabase Dashboard → Storage : vérifier les policies de storage.objects
--       (les buckets publics `photos` doivent rester lisibles).
--    d. Vercel : rotation de JWT_SECRET invalide toutes les sessions (24 h) —
--       à faire uniquement en cas de suspicion de fuite.
--    e. Supprimer les .env locaux périmés (server/.env local ne correspond plus
--       aux identifiants actuels).
-- ----------------------------------------------------------------------------
