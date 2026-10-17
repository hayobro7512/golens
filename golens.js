// GoLens: lets Superhuman Go's "While writing" agents read and underline text that is not editable.
// Go only scans text fields it sees focused during a real click. GoLens finds the regions you care about, makes them
// editable (locked so the page text never changes), and focuses them one after another inside one click.
// Usage (content script or page script):  const lens = GoLens.start({ keywords: /refund|price|warranty/i });
(function (root) {
  const ISLANDS = "a,button,input,select,textarea,label,img,svg,video,audio,canvas,iframe,[role=button],[role=link],[role=tab],[role=menuitem],summary";
  const NO_REGION = "input:not([type=hidden]),textarea,select,iframe,video,canvas,[contenteditable]";
  const SKIP_TEXT = /^(SCRIPT|STYLE|NOSCRIPT|TEMPLATE|OPTION|SELECT|TEXTAREA)$/;

  function start(opts = {}) {
    const o = Object.assign({
      keywords: null,     // RegExp: text that makes a region worth sending to Go. Required unless `find` is given.
      find: null,         // () => Element[]: your own picker (e.g. document.querySelectorAll(".terms")). Beats `keywords`.
      score: null,        // (text) => number: rank regions; regions scoring 0 are skipped. Default: 1 per keyword match.
      maxRegions: 8,      // regions scanned per click
      gapMs: 1200,        // pause between regions (Go keeps only the last field focused in one task; 1.2 s worked)
      minChars: 40,       // ignore shorter regions
      maxChars: 2500,     // climb to a container this big at most
      minFieldPx: 40,     // Go ignores fields shorter than this (tested: 24 px ignored, 40 px scanned)
      lock: true,         // block edits and undo any that get through (accepted suggestions)
      scanOn: ["click", "keydown"], // gestures that trigger the scan
      onScan: null,       // (regions) => void, after the first region is focused
    }, opts);
    if (!o.find && !o.keywords) throw new Error("GoLens: pass `keywords` or `find`.");

    const seen = new WeakSet(), queue = [];
    let lastGesture = 0, armed = false, stopped = false;
    const timers = new Set();
    const score = o.score || ((t) => (o.keywords.test(t) ? 1 : 0));

    function candidates() {
      if (o.find) return o.find();
      const cands = new Set(), w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let hits = 0;
      while (w.nextNode() && hits < 100) {
        const n = w.currentNode, p = n.parentElement;
        if (!p || SKIP_TEXT.test(p.tagName) || !o.keywords.test(n.nodeValue)) continue;
        hits++;
        let r = p; // climb to the biggest container that has no form controls (a search box makes it off limits)
        while (r.parentElement && r.parentElement !== document.body && r.parentElement.innerText.length < o.maxChars && !r.parentElement.querySelector(NO_REGION)) r = r.parentElement;
        cands.add(r);
      }
      return [...cands];
    }

    function findRegions() {
      const ok = candidates().filter((r) => !seen.has(r) && r.checkVisibility?.() !== false && !r.closest("[contenteditable],select,textarea")
        && !r.querySelector(NO_REGION) && (r.innerText || "").trim().length >= o.minChars);
      return ok
        .filter((r) => !ok.some((x) => x !== r && x.contains(r))) // keep the outermost
        .map((r) => ({ r, s: score(r.innerText) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, o.maxRegions)
        .map((x) => x.r);
    }

    // Pad short regions up to minFieldPx without moving the text: translate it back, then cancel any layout shift.
    function pad(b) {
      if (getComputedStyle(b).display === "inline") b.style.display = "inline-block";
      const h = b.getBoundingClientRect().height;
      if (h >= o.minFieldPx) return;
      const p = Math.ceil((o.minFieldPx - h) / 2);
      const probe = () => { const n = b.nextElementSibling; return n ? n.getBoundingClientRect().top : b.parentElement.getBoundingClientRect().height; };
      const before = probe();
      b.style.paddingTop = b.style.paddingBottom = p + "px";
      b.style.translate = `0 -${p}px`;
      for (let i = 0; i < 4; i++) { // margins collapse, so measure instead of guessing
        const shift = probe() - before;
        if (Math.abs(shift) < 0.5) break;
        b.style.marginBottom = parseFloat(getComputedStyle(b).marginBottom) - shift + "px";
      }
    }

    // Edits are blocked as attempted; any that land within 800 ms of a gesture are reverted. A change with no gesture
    // just before it is the page itself (a countdown) and is left alone.
    function lock(r) {
      for (const ev of ["beforeinput", "paste", "drop", "cut"]) r.addEventListener(ev, (e) => e.preventDefault(), true);
      const cfg = { subtree: true, characterData: true, characterDataOldValue: true, childList: true };
      const guard = new MutationObserver((records) => {
        if (Date.now() - lastGesture > 800) return;
        guard.disconnect();
        for (const rec of records.reverse()) {
          if (rec.type === "characterData") rec.target.nodeValue = rec.oldValue;
          else {
            for (const n of rec.addedNodes) if (n.parentNode === rec.target) rec.target.removeChild(n);
            for (const n of rec.removedNodes) rec.target.insertBefore(n, rec.nextSibling?.parentNode === rec.target ? rec.nextSibling : null);
          }
        }
        guard.observe(r, cfg);
      });
      guard.observe(r, cfg);
    }

    function activate(r) {
      pad(r);
      for (const e of r.querySelectorAll(ISLANDS)) if (!e.hasAttribute("contenteditable")) { e.setAttribute("contenteditable", "false"); e.setAttribute("data-golens-island", ""); } // links and buttons keep working
      r.setAttribute("data-golens", "");
      r.setAttribute("contenteditable", "true");
      r.spellcheck = false;
      if (o.lock) lock(r);
      r.focus({ preventScroll: true });
    }

    function onGesture(e) {
      if (stopped || e.target.closest?.("input,textarea,select") || e.target.isContentEditable) return; // never steal focus from a field
      const batch = queue.splice(0).filter((r) => r.isConnected);
      if (!batch.length) return;
      batch.forEach((r, i) => {
        if (i === 0) activate(r);
        else { const t = setTimeout(() => { timers.delete(t); if (r.isConnected && !stopped) activate(r); }, i * o.gapMs); timers.add(t); }
      });
      o.onScan?.(batch);
    }

    function rescan() { // call after the page changes; the next click scans anything new
      const found = findRegions();
      for (const r of found) { seen.add(r); queue.push(r); }
      if (queue.length && !armed) {
        armed = true;
        for (const ev of ["pointerup", "click", "keydown"]) addEventListener(ev, () => { lastGesture = Date.now(); }, true);
        for (const ev of o.scanOn) addEventListener(ev, onGesture, true);
      }
      return found;
    }

    rescan();
    return {
      rescan,
      get pending() { return queue.length; },
      stop() { stopped = true; timers.forEach(clearTimeout); }, // listeners stay but do nothing
    };
  }

  const api = { start };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.GoLens = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
