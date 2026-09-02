import React, { act, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { TextEncoder, TextDecoder } from "util";
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
global.IS_REACT_ACT_ENVIRONMENT = true;

const { MemoryRouter, Link } = require("react-router-dom");
const { api } = require("@/lib/api");
const MaintenanceGate = require("./MaintenanceGate").default;
jest.mock("@/lib/api", () => ({ api: { get: jest.fn() } }));
jest.mock("@/pages/MaintenancePage", () => () => <div data-testid="maintenance">Maintenance</div>);

function ActiveApp() {
    useEffect(() => {
        ["/auth/me", "/media", "/ads"].forEach((url) => api.get(url));
    }, []);
    return <div data-testid="application"><Link to="/">Accueil</Link><Link to="/browse">Catalogue</Link></div>;
}

let root, container;
beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockResolvedValue({ data: { enabled: true, can_bypass: false } });
});
afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
async function mount(path = "/") {
    await act(async () => root.render(<MemoryRouter initialEntries={[path]}>
        <MaintenanceGate><ActiveApp /></MaintenanceGate>
    </MemoryRouter>));
}
const requests = () => api.get.mock.calls.map(([url]) => url);

test("does not fetch catalogue, account or ads before maintenance status resolves", async () => {
    let resolve;
    api.get.mockImplementation(() => new Promise((done) => { resolve = done; }));
    await mount();
    expect(container.querySelector('[data-testid="application"]')).toBeNull();
    expect(requests()).toEqual(["/maintenance"]);
    await act(async () => resolve({ data: { enabled: true, can_bypass: false } }));
    expect(container.querySelector('[data-testid="maintenance"]')).not.toBeNull();
    expect(requests()).toEqual(["/maintenance"]);
});

test("failed check stays closed and can retry without starting background requests", async () => {
    api.get.mockRejectedValueOnce(new Error("unavailable"));
    await mount();
    expect(container.textContent).toContain("momentanément indisponible");
    expect(container.querySelector('[data-testid="application"]')).toBeNull();
    await act(async () => container.querySelector("button").click());
    expect(container.querySelector('[data-testid="maintenance"]')).not.toBeNull();
    expect(requests()).toEqual(["/maintenance", "/maintenance"]);
});

test.each([{ enabled: false }, { enabled: true, can_bypass: true }])(
    "opens the app when the server permits it: %j", async (config) => {
        api.get.mockResolvedValue({ data: config });
        await mount();
        expect(container.querySelector('[data-testid="application"]')).not.toBeNull();
        expect(requests()).toEqual(["/maintenance", "/auth/me", "/media", "/ads"]);
        await act(async () => container.querySelector('a[href="/browse"]').click());
        // Already-authorized providers stay mounted across navigation.
        expect(requests().filter((url) => url === "/auth/me")).toHaveLength(1);
    }
);

test.each(["/login", "/admin/media/new", "/cagnotte", "/don"])(
    "preserves explicitly accessible route %s during maintenance", async (path) => {
        await mount(path);
        expect(container.querySelector('[data-testid="application"]')).not.toBeNull();
    }
);

test("an exempt-route prefix is not a maintenance bypass", async () => {
    await mount("/admin-unrelated");
    expect(requests()).toEqual(["/maintenance"]);
    expect(container.querySelector('[data-testid="maintenance"]')).not.toBeNull();
});

test("returning from login rechecks the server with the new session", async () => {
    await mount("/login");
    api.get.mockResolvedValue({ data: { enabled: true, can_bypass: true } });
    await act(async () => container.querySelector('a[href="/"]').click());
    expect(requests().filter((url) => url === "/maintenance")).toHaveLength(2);
    expect(container.querySelector('[data-testid="application"]')).not.toBeNull();
});

test("offline downloads do not depend on the maintenance endpoint", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    await mount("/offline/saved-video");
    expect(requests()).not.toContain("/maintenance");
    expect(container.querySelector('[data-testid="application"]')).not.toBeNull();
});
