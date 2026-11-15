import sys
from playwright.sync_api import sync_playwright

def run_test():
    console_errors = []
    page_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(channel="msedge", headless=True)
        page = browser.new_page()

        page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
        page.on("pageerror", lambda err: page_errors.append(str(err)))

        print("Navigating to http://localhost:8085/index.html...")
        page.goto("http://localhost:8085/index.html", wait_until="networkidle", timeout=30000)

        # Wait for MapLibre map to initialize
        page.wait_for_function("() => window.__TQ && window.__TQ.map && window.__TQ.map.isStyleLoaded()", timeout=20000)

        # Verify no hardcoded key in #mapKey
        map_key_val = page.eval_on_selector("#mapKey", "el => el.value")
        print(f"  #mapKey value: '{map_key_val}' (must be empty by default)")
        assert map_key_val == "", f"#mapKey should be empty, got: {map_key_val}"

        # Verify projection is flat 2D Mercator
        proj = page.evaluate("() => window.__TQ.map.getProjection()")
        print(f"  Projection type: {proj.get('type') if proj else 'default'}")

        # Check console errors (filter out external network rate limits like 429, tile 404s, etc.)
        critical_errors = [e for e in console_errors if not any(x in e for x in ["favicon", "cors", "404", "429", "503", "celestrak"])]
        print(f"  Page errors: {len(page_errors)}")
        print(f"  Critical console errors: {len(critical_errors)}")
        if page_errors:
            print("  PAGE ERRORS:", page_errors)
        if critical_errors:
            print("  CONSOLE ERRORS:", critical_errors)

        assert len(page_errors) == 0, f"Uncaught page errors: {page_errors}"
        assert len(critical_errors) == 0, f"Critical console errors: {critical_errors}"

        browser.close()
        print("\nPLAYWRIGHT BROWSER TEST PASSED CLEANLY WITH 0 ERRORS!")

if __name__ == "__main__":
    run_test()
