# Correctifs de sécurité — 31 août 2026

Les corrections sont préparées pour une intégration coordonnée du backend et du frontend. Elles ne prouvent pas que le service actuellement déployé est protégé. Les paramètres réels de Render, Bunny, Cloudflare et MongoDB n'ont pas été accessibles lors de cet audit.

## Avant la mise en production

1. **Bunny : activer l'authentification des fichiers CDN et du lecteur intégré.** Renseigner `BUNNY_TOKEN_AUTH_KEY` pour les intégrations et `BUNNY_CDN_TOKEN_AUTH_KEY` pour le CDN, avec les clés correctes de la bibliothèque et de la Pull Zone. Vérifier `BUNNY_CDN_HOST` et `BUNNY_LIBRARY_ID`. Ne pas utiliser la clé API d'administration pour signer les lectures. Le backend sait utiliser la clé de signature historique comme valeur de repli du CDN si les deux configurations emploient effectivement cette même clé.
2. **Vérifier qu'un manifeste, un segment et une intégration sans signature sont refusés par Bunny.** Les protections par domaine référent seules ne suffisent pas. Tester aussi une signature expirée et une signature valide. Des références vidéo figuraient déjà dans le catalogue Git public : masquer les nouvelles réponses ne révoque pas ces références historiques. Les URLs signées restent partageables jusqu'à leur expiration (quatre heures pour une lecture).
3. **Render : conserver un `JWT_SECRET` stable et aléatoire d'au moins 32 octets.** Le démarrage échoue s'il manque ou s'il est trop court. Le fichier `render.yaml` prévoit déjà sa génération, mais ne permet pas de vérifier sa présence effective dans un service existant. Ne pas publier sa valeur dans un ticket, une capture ou une réponse de diagnostic.
4. **Cookies et domaines : privilégier un backend sur un sous-domaine du site**, par exemple `api.yourmovies.space`, et `COOKIE_SAMESITE=lax` pour le frontend sur `yourmovies.space`. Renseigner `REACT_APP_BACKEND_URL` et les origines exactes de `CORS_ORIGINS`. La valeur `none` prend en charge des origines de sites différents, mais les navigateurs qui bloquent les cookies tiers peuvent empêcher les sessions entre Vercel/yourmovies.space et onrender.com. Tester Chrome, Firefox et Safari. Le développement local doit aussi permettre les cookies `Secure`, idéalement en HTTPS.
5. **Proxy Render : vérifier la chaîne réseau avant de renseigner `TRUSTED_PROXY_CIDRS`.** La commande fournie utilise `--no-proxy-headers`; seul le code interprète ensuite `X-Forwarded-For`, de droite à gauche et uniquement si le pair réseau appartient aux proxies autorisés. Sans configuration, les en-têtes clients sont ignorés : c'est sûr contre leur falsification, mais des utilisateurs derrière un même proxy peuvent partager le quota. Ne jamais définir une confiance globale (`0.0.0.0/0` ou `::/0`). Faire confirmer par Render les pairs et en-têtes de l'infrastructure réelle; aucune hypothèse d'écrasement de l'en-tête n'a été faite ici.
6. **Turnstile : renseigner `TURNSTILE_SITE_KEY` et `TURNSTILE_SECRET_KEY`**, autoriser les domaines du frontend et vérifier une validation réelle. Une panne ou une mauvaise configuration bloque les visiteurs anonymes; il n'existe plus de jeton de secours. Les comptes authentifiés conservent le parcours sans captcha.
7. **MongoDB : autoriser la création des index TTL** des collections `rate_limits`, `playback_grants` et `playback_ad_history`. Les limites utilisent des compteurs atomiques persistants en fenêtres fixes et des identifiants hachés avec une clé. Elles survivent aux redémarrages et sont partagées entre instances. Une panne du limiteur refuse la requête au lieu de désactiver la protection.
8. **UQFlex : conserver uniquement les destinations HTTPS approuvées.** `UQFLEX_PARTNER_BASE` et `UQFLEX_PARTNER_FALLBACKS` sont administratifs et ne doivent pointer que vers le fournisseur autorisé. Les redirections automatiques avec clé partenaire sont désactivées. Le recours SSH devient explicite (`UQFLEX_ENABLE_SSH=true` uniquement si ce transport est réellement configuré).
9. **Déployer frontend et backend ensemble**, avec Node 24 pour les outils frontend et Python 3.12 pour le backend. Les anciens JWT navigateur sont intentionnellement rejetés : prévoir une reconnexion générale. Les clients API personnalisés doivent envoyer `X-YM-Request: 1` pour les mutations. Les échanges internes Discord conservent leur authentification de service.

## Changements du code

