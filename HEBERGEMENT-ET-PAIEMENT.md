# Hébergement et paiement — décision préparée le 23 octobre 2026

## Recommandation

Héberger la vitrine commerciale sur Cloudflare Pages Free et conserver GitHub pour le code et les traitements. L’offre Free prévoit 500 builds/mois ; déployer la vitrine seulement quand son code change, sans recopier le cron sportif toutes les 15 minutes. Les appels de paiement nécessitent un serveur (Worker ou fonction Supabase) ; les clés secrètes ne vont jamais dans config.js.

La migration n’est pas effectuée : aucun compte Cloudflare connecté n’est disponible. Le dépôt est prêt : sortie docs/, wrangler.jsonc, workflow manuel cloudflare.yml. Créer le projet pronos-foot-vitrine dans le compte Cloudflare, connecter ce dépôt ou renseigner les secrets CLOUDFLARE_API_TOKEN et CLOUDFLARE_ACCOUNT_ID, puis lancer le workflow manuel. Ne pas déclencher de plan payant. Les URLs GitHub existantes restent accessibles pendant la transition.

Les sources JSON sportives utilisent désormais ROBOT_BASE_URL : les liens ne dépendent plus d’un dossier voisin sur github.io. Après la migration, ajouter les URL exactes de confirmation/récupération de mot de passe dans la liste Supabase Auth autorisée. Tester connexion, activation et récupération sur le nouveau domaine avant de communiquer sa nouvelle adresse.

## Prestataire de paiement

FedaPay est un candidat pour MoMo au Bénin. Ses CGU §1.11.2 soumettent explicitement les prévisions sportives à une autorisation écrite préalable. L’hébergeur ne remplace pas cet accord. Un compte marchand, les justificatifs requis et la tarification contractuelle restent à vérifier. Les frais de transaction ne sont pas inclus dans le budget d’hébergement gratuit.

Aucun encaissement, faux SMS/USSD ou activation automatique n’est configuré. La page paiement.html explique le fonctionnement manuel et mène à l’activation existante.

## Architecture de l’automatisation, après acceptation

1. Le serveur identifie le client par sa session vérifiée, lit le tarif et l’affiliation en base ; il crée une commande immuable avec montant, devise XOF, durée, identifiant client et identifiant fournisseur. Le navigateur ne décide pas du prix.
2. Le prestataire héberge la saisie du paiement. Aucun code MoMo n’est demandé sur notre site.
3. Un webhook vérifie la signature du corps brut, puis relit la transaction auprès du prestataire. Statut approuvé, montant, devise, référence de commande et compte marchand doivent correspondre.
4. Une transaction SQL atomique et idempotente active l’abonnement une seule fois et attribue la commission admissible. Clés uniques de commande/transaction/événement ; une répétition du webhook ne prolonge pas deux fois l’accès. Rejouer les essais doublon, montant modifié, faux retour navigateur, signature invalide et interruption réseau.
5. Un simple retour de page « succès » ne prouve jamais le paiement. Les remboursements/annulations ont leur propre traitement audité.

Cette architecture est documentée, pas présentée comme un paiement opérationnel. Le code spécifique et la migration SQL seront finalisés après choix accepté du prestataire et accès de test.

## Sources officielles vérifiées

- https://developers.cloudflare.com/pages/platform/limits/
- https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/
- https://docs.github.com/en/site-policy/github-terms/github-terms-for-additional-products-and-features
- https://www.fedapay.com/general-terms-of-use
- https://docs.fedapay.com/fr/integration-api/webhooks
- https://supabase.com/docs/guides/auth/redirect-urls
