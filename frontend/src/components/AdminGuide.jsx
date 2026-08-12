import React, { useState } from "react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/context/AuthContext";
import { can, PERM_GROUPS } from "@/lib/perms";
import { Search, Compass, Film, Tv, FileText, CheckCircle2, Star, ChevronUp, MessageSquare, Users, Megaphone, Coins, Tag, AlertTriangle, LifeBuoy, ShieldCheck } from "lucide-react";

const Etape = ({ n, titre, children }) => (
    <div className="flex gap-4">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#E8D2A6]/40 text-xs font-semibold text-[#E8D2A6]">{n}</div>
        <div className="min-w-0 flex-1 pb-1">
            <div className="text-sm font-medium text-white">{titre}</div>
            <div className="mt-1 text-sm leading-relaxed text-neutral-400">{children}</div>
        </div>
    </div>
);

const Note = ({ ton = "info", children }) => {
    const tons = {
        info: "border-[#262626] bg-[#111] text-neutral-300",
        attention: "border-amber-500/30 bg-amber-500/[0.06] text-amber-100/90",
    };
    return <div className={`rounded-lg border p-3.5 text-sm leading-relaxed ${tons[ton]}`}>{children}</div>;
};

const Cle = ({ children }) => (
    <code className="rounded bg-[#1a1a1a] px-1.5 py-0.5 text-[12px] text-[#E8D2A6]">{children}</code>
);

const LIBELLES = Object.fromEntries(
    PERM_GROUPS.flatMap((groupe) => groupe.perms.map((perm) => [perm.id, perm.label]))
);

const CONTENU = ["content.add", "content.edit"];

