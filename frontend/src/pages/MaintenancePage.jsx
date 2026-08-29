import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion, useMotionValue, useSpring } from "framer-motion";
import { PiggyBank } from "lucide-react";
import curseurFleche from "../assets/cursors/cursor_arrow.png";
import curseurMain from "../assets/cursors/cursor_hand.png";

const MotionLink = motion(Link);

const DEFAULT_MESSAGE = "Le site est en cours de rénovation. Il sera prochainement disponible.";
const TITRE = "En rénovation";
const EYEBROW = "YourMovie's";

// Bruit de grain façon vieux film : une texture SVG tramée très discrète,
// en écho à l'identité cinéma du site sans reprendre le projecteur déjà
// écarté.
const GRAIN_SVG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(%23n)"/></svg>'
    );

// Petits éclats dorés qui montent lentement dans le décor, comme de la
// sciure qui capte la lumière. Profondeur variée (flous et grands en
// arrière-plan, nets et petits au premier plan) et rythme volontairement
// irrégulier pour un rendu moins mécanique.
const ECLATS = [
    { left: "10%", size: 7, duree: 14, retard: 0, opacite: 0.28, flou: 2.5, derive: -10 },
    { left: "18%", size: 2, duree: 8.2, retard: 1.4, opacite: 0.6, flou: 0, derive: 6 },
    { left: "27%", size: 5, duree: 12.5, retard: 3.1, opacite: 0.32, flou: 1.8, derive: 8 },
    { left: "36%", size: 3, duree: 9.6, retard: 0.5, opacite: 0.55, flou: 0, derive: -5 },
    { left: "45%", size: 8, duree: 16, retard: 2.2, opacite: 0.22, flou: 3, derive: 12 },
    { left: "54%", size: 2, duree: 7.4, retard: 4.1, opacite: 0.65, flou: 0, derive: -8 },
    { left: "62%", size: 4, duree: 11, retard: 1.1, opacite: 0.4, flou: 1, derive: 5 },
    { left: "70%", size: 6, duree: 13.5, retard: 3.8, opacite: 0.3, flou: 2.2, derive: -12 },
    { left: "79%", size: 3, duree: 8.8, retard: 0.9, opacite: 0.5, flou: 0, derive: 7 },
    { left: "88%", size: 5, duree: 15, retard: 2.6, opacite: 0.26, flou: 2, derive: -6 },
];

