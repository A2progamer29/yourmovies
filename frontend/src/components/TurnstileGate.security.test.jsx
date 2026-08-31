import React, { act } from "react";
import { createRoot } from "react-dom/client";
import TurnstileGate from "./TurnstileGate";
import { api } from "@/lib/api";
import { lirePass } from "@/lib/playbackPass";

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("@/lib/api", () => ({ api: { get: jest.fn(), post: jest.fn() } }));
jest.mock("@/lib/playbackPass", () => ({ lirePass: jest.fn(), ecrirePass: jest.fn() }));
let container, root, verified, options;
const access = { grant: "current-grant" };
beforeEach(() => {
    jest.clearAllMocks(); container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    verified = jest.fn(); lirePass.mockReturnValue("old-pass");
    api.get.mockResolvedValue({ data: { required: true, site_key: "test-site-key" } });
    api.post.mockResolvedValue({ data: { ok: true, pass: "new-pass" } });
    window.turnstile = { render: jest.fn((_node, params) => { options = params; return "widget-1"; }), remove: jest.fn() };
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); delete window.turnstile; });
const mount = callback => act(async () => root.render(<TurnstileGate access={access} onVerified={callback || verified} />));

test("a cached session pass never skips the fresh grant-bound challenge", async () => {
    await mount();
    expect(verified).not.toHaveBeenCalled();
    expect(window.turnstile.render).toHaveBeenCalledTimes(1);
    await act(async () => options.callback("cloudflare-response"));
    expect(api.post).toHaveBeenCalledWith("/playback/verify", { token: "cloudflare-response" }, expect.objectContaining({ headers: { "X-Playback-Grant": "current-grant" } }));
    expect(verified).toHaveBeenCalledTimes(1);
});

test("parent rerenders keep the widget and use the latest callback", async () => {
    await mount(); const latest = jest.fn(); await mount(latest);
    expect(window.turnstile.render).toHaveBeenCalledTimes(1);
    await act(async () => options.callback("response"));
    expect(latest).toHaveBeenCalledTimes(1); expect(verified).not.toHaveBeenCalled();
});

test("server rejection stays blocked and retry replaces the widget", async () => {
    api.post.mockRejectedValueOnce({ response: { data: { detail: "Vérification refusée" } } });
    await mount(); await act(async () => options.callback("invalid-response"));
    expect(verified).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]').textContent).toContain("Vérification refusée");
    await act(async () => container.querySelector('[data-testid="turnstile-retry"]').click());
    expect(window.turnstile.remove).toHaveBeenCalledWith("widget-1");
    expect(window.turnstile.render).toHaveBeenCalledTimes(2);
});

test("missing configuration does not unlock playback", async () => {
    api.get.mockResolvedValue({ data: { required: true, site_key: "" } });
    await mount(); expect(verified).not.toHaveBeenCalled(); expect(window.turnstile.render).not.toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
});