| Sujet | Correction |
| --- | --- |
| Catalogue public | Aucun identifiant Bunny, URL vidéo ou chemin de fichier; épisodes, qualités et langues limités aux métadonnées utiles. `has_video` et `has_primary_video` remplacent les déductions depuis les sources. |
| Administration | Endpoint distinct `/api/admin/media/{id}` protégé par permissions pour éditer les sources. |
| Lecture | `/api/media/{id}/playback`, avec ancien alias Bunny soumis aux mêmes vérifications. Contrôle de l'abonnement ou autorisation liée à la session, au titre et à l'épisode. |
| Publicités | Étapes, délais et fréquence contrôlés dans MongoDB. Une valeur dans localStorage ou une simple affirmation du navigateur ne suffit plus à obtenir la source. |
| Bunny/HLS | URLs signées par dossier; suppression des sondes qui acceptaient des flux non signés. Une configuration de signature manquante produit une erreur explicite. |
| UQFlex | Le relais public exige une autorisation temporaire spécifique au contenu; absence d'accès direct au partenaire sans cette autorisation. |
| Hors ligne | Premium contrôlé côté serveur; refus des sources externes sans signature. Les anciens contenus MP4/fichiers non signables doivent être migrés vers un hébergement protégé. |
| Authentification | Cookie `__Host-ym_session`, `Secure`, `HttpOnly`, sans domaine partagé. Aucun JWT dans les réponses de connexion ni dans localStorage. Même authentification pour Watch Party. Révocation à la déconnexion. |
| CSRF | En-tête obligatoire sur les mutations navigateur, contrôle strict des origines, CORS cohérent. Les erreurs de déconnexion ne sont plus présentées comme un succès. |
| Anti-abus | Limites partagées MongoDB, limites additionnelles par compte pour login/PIN, en-têtes proxy non fiables ignorés. |
| Captcha | Suppression du contournement; validation du domaine Turnstile et liaison des preuves au client; vérification serveur de leur expiration. |
| Profils | Vérification du propriétaire à la sélection; suppression d'un profil ne supprime plus les favoris/historiques d'un autre compte. |
| Secrets et journaux | Anciennes références de lecture supprimées du snapshot public en conservant ses 94 fiches. Caches privés déplacés dans un dossier ignoré par Git. Suppression des logs de jetons Google et des journaux d'accès Uvicorn susceptibles de contenir des autorisations dans les URLs. |
| Dépendances | Mise à jour des paquets vulnérables; les overrides de sécurité s'appliquent maintenant à npm, pas seulement à Yarn. Workflow de tests et d'audits ajouté. |

## Vérifications réalisées

- 25 tests Python passent : 15 scénarios de sécurité nouveaux et 10 tests existants liés à Discord.
- 3 tests React passent : visiteur anonyme, compte gratuit et Premium, depuis un catalogue dépourvu de sources.
- Compilation de production du frontend réussie; compatibilité des dépendances Python vérifiée.
- Après mises à jour, `pip-audit` et `npm audit` ne signalent aucune vulnérabilité connue dans les environnements examinés à cette date. Ce résultat dépend des bases d'avis disponibles et ne garantit pas l'absence de faille.
- Recherche de secrets dans les fichiers courants et recherche ciblée sur 1 026 versions de fichiers Git. Aucune clé de production confirmée par ces recherches. Le dépôt contient des identifiants de tests et un exemple historique d'URL MongoDB; si des valeurs d'exemple ont été réutilisées en production, les remplacer et révoquer leurs accès. Les valeurs n'ont pas été reproduites dans ce rapport.
- Les tests utilisent une base MongoDB simulée, des clés fictives et des fournisseurs simulés. Aucun compte réel, paiement ou donnée de production n'a été modifié.

Exécution reproductible :

```sh
python -m pip install -r backend/requirements-test.txt
python -m pytest backend/tests/test_security_boundaries.py backend/tests/test_discord_economy.py tests/test_discord_api_validation.py -q
cd frontend
npm ci --legacy-peer-deps --ignore-scripts
npm test -- --watchAll=false --runInBand WatchPage.security.test.jsx
npm run build
npm audit
```

## Limites à garder visibles

Le serveur peut imposer des étapes et un délai publicitaire, mais ne peut pas prouver qu'une personne a regardé une publicité hébergée sur un autre domaine. Une preuve de visionnage facturable nécessite une validation serveur du fournisseur publicitaire. Les scripts publicitaires tiers exécutés dans la page restent une dépendance de confiance : `HttpOnly` empêche de lire le cookie, mais ne neutralise pas une XSS capable d'agir dans une session ouverte. Leur isolation et une politique CSP adaptée demandent un contrôle des domaines effectivement utilisés.

Le téléchargement hors ligne existant stocke des vidéos lisibles sur l'appareil, avec une durée d'accès contrôlée côté client. Cela n'est pas une DRM et ne permet pas de révoquer des copies déjà extraites. Les autorisations de streaming temporaires ne sont pas non plus une DRM.

La revue n'est pas un audit exhaustif de chaque logique métier, du fournisseur vidéo, de l'hébergement ou de toute l'histoire Git. La suppression d'un secret du code ne révoque pas ce secret. Toute clé confirmée exposée doit être renouvelée chez son fournisseur; aucune réécriture destructive de l'historique Git n'a été effectuée.

Références : [signature Bunny CDN par dossier](https://support.bunny.net/hc/en-us/articles/360016055099-How-to-sign-URLs-for-BunnyCDN-Token-Authentication), [protections distinctes du lecteur et des fichiers Bunny](https://support.bunny.net/hc/en-us/articles/4414548058258-Understanding-Bunny-Stream-Security-options), [infrastructure de protection Render](https://render.com/articles/how-render-handles-ddos-attacks).
