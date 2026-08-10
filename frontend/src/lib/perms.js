export const PERM_GROUPS = [
    {
        group: "Contenu",
        perms: [
            { id: "content.add", label: "Ajouter du contenu", hint: "Films, séries, animes, téléversements et veille IMDb" },
            { id: "content.edit", label: "Modifier le contenu", hint: "Éditer les fiches et l'affichage à la une" },
            { id: "content.delete", label: "Supprimer du contenu", hint: "Action irréversible" },
        ],
    },
    {
        group: "Wishboard",
        perms: [
            { id: "wishboard.view", label: "Voir les propositions" },
            { id: "wishboard.approve", label: "Approuver" },
            { id: "wishboard.moderate", label: "Refuser, mettre en attente, supprimer" },
        ],
    },
    {
        group: "Utilisateurs",
        perms: [
            { id: "users.view", label: "Voir les utilisateurs" },
            { id: "users.block", label: "Bloquer / débloquer" },
            { id: "users.edit", label: "Modifier un compte", hint: "Pseudo, e-mail, mot de passe" },
            { id: "users.coins", label: "Gérer les Freemium" },
            { id: "users.premium", label: "Attribuer le Premium" },
            { id: "users.delete", label: "Supprimer un compte", hint: "Action irréversible" },
        ],
    },
    {
        group: "Communauté",
        perms: [
            { id: "reviews.moderate", label: "Modérer les commentaires" },
            { id: "announcements.manage", label: "Publier des annonces" },
        ],
    },
    {
        group: "Réglages",
        perms: [
            { id: "pricing.manage", label: "Tarifs Premium et Freemium" },
            { id: "ads.manage", label: "Publicité" },
            { id: "cagnotte.manage", label: "Cagnotte" },
            { id: "keys.manage", label: "Clés de licence" },
        ],
    },
    {
        group: "Administration",
        perms: [
            { id: "roles.manage", label: "Gérer les permissions", hint: "Permet d'accorder n'importe quel accès — à réserver aux personnes de confiance" },
        ],
    },
];

export const ALL_PERMS = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.id));

export const ROLE_PRESETS = {
    editor: ["content.add", "wishboard.view", "wishboard.approve", "users.view"],
    moderator: [
        "content.add", "content.edit",
        "wishboard.view", "wishboard.approve", "wishboard.moderate",
        "users.view", "users.block", "users.coins",
        "reviews.moderate", "announcements.manage",
    ],
    super: [...ALL_PERMS],
};

export const PRESET_LABELS = {
    editor: "Éditeur",
    moderator: "Modérateur",
    super: "Super-admin",
};

/** L'utilisateur possède-t-il la permission demandée ? */
export function can(user, perm) {
    if (!user) return false;
    if (user.superadmin_locked) return true;
    const perms = user.admin_perms;
    if (Array.isArray(perms)) return perms.includes(perm);
    return false;
}

/** Possède-t-il au moins une des permissions ? */
export function canAny(user, ...perms) {
    return perms.some((p) => can(user, p));
}
