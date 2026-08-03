# YourMovie's — PRD (Iteration 3)

## Statement
Site pour regarder animes/films/séries avec système d'abonnement Stripe, publicités réelles avant lecture, gestion complète depuis panneau admin. Nom : **YourMovie's**.

## Architecture
- FastAPI + MongoDB + Emergent Object Storage
- React 19, Tailwind, Shadcn UI, Framer Motion
- Auth : JWT + Emergent Google OAuth
- Paiements : Stripe (sandbox claimable)
- Ads : Google IMA SDK (VAST tag)

## Personas
- **Visiteur** : catalogue, détail, watch avec ads (720p max)
- **Basic (4,99€)** : sans pub, 1080p, 1 écran
- **Standard (9,99€)** : sans pub, 1080p, 2 écrans (populaire)
- **Premium (16,99€)** : sans pub, 4K UHD + HDR, 4 écrans, multi-profils, trailer autoplay hero
- **Admin** : panneau complet (contenus + utilisateurs)

## Implemented (Feb 2026)
- Auth (JWT + Google) + JWT admin promotion (1er utilisateur)
- Media CRUD avec qualités multiples (720p/1080p/4k), featured + ordre
- Reviews, Favoris, Watchlist, Progression de visionnage
- Stripe : 3 plans × 2 intervals, checkout, webhook, subscription/current, cancel, resume
- Multi-profils (max 4, Premium-only)
- Admin : full-page form, tabs Contenus/Utilisateurs, toggle-admin, delete-user
- Homepage : hero auto-rotatif (multi-featured, 7s), Reprendre, upsell Premium
- Custom Video Player : IMA SDK (VAST), quality selector, seek/skip/volume/fullscreen
- Similar Titles, Advanced Filters (genre/year/rating)

## Backlog
- P1 : Watch Party synchro + chat
- P1 : Réel gate 4K via manifest HLS/DASH
- P2 : Historique + i18n
- P2 : Contrôle parental profils enfants (PIN)
- P2 : Refactor server.py en routers par domaine
