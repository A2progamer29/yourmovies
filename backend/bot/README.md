# Bot Discord YourMovie's

Le bot relie Discord au backend FastAPI sans accès direct à MongoDB. Il gère les YM Coins, les bumps, les boosts et l'assistant des tickets.

## Économie retenue

| Source | Gain | Cooldown commun | Plafond journalier |
|---|---:|---:|---:|
| Message, réaction ou commande | 1 à 3 YM Coins | 3 minutes | 60 |
| Bump confirmé | 5 YM Coins | 2 heures | 15 |

Prix par défaut pour 30 jours : Basic 1 200, Standard 2 800, Premium 6 000 YM Coins. Les prix peuvent toujours être remplacés dans le panneau d'administration existant.

Cette configuration donne environ 20 à 40 YM Coins par jour à un membre régulier, sans permettre de farmer plusieurs types d'événements en parallèle. Le Basic demande généralement plusieurs semaines, tandis que Standard et Premium restent des objectifs plus longs.

## 1. Créer l'application Discord

1. Ouvrir le [Discord Developer Portal](https://discord.com/developers/applications).
2. Créer une application puis un bot.
3. Dans **Bot > Privileged Gateway Intents**, activer :
   - **Server Members Intent** ;
   - **Message Content Intent**.
4. Dans **OAuth2 > URL Generator**, sélectionner les scopes `bot` et `applications.commands`.
5. Accorder au minimum : voir les salons, lire l'historique, envoyer des messages, intégrer des liens et utiliser les commandes.
6. Inviter le bot sur le serveur.

Ne jamais placer le token Discord dans le code ou sur GitHub.

## 2. Récupérer les identifiants

Dans Discord, activer **Paramètres > Avancés > Mode développeur**, puis copier :

- l'identifiant du serveur ;
- l'identifiant de la catégorie des tickets d'assistance ;
- l'identifiant de la catégorie des tickets de paiement ;
- l'identifiant de la catégorie des autres tickets ;
- les identifiants des rôles du staff.

Le serveur, les trois catégories, le salon de bump et l'identifiant officiel de DISBOARD sont déjà préremplis dans `.env.example` avec les identifiants communiqués.

## 3. Configurer les secrets

Générer deux secrets différents :

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

- le premier devient `DISCORD_SERVICE_KEY` dans le backend **et** le bot ;
- le second devient `DISCORD_LINK_CODE_PEPPER` uniquement dans le backend.

Copier `backend/.env.discord.example` dans les variables d'environnement du backend. Copier `bot/.env.example` vers `bot/.env` uniquement en local, puis remplir les identifiants.

Pour l'IA des tickets, créer une clé API OpenAI côté serveur et définir aussi `OPENAI_MODEL`. Sans ces deux variables, toutes les autres fonctions du bot continuent de marcher et les tickets restent au staff.

## 4. Installer et lancer

Depuis le dossier `bot` :

```bash
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
python main.py
```

Sous Linux/macOS, l'activation est `source .venv/bin/activate`.

Pour Render, créer un second **Background Worker** Python :

- Root Directory : `bot`
- Build Command : `pip install -r requirements.txt`
- Start Command : `python main.py`

Ajouter toutes les variables du fichier `.env.example` dans les variables secrètes du service.

## 5. Utilisation

1. L'utilisateur ouvre **Paramètres > Discord** sur YourMovie's.
2. Il génère son code.
3. Il exécute `/lier CODE`.
4. `/solde` vérifie la liaison et le solde.
5. `/economie` affiche les règles actives.

Commandes staff :

- `/ia pause` et `/ia reprendre` ;
- `/boosts @membre nombre` pour corriger un historique de boosts antérieur à l'installation du bot.

L'assistant attend toujours le premier message d'un utilisateur : il ignore les messages automatiques d'ouverture des bots et des webhooks. Il lit ensuite jusqu'aux 30 derniers messages textuels du ticket pour comprendre le contexte, en distinguant l'utilisateur, le staff et ses propres réponses. Il fonctionne dans les catégories **Contacter le staff** et **Autres**, ne répond jamais dans la catégorie **Paiements**, et transmet au staff lorsqu'une information n'est pas présente dans sa documentation contrôlée.

## 6. Codes d'erreur

Chaque erreur affiche désormais un code stable, une explication et l'action recommandée. Ne transmets jamais le token Discord ni `DISCORD_SERVICE_KEY` avec un rapport d'erreur.

| Code | Signification | Correction principale |
|---|---|---|
| `YM-CONFIG-MISSING` | Variable obligatoire absente | Compléter `bot/.env` puis redémarrer le bot |
| `YM-CONFIG-ID` | Identifiant Discord invalide | Utiliser uniquement l'identifiant numérique |
| `YM-AUTH-SERVICE-KEY` | Clés bot/backend différentes | Mettre la même clé des deux côtés et redémarrer |
| `YM-API-404` | Route backend absente | Déployer les fichiers Discord sur Render |
| `YM-API-TIMEOUT` | Backend trop lent | Vérifier l'état et les logs Render |
| `YM-MEMBER-NOT-LINKED` | Compte Discord non lié | Générer un code sur le site puis utiliser `/lier` |
| `YM-LINK-CODE-INVALID` | Code invalide ou expiré | Générer un nouveau code |
| `YM-DISCORD-10062` | Interaction Discord expirée | Relancer la commande et vérifier la latence |
| `YM-CMD-NOT-FOUND` | Ancienne commande encore visible | Redémarrer Discord après la synchronisation |
| `YM-DISCORD-403` | Permissions du bot insuffisantes | Corriger les permissions du salon |

Dans les logs, recherche directement le code entre crochets, par exemple `[YM-API-TIMEOUT]`. Le détail technique reste dans les logs tandis que le message Discord reste compréhensible et ne révèle aucun secret.
