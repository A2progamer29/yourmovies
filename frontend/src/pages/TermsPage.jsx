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

export default function TermsPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            <div className="noise-overlay" />
            <Header />
            <div className="max-w-3xl mx-auto px-6 py-12 flex-1">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2">Légal</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-3">Conditions d&apos;utilisation</h1>
                <p className="text-sm text-neutral-500 mb-6">En utilisant YourMovie&apos;s, vous acceptez les conditions ci-dessous.</p>

                <Section title="1. Le service">
                    <p>YourMovie&apos;s est une plateforme communautaire proposant un catalogue de films, séries et animes ainsi que des fonctionnalités sociales (avis, messagerie, watch party, Wishboard, monnaie Freemium, profils).</p>
                </Section>

                <Section title="2. Hébergement et sources des contenus">
                    <p>YourMovie&apos;s <span className="text-white">n&apos;héberge aucun fichier vidéo</span> sur ses propres serveurs. Les contenus sont fournis par des <span className="text-white">sources tierces externes</span>.</p>
                    <p>Pour des raisons de <span className="text-white">sécurité</span> et de protection de l&apos;infrastructure, les détails techniques relatifs à ces sources ne sont pas communiqués publiquement.</p>
                    <p>YourMovie&apos;s ne peut être tenu responsable des contenus mis à disposition par des tiers. Toute réclamation d&apos;un ayant droit peut être adressée via notre Discord ; les demandes légitimes seront traitées dans les meilleurs délais.</p>
                </Section>

                <Section title="3. Compte utilisateur">
                    <p>Un compte est nécessaire pour certaines fonctionnalités. Le <span className="text-white">pseudo doit être unique</span> et l&apos;adresse email ne peut être utilisée qu&apos;une seule fois. Les comptes en double (même email ou même pseudo) sont supprimés automatiquement.</p>
                    <p>Vous êtes responsable de la confidentialité de vos identifiants et de l&apos;activité sur votre compte.</p>
                </Section>

                <Section title="4. Règles de conduite">
                    <p>Sont interdits : le harcèlement, les propos haineux, le spam, l&apos;usurpation d&apos;identité et toute tentative de nuire au service ou à ses utilisateurs. Un compte ne respectant pas ces règles peut être <span className="text-white">bloqué</span>, puis supprimé automatiquement au bout de 15 jours s&apos;il reste bloqué.</p>
                </Section>

                <Section title="5. Premium & Freemium">
                    <p>Des offres Premium et une monnaie virtuelle « Freemium » sont proposées. Le Freemium n&apos;a aucune valeur monétaire réelle et ne peut être ni revendu ni échangé contre de l&apos;argent. Les paiements des offres Premium se font via notre serveur Discord (salon #ticket) : carte bancaire, PayPal, Paysafecard, etc.</p>
                </Section>

                <Section title="6. Modifications">
                    <p>Ces conditions peuvent évoluer. Les changements importants sont annoncés sur le Discord et via les notifications du site.</p>
                </Section>
            </div>
            <Footer />
        </div>
    );
}
