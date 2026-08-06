import React, { useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function HScroller({ children, testId, itemClassName }) {
    const ref = useRef(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onWheel = (e) => {
            if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
            const atStart = el.scrollLeft <= 0;
            const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 1;
            if ((e.deltaY < 0 && atStart) || (e.deltaY > 0 && atEnd)) return;
            e.preventDefault();
            el.scrollLeft += e.deltaY;
        };
        el.addEventListener("wheel", onWheel, { passive: false });
        return () => el.removeEventListener("wheel", onWheel);
    }, []);

    const by = (dir) => {
        const el = ref.current;
        if (el) el.scrollBy({ left: dir * Math.max(320, el.clientWidth * 0.85), behavior: "smooth" });
    };

    return (
        <div className="relative group/scroller">
            <button
                onClick={() => by(-1)}
                aria-label="Précédent"
                className="hidden md:flex absolute -left-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/60 backdrop-blur border border-white/10 items-center justify-center text-white/80 hover:text-white hover:bg-black/80 opacity-0 group-hover/scroller:opacity-100 transition-opacity"
            >
                <ChevronLeft size={20} />
            </button>
            <button
                onClick={() => by(1)}
                aria-label="Suivant"
                className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-20 w-11 h-11 rounded-full bg-black/60 backdrop-blur border border-white/10 items-center justify-center text-white/80 hover:text-white hover:bg-black/80 opacity-0 group-hover/scroller:opacity-100 transition-opacity"
            >
                <ChevronRight size={20} />
            </button>
            <div
                ref={ref}
                data-testid={testId}
                className={itemClassName || "flex gap-5 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-2 -mx-6 px-6"}
            >
                {children}
            </div>
        </div>
    );
}
