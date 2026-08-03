"""
Focused Playwright verification for the reported error-message bug (iteration 5).

This records the exact UI scenarios exercised by the testing agent:
- anonymous homepage must not show silent 401 toasts
- wrong login password shows enriched 401 toast
- duplicate registration shows enriched 400 toast
- logged-in pricing checkout with invalid lookup_key shows enriched 400 toast
- admin /admin?tab=users renders without runtime overlay
- admin edit of missing media shows enriched 404 toast and no showError ReferenceError overlay

The MCP browser automation tool executed the same steps inline because the
container does not have the Python Playwright package installed.
"""

BASE_URL = "https://stream-portal-182.preview.emergentagent.com"

ADMIN_EMAIL = "admin@yourmovies.app"
ADMIN_PASSWORD = "Admin123!"


async def collect_toasts(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-sonner-toast], [role="status"], [aria-live]'))
            .map(el => (el.innerText || el.textContent || '').trim())
            .filter(Boolean)"""
    )


async def has_runtime_overlay(page):
    text = await page.evaluate("() => document.body.innerText || ''")
    lowered = text.lower()
    return "showerror is not defined" in lowered or "referenceerror" in lowered


async def run_verification(page):
    page_errors = []
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))

    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.context.clear_cookies()
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear()")
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_timeout(2500)
    home_toasts = await collect_toasts(page)
    assert not any("Erreur 401" in t or "Not authenticated" in t for t in home_toasts), home_toasts

    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="login-email"]')
    await page.fill('[data-testid="login-email"]', ADMIN_EMAIL)
    await page.fill('[data-testid="login-password"]', "wrong-password")
    await page.click('[data-testid="submit-login-btn"]', force=True)
    await page.wait_for_timeout(2500)
    login_text = " | ".join(await collect_toasts(page))
    assert "Erreur 401 · Invalid credentials" in login_text, login_text
    assert "Une erreur est survenue" not in login_text, login_text

    await page.click('[data-testid="tab-register"]', force=True)
    await page.wait_for_timeout(300)
    await page.fill('[data-testid="register-name"]', "Duplicate Admin")
    await page.fill('[data-testid="register-email"]', ADMIN_EMAIL)
    await page.fill('[data-testid="register-password"]', "AnyPass123!")
    await page.click('[data-testid="submit-register-btn"]', force=True)
    await page.wait_for_timeout(2500)
    register_text = " | ".join(await collect_toasts(page))
    assert "Erreur 400 · Email already registered" in register_text, register_text
    assert "Une erreur est survenue" not in register_text, register_text

    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="login-email"]')
    await page.fill('[data-testid="login-email"]', ADMIN_EMAIL)
    await page.fill('[data-testid="login-password"]', ADMIN_PASSWORD)
    await page.click('[data-testid="submit-login-btn"]', force=True)
    await page.wait_for_timeout(2500)
    token = await page.evaluate("localStorage.getItem('ym_token')")
    assert token, "admin login did not persist JWT"

    async def handle_plans(route):
        response = await route.fetch()
        data = await response.json()
        for plan in data:
            for interval in list((plan.get("prices") or {}).keys()):
                plan["prices"][interval]["lookup_key"] = "ym_nonexistent_plan_iteration5"
        await route.fulfill(status=200, content_type="application/json", json=data)

    await page.route("**/api/plans", handle_plans)
    await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="subscribe-basic"]')
    await page.click('[data-testid="subscribe-basic"]', force=True)
    await page.wait_for_timeout(3500)
    pricing_text = " | ".join(await collect_toasts(page))
    assert "Erreur 400 · Price not found" in pricing_text, pricing_text
    assert "Une erreur est survenue" not in pricing_text, pricing_text

    await page.goto(f"{BASE_URL}/admin?tab=users", wait_until="domcontentloaded")
    await page.wait_for_timeout(3500)
    body_text = await page.evaluate("() => document.body.innerText || ''")
    assert "Panneau de gestion" in body_text and "Utilisateurs" in body_text, body_text[:500]
    assert not await has_runtime_overlay(page), body_text[:500]

    await page.goto(f"{BASE_URL}/admin/media/does-not-exist/edit", wait_until="domcontentloaded")
    await page.wait_for_timeout(3500)
    missing_text = " | ".join(await collect_toasts(page))
    body_text = await page.evaluate("() => document.body.innerText || ''")
    assert "Erreur 404 · Not found" in missing_text, missing_text
    assert "Une erreur est survenue" not in missing_text, missing_text
    assert not await has_runtime_overlay(page), body_text[:500]
    assert not any("showError is not defined" in err for err in page_errors), page_errors

    return {
        "home_toasts": home_toasts,
        "login_toasts": login_text,
        "register_toasts": register_text,
        "pricing_toasts": pricing_text,
        "admin_users_rendered": True,
        "missing_media_toasts": missing_text,
        "page_errors": page_errors,
    }