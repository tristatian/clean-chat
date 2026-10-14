// The saved page: two collections kept inside the extension, on this computer only.
//   Saved   — questions and answers kept with "save", with your notes and highlights on top.
//   Journal — free-standing entries of your own, not attached to any saved answer.
// Both can be pinned, tagged, searched, exported and backed up.
(() => {
  "use strict";
  const $ = s => document.querySelector(s);
  const store = {
    async get(key) { try { if (globalThis.chrome?.storage?.local) { const r = await chrome.storage.local.get(key); return r[key] || null; } return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; } },
    async set(key, val) { try { if (globalThis.chrome?.storage?.local) return await chrome.storage.local.set({ [key]: val }); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { console.warn("storage failed", e); toast("Couldn't save: storage is full or unavailable"); } },
  };
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const siteName = { "claude.ai": "Claude", "gemini.google.com": "Gemini", "chatgpt.com": "ChatGPT", "chat.openai.com": "ChatGPT", "grok.com": "Grok", "claude-code": "Claude Code",
    "chat.deepseek.com": "DeepSeek", "doubao.com": "Doubao", "kimi.com": "Kimi", "chat.qwen.ai": "Qwen", "tongyi.com": "Qwen (通义)", "yuanbao.tencent.com": "Yuanbao", "chat.z.ai": "Z.ai", "chatglm.cn": "ChatGLM",
    "yiyan.baidu.com": "Yiyan", "chat.minimax.io": "MiniMax", "perplexity.ai": "Perplexity", "copilot.microsoft.com": "Copilot", "chat.mistral.ai": "Le Chat", "meta.ai": "Meta AI" };
  const when = t => { const d = new Date(t); return d.toLocaleDateString(undefined, { day: "numeric", month: "short", year: d.getFullYear() === new Date().getFullYear() ? undefined : "numeric" }); };
  const whenLong = t => new Date(t).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const firstLine = s => (String(s || "").split("\n").find(l => l.trim()) || "").replace(/^#+\s*/, "").trim().slice(0, 140);
  const words = s => (String(s || "").trim().match(/\S+/g) || []).length;

  // ------------------------------------------------------------ markdown, for saved answers
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)/g, "<em>$1</em>");
    s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function render(md) {
    const lines = String(md || "").split("\n"); const out = []; let i = 0;
    const isItem = l => l.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/);
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*```/.test(l)) { const code = []; i++; while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]); i++; out.push(`<pre><code>${esc(code.join("\n"))}</code></pre>`); continue; }
      const h = l.match(/^\s*(#{1,6})\s+(.*)$/);
      if (h) { out.push(h[1].length <= 2 ? `<h2>${inline(h[2])}</h2>` : `<h3>${inline(h[2])}</h3>`); i++; continue; }
      const li = isItem(l);
      if (li) {
        const ordered = !!li[1]; const items = [];
        while (i < lines.length) {
          const m = isItem(lines[i]); if (!m || !!m[1] !== ordered) break;
          items.push(`<li>${inline(m[2])}</li>`); i++;
          let j = i; while (j < lines.length && !lines[j].trim()) j++;          // items may be separated by blank lines
          const nxt = j < lines.length && isItem(lines[j]); if (nxt && !!nxt[1] === ordered) i = j;
        }
        out.push(`<${ordered ? "ol" : "ul"}>${items.join("")}</${ordered ? "ol" : "ul"}>`); continue;
      }
      if (/^\s*>\s?/.test(l)) { const q = []; while (i < lines.length && /^\s*>\s?/.test(lines[i])) q.push(lines[i++].replace(/^\s*>\s?/, "")); out.push(`<blockquote>${inline(q.join(" "))}</blockquote>`); continue; }
      if (/^\s*\|/.test(l)) {
        const rows = []; while (i < lines.length && /^\s*\|/.test(lines[i])) { if (!/^\s*\|\s*:?-{2,}/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim())); i++; }
        if (rows.length) out.push(`<table>${rows.map((r, ri) => `<tr>${r.map(c => ri === 0 ? `<th>${inline(c)}</th>` : `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</table>`);
        continue;
      }
      if (!l.trim()) { i++; continue; }
      const para = [l]; i++;
      while (i < lines.length && lines[i].trim() && !/^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|```|>|\|)/.test(lines[i])) para.push(lines[i++]);
      out.push(`<p>${inline(para.join(" "))}</p>`);
    }
    return out.join("\n");
  }

  // ------------------------------------------------------------ state
  const KEY = { saved: "cc:saved", journal: "cc:journal" };
  const data = { saved: [], journal: [] };
  const active = { saved: null, journal: null };
  let mode = "saved", query = "", filter = "all", selfWrite = 0;
  const coll = () => data[mode];
  const current = () => coll().find(x => x.id === active[mode]) || null;
  async function persist(which = mode) { selfWrite = Date.now(); await store.set(KEY[which], data[which]); showUsage(); }

  const titleOf = (x, m = mode) => m === "saved" ? (x.label || x.question || "(no question)") : (firstLine(x.body) || "Untitled entry");
  const haystack = x => mode === "saved"
    ? [x.label, x.question, x.answer, x.title, x.note, ...(x.tags || []), ...(x.highlights || []).map(h => h.q + " " + (h.note || "")), ...(x.thread || []).flatMap(f => [f.q, f.a])].join(" ")
    : [x.body, ...(x.tags || [])].join(" ");
  const allTags = () => [...new Set(coll().flatMap(x => x.tags || []))].sort((a, b) => a.localeCompare(b));
  function visible() {
    let v = coll();
    if (filter === "pinned") v = v.filter(x => x.pinned);
    else if (filter.startsWith("tag:")) v = v.filter(x => (x.tags || []).includes(filter.slice(4)));
    const q = query.trim().toLowerCase(); if (q) v = v.filter(x => haystack(x).toLowerCase().includes(q));
    return [...v].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (b.t - a.t));   // pinned first, then newest
  }
  const annotated = x => !!((x.note || "").trim() || (x.highlights || []).length || (x.thread || []).length);

  // ------------------------------------------------------------ export
  function toMarkdown(x, m = mode) {
    const tags = (x.tags || []).length ? `Tags: ${x.tags.map(t => "#" + t).join(" ")}\n\n` : "";
    if (m === "journal") return `## ${titleOf(x, "journal")}\n\n${whenLong(x.t)}\n\n${tags}${x.body || ""}\n`;
    let md = `## ${titleOf(x, "saved")}\n\n${siteName[x.site] || x.site} · ${when(x.t)}${x.url ? ` · ${x.url}` : ""}\n\n${tags}`;
    if (x.label && x.label !== x.question) md += `Asked: ${x.question}\n\n`;
    if ((x.note || "").trim()) md += `**My notes**\n\n${x.note.trim()}\n\n`;
    md += `${x.answer || ""}\n`;
    const hl = (x.highlights || []).filter(h => h.q);
    if (hl.length) md += `\n**Highlights**\n\n${hl.map(h => `- "${h.q}"${(h.note || "").trim() ? ` — ${h.note.trim()}` : ""}`).join("\n")}\n`;
    if ((x.thread || []).length) md += `\n**Asked further**\n\n${x.thread.map(f => `**Q:** ${f.q}\n\n${f.a}`).join("\n\n")}\n`;
    return md;
  }

  // ------------------------------------------------------------ chrome: tabs, filters, list
  function renderChrome() {
    $("#tabSaved").setAttribute("aria-selected", String(mode === "saved")); $("#tabJournal").setAttribute("aria-selected", String(mode === "journal"));
    $("#nSaved").textContent = data.saved.length; $("#nJournal").textContent = data.journal.length;
    $("#newEntry").hidden = mode !== "journal";
    $("#search").placeholder = mode === "saved" ? "Search saved answers, your notes, tags" : "Search your journal";
    document.title = `${mode === "saved" ? "Saved" : "Journal"} (${coll().length}) · Clean Chat`;
    const tags = allTags(); const pinned = coll().filter(x => x.pinned).length;
    if (filter.startsWith("tag:") && !tags.includes(filter.slice(4))) filter = "all";
    const chip = (id, label) => `<button class="chip" data-f="${esc(id)}" aria-pressed="${filter === id}">${esc(label)}</button>`;
    $("#filters").innerHTML = chip("all", `All ${coll().length}`) + (pinned ? chip("pinned", `Pinned ${pinned}`) : "") + tags.map(t => chip("tag:" + t, "#" + t)).join("");
    $("#filters").hidden = !coll().length;
  }
  function renderList() {
    const list = $("#list"); const vis = visible();
    if (!coll().length) {
      list.innerHTML = mode === "saved"
        ? '<div class="empty">Nothing saved yet.<br><br>On any supported chat site (Claude, Gemini, ChatGPT, Grok, DeepSeek, Kimi, Qwen and others), hover your own message (or a paragraph of a reply) and click <b>save</b>, or press <b>s</b>. It will appear here, with the answer, for as long as you want it.</div>'
        : '<div class="empty">Your journal is empty.<br><br>Click <b>New entry</b> and write. Entries are your own, not attached to any saved answer, and stay on this computer.</div>';
      return;
    }
    if (!vis.length) { list.innerHTML = '<div class="empty">Nothing matches.</div>'; return; }
    list.innerHTML = vis.map(x => {
      const meta = mode === "saved"
        ? `${esc(siteName[x.site] || x.site)} · ${esc(when(x.t))}${x.kind === "paragraph" ? " · paragraph" : x.kind === "section" ? " · section" : ""}${annotated(x) ? " · ✎" : ""}`
        : `${esc(when(x.t))} · ${words(x.body)} word${words(x.body) === 1 ? "" : "s"}`;
      return `<button class="item${x.id === active[mode] ? " active" : ""}${x.pinned ? " pinned" : ""}" data-id="${esc(x.id)}"><div class="q">${esc(titleOf(x))}</div><div class="m">${x.pinned ? '<span class="pin">Pinned</span> · ' : ""}${meta}</div>${(x.tags || []).length ? `<div class="t">${x.tags.map(t => `<span>#${esc(t)}</span>`).join("")}</div>` : ""}</button>`;
    }).join("");
  }
  const tagRow = x => `<div class="tagrow">${(x.tags || []).map(t => `<span class="tag">#${esc(t)}<button data-untag="${esc(t)}" title="Remove this tag" aria-label="Remove tag ${esc(t)}">×</button></span>`).join("")}<input class="tag-input" id="tagInput" placeholder="add a tag" list="tagList" autocomplete="off"><datalist id="tagList">${allTags().filter(t => !(x.tags || []).includes(t)).map(t => `<option value="${esc(t)}">`).join("")}</datalist></div>`;
  function wireCommon(x) {
    $("#pinBtn").addEventListener("click", () => { x.pinned = !x.pinned; persist(); refresh(); toast(x.pinned ? "Pinned to the top" : "Unpinned"); });
    $("#copyOne").addEventListener("click", () => copy(toMarkdown(x), "Copied as markdown"));
    confirmClick($("#removeOne"), async () => {
      const vis = visible(); const i = vis.findIndex(y => y.id === x.id);
      data[mode] = coll().filter(y => y.id !== x.id); await persist();
      const next = visible(); active[mode] = (next[Math.min(i, next.length - 1)] || {}).id || null; refresh(); toast("Removed");
    });
    $("#back")?.addEventListener("click", () => { active[mode] = null; refresh(); });
    const ti = $("#tagInput");
    ti.addEventListener("keydown", e => {
      if (e.key !== "Enter" && e.key !== ",") return; e.preventDefault();
      const t = ti.value.trim().replace(/^#+/, "").replace(/\s+/g, "-").toLowerCase(); if (!t) return;
      x.tags = x.tags || []; if (!x.tags.includes(t)) x.tags.push(t);
      persist(); refresh(); $("#tagInput")?.focus();
    });
    document.querySelectorAll("#detail [data-untag]").forEach(b => b.addEventListener("click", () => { x.tags = (x.tags || []).filter(t => t !== b.dataset.untag); persist(); refresh(); }));
  }
  // destructive buttons ask once more, in place
  function confirmClick(btn, fn) {
    let armed = false, t;
    btn.addEventListener("click", () => {
      if (armed) { clearTimeout(t); fn(); return; }
      armed = true; const label = btn.textContent; btn.textContent = "click again to remove"; btn.classList.add("warn");
      t = setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove("warn"); }, 3000);
    });
  }

  // ------------------------------------------------------------ detail: a saved answer
  function renderSaved(x) {
    $("#detail").innerHTML = `<div class="column">
      <button class="barbtn back" id="back">← all saved</button>
      <h1 id="title">${esc(titleOf(x))}</h1>
      <div class="meta"><span class="kind">${esc(siteName[x.site] || x.site)}</span><span>${esc(x.title || "")}</span><span>${esc(when(x.t))}</span>${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">open the conversation</a>` : ""}${x.label && x.label !== x.question ? `<span title="${esc(x.question)}">asked: ${esc(x.question.slice(0, 70))}${x.question.length > 70 ? "…" : ""}</span>` : ""}</div>
      <div class="acts"><button class="barbtn${x.pinned ? " on" : ""}" id="pinBtn">${x.pinned ? "pinned" : "pin"}</button><button class="barbtn" id="renameBtn">rename</button><button class="barbtn" id="copyOne">copy as markdown</button><button class="barbtn" id="removeOne">remove</button></div>
      ${tagRow(x)}
      <section class="notes"><div class="label">Your notes</div><textarea id="noteBox" rows="2" placeholder="Your own notes and reflections on this answer. Saved as you type.">${esc(x.note || "")}</textarea></section>
      <article>${render(x.answer)}</article>
      <p class="empty" style="padding:18px 0 0">Select any phrase in the answer to highlight it, or to highlight it and attach a note. Select highlighted text again to remove the highlight; click it to edit its note.</p>
      ${followupsHtml(x)}
    </div>`;
    applyHighlights($("#detail article"), x);
    wireCommon(x); wireFollowups(x);
    const nb = $("#noteBox"); const grow = () => { nb.style.height = "auto"; nb.style.height = Math.max(64, nb.scrollHeight + 2) + "px"; }; grow();
    let nt; nb.addEventListener("input", () => { x.note = nb.value; grow(); clearTimeout(nt); nt = setTimeout(() => { persist(); renderList(); }, 400); });
    $("#renameBtn").addEventListener("click", () => {
      const h1 = $("#title"); const before = titleOf(x);
      h1.contentEditable = "true"; h1.focus(); document.getSelection().selectAllChildren(h1);
      let finished = false;
      const done = keep => {
        if (finished) return; finished = true;                       // Enter and blur can both fire; act once
        h1.contentEditable = "false"; h1.removeEventListener("blur", onBlur); h1.removeEventListener("keydown", onKey);
        const v = h1.textContent.replace(/\s+/g, " ").trim();
        if (keep && v && v !== before) { if (v === x.question) delete x.label; else x.label = v; persist(); refresh(); toast("Renamed"); } else h1.textContent = before;
      };
      const onBlur = () => done(true);
      const onKey = e => { if (e.key === "Enter") { e.preventDefault(); done(true); } if (e.key === "Escape") { e.preventDefault(); done(false); } };
      h1.addEventListener("blur", onBlur); h1.addEventListener("keydown", onKey);
    });
  }

  // ------------------------------------------------------------ detail: a journal entry
  function renderJournal(x) {
    $("#detail").innerHTML = `<div class="column">
      <button class="barbtn back" id="back">← all entries</button>
      <div class="meta"><span class="kind">Journal</span><span>${esc(whenLong(x.t))}</span>${x.updated && x.updated - x.t > 60000 ? `<span>edited ${esc(when(x.updated))}</span>` : ""}<span id="wc">${words(x.body)} words</span></div>
      <div class="acts"><button class="barbtn${x.pinned ? " on" : ""}" id="pinBtn">${x.pinned ? "pinned" : "pin"}</button><button class="barbtn" id="copyOne">copy as markdown</button><button class="barbtn" id="removeOne">delete entry</button></div>
      ${tagRow(x)}
      <textarea class="entry" id="entryBox" placeholder="Write. The first line becomes the title. Saved as you type.">${esc(x.body || "")}</textarea>
    </div>`;
    wireCommon(x);
    const box = $("#entryBox"); const grow = () => { box.style.height = "auto"; box.style.height = Math.max(window.innerHeight * 0.55, box.scrollHeight + 4) + "px"; }; grow();
    let t; box.addEventListener("input", () => { x.body = box.value; x.updated = Date.now(); grow(); $("#wc").textContent = `${words(x.body)} words`; clearTimeout(t); t = setTimeout(() => { persist("journal"); renderList(); renderChrome(); }, 400); });
  }
  function newEntry() {
    mode = "journal"; filter = "all"; query = ""; $("#search").value = "";
    let e = data.journal.find(x => !(x.body || "").trim());                     // reuse an empty one rather than piling them up
    if (!e) { e = { id: newId(), t: Date.now(), updated: Date.now(), body: "", tags: [], pinned: false }; data.journal.unshift(e); persist("journal"); }
    active.journal = e.id; refresh(); $("#entryBox")?.focus();
  }

  function renderDetail() {
    const x = current(); $("#layout").classList.toggle("showing", !!x);
    if (!x) { $("#detail").innerHTML = `<div class="column"><div class="empty">${coll().length ? "Pick something on the left." : ""}</div></div>`; return; }
    (mode === "saved" ? renderSaved : renderJournal)(x);
  }
  function refresh() { renderChrome(); renderList(); renderDetail(); }

  // ------------------------------------------------------------ highlights on a saved answer, each with an optional note
  function textNodesOf(root) { const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); const out = []; let n; while ((n = w.nextNode())) if (!n.parentElement.closest(".hl-edit")) out.push(n); return out; }
  // A highlight may run across bold, links, bullets or paragraphs, so it is drawn as one <mark> per stretch of text.
  // Positions ignore whitespace: a selection's text and the page's text nodes disagree about spaces and line breaks.
  const flatOf = s => s.replace(/\s+/g, "");
  let hlPos = [];      // where each drawn highlight sits in the answer's text: { idx, pos, len }
  function flatMap(article) { const map = []; let flat = ""; for (const t of textNodesOf(article)) { const d = t.data; for (let i = 0; i < d.length; i++) if (!/\s/.test(d[i])) { flat += d[i]; map.push([t, i]); } } return { flat, map }; }
  function locate(flat, h) {
    const q = flatOf(h.q || ""); if (!q) return -1;
    let pos = -1; for (let c = 0; c <= (h.n || 0); c++) { pos = flat.indexOf(q, pos + 1); if (pos < 0) break; }
    return pos < 0 ? flat.indexOf(q) : pos;
  }
  // how many non-space characters of the answer come before a point in it
  function flatBefore(art, node, off) {
    const pre = document.createRange(); pre.selectNodeContents(art); pre.setEnd(node, off); let n = 0;
    for (const t of textNodesOf(art)) {
      if (t === node) { n += flatOf(t.data.slice(0, off)).length; break; }
      if (pre.comparePoint(t, t.data.length) > 0) break;
      n += flatOf(t.data).length;
    }
    return n;
  }
  // the same stretch highlighted twice is one highlight: keep the first, and carry over a note if only the later one has it
  function tidyHighlights(article, x) {
    if (!(x.highlights || []).length) return;
    const { flat } = flatMap(article); const seen = {}; const keep = [];
    x.highlights.forEach(h => {
      const pos = locate(flat, h); const noted = !!(h.note || "").trim();
      if (pos < 0) { if (noted) keep.push(h); return; }            // cannot be drawn: kept only if it carries a note
      const k = pos + ":" + flatOf(h.q).length;
      if (seen[k]) { if (noted && !(seen[k].note || "").trim()) seen[k].note = h.note; return; }
      seen[k] = h; keep.push(h);
    });
    if (keep.length !== x.highlights.length) { x.highlights = keep; persist(); }
  }
  function applyHighlights(article, x) {
    tidyHighlights(article, x); hlPos = [];
    (x.highlights || []).forEach((h, idx) => {
      const { flat, map } = flatMap(article);
      const pos = locate(flat, h); if (pos < 0) return; const len = flatOf(h.q).length;
      hlPos.push({ idx, pos, len });
      const segs = []; let cur = null;
      for (let k = pos; k < pos + len; k++) { const [node, off] = map[k]; if (cur && cur.node === node) cur.end = off + 1; else segs.push(cur = { node, start: off, end: off + 1 }); }
      segs.forEach(g => {
        const r = document.createRange(); r.setStart(g.node, g.start); r.setEnd(g.node, g.end);
        const m = document.createElement("mark"); m.className = "hl" + ((h.note || "").trim() ? " noted" : ""); m.dataset.i = idx; m.title = (h.note || "").trim() || "Click to add a note. Select it again to remove the highlight.";
        try { r.surroundContents(m); } catch (e) { /* leave this stretch unmarked */ }
      });
    });
  }
  function openHlEditor(idx) {
    const x = current(); if (mode !== "saved" || !x || !x.highlights || !x.highlights[idx]) return;
    const h = x.highlights[idx]; const art = $("#detail article");
    $("#detail .hl-edit")?.remove();
    const m = art.querySelector(`mark.hl[data-i="${idx}"]`);
    const host = m ? (m.closest("li, p, h2, h3, blockquote, pre, table") || art) : art;
    const ed = document.createElement("div"); ed.className = "hl-edit";
    ed.innerHTML = `<div class="label">Note on this highlight</div><div class="hl-q">“${esc(h.q)}”</div><textarea placeholder="Why this matters, what it reminds you of, what to check…"></textarea><div class="acts"><button class="barbtn" data-act="done">done</button><button class="barbtn" data-act="unhl">remove highlight</button></div>`;
    host.insertAdjacentElement("afterend", ed);
    const ta = ed.querySelector("textarea"); ta.value = h.note || ""; ta.focus();
    let t; ta.addEventListener("input", () => { h.note = ta.value; clearTimeout(t); t = setTimeout(() => { persist(); renderList(); }, 400); if (m) { m.classList.toggle("noted", !!h.note.trim()); m.title = h.note.trim() || "Click to add a note or remove this highlight"; } });
    ed.querySelector('[data-act="done"]').addEventListener("click", () => { persist(); ed.remove(); });
    ed.querySelector('[data-act="unhl"]').addEventListener("click", () => { x.highlights.splice(idx, 1); persist(); refresh(); });
  }
  let pendingSel = null; const seltool = $("#seltool");
  const selBtn = act => seltool.querySelector(`[data-act="${act}"]`);
  document.addEventListener("mouseup", () => setTimeout(() => {
    const sel = getSelection(); const art = $("#detail article");
    if (mode !== "saved" || !art || !sel || sel.isCollapsed || !sel.rangeCount) { seltool.hidden = true; return; }
    const r = sel.getRangeAt(0); const q = sel.toString();
    if (!art.contains(r.commonAncestorContainer) || q.trim().length < 2 || q.length > 600) { seltool.hidden = true; return; }
    const rect = r.getBoundingClientRect();
    const a = flatBefore(art, r.startContainer, r.startOffset), b = flatBefore(art, r.endContainer, r.endOffset);
    const hits = hlPos.filter(p => a < p.pos + p.len && p.pos < b).map(p => p.idx);     // highlights this selection already touches
    pendingSel = { q, a, hits };
    // already highlighted: the only offer is to remove it, so the same text can never be highlighted twice
    selBtn("hl").style.display = selBtn("note").style.display = hits.length ? "none" : ""; selBtn("unhl").style.display = hits.length ? "" : "none";
    seltool.style.left = Math.max(110, Math.min(innerWidth - 110, rect.left + rect.width / 2)) + "px"; seltool.style.top = (rect.top + scrollY) + "px"; seltool.hidden = false;
  }, 0));
  document.addEventListener("mousedown", e => { if (!seltool.contains(e.target)) seltool.hidden = true; });
  seltool.addEventListener("click", e => {
    const b = e.target.closest("button"); const x = current(); if (!b || !pendingSel || !x) return;
    const sel = pendingSel; pendingSel = null; getSelection().removeAllRanges(); seltool.hidden = true;
    if (b.dataset.act === "unhl") {
      [...sel.hits].sort((p, q) => q - p).forEach(i => x.highlights.splice(i, 1));
      persist(); refresh(); toast(sel.hits.length > 1 ? "Highlights removed" : "Highlight removed"); return;
    }
    if (sel.hits.length) return;
    const { flat } = flatMap($("#detail article")); const q = flatOf(sel.q);
    let n = -1, pos = -1;
    do { pos = flat.indexOf(q, pos + 1); if (pos < 0) break; n++; } while (pos < sel.a);
    x.highlights = x.highlights || []; x.highlights.push({ q: sel.q, n: Math.max(0, n), note: "" });
    const idx = x.highlights.length - 1; persist(); refresh();
    if (b.dataset.act === "note") openHlEditor(idx); else toast("Highlighted");
  });
  $("#detail").addEventListener("click", e => { const m = e.target.closest("mark.hl"); if (m && getSelection().isCollapsed) openHlEditor(+m.dataset.i); });

  // ------------------------------------------------------------ asking further, through the Clean Chat reader on this computer
  // The reader (clean_chat/claude-code/cc_reader.py, started by Start Reader.command or /reader) answers from a local
  // server: a question from here is put to a fresh `claude -p` run that is given only this note, the follow-ups
  // already answered and the question. It is the Claude subscription that pays, about 20k tokens a time. The server
  // takes questions from this extension only once the reader page has been opened with the extension on.
  const READER_DEFAULT = "http://127.0.0.1:8379";
  let readerUrl = READER_DEFAULT;
  const followMeta = f => { const k = f.tokens || {}, total = (k.input || 0) + (k.cache_read || 0) + (k.cache_write || 0); return "Answered from this note only" + (total ? ` · read ${Math.round(total / 1000)}k tokens` : "") + (f.ms ? ` · ${Math.max(1, Math.round(f.ms / 1000))} s` : "") + (f.stopped ? " · stopped early" : ""); };
  const renderFollow = (f, i) => `<div class="follow"><div class="fq"><span class="who">You</span><span>${esc(f.q)}</span></div><div class="fa">${render(f.a)}</div><div class="fm"><span>${esc(followMeta(f))}</span><button data-unfollow="${i}" title="Remove this follow-up">remove</button></div></div>`;
  function followupsHtml(x) {
    return `<section class="followups"><div class="label">Ask further</div><div id="thread">${(x.thread || []).map(renderFollow).join("")}</div>
      <div class="askrow"><input id="askBox" placeholder="A question about this answer… Enter asks it" aria-label="Ask about this answer" autocomplete="off"><button class="barbtn primary" id="askBtn">Ask</button></div>
      <div class="askhint">Answered on this computer by the Clean Chat reader (Start Reader.command in the clean_chat folder, or /reader in Claude Code). Claude is given this note, the follow-ups above and your question, nothing else: about 20k tokens of your Claude subscription each time. The answer is kept with the note.</div></section>`;
  }
  function wireFollowups(x) {
    const box = $("#askBox"); const go = () => { const q = box.value.trim(); if (!q) return; box.value = ""; askFurther(x, q); };
    box.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); go(); } });
    $("#askBtn").addEventListener("click", go);
    $("#thread").addEventListener("click", e => { const b = e.target.closest("[data-unfollow]"); if (!b) return; x.thread.splice(+b.dataset.unfollow, 1); persist(); refresh(); toast("Follow-up removed"); });
  }
  async function readerStatus() { try { const r = await fetch(readerUrl + "/status", { cache: "no-store" }); return await r.json(); } catch { return null; } }
  async function askFurther(x, q) {
    const f = { q, a: "", t: Date.now() };
    const div = document.createElement("div"); div.className = "follow";
    div.innerHTML = `<div class="fq"><span class="who">You</span><span>${esc(q)}</span></div><div class="fa"><span class="thinking">Thinking…</span></div><div class="fm"><span></span><button data-stop>Stop</button></div>`;
    $("#thread").appendChild(div); div.scrollIntoView({ block: "nearest" });
    const target = div.querySelector(".fa"); const ctl = new AbortController();
    div.querySelector("[data-stop]").addEventListener("click", () => ctl.abort());
    let text = "";
    const keep = () => {
      f.a = text; x.thread = x.thread || []; x.thread.push(f); persist(); renderList();
      if (div.isConnected) div.outerHTML = renderFollow(f, x.thread.length - 1); else if (current() === x) renderDetail();
    };
    try {
      const res = await fetch(readerUrl + "/ask", { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", "X-CC-Ask": "1" },
        body: JSON.stringify({ question: q, scope: "passage", source: siteName[x.site] || x.site || "", turn: { question: x.question || "", answer: x.answer || "" }, thread: (x.thread || []).slice(-6).map(p => ({ q: p.q, a: p.a })) }) });
      if (!res.ok) throw new Error((await res.text()).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200) || ("HTTP " + res.status));
      const rd = res.body.getReader(), dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { value, done } = await rd.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl); buf = buf.slice(nl + 1); if (!line.trim()) continue;
          let ev; try { ev = JSON.parse(line); } catch { continue; }
          if (ev.delta) { text += ev.delta; target.innerHTML = render(text) + '<span class="caret"></span>'; }
          else if (ev.error) throw new Error(ev.error);
          else if (ev.done) { f.tokens = ev.tokens; f.ms = ev.ms; }
        }
      }
      if (!text.trim()) throw new Error("No answer came back");
      keep();
    } catch (e) {
      if (e.name === "AbortError" && text.trim()) { f.stopped = true; keep(); return; }
      const msg = String(e.message || e); let why;
      if (e.name === "AbortError") why = "Stopped.";
      else if (e instanceof TypeError) { const s = await readerStatus(); why = !s ? "The reader isn't running. Double-click Start Reader.command in the clean_chat folder, or run /reader in Claude Code, then ask again." : s.known === false ? `The reader doesn't know this extension yet. Open the reader page once (${readerUrl}/) with Clean Chat on, then ask again.` : "Couldn't reach the reader: " + msg; }
      else if (/401|authenticat|OAuth/i.test(msg)) why = "The claude command's sign-in is no longer valid, so the reader cannot ask for you. In Terminal, run claude and send any message; if that fails too, run /login there, then try again. (" + msg + ")";
      else why = "Couldn't ask: " + msg;
      target.innerHTML = `<span class="muted">${esc(why)}</span>`;
      div.querySelector(".fm").innerHTML = `<button data-retry>Try again</button><button data-drop>Dismiss</button>`;
      div.querySelector("[data-retry]").addEventListener("click", () => { div.remove(); askFurther(x, q); });
      div.querySelector("[data-drop]").addEventListener("click", () => div.remove());
    }
  }

  // ------------------------------------------------------------ header actions, keys, live updates
  async function copy(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Couldn't reach the clipboard"); } }
  let tt; function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(tt); tt = setTimeout(() => { t.hidden = true; }, 2500); }
  async function showUsage() {
    let used = JSON.stringify(data.saved).length + JSON.stringify(data.journal).length;
    try { if (globalThis.chrome?.storage?.local?.getBytesInUse) used = await chrome.storage.local.getBytesInUse([KEY.saved, KEY.journal]); } catch (e) { /* estimate is fine */ }
    const kb = used / 1024;
    $("#usage").textContent = `${kb < 1024 ? kb.toFixed(0) + " KB" : (kb / 1024).toFixed(1) + " MB"} on this computer`;
  }
  function setMode(m) { if (mode === m) return; mode = m; filter = "all"; query = ""; $("#search").value = ""; if (!current() && visible()[0]) active[mode] = visible()[0].id; refresh(); }
  $("#tabSaved").addEventListener("click", () => setMode("saved"));
  $("#tabJournal").addEventListener("click", () => setMode("journal"));
  $("#newEntry").addEventListener("click", newEntry);
  $("#filters").addEventListener("click", e => { const c = e.target.closest(".chip"); if (!c) return; filter = c.dataset.f; renderChrome(); renderList(); });
  $("#list").addEventListener("click", e => { const b = e.target.closest(".item"); if (!b) return; active[mode] = b.dataset.id; renderList(); renderDetail(); window.scrollTo(0, 0); });
  $("#search").addEventListener("input", e => { query = e.target.value; renderList(); });
  $("#exportMd").addEventListener("click", () => { const v = visible(); copy(v.map(x => toMarkdown(x)).join("\n---\n\n"), `Copied ${v.length} ${mode === "saved" ? "saved item" : "journal entr"}${mode === "saved" ? (v.length === 1 ? "" : "s") : (v.length === 1 ? "y" : "ies")} as markdown`); });
  $("#download").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({ exported: new Date().toISOString(), saved: data.saved, journal: data.journal }, null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `clean-chat-backup-${new Date().toISOString().slice(0, 10)}.json`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000); toast("Backup file downloading");
  });
  document.addEventListener("keydown", e => {
    const typing = /^(INPUT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable;
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    const vis = visible(); const i = vis.findIndex(x => x.id === active[mode]);
    if (e.key === "j" || e.key === "ArrowDown") { active[mode] = (vis[Math.min(vis.length - 1, i + 1)] || vis[0] || {}).id || null; renderList(); renderDetail(); }
    if (e.key === "k" || e.key === "ArrowUp") { active[mode] = (vis[Math.max(0, i - 1)] || vis[0] || {}).id || null; renderList(); renderDetail(); }
    if (e.key === "/") { e.preventDefault(); $("#search").focus(); }
    if (e.key === "n") { e.preventDefault(); newEntry(); }
    if (e.key === "p" && current()) { const x = current(); x.pinned = !x.pinned; persist(); refresh(); toast(x.pinned ? "Pinned to the top" : "Unpinned"); }
    if (e.key === "1") setMode("saved");
    if (e.key === "2") setMode("journal");
  });
  if (globalThis.chrome?.storage?.onChanged) chrome.storage.onChanged.addListener(ch => {
    if (Date.now() - selfWrite < 1500) return;                                   // our own write
    let changed = false;
    for (const m of ["saved", "journal"]) if (ch[KEY[m]]) { data[m] = ch[KEY[m]].newValue || []; if (!data[m].some(x => x.id === active[m])) active[m] = null; changed = true; }
    if (changed) { refresh(); showUsage(); }
  });

  (async () => {
    data.saved = (await store.get(KEY.saved)) || [];
    // notes saved from Gemini before v0.5.8 carry the site's screen-reader label in front of the question: take it off, once
    let fixed = false;
    data.saved.forEach(x => { if (x.qv) return; x.qv = 2; fixed = true; if (x.site === "gemini.google.com" && typeof x.question === "string") x.question = x.question.replace(/^You said:?\s*/i, ""); });
    // notes that are the same words saved twice (possible before v0.6.1): keep the one with the most written on it, else the older
    const plain = t => String(t || "").replace(/^You said:?\s*/i, "").replace(/\]\([^)]*\)/g, "]").replace(/[*_`#>=]+/g, "").replace(/\s+/g, " ").trim();
    const weight = x => (x.note || "").length + (x.highlights || []).reduce((n, h) => n + 1 + (h.note || "").length, 0) + (x.pinned ? 1000 : 0);
    const keep = new Map();
    for (const x of [...data.saved].sort((a, b) => (weight(b) - weight(a)) || (a.t - b.t))) { const k = `${x.kind || ""}\n${plain(x.question)}\n${plain(x.answer)}`; if (!keep.has(k)) keep.set(k, x.id); }
    if (keep.size < data.saved.length) { const ids = new Set(keep.values()); data.saved = data.saved.filter(x => ids.has(x.id)); fixed = true; }
    if (fixed) await store.set(KEY.saved, data.saved);
    data.journal = (await store.get(KEY.journal)) || [];
    const ru = await store.get("cc:reader");                                      // another port, if the reader was started with --port
    if (typeof ru === "string" && /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(ru)) readerUrl = ru;
    const params = new URLSearchParams(location.search);
    if (params.get("tab") === "journal") mode = "journal";
    const wanted = params.get("id");
    for (const m of ["saved", "journal"]) { const first = [...data[m]].sort((a, b) => (Number(!!b.pinned) - Number(!!a.pinned)) || (b.t - a.t))[0]; active[m] = first ? first.id : null; }
    if (wanted && coll().some(x => x.id === wanted)) active[mode] = wanted;
    refresh(); showUsage();
  })();
})();
