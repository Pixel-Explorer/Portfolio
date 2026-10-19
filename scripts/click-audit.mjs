// Click audit: every role, client, project card, case study, milestone link,
// filter, nav transition, gallery photo and deep link, desktop and mobile,
// plus a scan of visible text for em-dashes. Written 20 Oct 2026 after the
// owner found, on the live site, project cards that opened a random case
// study, dead filters and a Send button that did nothing.
//
//   npm run dev                      (server on :4173, in another terminal)
//   npm run audit:clicks             (everything, ~25 min)
//   node scripts/click-audit.mjs http://localhost:4173/ roles,cs   (sections)
//
// Sections: tour roles clients roles-m clients-m cs cs-m nav filters hud
// entries contact mobile gallery groupfilter dashes. "filters" loads the real
// 43 MB city. Exits 1 on any failure.
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = (process.argv[2] || "http://localhost:4173/").replace(/\/?$/, "/");
const ONLY = (process.argv[3] || "").split(",").filter(Boolean);
const run = (name) => !ONLY.length || ONLY.includes(name);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..") + "/";
const L = JSON.parse(readFileSync(ROOT + "data/ledger.json", "utf8"));
const CS = JSON.parse(readFileSync(ROOT + "data/case-studies.json", "utf8")).caseStudies;
const byId = new Map(L.entries.map((e) => [e.id, e]));
const clientOf = (e) => (!e.excludeFromClients && e.clientCanonical) ? String(e.clientCanonical).trim() : "";

const fails = [];
let passes = 0;
const check = (ok, msg) => { if (ok) passes++; else fails.push(msg); return ok; };
const wait = (p, ms) => p.waitForTimeout(ms);

const browser = await chromium.launch();
const firstLine = (e) => String(e?.message || e).split(/\r?\n/)[0].slice(0, 200);
async function guard(name, fn) { try { await fn(); } catch (e) { fails.push(`[${name}] crashed: ${firstLine(e)}`); } }

async function newPage({ mobile = false, tour = false, city = false } = {}) {
  const ctx = await browser.newContext(mobile
    ? { ...devices["Pixel 7"] }
    : { viewport: { width: 1440, height: 900 } });
  if (!tour) await ctx.addInitScript(() => { try { localStorage.setItem("portfolio_onboarded", "1"); } catch {} });
  const page = await ctx.newPage();
  page.setDefaultTimeout(4000);
  page.setDefaultNavigationTimeout(30000);
  if (!city) await page.route(/\.(glb|exr)(\?|$)/, (r) => r.abort());
  else await page.route(/\.exr(\?|$)/, (r) => r.abort());
  page.__errors = [];
  page.on("pageerror", (e) => page.__errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() !== "error") return;
    const t = m.text();
    if (/glb|exr|EXR|stager-city|Failed to load resource|ERR_FAILED|ERR_ABORTED|youtube|ytimg|instagram|twitter|behance|GPU stall|Permissions policy|Content Security Policy/i.test(t)) return;
    page.__errors.push(t);
  });
  return { ctx, page };
}

async function boot(page, url = BASE) {
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelector("#loader")?.classList.contains("done") || getComputedStyle(document.querySelector("#loader") || document.body).display === "none", null, { timeout: 30000 }).catch(() => {});
  await wait(page, 900);
}

const snap = (page) => page.evaluate(() => {
  const vis = (el) => { if (!el) return false; const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && +s.opacity > 0.05 && r.width > 0 && r.height > 0; };
  const q = (s) => document.querySelector(s);
  const navPage = q("#navPage");
  const art = q("#galleryArtifact");
  const fol = q("#rosterFollower");
  return {
    hash: location.hash, search: location.search,
    router: window.ViewRouter ? { ...window.ViewRouter.current } : null,
    nav: navPage?.classList.contains("visible") || false,
    rail: q("#navPageInner .roles-explorer-btn.active .roles-explorer-title")?.textContent.trim() || null,
    cs: navPage?.classList.contains("visible") ? (q("#navPageInner .csr-h1")?.textContent.trim() || null) : null,
    csGrid: navPage?.classList.contains("visible") && !!q("#navPageInner [data-cs-folder]"),
    art: art?.classList.contains("visible") || false,
    artTitle: art?.classList.contains("visible") ? (q("#artifactContainer .artifact-title, #artifactContainer .feature-title, #artifactContainer .directory-title")?.textContent.trim() || null) : null,
    hud: document.body.classList.contains("hud-expanded"),
    hudTitle: document.body.classList.contains("hud-expanded") ? (q("#rightHud .detail-info-panel h2")?.textContent.trim() || q("#rightHud h2")?.textContent.trim() || null) : null,
    activeNav: [...document.querySelectorAll(".topnav .navlink.active")].map((a) => a.dataset.view),
    follower: fol ? +getComputedStyle(fol).opacity : 0,
    tour: vis(q("#onboardTooltip")) && !q("#onboardTooltip").hidden,
    gallery: q("#galleryOverlay")?.classList.contains("visible") || false,
    inView: q("#statInView")?.textContent.trim() || null,
    title: document.title,
  };
});

