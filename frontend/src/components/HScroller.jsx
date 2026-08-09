import React, { useRef, useEffect, useCallback, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function HScroller({ children, testId, itemClassName }) {
    const ref = useRef(null);
    const settleTimer = useRef(null);
    const [canGoLeft, setCanGoLeft] = useState(false);
    const [canGoRight, setCanGoRight] = useState(false);

    const syncArrows = useCallback(() => {
        const el = ref.current;
        if (!el) return;
        const max = Math.max(0, el.scrollWidth - el.clientWidth);
        setCanGoLeft(el.scrollLeft > 2);
        setCanGoRight(el.scrollLeft < max - 2);
    }, []);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        syncArrows();
        const observer = new ResizeObserver(syncArrows);
        observer.observe(el);
        Array.from(el.children).forEach((child) => observer.observe(child));
        el.addEventListener("scroll", syncArrows, { passive: true });
        window.addEventListener("resize", syncArrows);
        return () => {
            observer.disconnect();
            el.removeEventListener("scroll", syncArrows);
            window.removeEventListener("resize", syncArrows);
            if (settleTimer.current) clearTimeout(settleTimer.current);
        };
    }, [children, syncArrows]);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onWheel = (e) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            const max = Math.max(0, el.scrollWidth - el.clientWidth);
            if ((e.deltaY < 0 && el.scrollLeft <= 2) || (e.deltaY > 0 && el.scrollLeft >= max - 2)) return;
            e.preventDefault();
            el.scrollBy({ left: e.deltaY, behavior: "auto" });
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    const by = (dir) => {
        const el = ref.current;
        if (!el || (dir < 0 && !canGoLeft) || (dir > 0 && !canGoRight)) return;
        const target = Math.max(0, Math.min(
            el.scrollWidth - el.clientWidth,
            el.scrollLeft + dir * Math.max(280, el.clientWidth * 0.82)
        ));
        el.scrollTo({ left: target, behavior: "smooth" });
        if (settleTimer.current) clearTimeout(settleTimer.current);
        settleTimer.current = setTimeout(syncArrows, 450);
    };

    const arrowClass = "hidden md:flex absolute top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full backdrop-blur border items-center justify-center transition-[opacity,background-color,border-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E8D2A6]";

    return (
        <div className="relative group/scroller">
            <button
                type="button"
                onClick={() => by(-1)}
                disabled={!canGoLeft}
                aria-label="Précédent"
                aria-hidden={!canGoLeft}
                className={`${arrowClass} -left-3 ${canGoLeft ? "bg-black/70 border-white/15 text-white/90 opacity-0 group-hover/scroller:opacity-100 hover:bg-black hover:border-[#E8D2A6]/50 hover:scale-105 active:scale-95" : "opacity-0 pointer-events-none"}`}
            >
                <ChevronLeft size={20} />
            </button>
            <button
                type="button"
                onClick={() => by(1)}
                disabled={!canGoRight}
                aria-label="Suivant"
                aria-hidden={!canGoRight}
                className={`${arrowClass} -right-3 ${canGoRight ? "bg-black/70 border-white/15 text-white/90 opacity-0 group-hover/scroller:opacity-100 hover:bg-black hover:border-[#E8D2A6]/50 hover:scale-105 active:scale-95" : "opacity-0 pointer-events-none"}`}
            >
                <ChevronRight size={20} />
            </button>
            <div
                ref={ref}
                data-testid={testId}
                className={itemClassName || "flex gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory scroll-smooth pb-2 -mx-6 px-6"}
            >
                {children}
            </div>
        </div>
    );
}