const RUBRIQUES = [
    {
        id: "prise-en-main",
        titre: "Prise en main du panel",
        icone: Compass,
        mots: "navigation menu accueil à traiter sections",
        contenu: () => (
            <div className="space-y-4">
                <p>Le menu de gauche range les sections en trois familles. <strong className="text-white">Catalogue</strong> pour les contenus, <strong className="text-white">Communauté</strong> pour les gens, <strong className="text-white">Monétisation</strong> pour l&apos;argent. Tu ne vois que les sections auxquelles tu as accès.</p>
                <p>Tu arrives toujours sur <strong className="text-white">À traiter</strong>. Cette page ne sert qu&apos;à une chose : te dire ce qui attend une action, sans que tu aies à ouvrir chaque section pour vérifier. Les cartes sont cliquables et t&apos;emmènent au bon endroit.</p>
                <p>Les petits nombres dorés dans le menu suivent la même idée : à côté de <em>Contenus</em>, c&apos;est le nombre de fiches sans vidéo ; à côté de <em>Wishboard</em>, le nombre de propositions en attente.</p>
            </div>
        ),
    },
    {
        id: "film",
        titre: "Ajouter un film",
        icone: Film,
        mots: "film nouveau contenu import tmdb vidéo bunny enregistrer",
        perms: CONTENU,
        contenu: () => (
            <div className="space-y-4">
                <Etape n="1" titre="Ouvre le formulaire">
                    Section <strong className="text-white">Contenus</strong>, puis le bouton <strong className="text-white">Ajouter un contenu</strong> en haut à droite.
                </Etape>
                <Etape n="2" titre="Laisse l'import remplir la fiche">
                    L&apos;encadré doré <strong className="text-white">Import intelligent</strong> est en haut. Choisis <em>Film</em>, tape le titre, clique sur le bon résultat. Le synopsis, l&apos;année, les genres, l&apos;affiche, la bannière, le casting et la bande-annonce arrivent seuls. Tu n&apos;écris presque rien.
                </Etape>
                <Etape n="3" titre="Envoie le fichier">
                    Descends jusqu&apos;à <strong className="text-white">Vidéo</strong> et glisse ton fichier dans le cadre en pointillés. Une barre de progression apparaît.
                </Etape>
                <Etape n="4" titre="Attends la préparation">
                    Une fois le transfert terminé, il reste une deuxième attente : la vidéo est préparée pour la lecture. C&apos;est normal et automatique.
                </Etape>
                <Etape n="5" titre="Enregistre">
                    Le bouton <strong className="text-white">Enregistrer</strong> reste grisé tant qu&apos;un envoi n&apos;est pas allé au bout. Ce n&apos;est pas un bug : attends simplement qu&apos;il redevienne doré.
                </Etape>
                <Note ton="attention">
                    Ne ferme pas l&apos;onglet pendant l&apos;envoi. Tu peux changer d&apos;onglet, minimiser, faire autre chose — mais fermer celui-ci interrompt le transfert et il faut recommencer.
                </Note>
            </div>
        ),
    },
    {
        id: "serie",
        titre: "Ajouter une série ou un anime",
        icone: Tv,
        mots: "série anime saison épisode dépôt automatique masse",
        perms: CONTENU,
        contenu: () => (
            <div className="space-y-4">
                <p>Le début est identique au film : <strong className="text-white">Import intelligent</strong>, tu choisis <em>Série</em> ou <em>Anime</em>, tu cherches le titre.</p>
                <Etape n="1" titre="Crée la structure">
                    Dans <strong className="text-white">Saisons &amp; épisodes</strong>, ajoute la saison puis ses épisodes : numéro, nom, durée. C&apos;est cette liste qui servira de cible aux fichiers.
                </Etape>
                <Etape n="2" titre="Dépose tous les fichiers d'un coup">
                    Le cadre <strong className="text-white">Dépôt automatique des épisodes</strong> accepte une sélection entière. Chaque fichier est lu, rangé au bon épisode d&apos;après son nom, puis envoyé.
                </Etape>
                <Etape n="3" titre="Surveille le compteur">
                    Il t&apos;indique combien de fichiers ont trouvé leur place et combien sont <em>à placer à la main</em>. S&apos;il y en a, c&apos;est presque toujours une question de nom de fichier.
                </Etape>
                <Note>
                    Les fichiers partent les uns après les autres, volontairement, pour ne pas saturer la connexion. Une saison de douze épisodes prend le temps qu&apos;elle prend : lance-la et va faire autre chose.
                </Note>
            </div>
        ),
    },
    {
        id: "nommage",
        titre: "Bien nommer les fichiers",
        icone: FileText,
        mots: "nom fichier nommage s01e02 1x02 épisode reconnaissance",
        perms: CONTENU,
        contenu: () => (
            <div className="space-y-4">
                <p>C&apos;est le seul point à soigner en amont, et celui qui fait gagner le plus de temps. Le site reconnaît ces écritures :</p>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[#262626] text-left text-[10px] uppercase tracking-widest text-neutral-500">
                                <th className="py-2 pr-4 font-normal">Écriture</th>
                                <th className="py-2 font-normal">Exemple</th>
                            </tr>
                        </thead>
                        <tbody className="text-neutral-400">
                            {[
                                ["S01E02", "Naruto - S01E02.mkv"],
                                ["1x02", "Naruto 1x02.mkv"],
                                ["En toutes lettres", "Saison 3 - Épisode 7.mp4"],
                                ["Numéro seul", "Épisode 12.mkv"],
                                ["Numéro après un tiret", "Naruto - 08 [1080p].mkv"],
                            ].map(([forme, exemple]) => (
                                <tr key={forme} className="border-b border-[#1a1a1a]">
                                    <td className="py-2.5 pr-4 whitespace-nowrap"><Cle>{forme}</Cle></td>
                                    <td className="py-2.5 text-neutral-300">{exemple}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <p>Si tes fichiers suivent une de ces formes, tu les déposes tous ensemble et ils se placent seuls. Sinon, il faudra les rattacher un par un — et c&apos;est là que les soirées se perdent.</p>
                <p className="text-neutral-500">Formats acceptés : MP4, MKV, WEBM, MOV.</p>
            </div>
        ),
    },
    {
        id: "complet",
        titre: "Vérifier qu'un contenu est complet",
        icone: CheckCircle2,
        mots: "complet incomplet manquant vérification épisode sans vidéo",
        perms: CONTENU,
        contenu: () => (
            <div className="space-y-4">
                <p>Deux endroits te le disent, tu n&apos;as jamais à parcourir la liste toi-même.</p>
                <p><strong className="text-white">En bas du formulaire</strong>, un encadré liste précisément ce qui manque, épisode par épisode : <Cle>S02E05</Cle>, <Cle>S02E06</Cle>. Il repère aussi les saisons entières absentes.</p>
                <p><strong className="text-white">Sur la page À traiter</strong>, la carte <em>Contenus incomplets</em> donne le total pour tout le site, avec un accès direct à chaque fiche concernée. Quand elle affiche zéro, tout est en ligne.</p>
            </div>
        ),
    },
    {
        id: "mise-en-avant",
        titre: "Mettre un contenu en avant",
        icone: Star,
        mots: "à l'affiche cinéma priorité featured ordre accueil",
        perms: ["content.edit"],
        contenu: () => (
            <div className="space-y-4">
                <p>Dans la liste des <strong className="text-white">Contenus</strong>, chaque ligne porte deux interrupteurs.</p>
                <p><strong className="text-white">À l&apos;affiche</strong> place le contenu dans le grand bandeau de la page d&apos;accueil. Quand il est activé, un champ <em>priorité</em> apparaît à côté : plus le nombre est petit, plus le contenu passe tôt. Utilise 1, 2, 3… plutôt que des écarts au hasard.</p>
                <p><strong className="text-white">Au cinéma</strong> signale un film encore en salles. Les visiteurs voient alors un avertissement avant la lecture, expliquant que la qualité peut ne pas être optimale.</p>
                <Note>Les deux interrupteurs s&apos;appliquent immédiatement, sans passer par le formulaire ni par un bouton Enregistrer.</Note>
            </div>
        ),
    },
    {
        id: "wishboard",
        titre: "Traiter le Wishboard",
        icone: ChevronUp,
        mots: "wishboard propositions votes approuver refuser attente",
        perms: ["wishboard.view", "wishboard.approve", "wishboard.moderate"],
        contenu: (peut) => (
            <div className="space-y-4">
                <p>Les visiteurs proposent des titres et votent pour eux. La liste est triée par nombre de votes : le plus demandé est en haut.</p>
                {peut("wishboard.approve") && (
                    <p><strong className="text-white">Approuver</strong> signale publiquement que le titre arrivera. C&apos;est la réponse à donner dès que tu sais que le contenu sera ajouté.</p>
                )}
                {peut("wishboard.moderate") && (
                    <>
                        <p><strong className="text-white">En attente</strong> laisse la proposition dans la file sans t&apos;engager. <strong className="text-white">Refuser</strong> ferme la demande.</p>
                        <p>La corbeille supprime définitivement la proposition et ses votes. À réserver aux doublons et aux propositions hors sujet — un refus est plus honnête vis-à-vis de la personne qui a proposé.</p>
                    </>
                )}
                {!peut("wishboard.approve") && !peut("wishboard.moderate") && (
                    <Note>Tu peux consulter les propositions mais pas les trancher. Demande la permission correspondante si tu dois le faire.</Note>
                )}
            </div>
        ),
    },
    {
        id: "commentaires",
        titre: "Modérer les commentaires",
        icone: MessageSquare,
        mots: "commentaires avis modération réponses supprimer",
        perms: ["reviews.moderate"],
        contenu: () => (
            <div className="space-y-4">
                <p>La section rassemble tous les avis et leurs réponses, avec une recherche qui porte à la fois sur le texte, l&apos;auteur et le titre concerné.</p>
                <p>Attention à un détail : supprimer un avis supprime aussi toutes les réponses qu&apos;il a reçues. Pour ne retirer qu&apos;une réponse, supprime la réponse elle-même, pas l&apos;avis parent.</p>
            </div>
        ),
    },
    {
        id: "utilisateurs",
        titre: "Gérer les utilisateurs",
        icone: Users,
        mots: "utilisateurs comptes premium bloquer supprimer permissions rôles",
        perms: ["users.view", "users.edit", "users.block", "users.delete", "users.premium", "roles.manage"],
        contenu: (peut) => (
            <div className="space-y-4">
                <p>Cherche un compte par nom ou par adresse. Les colonnes se trient en cliquant sur leur en-tête, et cliquer sur une ligne ouvre la fiche détaillée du compte.</p>
                {peut("users.premium") && <p><strong className="text-white">Accorder un Premium</strong> se fait depuis la fiche : tu choisis la formule et la durée.</p>}
                {peut("users.block") && <p><strong className="text-white">Bloquer</strong> empêche la connexion sans effacer les données. C&apos;est réversible, contrairement à la suppression.</p>}
                {peut("users.delete") && <p><strong className="text-white">Supprimer</strong> efface le compte et tout ce qui lui appartient. Irréversible, et impossible sur ton propre compte.</p>}
                {peut("roles.manage") && (
                    <Note ton="attention">
                        <strong>Les permissions</strong> se cochent une par une, comme sur Discord. Trois préréglages existent pour aller vite, mais tu peux composer librement. Garde en tête qu&apos;accorder la gestion des permissions permet à la personne de s&apos;accorder tout le reste.
                    </Note>
                )}
            </div>
        ),
    },
    {
        id: "annonces",
        titre: "Publier une annonce",
        icone: Megaphone,
        mots: "annonces message information visiteurs publier",
        perms: ["announcements.manage"],
        contenu: () => (
            <div className="space-y-4">
                <p>Une annonce est un message visible par tous les visiteurs du site. Le titre est obligatoire, le texte est libre.</p>
                <p>La publication est immédiate. Relis avant de valider : il n&apos;y a pas de modification possible après coup, seulement la suppression et une nouvelle publication.</p>
            </div>
        ),
    },
    {
        id: "freemium",
        titre: "Freemium et cagnotte",
        icone: Coins,
        mots: "freemium coins points solde cagnotte dons total",
        perms: ["users.coins", "cagnotte.manage"],
        contenu: (peut) => (
            <div className="space-y-4">
                {peut("users.coins") && (
                    <p><strong className="text-white">Freemium</strong> ajuste le solde de points d&apos;un compte : ajouter, retirer, fixer une valeur précise ou remettre à zéro. Le nouveau solde s&apos;affiche immédiatement après l&apos;opération.</p>
                )}
                {peut("cagnotte.manage") && (
                    <>
                        <p><strong className="text-white">Cagnotte</strong> gère le total affiché publiquement sur le site. Tu saisis le montant, tu enregistres.</p>
                        <Note ton="attention">La remise à zéro demande deux confirmations successives. Ce n&apos;est pas une maladresse d&apos;interface : l&apos;opération est irréversible et le total public repart de zéro.</Note>
                    </>
                )}
            </div>
        ),
    },
    {
        id: "commerce",
        titre: "Tarifs, publicité et clés",
        icone: Tag,
        mots: "tarifs prix réduction publicité pub emplacements clés sellauth activation",
        perms: ["pricing.manage", "ads.manage", "keys.manage"],
        contenu: (peut) => (
            <div className="space-y-4">
                {peut("pricing.manage") && (
                    <p><strong className="text-white">Tarifs</strong> fixe les prix Premium et Freemium ainsi que les réductions en cours. Les montants s&apos;appliquent au site dès l&apos;enregistrement.</p>
                )}
                {peut("ads.manage") && (
                    <p><strong className="text-white">Publicité</strong> règle les emplacements et le nombre d&apos;étapes à franchir avant la lecture. Monte ce nombre avec prudence : chaque étape supplémentaire est un visiteur de plus qui abandonne.</p>
                )}
                {peut("keys.manage") && (
                    <p><strong className="text-white">Clés SellAuth</strong> tient la liste des clés d&apos;activation. Tu peux en importer plusieurs d&apos;un coup en choisissant la formule et la périodicité, ou en retirer une. Le décompte en haut indique ce qui est disponible, utilisé ou révoqué.</p>
                )}
            </div>
        ),
    },
    {
        id: "pieges",
        titre: "Les pièges classiques",
        icone: AlertTriangle,
        mots: "erreur piège brouillon publication onglet fermé",
        perms: CONTENU,
        contenu: () => (
            <div className="space-y-3">
                <Note ton="attention">
                    <strong>Une fiche enregistrée est visible tout de suite.</strong> Il n&apos;existe pas de brouillon. Si tu enregistres avant d&apos;avoir envoyé la vidéo, les visiteurs tombent sur une fiche qui ne se lance pas. Le bon réflexe : envoyer d&apos;abord, enregistrer ensuite.
                </Note>
                <Note ton="attention">
                    <strong>L&apos;onglet doit rester ouvert.</strong> Un envoi en cours s&apos;interrompt si tu fermes la page.
                </Note>
                <Note ton="attention">
                    <strong>Le bouton Enregistrer grisé n&apos;est pas une panne.</strong> Il attend qu&apos;un transfert en cours se termine, pour éviter d&apos;enregistrer une fiche à moitié faite.
                </Note>
            </div>
        ),
    },
    {
        id: "coince",
        titre: "Si ça coince",
        icone: LifeBuoy,
        mots: "problème bug aide bloqué erreur support",
        contenu: () => (
            <div className="space-y-4">
                <p>Un envoi bloqué à 0 %, une vidéo qui n&apos;apparaît pas, un épisode qui refuse de se rattacher : dans la grande majorité des cas c&apos;est un fichier mal nommé ou une connexion coupée en cours de route.</p>
                <p>Avant de signaler quoi que ce soit, essaie dans cet ordre : vérifie le nom du fichier, recharge la page, relance l&apos;envoi. Si le problème revient, note <strong className="text-white">le titre concerné</strong>, <strong className="text-white">ce que tu faisais</strong> et <strong className="text-white">l&apos;heure</strong> — ces trois informations suffisent presque toujours à retrouver la cause.</p>
            </div>
        ),
    },
];

export default function AdminGuide() {
    const { user } = useAuth();
    const [recherche, setRecherche] = useState("");

    const peut = (perm) => can(user, perm);
    const mesPerms = Array.isArray(user?.admin_perms) ? user.admin_perms : [];
    // Une rubrique sans permission déclarée concerne tout le monde ; les autres
    // n'apparaissent que si la personne peut réellement agir dessus.
    const autorisees = RUBRIQUES.filter((r) => !r.perms || r.perms.some(peut));

    const terme = recherche.trim().toLowerCase();
    const visibles = terme
        ? autorisees.filter((r) => (r.titre + " " + r.mots).toLowerCase().includes(terme))
        : autorisees;

    const masquees = RUBRIQUES.length - autorisees.length;

    return (
        <div className="space-y-6" data-testid="admin-guide">
            <div className="rounded-xl border border-[#E8D2A6]/25 bg-[#E8D2A6]/[0.04] p-5">
                <h2 className="font-display text-2xl text-[#E8D2A6]">Guide du panel</h2>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-neutral-300">
                    Tout ce qu&apos;il faut savoir pour publier un contenu et faire tourner le site au quotidien.
                    Chaque rubrique est indépendante : ouvre celle qui te concerne, ignore le reste.
                </p>
                <div className="mt-4 border-t border-[#E8D2A6]/15 pt-3">
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-neutral-500">
                        <ShieldCheck size={12} className="text-[#E8D2A6]" /> Tes autorisations
                    </div>
                    {user?.superadmin_locked ? (
                        <p className="mt-2 text-xs text-neutral-300">
                            Compte super-admin protégé : toutes les permissions, guide affiché en entier.
                        </p>
                    ) : mesPerms.length === 0 ? (
                        <p className="mt-2 text-xs text-neutral-400">Aucune permission reçue du serveur.</p>
                    ) : (
                        <div className="mt-2 flex flex-wrap gap-1.5" data-testid="guide-perms">
                            {mesPerms.map((perm) => (
                                <span key={perm} className="rounded-full border border-[#262626] bg-[#111] px-2 py-0.5 text-[11px] text-neutral-300">
                                    {LIBELLES[perm] || perm}
                                </span>
                            ))}
                        </div>
                    )}
                    {masquees > 0 && (
                        <p className="mt-2.5 text-xs text-neutral-500">
                            {masquees} rubrique{masquees > 1 ? "s" : ""} {masquees > 1 ? "sont masquées" : "est masquée"} : {masquees > 1 ? "elles concernent" : "elle concerne"} des sections auxquelles tu n&apos;as pas accès.
                        </p>
                    )}
                </div>
            </div>

            <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500" />
                <Input
                    value={recherche}
                    onChange={(e) => setRecherche(e.target.value)}
                    placeholder="Chercher une rubrique (épisode, tarif, permission…)"
                    data-testid="guide-search"
                    className="border-[#262626] bg-[#111] pl-9 text-white"
                />
            </div>

            {visibles.length === 0 ? (
                <div className="rounded-xl border border-[#262626] bg-[#0a0a0a] p-8 text-center text-sm text-neutral-500">
                    {terme ? <>Aucune rubrique ne correspond à « {recherche} ».</> : "Aucune rubrique disponible avec tes autorisations actuelles."}
                </div>
            ) : (
                <Accordion type="single" collapsible defaultValue={visibles[0].id} className="space-y-3">
                    {visibles.map((rubrique) => {
                        const Icone = rubrique.icone;
                        return (
                            <AccordionItem
                                key={rubrique.id}
                                value={rubrique.id}
                                className="overflow-hidden rounded-xl border border-[#262626] bg-[#0a0a0a] px-5"
                            >
                                <AccordionTrigger className="gap-3 py-4 text-left hover:no-underline">
                                    <Icone size={16} className="shrink-0 text-[#E8D2A6]" />
                                    <span className="flex-1 font-display text-lg text-white">{rubrique.titre}</span>
                                </AccordionTrigger>
                                <AccordionContent className="pb-6 pt-1 text-sm leading-relaxed text-neutral-400">
                                    <div className="space-y-4 border-t border-[#1a1a1a] pt-5">{rubrique.contenu(peut)}</div>
                                </AccordionContent>
                            </AccordionItem>
                        );
                    })}
                </Accordion>
            )}
        </div>
    );
}
