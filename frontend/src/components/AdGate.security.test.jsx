import React, { act } from "react";
import { createRoot } from "react-dom/client";
import AdGate from "./AdGate";
import { api } from "@/lib/api";
import { loadAdsConfig } from "@/lib/ads";

global.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("@/lib/api", () => ({ api: { post: jest.fn() } }));
jest.mock("@/lib/ads", () => ({ loadAdsConfig: jest.fn(), markShown: jest.fn(), frequencyAllows: () => true, injectScript: jest.fn() }));
jest.mock("react-router-dom", () => ({ Link: ({ children }) => <span>{children}</span> }));
jest.mock("@/components/ui/dialog", () => ({
    Dialog: ({ open, children }) => open ? <div>{children}</div> : null,
    DialogContent: ({ children }) => <div>{children}</div>, DialogHeader: ({ children }) => <div>{children}</div>,
    DialogTitle: ({ children }) => <h2>{children}</h2>, DialogDescription: ({ children }) => <p>{children}</p>,
}));
let root, container, unlock;
const access = { grant: "bound-grant", gate_steps: 3, gate_seconds: 2, step_ticket: "initial-step-ticket-long-enough" };
beforeEach(() => {
    jest.useFakeTimers(); jest.clearAllMocks();
    container = document.createElement("div"); document.body.appendChild(container); root = createRoot(container);
    unlock = jest.fn(); window.open = jest.fn();
    loadAdsConfig.mockResolvedValue({ enabled: true, gate: { enabled: true, direct_link: "https://ad.example" } });
    let remaining = 3;
    api.post.mockImplementation(async (_url, body) => body.action === "start"
        ? { data: { ok: true, challenge: `challenge-${remaining}-long-enough`, wait_seconds: 2, remaining_steps: remaining } }
        : { data: { ok: true, remaining_steps: --remaining, next_step_ticket: remaining ? `next-ticket-${remaining}-long-enough` : null } });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); jest.useRealTimers(); });
const mount = () => act(async () => root.render(<AdGate access={access} onUnlock={unlock} />));
const click = () => act(async () => container.querySelector('[data-testid="gate-continue-btn"]').click());
const advance = ms => act(async () => jest.advanceTimersByTime(ms));

test("three ads include the final wait before unlocking Cloudflare", async () => {
    await mount();
    for (let i = 0; i < 3; i++) {
        await click();
        expect(unlock).not.toHaveBeenCalled();
        expect(container.querySelector('[data-testid="gate-continue-btn"]').disabled).toBe(true);
        await advance(2200);
    }
    expect(window.open).toHaveBeenCalledTimes(3);
    expect(api.post).toHaveBeenCalledTimes(6);
    expect(api.post).toHaveBeenCalledWith("/playback/access/step", expect.objectContaining({ action: "start", ticket: "initial-step-ticket-long-enough" }), expect.objectContaining({ headers: { "X-Playback-Grant": "bound-grant" } }));
    expect(unlock).toHaveBeenCalledTimes(1);
});

test("a config failure keeps playback blocked and can be retried", async () => {
    loadAdsConfig.mockRejectedValueOnce(new Error("Configuration indisponible"));
    await mount();
    expect(container.querySelector('[role="alert"]').textContent).toContain("Configuration indisponible");
    expect(unlock).not.toHaveBeenCalled();
    await act(async () => container.querySelector('button').click());
    expect(container.querySelector('[data-testid="gate-continue-btn"]')).not.toBeNull();
});

test("retrying server validation does not open a duplicate ad", async () => {
    api.post.mockRejectedValueOnce({ response: { status: 429, headers: { "retry-after": "2" } } });
    await mount(); await click(); await advance(2200); await click();
    expect(window.open).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledTimes(2);
    expect(unlock).not.toHaveBeenCalled();
});
