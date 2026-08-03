"""
Focused Playwright verification for the reported error-message bug.

Run manually inside an async Playwright context, or copy the core steps into the
MCP browser automation tool. This file records the exact scenarios exercised by
the testing agent for iteration 4.
"""

BASE_URL = "https://stream-portal-182.preview.emergentagent.com"


async def collect_toasts(page):
    return await page.evaluate(
        """() => Array.from(document.querySelectorAll('[data-sonner-toast], [role="status"], [aria-live]'))
            .map(el => (el.innerText || el.textContent || '').trim())
            .filter(Boolean)"""
    )


async def verify_core_error_toasts(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.context.clear_cookies()
    await page.goto(f"{BASE_URL}/", wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear()")
    await page.reload(wait_until="domcontentloaded")
    await page.wait_for_timeout(3000)
    home_toasts = await collect_toasts(page)
    assert not any("Erreur 401" in t or "Not authenticated" in t for t in home_toasts)

    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="login-email"]')
    await page.fill('[data-testid="login-email"]', "admin@yourmovies.app")
    await page.fill('[data-testid="login-password"]', "wrongpwd")
    await page.click('[data-testid="submit-login-btn"]', force=True)
    await page.wait_for_timeout(2500)
    login_text = " | ".join(await collect_toasts(page)).lower()
    assert "401" in login_text and "invalid credentials" in login_text
    assert login_text.strip() != "une erreur est survenue"

    await page.click('[data-testid="tab-register"]', force=True)
    await page.wait_for_timeout(300)
    await page.fill('[data-testid="register-name"]', "Duplicate Admin")
    await page.fill('[data-testid="register-email"]', "admin@yourmovies.app")
    await page.fill('[data-testid="register-password"]', "AnyPass123!")
    await page.click('[data-testid="submit-register-btn"]', force=True)
    await page.wait_for_timeout(2500)
    register_text = " | ".join(await collect_toasts(page)).lower()
    assert "400" in register_text and "email already registered" in register_text
    assert register_text.strip() != "une erreur est survenue"


async def verify_pricing_invalid_lookup_key(page):
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.context.clear_cookies()
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear()")
    await page.wait_for_selector('[data-testid="login-email"]')
    await page.fill('[data-testid="login-email"]', "admin@yourmovies.app")
    await page.fill('[data-testid="login-password"]', "Admin123!")
    await page.click('[data-testid="submit-login-btn"]', force=True)
    await page.wait_for_timeout(2500)
    assert await page.evaluate("localStorage.getItem('ym_token')")

    async def handle_plans(route):
        response = await route.fetch()
        data = await response.json()
        for plan in data:
            for interval in list((plan.get("prices") or {}).keys()):
                plan["prices"][interval]["lookup_key"] = "ym_nonexistent_plan"
        await route.fulfill(status=200, content_type="application/json", json=data)

    await page.route("**/api/plans", handle_plans)
    await page.goto(f"{BASE_URL}/pricing", wait_until="domcontentloaded")
    await page.wait_for_selector('[data-testid="subscribe-basic"]')
    await page.click('[data-testid="subscribe-basic"]', force=True)
    await page.wait_for_timeout(3500)
    pricing_text = " | ".join(await collect_toasts(page)).lower()
    assert "400" in pricing_text and "price not found" in pricing_text
    assert pricing_text.strip() != "une erreur est survenue"


async def reproduce_admin_media_form_runtime_error(page):
    """Documents the remaining defect: missing showError import on AdminMediaForm."""
    page_errors = []
    page.on("pageerror", lambda exc: page_errors.append(str(exc)))
    await page.set_viewport_size({"width": 1920, "height": 1080})
    await page.context.clear_cookies()
    await page.goto(f"{BASE_URL}/login", wait_until="domcontentloaded")
    await page.evaluate("localStorage.clear()")
    await page.wait_for_selector('[data-testid="login-email"]')
    await page.fill('[data-testid="login-email"]', "admin@yourmovies.app")
    await page.fill('[data-testid="login-password"]', "Admin123!")
    await page.click('[data-testid="submit-login-btn"]', force=True)
    await page.wait_for_timeout(2500)
    await page.goto(f"{BASE_URL}/admin/media/does-not-exist/edit", wait_until="domcontentloaded")
    await page.wait_for_timeout(3500)
    assert any("showError is not defined" in err for err in page_errors)
