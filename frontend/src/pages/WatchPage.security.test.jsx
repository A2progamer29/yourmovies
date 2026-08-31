import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { MemoryRouter, Routes, Route } = require("react-router-dom");
const { api } = require("@/lib/api");
const { useAuth } = require("@/context/AuthContext");
const WatchPage = require("./WatchPage").default;

jest.mock("@/lib/api", () => ({ api: { get: jest.fn(), post: jest.fn() }, API: "https://api.example/api" }));
jest.mock("@/context/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("@/context/OfflineDownloadsContext", () => ({ useOfflineDownloads: () => ({ downloads: [], offlineEligible: false }) }));
jest.mock("@/components/Header", () => () => null);
jest.mock("@/components/ReportDialog", () => () => null);
jest.mock("@/components/OfflineDownloadButton", () => () => null);
jest.mock("@/components/AvertissementContenu", () => () => null);
jest.mock("@/components/SuiteAutomatique", () => () => null);
jest.mock("@/components/WatchParty", () => () => null);
jest.mock("@/components/VideoPlayer", () => (props) => <div data-testid="source">{props.manifestUrl}</div>);
jest.mock("@/components/AdGate", () => ({ onUnlock }) => <button data-testid="gate" onClick={onUnlock}>Gate</button>);
jest.mock("@/components/PreRollAd", () => ({ onDone }) => <button data-testid="preroll" onClick={onDone}>Ad</button>);
jest.mock("@/components/TurnstileGate", () => ({ onVerified }) => <button data-testid="captcha" onClick={onVerified}>Verify</button>);

let container, root;
beforeEach(() => {
    jest.clearAllMocks();
    sessionStorage.clear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockImplementation(async (url) => {
        if (url === "/media/movie1") return { data: { id: "movie1", type: "movie", title: "Public metadata", has_video: true, language_tracks: [], seasons: [] } };
        if (url.endsWith("/playback")) return { data: { manifest_url: "https://cdn.example/bcdn_token=signed/movie/playlist.m3u8" } };
        return { data: [] };
    });
    api.post.mockImplementation(async (url) => ({ data: url === "/playback/access" ? { grant: "bound-grant", gate_steps: 1 } : { ok: true } }));
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
});

async function mount(user) {
    useAuth.mockReturnValue({ user, loading: false, activeProfile: null });
    await act(async () => root.render(<MemoryRouter initialEntries={["/watch/movie1"]}><Routes><Route path="/watch/:id" element={<WatchPage />} /></Routes></MemoryRouter>));
}
async function click(id) {
    await act(async () => container.querySelector(`[data-testid="${id}"]`).click());
}

test("pending authorized source displays loading instead of a missing-stream error", async () => {
    const previous = api.get.getMockImplementation();
    let complete;
    api.get.mockImplementation((url, config) => url.endsWith("/playback")
        ? new Promise(resolve => { complete = resolve; }) : previous(url, config));
    await mount({ user_id: "premium", premium: true });
    expect(container.querySelector('[role="status"]').textContent).toContain("Chargement");
    expect(container.textContent).not.toContain("Aucun flux");
    await act(async () => complete({ data: { manifest_url: "https://cdn.example/signed.m3u8" } }));
    expect(container.querySelector('[data-testid="source"]').textContent).toContain("signed.m3u8");
});

test("anonymous playback waits for gates then obtains only the server-authorized source", async () => {
    await mount(null);
    expect(api.get.mock.calls.some(([url]) => url.endsWith("/playback"))).toBe(false);
    await click("gate");
    await click("preroll");
    expect(api.get.mock.calls.some(([url]) => url.endsWith("/playback"))).toBe(false);
    await click("captcha");
    expect(api.post).toHaveBeenCalledWith("/playback/access/complete", {}, expect.objectContaining({ headers: expect.objectContaining({ "X-Playback-Grant": "bound-grant" }) }));
    expect(container.querySelector('[data-testid="source"]').textContent).toContain("bcdn_token=signed");
});

test("signed-in free member must verify Cloudflare after the final ad", async () => {
    await mount({ user_id: "free", premium: false });
    await click("gate");
    await click("preroll");
    expect(container.querySelector('[data-testid="captcha"]')).not.toBeNull();
    expect(api.post.mock.calls.some(([url]) => url === "/playback/access/complete")).toBe(false);
    expect(api.get.mock.calls.some(([url]) => url.endsWith("/playback"))).toBe(false);
    await click("captcha");
    expect(container.querySelector('[data-testid="source"]').textContent).toContain("bcdn_token=signed");
});

test("premium member requests playback without waiting for ads", async () => {
    await mount({ user_id: "premium", premium: true });
    expect(container.querySelector('[data-testid="gate"]')).toBeNull();
    expect(container.querySelector('[data-testid="source"]').textContent).toContain("bcdn_token=signed");
    expect(api.post.mock.calls.some(([url]) => url === "/playback/access/complete")).toBe(false);
});
