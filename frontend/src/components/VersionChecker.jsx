import { useEffect, useRef } from "react";

const CHECK_INTERVAL = 120000;
const BUNDLE_RE = /\/static\/js\/main\.[a-z0-9]+\.js/;

export default function VersionChecker() {
    const currentRef = useRef(null);

    useEffect(() => {
        let stopped = false;

        const loadedBundle = () => {
            const s = document.querySelector('script[src*="/static/js/main."]');
            const m = s && s.src.match(BUNDLE_RE);
            return m ? m[0] : null;
        };

        const fetchLatest = async () => {
            try {
                const res = await fetch(`/?_=${Date.now()}`, { cache: "no-store" });
                if (!res.ok) return null;
                const html = await res.text();
                const m = html.match(BUNDLE_RE);
                return m ? m[0] : null;
            } catch { return null; }
        };

        const busy = () => {
            if (window.location.pathname.startsWith("/watch/")) return true;
            const vids = document.querySelectorAll("video");
            for (const v of vids) {
                if (!v.paused && !v.ended && v.currentTime > 0) return true;
            }
            return false;
        };

        currentRef.current = loadedBundle();

        const check = async () => {
            if (stopped) return;
            const latest = await fetchLatest();
            if (stopped || !latest) return;
            if (!currentRef.current) { currentRef.current = latest; return; }
            if (latest !== currentRef.current && !busy()) {
                window.location.reload();
            }
        };

        const id = setInterval(check, CHECK_INTERVAL);
        const onVisible = () => { if (document.visibilityState === "visible") check(); };
        document.addEventListener("visibilitychange", onVisible);
        const first = setTimeout(check, 8000);

        return () => {
            stopped = true;
            clearInterval(id);
            clearTimeout(first);
            document.removeEventListener("visibilitychange", onVisible);
        };
    }, []);

    return null;
}