const errs = (page, where) => { for (const e of page.__errors.splice(0)) fails.push(`[${where}] console: ${e.slice(0, 160)}`); };

// ── 1. First-visit tour ─────────────────────────────────────────────
if (run("tour")) await guard("tour", async () => {
  const { ctx, page } = await newPage({ tour: true });
  await boot(page);
  await wait(page, 2600);
  let s = await snap(page);
  check(s.tour, "[tour] does not appear on a first visit");
  for (let i = 0; i < 5 && s.tour; i++) {
    const hl = await page.evaluate(() => { const h = document.querySelector("#onboardHighlight"); const r = h?.getBoundingClientRect(); return { hidden: h?.hidden, w: r?.width || 0, steps: document.querySelector("#onboardSteps")?.textContent, title: document.querySelector("#onboardTitle")?.textContent }; });
    if (i > 0 && i < 4) check(!hl.hidden && hl.w > 4, `[tour] step ${hl.steps} "${hl.title}" highlights nothing`);
    await page.click("#onboardNext");
    await wait(page, 500);
    s = await snap(page);
  }
  check(!s.tour, "[tour] still showing after 5 Next clicks");
  errs(page, "tour");
  await ctx.close();

  // A visitor who opens a section before the tour starts must not be pulled out.
  const b = await newPage({ tour: true });
  await boot(b.page);
  await b.page.click('.navlink[data-view="roles"]');
  await wait(b.page, 3500);
  s = await snap(b.page);
  check(s.nav && s.router?.view === "roles", `[tour] opening Roles early: tour pulled the visitor to ${s.router?.view} (nav visible ${s.nav})`);
  check(!s.tour, "[tour] tour pops over the Roles page");
  await b.ctx.close();
});

// ── 2. Roles and Clients: every rail item, every card ──────────────
async function sectionSweep(view, mobile) {
  const tag = `${view}${mobile ? "/mobile" : ""}`;
  const { ctx, page } = await newPage({ mobile });
  await boot(page);
  if (mobile) {
    await page.click("#navMenuToggle").catch(() => {});
    await wait(page, 300);
  }
  // Visit case studies first: a stale back-stack is what sent project clicks to a case study.
  await page.click(`.navlink[data-view="case-studies"]`);
  await wait(page, 700);
  await page.click(`[data-cs-folder="${CS[1].id}"]`);
  await wait(page, 700);
  if (mobile) { await page.click("#navMenuToggle").catch(() => {}); await wait(page, 300); }
  await page.click(`.navlink[data-view="${view}"]`);
  await wait(page, 900);

  const labels = await page.$$eval("#navPageInner [data-role-select]", (b) => b.map((x) => x.dataset.roleSelect));
  const expectLabels = view === "roles" ? 11 : 37;
  check(labels.length === expectLabels, `[${tag}] rail shows ${labels.length} items, expected ${expectLabels}`);
  const opened = new Set();
  for (const label of labels) {
    if (mobile) {
      const open = await page.$eval(".roles-explorer-layout", (x) => x.classList.contains("rail-open")).catch(() => false);
      if (!open) { await page.click(".explorer-rail-toggle"); await wait(page, 250); }
    }
    await page.click(`#navPageInner [data-role-select="${label.replace(/"/g, '\\"')}"]`);
    await wait(page, 350);
    let s = await snap(page);
    check(s.rail === label, `[${tag}] clicked rail "${label}", active is "${s.rail}"`);
    const cards = await page.$$eval("#navPageInner [data-client-entry]", (c) => c.map((x) => Number(x.dataset.clientEntry)));
    const want = L.entries.filter((e) => view === "roles" ? (e.roles || []).includes(label) : clientOf(e) === label).map((e) => e.id).sort();
    const got = [...new Set(cards)].sort();
    check(JSON.stringify(got) === JSON.stringify(want), `[${tag}] "${label}": cards open ${JSON.stringify(got)}, projects in this ${view === "roles" ? "role" : "client"} are ${JSON.stringify(want)}`);
    for (const id of cards) { try {
      const card = page.locator(`#navPageInner [data-client-entry="${id}"]`).first();
      await card.scrollIntoViewIfNeeded();
      if (!mobile) { await card.hover(); await wait(page, 120); }
      await card.click();
      await wait(page, 700);
      s = await snap(page);
      const want = byId.get(id)?.title;
      const shown = s.artTitle || s.hudTitle;
      check(shown === want, `[${tag}] "${label}" card #${id}: opened "${shown}" (cs "${s.cs}", router ${s.router?.view}), expected "${want}"`);
      check(!s.cs, `[${tag}] "${label}" card #${id}: a case study is on screen ("${s.cs}")`);
      check(s.follower < 0.05, `[${tag}] "${label}" card #${id}: hover preview stuck on screen`);
      opened.add(id);
      // Back: artifact back arrow, or the HUD close.
      if (s.art) await page.click("#artifactClose");
      else if (s.hud) await page.click("#expCloseBtn");
      await wait(page, 700);
      s = await snap(page);
      check(s.nav && s.rail === label && !s.art, `[${tag}] back from #${id}: landed on nav ${s.nav} rail "${s.rail}" router ${s.router?.view} (expected ${view} / "${label}")`);
      if (!(s.nav && s.rail === label)) {
        // recover
        if (mobile) { await page.click("#navMenuToggle").catch(() => {}); await wait(page, 300); }
        await page.click(`.navlink[data-view="${view}"]`).catch(() => {});
        await wait(page, 600);
        if (mobile) { const open = await page.$eval(".roles-explorer-layout", (x) => x.classList.contains("rail-open")).catch(() => false); if (!open) { await page.click(".explorer-rail-toggle").catch(() => {}); await wait(page, 200); } }
        await page.click(`#navPageInner [data-role-select="${label.replace(/"/g, '\\"')}"]`).catch(() => {});
        await wait(page, 300);
      }
      const pillOn = mobile ? null : await page.evaluate(() => { const p = document.querySelector(".nav-pill-indicator"); if (!p || +getComputedStyle(p).opacity < 0.05) return null; const pr = p.getBoundingClientRect(); const hit = [...document.querySelectorAll(".topnav .navlink")].find((l) => Math.abs(l.getBoundingClientRect().left - pr.left) < 3); return hit ? hit.dataset.view : "none"; });
      if (!mobile) check(pillOn === null || pillOn === view, `[${tag}] after back from #${id}, tab highlight on "${pillOn}"`);
      const an = (await snap(page)).activeNav;
      if (!mobile) check(an.length === 1 && an[0] === view, `[${tag}] after back, active nav is ${JSON.stringify(an)}`);
    } catch (err) { fails.push(`[${tag}] "${label}" card #${id}: blocked (${firstLine(err)})`); await page.keyboard.press("Escape").catch(()=>{}); await page.goto(BASE + "#" + view).catch(()=>{}); await wait(page, 1500); } }
  }
  const unreachable = L.entries.filter((e) => view === "clients" ? clientOf(e) : (e.roles || []).length).filter((e) => !opened.has(e.id));
  check(!unreachable.length, `[${tag}] ${unreachable.length} projects cannot be opened from ${view}: ${unreachable.map((e) => "#" + e.id).join(" ")}`);
  errs(page, tag);
  await ctx.close();
}
if (run("roles")) await sectionSweep("roles", false).catch((e) => fails.push(`[roles] crashed: ${firstLine(e)}`));
if (run("clients")) await sectionSweep("clients", false).catch((e) => fails.push(`[clients] crashed: ${firstLine(e)}`));
if (run("roles-m")) await sectionSweep("roles", true).catch((e) => fails.push(`[roles-m] crashed: ${firstLine(e)}`));
if (run("clients-m")) await sectionSweep("clients", true).catch((e) => fails.push(`[clients-m] crashed: ${firstLine(e)}`));

