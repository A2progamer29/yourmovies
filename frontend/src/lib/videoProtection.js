// UI safeguards only. Authorization and expiring sources are enforced by the API.
export const videoProtection = {
    controls: false,
    controlsList: "nodownload noremoteplayback",
    disableRemotePlayback: true,
    disablePictureInPicture: true,
    draggable: false,
    onContextMenu: (event) => event.preventDefault(),
    onDragStart: (event) => event.preventDefault(),
};

export function videoCrossOrigin(source, apiBase) {
    if (!source) return undefined;
    try {
        const url = new URL(source, window.location.origin);
        const api = new URL(apiBase, window.location.origin);
        // Only the authenticated relay receives cookies; never send them to a CDN.
        if (url.origin === api.origin && url.pathname === `${api.pathname.replace(/\/$/, "")}/uqflex/stream`) return "use-credentials";
    } catch { /* Invalid sources are reported by the player's error state. */ }
    return undefined;
}
