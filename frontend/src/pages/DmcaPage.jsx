import React from "react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";

function Section({ title, children }) {
    return (
        <section>
            <h2 className="font-display text-xl text-white mt-8 mb-2">{title}</h2>
            <div className="text-neutral-300 leading-relaxed space-y-3">{children}</div>
        </section>
    );
}

export default function DmcaPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white flex flex-col">
            <div className="noise-overlay" />
            <Header />
            <main className="max-w-3xl mx-auto px-6 py-12 flex-1">
                <div className="text-xs uppercase tracking-widest text-[#E8D2A6] mb-2">Droits d&apos;auteur</div>
                <h1 className="font-display text-4xl sm:text-5xl tracking-tighter mb-3">DMCA et demandes de retrait</h1>
                <p className="text-sm text-neutral-500 mb-6">
                    YourMovie&apos;s respecte les droits de propriété intellectuelle et examine toute demande suffisamment précise concernant un contenu accessible sur la plateforme.
                </p>

                <Section title="Nature du service">
                    <p>
                        YourMovie&apos;s donne accès à des contenus audiovisuels au moyen d&apos;une infrastructure technique pouvant faire appel à des prestataires externes.
                        Lorsque cela est nécessaire, YourMovie&apos;s peut désactiver l&apos;accès à un contenu depuis sa plateforme et demander ou procéder à son retrait.
                    </p>
                </Section>

                <Section title="Signaler un contenu">
                    <p>Si vous êtes titulaire de droits ou son représentant autorisé et estimez qu&apos;un contenu porte atteinte à vos droits, envoyez une demande comprenant :</p>
                    <ol className="list-decimal pl-5 space-y-2">
                        <li>votre nom, votre qualité et une adresse e-mail de contact ;</li>
                        <li>l&apos;identification précise de l&apos;œuvre protégée ;</li>
                        <li>l&apos;URL exacte de la page concernée sur YourMovie&apos;s ;</li>
                        <li>un justificatif de vos droits ou de votre mandat de représentation ;</li>
                        <li>une explication indiquant pourquoi l&apos;utilisation contestée n&apos;est pas autorisée ;</li>
                        <li>une déclaration de bonne foi confirmant l&apos;exactitude des informations transmises ;</li>
                        <li>votre signature physique ou électronique.</li>
                    </ol>
                </Section>

                <Section title="Traitement de la demande">
                    <p>
                        Une demande complète sera examinée dans les meilleurs délais. YourMovie&apos;s pourra demander des informations complémentaires,
                        désactiver temporairement l&apos;accès pendant l&apos;examen ou retirer définitivement le contenu lorsque la demande est fondée.
                    </p>
                    <p>
                        Les demandes frauduleuses, manifestement infondées ou incomplètes peuvent être rejetées.
                    </p>
                </Section>

                <Section title="Licences et autorisations">
                    <p>
                        Vous détenez les droits d&apos;un film, d&apos;une série, d&apos;un anime ou d&apos;un autre contenu et souhaitez autoriser sa diffusion sur YourMovie&apos;s ?
                        Contactez-nous afin de discuter d&apos;une licence, d&apos;une autorisation ou d&apos;un partenariat.
                    </p>
                </Section>

                <Section title="Contact">
                    <p>
                        Pour une demande de retrait ou une proposition concernant des droits de diffusion, écrivez à{" "}
                        <a href="mailto:yourmovies@proton.me" className="text-[#E8D2A6] hover:underline">yourmovies@proton.me</a>.
                    </p>
                    <p className="text-neutral-500 text-sm">
                        Objet conseillé : « Demande de retrait — Droits d&apos;auteur » ou « Proposition de licence ».
                    </p>
                </Section>
            </main>
            <Footer />
        </div>
    );
}
