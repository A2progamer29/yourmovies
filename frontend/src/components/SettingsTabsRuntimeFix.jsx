import { useEffect } from "react";
import { useLocation } from "react-router-dom";

const MOBILE_BREAKPOINT = 768;

export default function SettingsTabsRuntimeFix() {
    const location = useLocation();

    useEffect(() => {
        if (location.pathname !== "/settings") return undefined;

        let cleanupListeners = () => {};

        const applyFix = () => {
            cleanupListeners();

            const tabs = document.querySelector('[data-testid="settings-tabs-scroll"]');
            if (!tabs) return;

            // Le badge Premium ne doit pas apparaître dans l'onglet Téléchargements.
            const downloadsTab = tabs.querySelector('[data-settings-tab="downloads"]');
            if (downloadsTab) {
                Array.from(downloadsTab.children).forEach((child) => {
                    if (child.tagName === "SPAN") child.remove();
                });
            }

            // Neutralise les animations concurrentes qui rendaient le scroll irrégulier.
            tabs.style.scrollBehavior = "auto";
            tabs.style.scrollSnapType = "none";

            const previous = document.querySelector('button[aria-label="Rubriques précédentes"]');
            const next = document.querySelector('button[aria-label="Rubriques suivantes"]');

            const updateResponsiveState = () => {
                const mobile = window.innerWidth < MOBILE_BREAKPOINT;
                [previous, next].forEach((button) => {
                    if (!button) return;
                    button.style.display = mobile ? "none" : "flex";
                });
                tabs.style.paddingLeft = mobile ? "0" : "2.5rem";
                tabs.style.paddingRight = mobile ? "0" : "2.5rem";
            };

            const scrollTabs = (direction) => {
                const amount = Math.max(220, tabs.clientWidth * 0.7);
                tabs.scrollTo({
                    left: Math.max(0, Math.min(tabs.scrollWidth - tabs.clientWidth, tabs.scrollLeft + direction * amount)),
                    behavior: "auto",
                });
            };

            const onPrevious = (event) => {
                event.preventDefault();
                event.stopPropagation();
                scrollTabs(-1);
            };
            const onNext = (event) => {
                event.preventDefault();
                event.stopPropagation();
                scrollTabs(1);
            };

            previous?.addEventListener("click", onPrevious, true);
            next?.addEventListener("click", onNext, true);
            window.addEventListener("resize", updateResponsiveState);
            updateResponsiveState();

            cleanupListeners = () => {
                previous?.removeEventListener("click", onPrevious, true);
                next?.removeEventListener("click", onNext, true);
                window.removeEventListener("resize", updateResponsiveState);
            };
        };

        applyFix();

        const observer = new MutationObserver(() => applyFix());
        observer.observe(document.body, { childList: true, subtree: true });

        return () => {
            observer.disconnect();
            cleanupListeners();
        };
    }, [location.pathname]);

    return null;
}