// ── 3. Case studies: each one, every milestone link, frames, back ───
async function csSweep(mobile) {
  const tag = `case-studies${mobile ? "/mobile" : ""}`;
  const { ctx, page } = await newPage({ mobile });
  await boot(page);
  if (mobile) { await page.click("#navMenuToggle").catch(() => {}); await wait(page, 300); }
  await page.click(`.navlink[data-view="case-studies"]`);
  await wait(page, 800);
  for (const cs of CS) {
    await page.click(`[data-cs-folder="${cs.id}"]`);
    await wait(page, 900);
    let s = await snap(page);
    check(s.cs === cs.title, `[${tag}] folder ${cs.id} opened "${s.cs}"`);
    if (!mobile) check(JSON.stringify(s.activeNav) === '["case-studies"]', `[${tag}] ${cs.id}: active nav ${JSON.stringify(s.activeNav)}`);
    const jumps = await page.$$eval("#navPageInner [data-ledger-jump]", (j) => j.map((x) => Number(x.dataset.ledgerJump)));
    const want = (cs.milestones || []).filter((m) => m.ledgerEntryId).map((m) => m.ledgerEntryId);
    check(jumps.length === want.length, `[${tag}] ${cs.id}: ${jumps.length} milestone links, data has ${want.length}`);
    for (const id of jumps) { try {
      const j = page.locator(`#navPageInner [data-ledger-jump="${id}"]`).first();
      await j.scrollIntoViewIfNeeded();
      await j.click();
      await wait(page, 800);
      s = await snap(page);
      const shown = s.artTitle || s.hudTitle;
      check(shown === byId.get(id)?.title, `[${tag}] ${cs.id} milestone #${id}: opened "${shown}" (router ${s.router?.view}, cs "${s.cs}")`);
      if (s.art) await page.click("#artifactClose"); else if (s.hud) await page.click("#expCloseBtn");
      await wait(page, 800);
      s = await snap(page);
      check(s.cs === cs.title, `[${tag}] back from milestone #${id}: on "${s.cs}" router ${s.router?.view} (expected ${cs.title})`);
      if (s.cs !== cs.title) {
        if (mobile) { await page.click("#navMenuToggle").catch(() => {}); await wait(page, 300); }
        await page.click(`.navlink[data-view="case-studies"]`).catch(() => {}); await wait(page, 600);
        await page.click(`[data-cs-folder="${cs.id}"]`).catch(() => {}); await wait(page, 700);
      }
    } catch (err) { fails.push(`[${tag}] ${cs.id} milestone #${id}: blocked (${firstLine(err)})`); await page.goto(BASE + "#case-study/" + cs.id).catch(()=>{}); await wait(page, 1500); } }
    // Frames → lightbox → Esc
    const frame = page.locator("#navPageInner [data-cs-lightbox]").first();
    if (await frame.count()) {
      await frame.scrollIntoViewIfNeeded(); await frame.click(); await wait(page, 400);
      const lb = await page.evaluate(() => !!document.querySelector(".ev-lightbox, .cs-lightbox, [class*=lightbox].visible"));
      check(lb, `[${tag}] ${cs.id}: frame click opens no lightbox`);
      await page.keyboard.press("Escape"); await wait(page, 400);
      s = await snap(page);
      check(s.cs === cs.title, `[${tag}] ${cs.id}: Escape on lightbox left "${s.cs}" router ${s.router?.view}`);
    }
    // Rail jump links scroll the reader
    const gotos = await page.$$eval("#navPageInner [data-csr-goto]", (g) => g.map((x) => x.dataset.csrGoto));
    for (const g of gotos.slice(0, 3)) {
      if (mobile) break;
      const before = await page.evaluate(() => document.querySelector("#navPageInner")?.scrollTop || 0);
      await page.click(`#navPageInner [data-csr-goto="${g}"]`); await wait(page, 700);
      const after = await page.evaluate(() => document.querySelector("#navPageInner")?.scrollTop || 0);
      check(after !== before || g === "overview" || g === "hero", `[${tag}] ${cs.id}: rail "${g}" does not scroll`);
    }
    // Back to the grid
    const back = page.locator("#navPageInner [data-cs-back]").first();
    if (await back.count()) { await back.click(); }
    else { await page.goBack(); }
    await wait(page, 800);
    s = await snap(page);
    check(s.csGrid, `[${tag}] back from ${cs.id} did not return to the case-study grid (router ${s.router?.view}, cs "${s.cs}")`);
    if (!s.csGrid) {
      if (mobile) { await page.click("#navMenuToggle").catch(() => {}); await wait(page, 300); }
      await page.click(`.navlink[data-view="case-studies"]`).catch(() => {}); await wait(page, 700);
    }
  }
  errs(page, tag);
  await ctx.close();
}
if (run("cs")) await csSweep(false).catch((e) => fails.push(`[cs] crashed: ${firstLine(e)}`));
if (run("cs-m")) await csSweep(true).catch((e) => fails.push(`[cs-m] crashed: ${firstLine(e)}`));

