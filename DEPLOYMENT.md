# YourMovie's — Guide de lancement local & hébergement

Ce projet est composé de **deux applications** :

| Partie | Techno | Rôle |
|--------|--------|------|
| `backend/` | FastAPI (Python) + MongoDB | API REST + WebSocket (auth, catalogue, favoris, paiements Stripe, watch party) |
| `frontend/` | React 19 (CRA + craco) + Tailwind | Interface (le site que l'on voit) |

> ⚠️ **Important** : Netlify et Cloudflare Pages n'hébergent que le **frontend** (fichiers statiques). Le **backend Python** doit être hébergé ailleurs (Render, Railway…) et la **base** sur MongoDB Atlas.

---

## 1. Lancer en local

### Prérequis (déjà présents sur cette machine)
- Node.js 20+ et npm
- Python 3.14
- Un cluster **MongoDB Atlas** gratuit (voir §3)

### Variables d'environnement
- `backend/.env` → `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `CORS_ORIGINS`
- `frontend/.env` → `REACT_APP_BACKEND_URL=http://localhost:8001`

### Démarrage
```bash
# Terminal 1 — backend
cd backend
venv/Scripts/python.exe -m uvicorn server:app --host 127.0.0.1 --port 8001

# Terminal 2 — frontend
cd frontend
npm install        # la première fois seulement
npm start          # ouvre http://localhost:3000
```

Le **premier compte créé** (via /login → inscription) devient automatiquement **admin**.
En tant qu'admin, va dans `/admin` pour ajouter des films/séries/animes.

---

## 2. Hébergement en ligne (full stack)

Architecture cible :

```
  Navigateur
      │
      ▼
  Frontend (Cloudflare Pages ou Netlify)  ──►  Backend (Render)  ──►  MongoDB Atlas
     REACT_APP_BACKEND_URL                       CORS_ORIGINS
```

### 2.a — Base : MongoDB Atlas (voir §3)

### 2.b — Backend sur Render (gratuit)
1. Pousse le projet sur un dépôt GitHub.
2. Sur [render.com](https://render.com) → *New* → *Blueprint* → sélectionne le repo.
   Le fichier `render.yaml` (à la racine) configure tout automatiquement.
3. Renseigne les variables secrètes demandées :
   - `MONGO_URL` = ta chaîne Atlas
   - `CORS_ORIGINS` = l'URL de ton frontend (ex. `https://yourmovies.pages.dev`)
4. Render te donne une URL type `https://yourmovies-backend.onrender.com`.

> Alternative Railway : le fichier `backend/Procfile` fournit la commande de démarrage.

### 2.c — Frontend sur Cloudflare Pages
1. Cloudflare Dashboard → *Workers & Pages* → *Create* → *Pages* → connecte le repo.
2. Réglages de build :
   - **Root directory** : `frontend`
   - **Build command** : `npm run build`
   - **Output directory** : `build`
3. Variable d'environnement (Settings → Environment variables) :
   - `REACT_APP_BACKEND_URL` = l'URL Render du backend (ex. `https://yourmovies-backend.onrender.com`)
4. Le fichier `frontend/public/_redirects` gère déjà le routage SPA.

> Déploiement CLI (au lieu du dashboard) :
> ```bash
> cd frontend
> npm run build
> npx wrangler pages deploy build --project-name yourmovies
> ```

### 2.d — Frontend sur Netlify (alternative)
Le fichier `frontend/netlify.toml` contient déjà la config (base `frontend`, build `npm run build`, publish `build`, redirections SPA). Il suffit de définir `REACT_APP_BACKEND_URL` dans l'UI Netlify.

### 2.e — Après déploiement
Sur le backend Render, mets `CORS_ORIGINS` = l'URL exacte du frontend déployé, sinon le navigateur bloquera les requêtes (erreurs CORS).

---

## 3. MongoDB Atlas (gratuit) — étape unique

1. [mongodb.com/cloud/atlas/register](https://www.mongodb.com/cloud/atlas/register) → compte gratuit.
2. Crée un cluster **M0 (Free)**.
3. **Database Access** → nouvel utilisateur (user + mot de passe).
4. **Network Access** → *Allow access from anywhere* (`0.0.0.0/0`).
5. **Connect → Drivers** → copie la connection string :
   `mongodb+srv://user:motdepasse@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
6. Colle-la dans `MONGO_URL` (local et Render).

> Si le mot de passe contient des caractères spéciaux (`@ : / # ?`), il faut les encoder en URL (ex. `@` → `%40`).

---

## 4. Fonctionnalités optionnelles

| Fonction | Variable | Sans elle |
|----------|----------|-----------|
| Login Google | — (service cloud Emergent) | Utilise l'inscription email/mot de passe |
| Upload d'images admin | `EMERGENT_LLM_KEY` | Renseigne les URLs d'images à la main (champs `poster_url`, `banner_url`) |
| Paiements | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | Les pages Pricing/abonnement échouent à l'appel Stripe |

Le reste de l'application (catalogue, favoris, avis, profils, progression, watch party) fonctionne sans aucune de ces clés.
