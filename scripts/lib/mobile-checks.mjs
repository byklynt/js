// The checks that run INSIDE the page (page.evaluate). Self-contained on purpose: Playwright serialises the function, so it may not use anything from this module.
// Returns plain JSON: { doc, inputs, viewport, covered, targets, clipped, dialogs, fixedOverlap, images, kbd, misc }.
export function auditInPage(opts) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const out = { doc: { scrollWidth: 0, clientWidth: 0, overflow: false, offenders: /** @type {string[]} */ ([]) }, inputs: [], viewport: "", covered: [], targets: [], clipped: [], dialogs: [], fixedOverlap: [], images: [], kbd: [], misc: {} };

  const visible = (el) => {
    if (el.closest("details:not([open])") && el.tagName !== "SUMMARY" && !el.closest("summary")) return false; // inside a closed <details>
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const inert = (el) => !!el.closest("[aria-hidden='true'], [inert], .sr-only, nextjs-portal, [data-nextjs-toast], [data-nextjs-dev-tools-button]");
  const sel = (el) => {
    let s = el.tagName.toLowerCase();
    if (el.id) s += `#${String(el.id).slice(0, 24)}`;
    const cls = typeof el.className === "string" ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join(".") : "";
    if (cls) s += `.${cls}`;
    const label = el.getAttribute("aria-label") || (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 24);
    return label ? `${s} "${label}"` : s;
  };
  const scrollParent = (el) => {
    for (let p = el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return p;
    }
    return null;
  };
  const insideFixed = (el) => {
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) if (getComputedStyle(p).position === "fixed") return true;
    return false;
  };

  // 3. viewport meta
  out.viewport = document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? "";

  // 1. horizontal overflow of the whole page, and who causes it
  const se = document.scrollingElement || document.documentElement;
  out.doc = { scrollWidth: se.scrollWidth, clientWidth: se.clientWidth, overflow: se.scrollWidth > se.clientWidth + 1, offenders: [] };
  if (out.doc.overflow) {
    for (const el of Array.from(document.querySelectorAll("body *")).slice(0, 4000)) {
      if (out.doc.offenders.length >= 8) break;
      if (!visible(el) || inert(el) || insideFixed(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right <= vw + 1) continue;
      const sp = scrollParent(el);
      if (sp && sp.getBoundingClientRect().right <= vw + 1) continue; // scrolls or is clipped inside its own box
      out.doc.offenders.push(`${sel(el)} right=${Math.round(r.right)} (viewport ${vw})`);
    }
  }

  // 2. form controls under 16px (iOS Safari zooms on focus)
  const skipTypes = new Set(["checkbox", "radio", "range", "file", "hidden", "submit", "button", "reset", "image", "color"]);
  for (const el of document.querySelectorAll("input, select, textarea")) {
    if (el.tagName === "INPUT" && skipTypes.has(el.type)) continue;
    if (!visible(el) || inert(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 16) out.inputs.push(`${sel(el)} font-size ${fs}px`);
  }

  // modal root (a dialog or an open drawer): when present, the "covered" check only looks inside it
  const modal = Array.from(document.querySelectorAll("[role='dialog'], [aria-modal='true']")).find((m) => visible(m)) || null;

  // 5 + 6. tap targets and covered controls
  const interactive = Array.from(document.querySelectorAll("a[href], button, [role='button'], [role='tab'], [role='switch'], [role='menuitem'], [role='radio'], input:not([type='hidden']), select, textarea, summary"));
  for (const el of interactive) {
    if (!visible(el) || inert(el)) continue;
    if (modal && !modal.contains(el)) continue;
    const r0 = el.getBoundingClientRect();
    const inView = r0.bottom > 0 && r0.top < vh && r0.right > 0 && r0.left < vw;
    // a tap target is the control or the label wrapping it
    const box = (el.tagName === "INPUT" && (el.type === "checkbox" || el.type === "radio") && el.closest("label")) || el;
    const r = box.getBoundingClientRect();
    const inlineLink = el.tagName === "A" && getComputedStyle(el).display === "inline";
    const pseudo = getComputedStyle(el, "::after");
    const reach = pseudo.content !== "none" && pseudo.position === "absolute" ? Math.min(parseFloat(pseudo.width) || 0, parseFloat(pseudo.height) || 0) : 0;
    if (!inlineLink && inView && Math.max(reach, Math.min(r.width, r.height)) < 40) out.targets.push(`${sel(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    // clipped by its own scroll box (e.g. the rows of an inline list below the fold of that list) or scrolled under a sticky header: not a stacking problem
    const clippedByParent = (() => {
      const cxm = r0.left + r0.width / 2;
      const cym = r0.top + r0.height / 2;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const cs = getComputedStyle(p);
        if (/(auto|scroll|hidden|clip)/.test(cs.overflowY) || /(auto|scroll|hidden|clip)/.test(cs.overflowX)) {
          const pr = p.getBoundingClientRect();
          if (cxm < pr.left || cxm > pr.right || cym < pr.top || cym > pr.bottom) return true;
        }
      }
      return false;
    })();
    if (inView && !modal && !clippedByParent) {
      const cx = Math.min(Math.max(r0.left + r0.width / 2, 1), vw - 1);
      const cy = Math.min(Math.max(r0.top + r0.height / 2, 1), vh - 1);
      if (cx >= r0.left && cx <= r0.right && cy >= r0.top && cy <= r0.bottom) {
        const top = document.elementFromPoint(cx, cy);
        const underSticky = (() => { for (let p = top; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if ((pos === "sticky" || pos === "fixed") && r0.top < p.getBoundingClientRect().bottom - 1 && r0.top < 80) return true; } return false; })();
        const popover = underSticky || el.getAttribute("aria-expanded") === "true" || top?.closest("[role='listbox'], [role='menu'], [role='dialog']"); // an open menu sitting over its own trigger is intended
        if (top && !popover && top !== el && !el.contains(top) && !top.contains(el) && !top.closest("label")?.contains(el) && !inert(top) && getComputedStyle(top).pointerEvents !== "none") {
          out.covered.push(`${sel(el)} is covered by ${sel(top)}`);
        }
      }
    }
  }
  // 4. clipped text (overflow hidden without an ellipsis)
  for (const el of Array.from(document.querySelectorAll("body *")).slice(0, 4000)) {
    if (out.clipped.length >= 12) break;
    if (!visible(el) || inert(el)) continue;
    const cs = getComputedStyle(el);
    if (!/(hidden|clip)/.test(cs.overflowX) || cs.textOverflow === "ellipsis") continue;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim());
    if (hasText && el.scrollWidth > el.clientWidth + 2) out.clipped.push(`${sel(el)} scrollWidth ${el.scrollWidth} > ${el.clientWidth}`);
  }

  // 6. fixed / sticky layers covering each other
  const layers = Array.from(document.querySelectorAll("body *")).filter((el) => {
    const p = getComputedStyle(el).position;
    return (p === "fixed" || p === "sticky") && el.tagName !== "TH" && visible(el) && !inert(el);
  }).slice(0, 40);
  for (let i = 0; i < layers.length; i++) {
    for (let j = i + 1; j < layers.length; j++) {
      const a = layers[i];
      const b = layers[j];
      if (a.contains(b) || b.contains(a)) continue;
      if (modal && (modal.contains(a) || modal.contains(b) || a.contains(modal) || b.contains(modal))) continue; // the open dialog / drawer (and its dim wrapper) is meant to cover the page
      if (a.getAttribute("aria-hidden") === "true" || b.getAttribute("aria-hidden") === "true") continue; // the dim layer behind a dialog / drawer
      const ra = a.getBoundingClientRect();
      const rb = b.getBoundingClientRect();
      const w = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
      const h = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
      if (w > 6 && h > 6 && !(ra.bottom <= 0 || rb.bottom <= 0) && !(ra.top >= vh || rb.top >= vh)) out.fixedOverlap.push(`${sel(a)} overlaps ${sel(b)} (${Math.round(w)}x${Math.round(h)})`);
    }
  }

  // 9. dialogs: inside the viewport, scrollable when taller than the screen, page scroll locked
  for (const d of document.querySelectorAll("[role='dialog']")) {
    if (!visible(d)) continue;
    const r = d.getBoundingClientRect();
    const problems = [];
    if (r.left < -1 || r.right > vw + 1) problems.push(`outside the viewport horizontally (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
    if (r.top < -1) problems.push(`starts above the screen (${Math.round(r.top)})`);
    if (r.bottom > vh + 1) {
      const scrollable = [d, ...d.querySelectorAll("*")].some((x) => /(auto|scroll)/.test(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight);
      const pageScroll = r.height <= vh + 1;
      if (!scrollable && !pageScroll) problems.push(`taller than the screen (${Math.round(r.height)} > ${vh}) and not scrollable`);
    }
    const lock = getComputedStyle(document.body).overflow === "hidden" || getComputedStyle(document.documentElement).overflow === "hidden" || getComputedStyle(document.body).position === "fixed";
    if (!lock) problems.push("page scroll is not locked while the dialog is open");
    if (problems.length) out.dialogs.push(`${sel(d)}: ${problems.join("; ")}`);
  }

  // 11. images without reserved space
  for (const img of document.querySelectorAll("img")) {
    if (!visible(img) || inert(img)) continue;
    const hasDims = (img.getAttribute("width") && img.getAttribute("height")) || getComputedStyle(img).aspectRatio !== "auto" || img.closest("[class*='aspect-']");
    if (!hasDims) out.images.push(sel(img));
  }
  out.misc.themeColor = Array.from(document.querySelectorAll('meta[name="theme-color"]')).map((m) => `${m.getAttribute("media") ?? "all"}:${m.getAttribute("content")}`);
  out.misc.textSizeAdjust = getComputedStyle(document.documentElement).getPropertyValue("-webkit-text-size-adjust") || getComputedStyle(document.documentElement).getPropertyValue("text-size-adjust") || "";

  // 12. keyboard attributes of the main fields
  for (const el of document.querySelectorAll("input, textarea")) {
    if (!visible(el) || inert(el) || (el.tagName === "INPUT" && skipTypes.has(el.type))) continue;
    const id = `${el.name} ${el.id} ${el.placeholder} ${el.getAttribute("aria-label") ?? ""}`.toLowerCase();
    if (el.type === "search" || /^\s*cari\b/i.test(el.placeholder ?? "")) continue; // search boxes take free text
    const attr = (n) => (el.getAttribute(n) ?? "").toLowerCase();
    const issues = [];
    if (el.type === "password" && !/password|^off$/.test(attr("autocomplete"))) issues.push("password without autocomplete (current-password / new-password)");
    if (el.type === "text" && /nama_pengguna|username|nama pengguna/.test(id)) {
      if (attr("autocomplete") !== "username") issues.push("username without autocomplete=username");
      if (attr("autocapitalize") !== "none") issues.push("username without autocapitalize=none");
    }
    if (/email/.test(id) && !/https?:/.test(id) && el.type !== "email" && attr("inputmode") !== "email") issues.push("email field is not type=email");
    if (el.tagName === "INPUT" && el.type === "text" && /jumlah|quantity|qty|nominal|amount/.test(id) && !/numeric|decimal/.test(attr("inputmode"))) issues.push("amount field without inputmode=numeric");
    if (el.tagName === "INPUT" && /(^|\s)(link|url|tautan)\b|tempel link/.test(id) && attr("autocapitalize") !== "none") issues.push("link field without autocapitalize=none");
    if (issues.length) out.kbd.push(`${sel(el)}: ${issues.join(", ")}`);
  }
  return out;
}