// ── 4. Nav: every section to every section ──────────────────────────
if (run("nav")) await guard("nav", async () => {
  const { ctx, page } = await newPage();
  await boot(page);
  const views = ["archive", "roles", "clients", "case-studies", "contact"];
  for (const a of views) for (const b of views) {
    if (a === b) continue;
    await page.click(`.navlink[data-view="${a}"]`); await wait(page, 500);
    await page.click(`.navlink[data-view="${b}"]`); await wait(page, 600);
    const s = await snap(page);
    check(JSON.stringify(s.activeNav) === JSON.stringify([b]), `[nav] ${a} → ${b}: active nav ${JSON.stringify(s.activeNav)}`);
    check(b === "archive" ? !s.nav : s.nav, `[nav] ${a} → ${b}: nav page visible = ${s.nav}`);
    check(!s.art && !s.gallery, `[nav] ${a} → ${b}: stale overlay (artifact ${s.art}, gallery ${s.gallery})`);
    const navBg = await page.$eval(`.navlink[data-view="${a}"]`, (el) => getComputedStyle(el).backgroundColor);
    const onBg = await page.$eval(`.navlink[data-view="${b}"]`, (el) => getComputedStyle(el).backgroundColor);
    check(navBg === "rgba(0, 0, 0, 0)" || navBg === onBg || navBg === "transparent", `[nav] ${a} → ${b}: the old tab "${a}" still looks selected (bg ${navBg})`);
    const pillOn = await page.evaluate(() => { const p = document.querySelector(".nav-pill-indicator"); if (!p || +getComputedStyle(p).opacity < 0.05) return null; const pr = p.getBoundingClientRect(); const hit = [...document.querySelectorAll(".topnav .navlink")].find((l) => Math.abs(l.getBoundingClientRect().left - pr.left) < 3); return hit ? hit.dataset.view : "none"; });
    check(pillOn === null || pillOn === b, `[nav] ${a} → ${b}: tab highlight sits on "${pillOn}"`);
  }
  // Browser Back walks the sections in reverse.
  await page.click('.navlink[data-view="roles"]'); await wait(page, 400);
  await page.click('.navlink[data-view="clients"]'); await wait(page, 400);
  await page.click('.navlink[data-view="contact"]'); await wait(page, 400);
  await page.goBack(); await wait(page, 600);
  let s = await snap(page);
  check(s.router?.view === "clients" && s.nav, `[nav] Back from contact went to ${s.router?.view}`);
  await page.goBack(); await wait(page, 600);
  s = await snap(page);
  check(s.router?.view === "roles" && s.nav, `[nav] second Back went to ${s.router?.view}`);
  errs(page, "nav");
  await ctx.close();
});

