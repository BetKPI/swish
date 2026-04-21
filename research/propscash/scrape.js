const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

const EMAIL = "scott.freitag91@gmail.com";
const PASSWORD = "Props123$";
const OUT = path.join(__dirname, "screenshots");

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 },
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);

  // Step 1: Login
  console.log("1. Loading props.cash...");
  await page.goto("https://props.cash", { waitUntil: "networkidle" });
  await page.waitForTimeout(5000);

  console.log("2. Clicking login...");
  await page.evaluate(() => {
    const els = document.querySelectorAll("a, button, span, div");
    for (const el of els) {
      if (el.textContent?.trim().match(/^Log\s*In$/i)) {
        el.click();
        return;
      }
    }
  });

  // Wait for redirect to Auth0
  console.log("3. Waiting for Auth0 page...");
  try {
    await page.waitForURL("**/auth0.com/**", { timeout: 15000 });
  } catch {
    console.log("   Didn't redirect to Auth0, checking current state...");
  }

  // Auth0 Universal Login can take a LONG time to render
  console.log("4. Waiting for Auth0 form to render (up to 30s)...");
  await page.waitForTimeout(10000);
  await page.screenshot({ path: path.join(OUT, "01-auth0-10s.png") });

  // Check for iframe — Auth0 sometimes renders in an iframe
  const frames = page.frames();
  console.log(`   Found ${frames.length} frames`);
  for (const frame of frames) {
    console.log(`   Frame: ${frame.url().slice(0, 80)}`);
  }

  // Try to find input in any frame
  let loginFrame = page;
  for (const frame of frames) {
    const input = await frame.$("input");
    if (input) {
      console.log(`   Found input in frame: ${frame.url().slice(0, 60)}`);
      loginFrame = frame;
      break;
    }
  }

  // Dump full HTML to understand the page
  const html = await page.content();
  fs.writeFileSync(path.join(OUT, "auth0-html.txt"), html.slice(0, 20000));

  // Wait even longer and try again
  await page.waitForTimeout(10000);
  await page.screenshot({ path: path.join(OUT, "02-auth0-20s.png") });

  // Try to find any input
  const allInputs = await loginFrame.$$("input");
  console.log(`   Inputs after 20s wait: ${allInputs.length}`);

  if (allInputs.length === 0) {
    // Try reloading the auth0 page
    console.log("   No inputs found. Trying page reload...");
    await page.reload({ waitUntil: "networkidle" });
    await page.waitForTimeout(10000);
    await page.screenshot({ path: path.join(OUT, "03-auth0-reloaded.png") });

    const inputsAfterReload = await page.$$("input");
    console.log(`   Inputs after reload: ${inputsAfterReload.length}`);
  }

  // Final attempt to fill
  try {
    // Try multiple selectors
    for (const sel of ["input[name='username']", "input[name='email']", "input[type='email']", "input#username", "input#email", "input:first-of-type"]) {
      const el = await loginFrame.$(sel);
      if (el) {
        console.log(`   Found input via: ${sel}`);
        await el.click();
        await el.fill(EMAIL);
        await page.screenshot({ path: path.join(OUT, "04-email-entered.png") });

        // Submit email
        for (const btnSel of ["button[type='submit']", "button:has-text('Continue')", "button:has-text('Log In')", "button"]) {
          const btn = await loginFrame.$(btnSel);
          if (btn) {
            const btnText = await btn.textContent();
            if (btnText?.trim()) {
              console.log(`   Clicking: ${btnText.trim()}`);
              await btn.click();
              break;
            }
          }
        }
        await page.waitForTimeout(3000);

        // Fill password
        const passEl = await loginFrame.$("input[type='password']");
        if (passEl) {
          await passEl.fill(PASSWORD);
          console.log("   Filled password");
          await page.screenshot({ path: path.join(OUT, "05-password-entered.png") });

          // Submit login
          for (const btnSel of ["button[type='submit']", "button:has-text('Continue')", "button:has-text('Log In')"]) {
            const btn = await loginFrame.$(btnSel);
            if (btn) {
              await btn.click();
              break;
            }
          }
          // Wait for redirect back to props.cash
          console.log("   Waiting for redirect...");
          await page.waitForURL("**/props.cash/**", { timeout: 20000 }).catch(() => {});
          await page.waitForTimeout(5000);
        }
        break;
      }
    }
  } catch (e) {
    console.log("   Login error:", e.message?.slice(0, 100));
  }

  console.log("   Final URL:", page.url());
  await page.screenshot({ path: path.join(OUT, "06-final-state.png") });

  // If logged in, capture all sports
  if (page.url().includes("props.cash") && !page.url().includes("auth0")) {
    console.log("\n=== LOGGED IN — capturing sports ===");

    for (const sport of ["mlb", "nba", "nhl", "nfl"]) {
      console.log(`\n--- ${sport.toUpperCase()} ---`);
      try {
        await page.goto(`https://props.cash/${sport}`, { waitUntil: "networkidle", timeout: 20000 });
        await page.waitForTimeout(5000);
        await page.screenshot({ path: path.join(OUT, `${sport}-01-list.png`), fullPage: true });

        const pageText = await page.evaluate(() => document.body?.innerText?.slice(0, 5000) || "");
        fs.writeFileSync(path.join(OUT, `${sport}-text.txt`), pageText);

        // Click first player row
        const playerLinks = await page.$$("a[href*='player'], tr[class*='cursor'], [class*='clickable'], tbody tr");
        console.log(`   Player rows: ${playerLinks.length}`);

        if (playerLinks.length > 0) {
          await playerLinks[0].click();
          await page.waitForTimeout(5000);
          await page.screenshot({ path: path.join(OUT, `${sport}-02-player.png`), fullPage: true });

          // Scroll down to see charts
          await page.evaluate(() => window.scrollBy(0, 800));
          await page.waitForTimeout(1000);
          await page.screenshot({ path: path.join(OUT, `${sport}-03-charts.png`), fullPage: true });

          // Capture chart elements specifically
          const charts = await page.$$("canvas, [class*='chart'], [class*='recharts'], svg.recharts-surface");
          console.log(`   Chart elements: ${charts.length}`);
          for (let i = 0; i < Math.min(charts.length, 4); i++) {
            try {
              await charts[i].screenshot({ path: path.join(OUT, `${sport}-chart-${i}.png`) });
            } catch {}
          }

          // Look for toggles
          const toggles = await page.evaluate(() => {
            const btns = document.querySelectorAll("button, [role='button'], [class*='tab'], [class*='toggle'], [class*='filter']");
            return Array.from(btns).map(b => b.textContent?.trim()).filter(t => t && t.length < 20);
          });
          console.log(`   Toggles/buttons: ${toggles.join(" | ")}`);
          fs.writeFileSync(path.join(OUT, `${sport}-toggles.txt`), toggles.join("\n"));

          await page.goBack();
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        console.log(`   Error: ${e.message?.slice(0, 80)}`);
      }
    }
  } else {
    console.log("\nNot logged in. Auth0 login failed.");
    console.log("You may need to log in manually first, then save cookies.");
  }

  console.log("\nDone! Closing in 5s...");
  await page.waitForTimeout(5000);
  await browser.close();
})();
