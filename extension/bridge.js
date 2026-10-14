// Clean Chat bridge: runs only on the Claude Code reader page (http://127.0.0.1:8379, served by cc_reader.py on this
// computer, never a site on the web). It does two small things:
//   1. lets the reader page's "save" button keep a question and answer in the extension's saved list, exactly as
//      "save" does on a chat site, with the same one-note-per-thing rule;
//   2. tells the page which extension it is (its id), so the reader may answer questions asked from the saved page.
// It reads nothing from the page on its own: the page has to post a note to it, and only the page itself can.
(() => {
  "use strict";
  if (!/^(127\.0\.0\.1|localhost)$/.test(location.hostname) || window.top !== window) return;
  const store = {
    async get(key) { try { if (globalThis.chrome?.storage?.local) { const r = await chrome.storage.local.get(key); return r[key] || null; } return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
    async set(key, val) { try { if (globalThis.chrome?.storage?.local) return await chrome.storage.local.set({ [key]: val }); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn("storage failed", e); } },
  };
  // the same rules as content.js: the same words again is "already saved"; the same question in the same session
  // whose answer has grown updates the note that is there instead of adding a second one
  const plain = t => String(t || "").replace(/^You said:?\s*/i, "").replace(/\]\([^)]*\)/g, "]").replace(/[*_`#>=]+/g, "").replace(/\s+/g, " ").trim();
  const noteKey = x => `${x.kind || ""}\n${plain(x.question)}\n${plain(x.answer)}`;
  const firstPara = t => String(t || "").split(/\n\s*\n/)[0];
  const sameNote = (x, y) => (x.session || "") === (y.session || "") && x.kind === y.kind && plain(x.question) === plain(y.question) &&
    (x.kind === "turn" || (() => { const a = plain(x.answer), b = plain(y.answer), fa = plain(firstPara(x.answer)), fb = plain(firstPara(y.answer)); return !!a && !!b && (a.startsWith(b) || b.startsWith(a) || (Math.min(fa.length, fb.length) >= 20 && (fa.startsWith(fb) || fb.startsWith(fa)))); })());
  const str = (v, n) => String(v == null ? "" : v).slice(0, n);
  const ID = (globalThis.chrome?.runtime?.id) || "local";
  document.documentElement.dataset.ccBridge = ID;          // the page shows its "save" buttons when it sees this

  window.addEventListener("message", async e => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.type !== "cleanchat:save") return;
    const n = e.data.note || {}; const rid = str(e.data.rid, 40);
    const reply = r => window.postMessage(Object.assign({ type: "cleanchat:saved", rid }, r), location.origin);
    const payload = { site: "claude-code", url: "", title: str(n.title, 300), t: Date.now(), kind: /^(turn|section|paragraph)$/.test(n.kind) ? n.kind : "paragraph",
      question: str(n.question, 20000), answer: str(n.answer, 200000), session: str(n.session, 80), project: str(n.project, 400), qv: 2 };
    if (!payload.answer.trim() && !payload.question.trim()) return reply({ status: "empty" });
    const saved = (await store.get("cc:saved")) || [];
    if (saved.find(x => noteKey(x) === noteKey(payload))) return reply({ status: "already", count: saved.length });
    const grown = saved.find(x => sameNote(x, payload));
    if (grown) { Object.assign(grown, { answer: payload.answer, title: payload.title, updated: payload.t, qv: 2 }); await store.set("cc:saved", saved); return reply({ status: "updated", count: saved.length }); }
    saved.unshift(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), highlights: [], note: "" }, payload));
    await store.set("cc:saved", saved);
    reply({ status: "saved", count: saved.length });
  });
  // a page that was already running when this script arrived (an extension reload) learns about it this way
  window.postMessage({ type: "cleanchat:bridge", id: ID }, location.origin);
})();