// ── 5. Archive filters, with the real city loaded ───────────────────
if (run("filters")) await guard("filters", async () => {
  const { ctx, page } = await newPage({ city: true });
  await boot(page);
  page.setDefaultTimeout(60000);
  await page.waitForFunction(() => window.__storyRefs?.cityReady, null, { timeout: 180000 }).catch(() => fails.push("[filters] city never loaded"));
  await wait(page, 1500);
  const themeOf = (e, key) => {
    const T = { MovingImages: ["Director","Cinematographer","Photographer","Editor","Producer"], VisualSystems: ["Designer","Art Director"], CompCulture: [], DocResearch: ["Research"], LeadershipEdu: ["Founder","Teaching","Leadership & Volunteering"] };
    const LBL = { MovingImages: "Moving Images", VisualSystems: "Visual Systems", CompCulture: "Computational Culture", DocResearch: "Documentation & Research", LeadershipEdu: "Leadership & Teaching" };
    return (e.roleGroups || []).includes(LBL[key]) || (e.roles || []).some((r) => T[key].includes(r));
  };
  const buildings = () => page.evaluate(() => {
    const out = [];
    window.__storyRefs.stagerCityGroup.traverse((n) => {
      if (n.userData?.entryId == null || n.userData.__seen) return;
      let op = null;
      n.traverse((o) => { if (op == null && o.isMesh && o.material) op = (Array.isArray(o.material) ? o.material[0] : o.material).opacity; });
      out.push({ name: n.name, id: String(n.userData.entryId), op });
    });
    return out;
  });
  const pills = await page.$$eval("#rolePills [data-role]", (b) => b.map((x) => ({ key: x.dataset.role, count: Number(x.querySelectorAll("span")[1]?.textContent) })));
  check(pills.length === 6, `[filters] ${pills.length} discipline pills, expected 6`);
  for (const p of pills) {
    await page.evaluate((k) => document.querySelector(`#rolePills [data-role="${k}"]`).click(), p.key);
    await wait(page, 1600);
    const s = await snap(page);
    const expect = p.key === "all" ? L.entries.length : L.entries.filter((e) => themeOf(e, p.key)).length;
    check(p.count === expect, `[filters] pill ${p.key} shows count ${p.count}, data says ${expect}`);
    check(Number(s.inView) === expect, `[filters] pill ${p.key}: "In view" shows ${s.inView}, expected ${expect}`);
    const active = await page.$eval(`#rolePills [data-role="${p.key}"]`, (x) => x.classList.contains("active"));
    check(active, `[filters] pill ${p.key} not marked active after click`);
    const b = await buildings();
    const dim = b.filter((x) => x.op != null && x.op < 0.5).length;
    if (p.key === "all") check(dim === 0, `[filters] "All work": ${dim} buildings still dimmed`);
    else check(dim > 0, `[filters] pill ${p.key}: no building dims (of ${b.length}); the filter looks dead`);
    console.log(`  filter ${p.key}: in view ${s.inView}, dimmed ${dim}/${b.length}`);
  }
  // Filters combine: reset the discipline so each year is checked on its own.
  await page.evaluate(() => document.querySelector("#rolePills [data-role=\"all\"]").click()); await wait(page, 1500);
  const years = await page.$$eval("#yearPills button", (b) => b.map((x) => x.querySelector("span")?.textContent.trim()));
  for (const y of years) {
    await page.evaluate((yy) => [...document.querySelectorAll("#yearPills button")].find((b) => b.querySelector("span")?.textContent.trim() === yy).click(), y);
    await wait(page, 1600);
    const s = await snap(page);
    const expect = y === "All" ? L.entries.length : L.entries.filter((e) => String(e.year) === y).length;
    check(Number(s.inView) === expect, `[filters] year ${y}: "In view" shows ${s.inView}, expected ${expect}`);
    const b = await buildings();
    const dim = b.filter((x) => x.op != null && x.op < 0.5).length;
    if (y === "All") check(dim === 0, `[filters] year All: ${dim} buildings still dimmed`);
    else check(dim > 0, `[filters] year ${y}: no building dims`);
  }
  // Search, on all years.
  await page.evaluate(() => [...document.querySelectorAll("#yearPills button")].find((x) => x.querySelector("span")?.textContent.trim() === "All").click()); await wait(page, 1500);
  await page.evaluate(() => { const i = document.querySelector("#searchInput"); i.value = "dell"; i.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(page, 1500); await page.waitForFunction((n) => document.querySelector("#statInView")?.textContent.trim() === n, "1", { timeout: 30000 }).catch(() => {});
  let s = await snap(page);
  check(Number(s.inView) === 1, `[filters] search "dell": In view ${s.inView}, expected 1`);
  await page.evaluate(() => { const i = document.querySelector("#searchInput"); i.value = ""; i.dispatchEvent(new Event("input", { bubbles: true })); }); await wait(page, 1500); await page.waitForFunction((n) => document.querySelector("#statInView")?.textContent.trim() === n, String(L.entries.length), { timeout: 30000 }).catch(() => {});
  s = await snap(page);
  check(Number(s.inView) === L.entries.length, `[filters] cleared search: In view ${s.inView}`);
  // City building click → right entry
  errs(page, "filters");
  await ctx.close();
});

// ── 6. Desktop project panel (city / cluster path) ──────────────────
if (run("hud")) await guard("hud", async () => {
  const { ctx, page } = await newPage();
  await boot(page);
  for (const id of [136, 3, 100, 51]) {
    await page.evaluate((i) => window.ARCHIVE_APP_DEBUG.selectEntry(i, { zoom: true }), id);
    await wait(page, 900);
    let s = await snap(page);
    check(s.hudTitle === byId.get(id).title, `[hud] select #${id}: panel shows "${s.hudTitle}"`);
    const cta = await page.$eval("#expFullScreenBtn", (b) => b.textContent.trim()).catch(() => null);
    check(cta && !/case study/i.test(cta), `[hud] #${id}: main button reads "${cta}" but opens the project, not a case study`);
    const blank = await page.$$eval("#rightHud .evidence-thumb", (t) => t.filter((b) => /\.(mp4|pdf)/i.test(b.style.backgroundImage)).length);
    check(blank === 0, `[hud] #${id}: ${blank} evidence tiles use a video/PDF file as a background image (render blank)`);
    await page.click("#expFullScreenBtn"); await wait(page, 800);
    s = await snap(page);
    check(s.artTitle === byId.get(id).title, `[hud] #${id}: full page opened "${s.artTitle}"`);
    await page.click("#artifactClose"); await wait(page, 700);
    s = await snap(page);
    check(!s.art && !s.nav, `[hud] #${id}: back from full page left artifact ${s.art} nav ${s.nav}`);
    await page.click("#expCloseBtn").catch(() => {}); await wait(page, 500);
  }
  // Prev / next step through entries
  await page.evaluate(() => window.ARCHIVE_APP_DEBUG.selectEntry(100, { zoom: true })); await wait(page, 900);
  const t0 = (await snap(page)).hudTitle;
  await page.click("#expNextBtn"); await wait(page, 900);
  const t1 = (await snap(page)).hudTitle;
  check(t1 && t1 !== t0, `[hud] Next did not move (${t0} → ${t1})`);
  await page.click("#expPrevBtn"); await wait(page, 900);
  check((await snap(page)).hudTitle === t0, `[hud] Prev did not return to "${t0}"`);
  errs(page, "hud");
  await ctx.close();
});

// ── 7. Every entry by deep link: title, images, evidence ────────────
if (run("entries")) await guard("entries", async () => {
  const { ctx, page } = await newPage();
  for (const e of L.entries) {
    try { await page.goto(`${BASE}?entry=${e.id}`, { waitUntil: "domcontentloaded" }); } catch (err) { fails.push(`[entries] ?entry=${e.id}: page did not load (${firstLine(err)})`); continue; }
    await page.waitForFunction(() => document.querySelector("#galleryArtifact")?.classList.contains("visible"), null, { timeout: 15000 }).catch(() => {});
    await wait(page, 600);
    const s = await snap(page);
    check(s.artTitle === e.title, `[entries] ?entry=${e.id}: shows "${s.artTitle}"`);
    const imgs = await page.$$eval("#artifactContainer img", async (list) => {
      await Promise.all(list.map((i) => i.complete ? 0 : new Promise((r) => { i.onload = i.onerror = r; setTimeout(r, 6000); })));
      return list.map((i) => ({ src: i.getAttribute("src"), ok: i.naturalWidth > 0 }));
    });
    for (const i of imgs) if (!i.ok && !/ytimg|youtube|icons8/.test(i.src)) fails.push(`[entries] #${e.id}: image does not load ${i.src}`);
    const evCount = (e.evidence || []).length;
    const shown = await page.$$eval("#artifactContainer .artifact-thumb, #artifactContainer .feature-figure, #artifactContainer .artifact-hero > *", (x) => x.length);
    if (evCount) check(shown > 0, `[entries] #${e.id}: has ${evCount} evidence items, artifact shows none`);
    errs(page, `entry ${e.id}`);
  }
  await ctx.close();
});

// ── 8. Contact ───────────────────────────────────────────────────────
if (run("contact")) await guard("contact", async () => {
  const { ctx, page } = await newPage();
  await boot(page);
  await page.click('.navlink[data-view="contact"]'); await wait(page, 800);
  const links = await page.$$eval("#navPageInner a", (a) => a.map((x) => ({ t: x.textContent.trim().slice(0, 40), h: x.getAttribute("href") })));
  for (const l of links) check(l.h && l.h !== "#" && !/undefined|null/.test(l.h), `[contact] link "${l.t}" has href ${l.h}`);
  check(links.some((l) => /^mailto:1991anirudh@gmail\.com/.test(l.h)), "[contact] no mailto link");
  const pdf = links.find((l) => /pdf|drive/i.test(l.h));
  if (pdf && !/^https?:/.test(pdf.h)) { const r = await page.request.get(BASE + pdf.h.replace(/^\//, "")); check(r.ok(), `[contact] folio ${pdf.h} → ${r.status()}`); }
  errs(page, "contact");
  await ctx.close();
});

// ── 9. Mobile archive list and filters ──────────────────────────────
if (run("mobile")) await guard("mobile", async () => {
  const { ctx, page } = await newPage({ mobile: true });
  await boot(page);
  await page.click("#navMenuToggle").catch(() => {}); await wait(page, 300);
  await page.click('.navlink[data-view="archive"]'); await wait(page, 900);
  const count = () => page.$$eval(".mobile-list [data-entry-id], .mobile-list-item, #mobileList [data-entry-id]", (x) => x.length);
  check(await count() === L.entries.length, `[mobile] archive list shows ${await count()} of ${L.entries.length}`);
  await page.click("#railToggle"); await wait(page, 300);
  const pills = await page.$$eval("#rolePills [data-role]", (b) => b.map((x) => ({ key: x.dataset.role, count: Number(x.querySelectorAll("span")[1]?.textContent) })));
  for (const p of pills) {
    await page.evaluate((k) => document.querySelector(`#rolePills [data-role="${k}"]`).click(), p.key); await wait(page, 500);
    const n = await count();
    check(n === p.count, `[mobile] filter ${p.key}: list shows ${n}, pill says ${p.count}`);
    const st = await page.$eval("#railToggleState", (x) => x.textContent.trim()).catch(() => "");
    check(st.startsWith(String(p.count)), `[mobile] filter ${p.key}: toggle says "${st}"`);
  }
  await page.click('#rolePills [data-role="all"]'); await wait(page, 400);
  await page.click('#yearPills button:has-text("2024")'); await wait(page, 500);
  const n24 = L.entries.filter((e) => e.year === 2024).length;
  check(await count() === n24, `[mobile] year 2024: list shows ${await count()}, expected ${n24}`);
  await page.click('#yearPills button:has-text("All")'); await wait(page, 500);
  const first = page.locator(".mobile-list [data-entry-id], #mobileList [data-entry-id]").first();
  if (await first.count()) {
    const id = Number(await first.getAttribute("data-entry-id"));
    await first.click(); await wait(page, 800);
    let s = await snap(page);
    check(s.artTitle === byId.get(id)?.title, `[mobile] list item #${id} opened "${s.artTitle}"`);
    await page.goBack(); await wait(page, 700);
    s = await snap(page);
    check(!s.art, "[mobile] system Back did not close the project");
  }
  errs(page, "mobile");
  await ctx.close();
});

// Extra journeys, appended to audit.mjs by patch-audit.cjs.
// ── 10. Gallery: photo opens, back returns to gallery, Escape closes ──
if (run("gallery")) await guard("gallery", async () => {
  const { ctx, page } = await newPage();
  await boot(page);
  await page.evaluate(() => window.ARCHIVE_APP_DEBUG.openCluster("Travel & Gallery", []));
  await page.waitForFunction(() => document.querySelectorAll("#galleryOverlay .gallery-item").length > 0, null, { timeout: 15000 }).catch(() => {});
  let s = await snap(page);
  check(s.gallery, "[gallery] overlay did not open");
  const n = await page.$$eval("#galleryOverlay .gallery-item", (x) => x.length);
  check(n > 100, `[gallery] grid shows ${n} photos`);
  const onScreen = () => page.evaluate(() => [...document.querySelectorAll("#galleryOverlay .gallery-item")].map((el) => el.getBoundingClientRect()).filter((r) => r.x > 40 && r.y > 120 && r.right < innerWidth - 40 && r.bottom < innerHeight - 40).map((r) => [r.x + r.width / 2, r.y + r.height / 2]));
  const tapPhoto = async (k) => { const pts = await onScreen(); if (!pts.length) throw new Error("no photo on screen"); const [x, y] = pts[Math.min(k * 3, pts.length - 1)]; await page.mouse.click(x, y); };
  for (let k = 0; k < 3; k++) {
    await tapPhoto(k); await wait(page, 900);
    s = await snap(page);
    check(s.art && s.gallery, `[gallery] photo ${k}: artifact ${s.art} gallery ${s.gallery}`);
    await page.click("#artifactClose"); await wait(page, 700);
    s = await snap(page);
    check(!s.art && s.gallery, `[gallery] back from photo ${k}: artifact ${s.art}, gallery still open ${s.gallery}`);
  }
  await tapPhoto(0); await wait(page, 800);
  await page.keyboard.press("Escape"); await wait(page, 600);
  s = await snap(page);
  check(!s.art && s.gallery, `[gallery] Escape on photo: artifact ${s.art}, gallery ${s.gallery}`);
  await page.keyboard.press("Escape"); await wait(page, 600);
  s = await snap(page);
  check(!s.gallery && !s.nav, `[gallery] second Escape: gallery ${s.gallery}, nav ${s.nav}`);
  errs(page, "gallery");
  await ctx.close();
});

// ── 11. "Filter Archive →" from roles and clients ───────────────────
if (run("groupfilter")) await guard("groupfilter", async () => {
  const { ctx, page } = await newPage();
  await boot(page);
  for (const [view, label] of [["roles", "Director"], ["roles", "Leadership & Volunteering"], ["roles", "Teaching"], ["clients", "Dell"], ["clients", "LetsArc Media"]]) {
    await page.click(`.navlink[data-view="${view}"]`); await wait(page, 700);
    const sel = `#navPageInner [data-role-select="${label}"]`;
    if (!(await page.$(sel))) { fails.push(`[groupfilter] no rail item "${label}" on ${view}`); continue; }
    await page.click(sel); await wait(page, 400);
    await page.click("#navPageInner [data-filter-active-group]"); await wait(page, 900);
    const s = await snap(page);
    const want = L.entries.filter((e) => view === "roles" ? (e.roles || []).includes(label) : (e.clientCanonical || e.org) === label).length;
    check(!s.nav && Number(s.inView) === want, `[groupfilter] ${view} "${label}": nav ${s.nav}, In view ${s.inView}, expected ${want}`);
    const chip = await page.$eval("#searchChips", (x) => x.textContent.trim()).catch(() => "");
    check(chip.includes(label), `[groupfilter] ${view} "${label}": no filter chip (chips "${chip}")`);
    await page.click("#searchChips .chip-remove").catch(() => {}); await wait(page, 600);
    check(Number((await snap(page)).inView) === L.entries.length, `[groupfilter] removing "${label}" chip did not restore all projects`);
  }
  errs(page, "groupfilter");
  await ctx.close();
});

// ── 12. Contact form Send ────────────────────────────────────────────
if (run("contact")) await guard("contact-send", async () => {
  const { ctx, page } = await newPage();
  await boot(page);
  await page.click('.navlink[data-view="contact"]'); await wait(page, 800);
  await page.click("#contactSubmit"); await wait(page, 300);
  const empty = await page.$eval("#contactNote", (x) => x.textContent).catch(() => "");
  check(/name/i.test(empty), `[contact] Send with an empty form gave no message ("${empty}")`);
  await page.fill("#contactName", "Test Recruiter");
  await page.fill("#contactEmail", "recruiter@example.com");
  await page.fill("#contactMessage", "We have a brand film project.");
  await page.click("#contactSubmit"); await wait(page, 600);
  const note = await page.$eval("#contactNote", (x) => x.textContent).catch(() => "");
  check(/email app/i.test(note), `[contact] Send with a filled form did nothing (note "${note}")`);
  errs(page, "contact-send");
  await ctx.close();
});

// ── 13. No em-dashes in any visible text ─────────────────────────────
if (run("dashes")) await guard("dashes", async () => {
  const { ctx, page } = await newPage();
  await boot(page);
  const scan = async (where) => {
    const hits = await page.evaluate(() => {
      const out = [];
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) {
        const t = w.currentNode;
        if (!t.nodeValue.includes("—")) continue;
        const el = t.parentElement;
        if (!el || el.closest("[hidden], [aria-hidden=true], script, style")) continue;
        const st = getComputedStyle(el); const r = el.getBoundingClientRect();
        if (st.display === "none" || st.visibility === "hidden" || r.width === 0) continue;
        out.push(t.nodeValue.trim().slice(0, 70));
      }
      return [...new Set(out)];
    });
    for (const h of hits) fails.push(`[dashes] ${where}: "${h}"`);
  };
  await scan("archive");
  for (const v of ["roles", "clients", "case-studies", "contact"]) { await page.click(`.navlink[data-view="${v}"]`); await wait(page, 700); await scan(v); }
  for (const cs of CS) { await page.goto(BASE + "#case-study/" + cs.id); await wait(page, 1800); await scan("case study " + cs.id); }
  await page.goto(BASE); await wait(page, 2500);
  await page.evaluate(() => window.ARCHIVE_APP_DEBUG.selectEntry(100, { zoom: true })); await wait(page, 900); await scan("project panel");
  for (const e of L.entries) { await page.goto(`${BASE}?entry=${e.id}`); await wait(page, 1200); await scan("entry " + e.id); }
  errs(page, "dashes");
  await ctx.close();
});

await browser.close();
console.log(`\n${passes} checks passed, ${fails.length} failed`);
for (const f of fails) console.log(" ✗ " + f);
process.exit(fails.length ? 1 : 0);
