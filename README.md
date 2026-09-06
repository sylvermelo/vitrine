# Vitrine mobile PRONOS FOOT

Site **clients** (design Google Stitch, assemblé par `assemble.py` depuis `src/`).
Déployé sur GitHub Pages : https://sylvermelo.github.io/vitrine/

**Séparé du robot** : le terminal complet reste sur
https://sylvermelo.github.io/pronos-foot/ (usage personnel). La vitrine ne
contient AUCUN code du robot ; elle lit uniquement :
- la table `selections` et la table `combines` de Supabase (clé publique
  `anon` + politiques RLS de lecture, cf. `supabase/rls_vitrine.sql` dans le
  repo robot) ;
- Supabase Auth pour les pages connexion / inscription.

Rien n'est inventé : si la base est vide ou les RLS absentes, l'écran
affiche un message au lieu de fausses données.

## Regénérer après une retouche Stitch
1. Remplacer les fichiers dans `src/` par les nouveaux exports.
2. `python3 assemble.py` → régénère `docs/`.
3. Commit + push.

## Config
`docs/assets/config.js` : URL du projet + clé **anon publique** (sans risque :
RLS borne tout). La clé maîtresse d'écriture reste dans les GitHub Secrets
du repo robot, jamais ici.
