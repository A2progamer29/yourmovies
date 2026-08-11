import { useEffect } from "react";
import { api } from "@/lib/api";

const SESSION_KEY = "ym_visit_sent";
const VISITOR_KEY = "ym_visitor";

/**
 * Compte une visite par session. Aucun identifiant n'est envoyé au serveur :
 * seul un booléen « nouveau visiteur » distingue les visites uniques.
 */
export default function VisitTracker() {
    useEffect(() => {
        let alreadySent = false;
        let isNew = false;
        try {
            alreadySent = !!sessionStorage.getItem(SESSION_KEY);
            isNew = !localStorage.getItem(VISITOR_KEY);
        } catch { }
        if (alreadySent) return undefined;

        const timer = setTimeout(() => {
            api.post("/site/ping", { new_visitor: isNew }, { silent: true })
                .then(() => {
                    try {
                        sessionStorage.setItem(SESSION_KEY, "1");
                        if (isNew) localStorage.setItem(VISITOR_KEY, "1");
                    } catch { }
                })
                .catch(() => { });
        }, 1500); // laisse la page s'afficher avant tout appel secondaire

        return () => clearTimeout(timer);
    }, []);

    return null;
}
