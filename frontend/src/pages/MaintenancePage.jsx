import React, { useMemo } from "react";
import { motion, useReducedMotion, useMotionValue, useSpring } from "framer-motion";
import { ExternalLink } from "lucide-react";

const DEFAULT_MESSAGE = "Le site est en cours de rénovation. Il sera prochainement disponible.";
const TITRE = "En rénovation";

// Petits éclats dorés qui montent lentement dans le décor, comme de la
// sciure qui capte la lumière — écho discret au marteau et au chantier,
// sans reprendre l'imagerie cinéma habituelle du site. Intensité variée
// pour un rendu moins mécanique.
const ECLATS = [
    { left: "12%", size: 3, duree: 9, retard: 0, opacite: 0.7 },
    { left: "22%", size: 2, duree: 11, retard: 1.4, opacite: 0.4 },
    { left: "34%", size: 4, duree: 8.5, retard: 2.8, opacite: 0.55 },
    { left: "48%", size: 2, duree: 12, retard: 0.6, opacite: 0.35 },
    { left: "58%", size: 3, duree: 9.5, retard: 3.6, opacite: 0.65 },
    { left: "68%", size: 2, duree: 10.5, retard: 1.9, opacite: 0.45 },
    { left: "78%", size: 4, duree: 8, retard: 4.4, opacite: 0.75 },
    { left: "88%", size: 2, duree: 11.5, retard: 2.2, opacite: 0.4 },
];

export default function MaintenancePage({ config = {} }) {
    const discordUrl = config.discord_url || "https://discord.gg/yourmovies";
    const reduceMotion = useReducedMotion();
    const eclats = useMemo(() => ECLATS, []);
    const message = config.message || DEFAULT_MESSAGE;
    const mots = useMemo(() => message.split(" "), [message]);
    const lettres = useMemo(() => TITRE.split(""), []);

    // Parallax très discret des éclats dorés : ils suivent légèrement la
    // souris, comme s'ils flottaient dans l'air plutôt que d'être plaqués
    // au décor.
    const pointerX = useMotionValue(0);
    const pointerY = useMotionValue(0);
    const parallaxX = useSpring(pointerX, { stiffness: 40, damping: 14 });
    const parallaxY = useSpring(pointerY, { stiffness: 40, damping: 14 });
    const suivrePointeur = (event) => {
        if (reduceMotion) return;
        const { innerWidth, innerHeight } = window;
        pointerX.set(((event.clientX / innerWidth) - 0.5) * 24);
        pointerY.set(((event.clientY / innerHeight) - 0.5) * 24);
    };

    const conteneur = {
        hidden: {},
        visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.09, delayChildren: reduceMotion ? 0 : 0.05 } },
    };
    const monte = {
        hidden: { opacity: 0, y: reduceMotion ? 0 : 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
    };

    return (
        <main
            className="ym-maintenance-cursor relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-6 py-16 text-white"
            onPointerMove={suivrePointeur}
        >
            {/* Texture de fond façon plan de chantier : quadrillage fin, en
                clin d'œil à la "rénovation" plutôt qu'au thème cinéma. */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.05]"
                aria-hidden="true"
                style={{
                    backgroundImage:
                        "linear-gradient(#E8D2A6 1px, transparent 1px), linear-gradient(90deg, #E8D2A6 1px, transparent 1px)",
                    backgroundSize: "42px 42px",
                    maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 40%, transparent 90%)",
                    WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 40%, transparent 90%)",
                }}
            />

            {!reduceMotion && (
                <motion.div
                    className="pointer-events-none absolute inset-0 overflow-hidden"
                    aria-hidden="true"
                    style={{ x: parallaxX, y: parallaxY }}
                >
                    {eclats.map((e, i) => (
                        <motion.span
                            key={i}
                            className="absolute bottom-0 rounded-full bg-[#E8D2A6]"
                            style={{ left: e.left, width: e.size, height: e.size }}
                            animate={{ y: ["0vh", "-95vh"], opacity: [0, e.opacite, 0] }}
                            transition={{ duration: e.duree, delay: e.retard, repeat: Infinity, ease: "linear" }}
                        />
                    ))}
                </motion.div>
            )}

            <motion.div
                className="relative w-full max-w-xl text-center"
                variants={conteneur}
                initial="hidden"
                animate="visible"
            >
                <motion.p variants={monte} className="mt-8 text-xs uppercase tracking-[0.28em] text-[#E8D2A6]">
                    YourMovie&apos;s
                </motion.p>

                <motion.h1
                    variants={monte}
                    className="relative mt-3 overflow-hidden font-display text-4xl tracking-tight sm:text-5xl"
                >
                    {lettres.map((lettre, i) => (
                        <motion.span
                            key={i}
                            className="inline-block"
                            style={{ whiteSpace: lettre === " " ? "pre" : "normal" }}
                            variants={{
                                hidden: { opacity: 0, y: reduceMotion ? 0 : 16 },
                                visible: {
                                    opacity: 1,
                                    y: 0,
                                    transition: { duration: 0.45, delay: reduceMotion ? 0 : 0.4 + i * 0.045, ease: [0.22, 1, 0.36, 1] },
                                },
                            }}
                        >
                            {lettre}
                        </motion.span>
                    ))}
                    {/* Surlignage doré qui balaie le titre une fois, à l'arrivée. */}
                    {!reduceMotion && (
                        <motion.span
                            className="pointer-events-none absolute inset-y-0 left-0 w-1/3"
                            style={{
                                background: "linear-gradient(100deg, transparent, rgba(232,210,166,0.65), transparent)",
                                mixBlendMode: "overlay",
                            }}
                            initial={{ x: "-120%" }}
                            animate={{ x: "320%" }}
                            transition={{ duration: 1.1, delay: 0.4 + lettres.length * 0.045 + 0.15, ease: "easeInOut" }}
                        />
                    )}
                </motion.h1>

                <motion.p
                    variants={{
                        hidden: {},
                        visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.05, delayChildren: reduceMotion ? 0 : 0.05 } },
                    }}
                    className="mx-auto mt-5 flex max-w-lg flex-wrap justify-center gap-x-[0.35em] text-base leading-relaxed text-neutral-400"
                >
                    {mots.map((mot, i) => (
                        <motion.span
                            key={i}
                            variants={{
                                hidden: { opacity: 0, y: reduceMotion ? 0 : 10, filter: reduceMotion ? "none" : "blur(4px)" },
                                visible: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } },
                            }}
                        >
                            {mot}
                        </motion.span>
                    ))}
                </motion.p>

                <motion.a
                    variants={monte}
                    href={discordUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                    whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                    className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#E8D2A6] px-5 py-3 text-sm font-semibold text-black shadow-[0_0_30px_rgba(232,210,166,0.15)] transition-colors hover:bg-[#D4BB8B]"
                    data-testid="maintenance-discord-link"
                >
                    Rejoindre le Discord <ExternalLink size={15} />
                </motion.a>
                <motion.p variants={monte} className="mt-5 text-xs text-neutral-600">
                    Restez informé de la réouverture sur notre serveur Discord.
                </motion.p>
            </motion.div>
        </main>
    );
}