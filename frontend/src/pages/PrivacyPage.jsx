import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

function Section({ title, children }) {
    return (
        <div>
            <h2 className="font-display text-xl text-white mt-8 mb-2">{title}</h2>
            <div className="text-neutral-300 leading-relaxed space-y-2">{children}</div>
        </div>
    );
}

export default function PrivacyPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            <div className="noise-overlay" />
            <Header />
            <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2">Légal</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-3">Politique de confidentialité</h1>
                <p className="text-sm text-neutral-500 mb-6">Comment vos données sont traitées sur YourMovie&apos;s.</p>

                <Section title="1. Données collectées">
                    <p>Nous collectons uniquement ce qui est nécessaire au fonctionnement : adresse email, pseudo, photo de profil, avis et notes, favoris, progression de lecture, messages privés et préférences.</p>
                </Section>

                <Section title="2. Utilisation">
                    <p>Ces données servent à faire fonctionner votre compte et les fonctionnalités du site. Nous <span className="text-white">ne vendons pas</span> vos données et ne les partageons pas à des fins publicitaires.</p>
                </Section>

                <Section title="3. Stockage local">
                    <p>Le site utilise le stockage local de votre navigateur pour votre session (jeton de connexion) et votre profil actif. Aucune donnée sensible n&apos;est stockée en clair.</p>
                </Section>

                <Section title="4. Prestataires externes">
                    <p>Certaines fonctions reposent sur des services tiers : Google (connexion), Discord (paiements et support), et des fournisseurs pour les médias. Les contenus vidéo proviennent de <span className="text-white">sources externes</span> ; pour des raisons de sécurité, les détails de cette infrastructure ne sont pas divulgués publiquement.</p>
                </Section>

                <Section title="5. Suppression du compte">
                    <p>Vous pouvez demander la suppression de votre compte. À sa suppression, vos données associées (avis, favoris, profils, messages, notifications) sont effacées. Les comptes bloqués sont supprimés automatiquement au bout de 15 jours.</p>
                </Section>

                <Section title="6. Contact">
                    <p>Pour toute question relative à vos données, contactez-nous via le Discord (lien en bas de page).</p>
                </Section>
            </div>
            <Footer />
        </div>
    );
}