export default function MaintenancePage({ config = {} }) {
    const discordUrl = config.discord_url || "https://discord.gg/yourmovies";
    const reduceMotion = useReducedMotion();
    const eclats = useMemo(() => ECLATS, []);
    const message = config.message || DEFAULT_MESSAGE;
    const mots = useMemo(() => message.split(" "), [message]);
    const lettresTitre = useMemo(() => TITRE.split(""), []);
    const lettresEyebrow = useMemo(() => EYEBROW.split(""), []);

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

    const delaiEyebrowFin = reduceMotion ? 0 : 0.1 + lettresEyebrow.length * 0.035;
    const delaiTitreDebut = delaiEyebrowFin + 0.15;
    const delaiTitreFin = delaiTitreDebut + lettresTitre.length * 0.045;

    const conteneur = {
        hidden: {},
        visible: { transition: { staggerChildren: reduceMotion ? 0 : 0.09, delayChildren: reduceMotion ? 0 : delaiTitreFin + 0.25 } },
    };
    const monte = {
        hidden: { opacity: 0, y: reduceMotion ? 0 : 14 },
        visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
    };

    return (
        <main
            className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050505] px-6 py-16 text-white"
            style={{ cursor: `url(${curseurFleche}) 1 0, auto` }}
            onPointerMove={suivrePointeur}
        >
            {/* Texture de fond façon plan de chantier : quadrillage fin qui
                respire très légèrement, comme un chantier vivant. */}
            <motion.div
                className="pointer-events-none absolute inset-0"
                aria-hidden="true"
                style={{
                    backgroundImage:
                        "linear-gradient(#E8D2A6 1px, transparent 1px), linear-gradient(90deg, #E8D2A6 1px, transparent 1px)",
                    backgroundSize: "42px 42px",
                    maskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 40%, transparent 90%)",
                    WebkitMaskImage: "radial-gradient(ellipse 70% 60% at 50% 45%, black 40%, transparent 90%)",
                }}
                animate={reduceMotion ? undefined : { opacity: [0.045, 0.07, 0.045], scale: [1, 1.012, 1] }}
                transition={reduceMotion ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
            />

            {/* Rayures de barrière de chantier, en bordure haute et basse, très
                atténuées. */}
            <div
                className="pointer-events-none absolute inset-x-0 top-0 h-2 opacity-[0.07]"
                aria-hidden="true"
                style={{
                    backgroundImage: "repeating-linear-gradient(45deg, #E8D2A6 0 10px, transparent 10px 20px)",
                }}
            />
            <div
                className="pointer-events-none absolute inset-x-0 bottom-0 h-2 opacity-[0.07]"
                aria-hidden="true"
                style={{
                    backgroundImage: "repeating-linear-gradient(45deg, #E8D2A6 0 10px, transparent 10px 20px)",
                }}
            />

            {/* Grain façon vieux film, discret et statique (juste une texture,
                pas une agitation qui distrairait). */}
            <div
                className="pointer-events-none absolute inset-0 opacity-[0.045] mix-blend-overlay"
                aria-hidden="true"
                style={{ backgroundImage: `url("${GRAIN_SVG}")` }}
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
                            style={{ left: e.left, width: e.size, height: e.size, filter: e.flou ? `blur(${e.flou}px)` : undefined }}
                            animate={{ y: ["0vh", "-95vh"], x: [0, e.derive], opacity: [0, e.opacite, 0] }}
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
                <p className="mt-8 text-xs uppercase tracking-[0.28em] text-[#E8D2A6]">
                    {lettresEyebrow.map((lettre, i) => (
                        <motion.span
                            key={i}
                            className="inline-block"
                            style={{ whiteSpace: lettre === " " ? "pre" : "normal" }}
                            initial={{ opacity: 0, y: reduceMotion ? 0 : 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.35, delay: reduceMotion ? 0 : 0.1 + i * 0.035, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {lettre}
                        </motion.span>
                    ))}
                </p>

                <h1 className="relative mt-3 overflow-visible font-display text-4xl tracking-tight sm:text-5xl">
                    {/* Ombre dorée qui pulse doucement derrière le titre, pour lui
                        donner du poids sans surcharger. */}
                    <motion.span
                        className="pointer-events-none absolute inset-0 -z-10 blur-2xl"
                        style={{ background: "radial-gradient(ellipse 60% 70% at 50% 50%, rgba(232,210,166,0.35), transparent 70%)" }}
                        animate={reduceMotion ? undefined : { opacity: [0.5, 0.9, 0.5], scale: [0.96, 1.04, 0.96] }}
                        transition={reduceMotion ? undefined : { duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: delaiTitreFin }}
                    />
                    {lettresTitre.map((lettre, i) => (
                        <motion.span
                            key={i}
                            className="relative inline-block"
                            style={{ whiteSpace: lettre === " " ? "pre" : "normal" }}
                            initial={{ opacity: 0, y: reduceMotion ? 0 : 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.45, delay: reduceMotion ? 0 : delaiTitreDebut + i * 0.045, ease: [0.22, 1, 0.36, 1] }}
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
                            transition={{ duration: 1.1, delay: delaiTitreFin + 0.15, ease: "easeInOut" }}
                        />
                    )}
                </h1>

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

                <motion.div variants={monte} className="mt-8 flex flex-wrap items-center justify-center gap-3">
                    <MotionLink
                        to="/cagnotte"
                        whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                        style={{ cursor: `url(${curseurMain}) 8 0, pointer` }}
                        className="inline-flex items-center gap-2 rounded-full border border-[#E8D2A6]/40 bg-transparent px-5 py-3 text-sm font-semibold text-[#E8D2A6] transition-colors hover:bg-[#E8D2A6]/10"
                        data-testid="maintenance-cagnotte-link"
                    >
                        <PiggyBank size={16} /> Soutenir le projet
                    </MotionLink>
                    <motion.a
                        href={discordUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        whileHover={reduceMotion ? undefined : { scale: 1.04 }}
                        whileTap={reduceMotion ? undefined : { scale: 0.97 }}
                        style={{ cursor: `url(${curseurMain}) 8 0, pointer` }}
                        className="inline-flex items-center gap-2 rounded-full bg-[#E8D2A6] px-5 py-3 text-sm font-semibold text-black shadow-[0_0_30px_rgba(232,210,166,0.15)] transition-colors hover:bg-[#D4BB8B]"
                        data-testid="maintenance-discord-link"
                    >
                        <svg width="16" height="16" viewBox="0 0 127.14 96.36" fill="currentColor" aria-hidden="true">
                            <path d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21a105.73,105.73,0,0,0,32.17,16.15,77.7,77.7,0,0,0,6.89-11.11,68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1,105.25,105.25,0,0,0,32.19-16.14C129.24,52.84,123.9,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,45.93,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,45.93,96.12,53,91.08,65.69,84.69,65.69Z" />
                        </svg>
                        Rejoindre le Discord
                    </motion.a>
                </motion.div>
                <motion.p variants={monte} className="mt-5 text-xs text-neutral-600">
                    Restez informé de la réouverture sur notre serveur Discord.
                </motion.p>
                <motion.div variants={monte} className="mt-10">
                    <Link
                        to="/login"
                        className="text-[11px] text-neutral-700 underline decoration-neutral-800 underline-offset-4 transition-colors hover:text-neutral-500"
                    >
                        Administrateur ? Se connecter
                    </Link>
                </motion.div>
            </motion.div>
        </main>
    );
}