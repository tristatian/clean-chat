// Clean Chat — a reading-mode layer for LLM chat sites (Claude, Gemini, ChatGPT, Grok, DeepSeek, Doubao, Kimi, Qwen, Z.ai, Yuanbao, Copilot, Perplexity and more).
// Erase blocks you understand (they collapse to a stub), highlight a phrase and ask about it
// (the quote is placed in the composer for you to finish and send), undo, history.
// Works at two grains: a paragraph, or a whole question and its answer.
// Two reasons to collapse: understood (done) or not central right now (later). Drafts can be parked unsent.
// "save" keeps a question and its answer inside the extension (see saved.html); optionally it is also sent to a Google Doc
// through a small Apps Script web app (see apps-script/).
// Nothing is ever sent automatically. State is stored per conversation in chrome.storage.local.
(() => {
  "use strict";
  if (window.__cleanChatLoaded) return;
  window.__cleanChatLoaded = true;

  const log = (...a) => console.log("[Clean Chat]", ...a);

  // ------------------------------------------------------------ storage
  // After the extension is reloaded at chrome://extensions, scripts already running in open tabs lose their connection
  // to it: they must not quietly write to the page's own storage instead. Say so once and stop saving.
  const WAS_EXT = !!globalThis.chrome?.runtime?.id; let saidOrphan = false;
  const orphaned = () => { if (!WAS_EXT || globalThis.chrome?.runtime?.id) return false; if (!saidOrphan) { saidOrphan = true; try { toast("Clean Chat was updated. Reload this page to keep saving.", 8000); } catch { /* too early */ } } return true; };
  const store = {
    async get(key) {
      try {
        if (orphaned()) return null;
        if (globalThis.chrome?.storage?.local) { const r = await chrome.storage.local.get(key); return r[key] || null; }
        return JSON.parse(localStorage.getItem(key) || "null");
      } catch { return null; }
    },
    async set(key, val) {
      try {
        if (orphaned()) return;
        if (globalThis.chrome?.storage?.local) return await chrome.storage.local.set({ [key]: val });
        localStorage.setItem(key, JSON.stringify(val));
      } catch (e) { log("storage failed", e); }
    },
  };
  // ------------------------------------------------------------ site profiles
  // Each site's markup changes over time. A profile lists the hooks to try first; after them come the generic hooks
  // (role attributes and markdown containers most chat apps use), then a structural fallback that needs no hooks at
  // all. `hosts` says which host names use the profile; data is filed under the profile's key.
  const GENERIC = {
    assistant: ['[data-message-author-role="assistant"]', '[data-role="assistant"]', '[data-message-role="assistant"]', ".ds-markdown", ".markdown-body", ".markdown-prose", ".markdown-container", ".markdown", ".prose", '[class*="markdown" i]', '[class*="assistant" i]', '[class*="response" i]'],
    user: ['[data-message-author-role="user"]', '[data-role="user"]', '[data-message-role="user"]', '[data-testid*="user" i][data-testid*="message" i]', '[class*="user-message" i]', '[class*="user_message" i]', '[class*="usermessage" i]', '[class*="user-query" i]', '[class*="query-content" i]', '[class*="human" i]'],
    composer: ['div[contenteditable="true"].ProseMirror', '.ql-editor[contenteditable="true"]', '[role="textbox"][contenteditable="true"]', 'div[contenteditable="true"]', "textarea"],
    convo: [/[?&](?:id|cid|chat_?id|session_?id|conversation_?id)=([^&#]{4,})/i, /\/(?:[^/?#]+\/)*([0-9a-zA-Z_-]{6,})\/?(?:$|\?)/],   // ?id=… or the last path segment that looks like an id
  };
  const SITES = {
    "claude.ai": {
      assistant: ["[data-is-streaming]", ".font-claude-response", ".font-claude-message", '[data-testid="assistant-message"]'],
      replyContainer: null,
      user: '[data-testid="user-message"]',
      composer: ['div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]', "textarea"],
      convo: /\/(?:chat|code)\/(?:[a-z]+\/)?([0-9a-zA-Z_-]{6,})/,
    },
    "gemini.google.com": {
      assistant: ["model-response .markdown", "model-response message-content", "model-response"],
      replyContainer: "model-response",
      user: "user-query",
      composer: ['.ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"]', 'div[contenteditable="true"]', "textarea"],
      convo: /\/(?:app|gem)\/([0-9a-zA-Z_-]{6,})/,
    },
    "chatgpt.com": {
      assistant: ['[data-message-author-role="assistant"] .markdown', '[data-message-author-role="assistant"]'],
      replyContainer: 'article, [data-testid^="conversation-turn"]',
      user: '[data-message-author-role="user"]',
      composer: ["#prompt-textarea", 'textarea[name="prompt"]', 'div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]', "textarea"],
      convo: /\/c\/([0-9a-zA-Z-]{6,})/,
    },
    "grok.com": {
      assistant: [".response-content-markdown", '[id^="response-"].items-start .message-bubble', ".items-start .message-bubble"],
      replyContainer: '[id^="response-"]',
      user: ['[id^="response-"].items-end .message-bubble', ".items-end .message-bubble"],
      composer: ['textarea[aria-label*="Grok" i]', 'div[contenteditable="true"].ProseMirror', 'div[contenteditable="true"]', "textarea"],
      convo: /\/(?:chat|c)\/([0-9a-zA-Z-]{6,})/,
    },
    // ---- the hooks below come from open-source exporters for each site, not from a live check; "copy page info"
    // in the panel reports which hook matched, so a site whose markup moved on can be fixed from that report.
    "chat.deepseek.com": {
      assistant: [".ds-markdown", ".ds-assistant-message-main-content"],
      replyContainer: ".ds-message",
      user: [".ds-collapsible-text:not(.ds-message .ds-collapsible-text):not(.ds-think-content .ds-collapsible-text)", "._72b6158", ".fbb737a4"],
      composer: ["#chat-input", "textarea", 'div[contenteditable="true"]'],
      convo: /\/a\/chat\/s\/([0-9a-zA-Z_-]{6,})/,
    },
    "doubao.com": {
      hosts: /(^|\.)doubao\.com$/,
      assistant: ['[data-testid="receive_message"] [data-testid="message_text_content"]', '[data-testid="receive_message"]'],
      replyContainer: '[data-testid="receive_message"]',
      user: ['[data-testid="send_message"]', '[data-testid="union_message"]:not(:has([data-testid="receive_message"]))'],
      composer: ['textarea[data-testid="chat_input_input"]', "textarea", 'div[contenteditable="true"]'],
      convo: /\/chat\/([0-9a-zA-Z_-]{4,})/,
    },
    "kimi.com": {
      hosts: /(^|\.)(kimi\.com|kimi\.moonshot\.cn)$/,
      assistant: [".chat-content-item-assistant .markdown-container", ".chat-content-item-assistant", ".segment-assistant"],
      replyContainer: ".chat-content-item-assistant",
      user: [".chat-content-item-user", ".segment-user", '[class*="user-content"]', '[class*="item-user"]'],
      composer: ['.chat-input-editor [contenteditable="true"]', 'div[contenteditable="true"]', "textarea"],
      convo: /\/chat\/([0-9a-zA-Z_-]{6,})/,
    },
    "chat.qwen.ai": {                                   // Qwen Chat and Z.ai both build on Open WebUI
      hosts: /^(chat\.qwen\.ai|chat\.qwenlm\.ai|qwen\.aliyun\.com)$/,
      assistant: [".chat-assistant", '[id^="message-"] .markdown-prose', ".markdown-prose"],
      replyContainer: '[id^="message-"]',
      user: [".user-message", ".chat-user", '[id^="message-"]:has(.chat-user)'],
      composer: ["#chat-input", 'div[contenteditable="true"]', "textarea"],
      convo: /\/c\/([0-9a-zA-Z_-]{6,})/,
    },
    "chat.z.ai": {
      hosts: /^(chat\.)?z\.ai$/,
      assistant: [".chat-assistant", '[id^="message-"] .markdown-prose', ".markdown-prose"],
      replyContainer: '[id^="message-"]',
      user: [".user-message", ".chat-user", '[id^="message-"]:has(.chat-user)'],
      composer: ["#chat-input", 'div[contenteditable="true"]', "textarea"],
      convo: /\/c\/([0-9a-zA-Z_-]{6,})/,
    },
    "yuanbao.tencent.com": {
      assistant: [".agent-chat__list__item:not(.agent-chat__list__item--human) .hyc-content-md", ".hyc-content-md"],
      replyContainer: ".agent-chat__list__item",
      user: [".agent-chat__list__item--human"],
      composer: ['.ql-editor[contenteditable="true"]', 'div[contenteditable="true"]', "textarea"],
      convo: /\/chat\/(?:[^/?#]+\/)*([0-9a-zA-Z_-]{6,})\/?(?:$|\?)/,
    },
    "tongyi.com": { hosts: /(^|\.)tongyi\.com$/ },        // Qwen's Chinese site
    "chatglm.cn": { hosts: /(^|\.)chatglm\.cn$/ },        // Zhipu's Chinese site
    "yiyan.baidu.com": {},                               // ERNIE Bot
    "chat.minimax.io": { hosts: /^chat\.minimax(i\.com|\.io)$/ },
    "perplexity.ai": {
      hosts: /(^|\.)perplexity\.ai$/,
      assistant: [".prose"],
      user: [".group\\/query", '[class*="query" i]'],
      convo: /\/search\/([0-9a-zA-Z_-]{6,})/,
    },
    "copilot.microsoft.com": {
      hosts: /^(copilot\.microsoft\.com|(www\.)?copilot\.com)$/,
      assistant: ['[data-content="ai-message"]', ".group\\/ai-message-item", ".group\\/ai-message"],
      replyContainer: ".group\\/ai-message",
      user: ['[data-content="user-message"]', ".group\\/user-message"],
      composer: ["#userInput", "textarea", 'div[contenteditable="true"]'],
      convo: /\/chats\/([0-9a-zA-Z_-]{6,})/,
    },
    "chat.mistral.ai": { convo: /\/chat\/([0-9a-zA-Z_-]{6,})/ },
    "meta.ai": { hosts: /(^|\.)meta\.ai$/, convo: /\/(?:prompt|c|chat)\/([0-9a-zA-Z_-]{6,})/ },
  };
  SITES["chat.openai.com"] = SITES["chatgpt.com"];
  const HOST = document.documentElement.dataset.ccSite || location.hostname;
  const [SITE_NAME, SITE] = Object.entries(SITES).find(([k, p]) => k === HOST || (p.hosts && p.hosts.test(HOST))) || [HOST, {}];
  const CONVO_RES = [].concat(SITE.convo || GENERIC.convo);
  function convoId() {
    const where = location.pathname + location.search;
    for (const re of CONVO_RES) { const m = where.match(re); if (m) return m[1]; }
    return "home";
  }
  const storeKey = () => (SITE_NAME === "claude.ai" ? `cc:${convoId()}` : `cc:${SITE_NAME}:${convoId()}`);

  let state = { erased: {}, erasedTurns: {}, highlights: [], figs: {}, drafts: [], asks: [], notes: [], showStubs: true };
  let settings = { notesEndpoint: "", stayPut: true };
  const saveSettings = () => store.set("cc:settings", settings);
  let undoStack = [];
  let currentConvo = null;

  async function loadState() {
    currentConvo = convoId();
    state = Object.assign({ erased: {}, erasedTurns: {}, highlights: [], figs: {}, drafts: [], asks: [], notes: [], showStubs: true }, (await store.get(storeKey())) || {});
    settings = Object.assign({ notesEndpoint: "", stayPut: true }, (await store.get("cc:settings")) || {});
    undoStack = [];
    document.documentElement.classList.toggle("cc-hide-stubs", !state.showStubs);
    // keep the cross-chat index in step with what this conversation already has saved (covers data from older versions)
    if (Object.keys(state.erased).length || Object.keys(state.erasedTurns).length || state.drafts.length) queueIndex();
  }
  const saveState = () => { store.set(storeKey(), state); queueIndex(); };

  // ------------------------------------------------------------ finding Claude's replies
  // claude.ai's markup changes; try known hooks first, then a structural fallback.
  const chain = (own, generic) => [...new Set([].concat(own || [], generic))];
  const ASSISTANT_SELECTORS = chain(SITE.assistant, GENERIC.assistant);   // tried in order
  const USER_SELS = chain(SITE.user, GENERIC.user);
  const USER_SEL = USER_SELS.join(", ");
  const COMPOSER_SELS = chain(SITE.composer, GENERIC.composer);
  let matchedUserSel = null;
  const BLOCK_TAGS = "p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, table";
  let matchedSelector = null;

  function assistantRoots() {
    for (const sel of ASSISTANT_SELECTORS) {
      let els = [...document.querySelectorAll(sel)].filter(el => !el.closest(USER_SEL) && !el.closest("[contenteditable]") && !layer.contains(el));
      // a hook that matches a wrapper and the message inside it: keep the inner one, where the text is
      if (els.length > 1) { const inner = new Set(els.filter(el => els.some(o => o !== el && el.contains(o) && o.querySelector(BLOCK_TAGS)))); els = els.filter(el => !inner.has(el)); }
      if (els.length) { if (matchedSelector !== sel) { matchedSelector = sel; log(`found ${els.length} replies via ${sel}`); } return els; }
    }
    // fallback: innermost containers in <main> that directly hold rendered markdown
    const main = document.querySelector("main") || document.body;
    const cands = [...main.querySelectorAll("div")].filter(d =>
      !d.closest(USER_SEL) && !d.closest("[contenteditable]") &&
      [...d.children].some(c => /^(P|H[1-6]|UL|OL|PRE)$/.test(c.tagName)) &&
      [...d.children].filter(c => /^(P|H[1-6]|UL|OL|PRE|BLOCKQUOTE|TABLE)$/.test(c.tagName)).length >= 1
    );
    const leafs = cands.filter(d => !cands.some(o => o !== d && d.contains(o)));
    if (leafs.length && matchedSelector !== "fallback") { matchedSelector = "fallback"; log(`found ${leafs.length} replies via structural fallback`); }
    return leafs;
  }

  function blocksIn(root) {
    const all = [...root.querySelectorAll(BLOCK_TAGS)];
    // keep only outermost candidates (a <p> inside an <li> belongs to the <li>)
    return all.filter(el => { let p = el.parentElement; while (p && p !== root) { if (p.matches(BLOCK_TAGS)) return false; p = p.parentElement; } return true; })
              .filter(el => el.textContent.trim().length > 0);
  }

  // ---- figures: charts, diagrams and images in a reply can be highlighted and asked about
  const FIG_TAGS = "figure, img, svg, canvas, iframe";
  function figuresIn(roots) {
    const out = [];
    roots.forEach(root => {
      const cands = [...root.querySelectorAll(FIG_TAGS)].filter(el => {
        if (el.closest("button, a, [contenteditable]") || layer.contains(el)) return false;
        const r = el.getBoundingClientRect(); return r.width >= 140 && r.height >= 90;            // skips icons and avatars
      });
      cands.filter(el => !cands.some(o => o !== el && o.contains(el))).forEach(el => out.push(el)); // outermost only
    });
    return out;
  }
  const figRaw = el => norm(el.getAttribute("alt") || el.getAttribute("aria-label") || el.getAttribute("title") || (el.querySelector && el.querySelector("figcaption, title") || {}).textContent || "");
  const figLabel = el => figRaw(el).replace(/^[\w-]{2,20}:\s*/, "");   // drop a connector prefix such as "visualize: "
  const figFrame = el => el.tagName === "IFRAME" ? el : el.querySelector?.("iframe");
  // the text selected inside a figure: in the page itself, or in a frame the page is allowed to read
  function figPart(el) {
    const s = window.getSelection();
    if (s && !s.isCollapsed && s.rangeCount && el.contains(s.getRangeAt(0).commonAncestorContainer)) return norm(s.toString());
    const fr = figFrame(el);
    let inner = ""; try { const fs = fr && fr.contentWindow.getSelection(); inner = fs && !fs.isCollapsed ? norm(fs.toString()) : ""; } catch { /* sealed frame */ }
    if (!inner && fr && frameSel && Date.now() - frameSel.t < 6e5) inner = norm(frameSel.text);   // reported by frame.js from inside the frame
    return inner;
  }
  // selections made inside embedded frames arrive here, relayed by the background worker
  let frameSel = null; const frameSeen = {};
  if (globalThis.chrome?.runtime?.onMessage) chrome.runtime.onMessage.addListener(m => {
    if (m && m.type === "cc:frameinput") { lastUserScrollInput = Date.now(); if (pin) releasePin(false, "you scrolled inside a frame"); return; }   // wheel or touch inside a frame
    if (!m || (m.type !== "cc:framesel" && m.type !== "cc:framehello")) return;
    frameSeen[m.from || "unknown"] = true;
    if (m.type === "cc:framesel") frameSel = m.text ? { text: m.text, t: Date.now() } : null;
  });
  function frameSelections() {
    return new Promise(res => {
      const none = { ok: false, frames: [] };
      if (!globalThis.chrome?.runtime?.sendMessage) return res(none);
      try { chrome.runtime.sendMessage({ type: "cc:framesels" }, r => { void chrome.runtime.lastError; res(r || none); }); } catch { res(none); }
    });
  }
  // what this page is made of, for troubleshooting: which hooks matched, the shape of the markup around the first
  // reply and the first question (tag and class names only, never the words), and the figures
  const shape = el => { const out = []; for (let n = el, i = 0; n && n !== document.body && i < 7; n = n.parentElement, i++) { const cls = typeof n.className === "string" ? n.className.trim().split(/\s+/).filter(Boolean).slice(0, 4).join(".") : ""; const attrs = [...n.attributes].filter(a => /^(data-testid|data-role|data-message-author-role|id)$/.test(a.name)).map(a => `[${a.name}=${a.value.slice(0, 30)}]`).join(""); out.unshift(n.tagName.toLowerCase() + (cls ? "." + cls : "") + attrs); } return out.join(" > "); };
  async function figInfo() {
    const roots = assistantRoots(), users = userMessages(), box = composer();
    const lines = [`Clean Chat ${orphaned() ? "(updated: reload this page)" : globalThis.chrome?.runtime?.getManifest?.().version || "(local)"} on ${location.hostname} (profile: ${SITE_NAME}${SITE.assistant ? "" : ", generic"}), page ${location.pathname}, conversation ${convoId()}`,
      `replies: ${roots.length} via ${matchedSelector || "none"} · questions: ${users.length} via ${matchedUserSel || "none"} · blocks: ${document.querySelectorAll(".cc-block").length} · message box: ${box ? shape(box).split(" > ").pop() : "not found"}`];
    if (roots[0]) lines.push("first reply: " + shape(roots[0]));
    if (users[0]) lines.push("first question: " + shape(users[0]));
    if (!roots.length || !users.length) {   // nothing matched: the shapes of the elements that hold paragraphs, so a hook can be written
      const seen = new Set(); const main = document.querySelector("main") || document.body;
      [...main.querySelectorAll("p, li")].slice(0, 400).forEach(el => { const sh = shape(el.parentElement); if (!seen.has(sh) && seen.size < 8) { seen.add(sh); } });
      lines.push("paragraph holders: " + ([...seen].join(" | ") || "none"));
    }
    document.querySelectorAll(".cc-figure").forEach((el, i) => {
      const fr = figFrame(el); let what = "part of the page";
      if (fr) {
        let readable = "no", site = ""; try { readable = fr.contentDocument ? "yes" : "no"; } catch { /* sealed */ }
        try { site = new URL(fr.src).origin; } catch { /* no address */ }
        what = `frame at ${site || (fr.hasAttribute("srcdoc") ? "srcdoc" : "no address")}, sandbox="${fr.getAttribute("sandbox") ?? "none"}", readable from the page: ${readable}`;
      }
      lines.push(`${i + 1}. <${el.tagName.toLowerCase()}> "${figRaw(el)}": ${what}`);
    });
    const sc = scrollContainerOf(latestMessage());
    lines.push(`scrolls in: ${isDocScroller(sc) ? "the page" : shape(sc)} · position ${Math.round(getTop(sc))} of ${Math.round(maxTop(sc))} · stay put: ${settings.stayPut === false ? "off" : "on"}`);
    lines.push("stay-put log: " + (pinLog.join(" | ") || "nothing yet (no question sent on this page since it loaded)"));
    // everything on the page that could be a message box, whether or not a hook matched it, so a new site shape can be read off the paste
    const EDITABLE = 'textarea, input:not([type]), input[type="text"], input[type="search"], [contenteditable], [role="textbox"], rich-textarea, [class*="ql-editor" i], [class*="prompt" i][class*="input" i], [class*="input-area" i], [class*="composer" i], [class*="text-input" i], [data-placeholder]';
    const seenEd = new Set(); const eds = deepQueryAll(EDITABLE).filter(e => !layer.contains(e) && !seenEd.has(e) && seenEd.add(e)).slice(0, 8);
    lines.push("editable-looking elements: " + (eds.map(e => `${shape(e).split(" > ").slice(-2).join(" > ")}${e.getAttribute("contenteditable") != null ? ` [contenteditable=${JSON.stringify(e.getAttribute("contenteditable"))}]` : ""}${e.getClientRects().length ? "" : " (not visible)"}${e.closest("[aria-hidden='true']") ? " (aria-hidden)" : ""}${e.closest("[data-cc-msg]") ? " (inside a reply)" : ""}`).join(" | ") || "none"));
    const hosts = [...document.querySelectorAll("*")].filter(e => e.shadowRoot), closed = [...document.querySelectorAll("*")].filter(e => e.tagName.includes("-") && !e.shadowRoot && customElements.get(e.tagName.toLowerCase()) && e.children.length === 0);
    lines.push(`shadow roots: ${hosts.length} open${hosts.length ? " (" + [...new Set(hosts.map(e => e.tagName.toLowerCase()))].slice(0, 6).join(", ") + ")" : ""} · empty custom elements (possible closed roots): ${[...new Set(closed.map(e => e.tagName.toLowerCase()))].slice(0, 6).join(", ") || "none"}`);
    const frames = deepQueryAll("iframe"), readable = sameOriginFrameDocs();
    lines.push(`frames on the page: ${frames.length} · readable from here: ${readable.length}` + readable.map((d, i) => {
      const cands = ['textarea', '[contenteditable]', '[role="textbox"]'].flatMap(sel => deepQueryAll(sel, d)).filter(e => e.getClientRects().length > 0);
      return ` · frame ${i + 1}: ${cands.length ? "message box candidates: " + cands.slice(0, 3).map(e => shape(e).split(" > ").pop()).join(", ") : "no message box"}`;
    }).join(""));
    lines.push("frames reporting to Clean Chat: " + (Object.keys(frameSeen).join(", ") || "none"));
    const r = await frameSelections();
    lines.push("frames Clean Chat can read: " + (r.frames.filter(f => !f.top).map(f => `${f.site}${f.text ? " (has a selection)" : ""}`).join(", ") || "none") + (r.error ? ` [${r.error}]` : ""));
    return lines.join("\n");
  }
  function figPrompt(el, part) {
    const label = figLabel(el); const root = el.closest("[data-cc-msg]");
    const fig = `the figure${label ? ` "${label}"` : ""} in your answer`;
    if (part) return `About "${part}" in ${fig}:\n\n`;
    // an unlabelled figure is located by the last real sentence before it (short scraps of interface text are skipped)
    const before = !label && root ? [...root.querySelectorAll(".cc-block")].filter(b => (b.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) && norm(b.textContent).length >= 20).pop() : null;
    const where = before ? `, the one right after "${norm(before.textContent).slice(0, 80)}"` : "";
    return `About ${fig}${where}:\n\n`;
  }
  function toggleFigure(el) {
    const key = el.dataset.ccFig; if (!key) return;
    if (state.figs[key]) delete state.figs[key]; else state.figs[key] = { label: figLabel(el), t: Date.now() };
    el.classList.toggle("cc-fig-hl", !!state.figs[key]); saveState(); toast(state.figs[key] ? "Figure highlighted" : "Highlight removed");
  }
  let frameNoted = false;
  function askAbout(h) {
    if (h.classList.contains("cc-figure")) {
      (async () => {
        const fr = figFrame(h); let part = figPart(h), seen = null;
        if (!part && fr) { seen = await frameSelections(); const hit = seen.frames.find(f => !f.top && f.text); if (hit) part = norm(hit.text); }
        insertIntoComposer(figPrompt(h, part), { quote: part || figLabel(h) || "figure", action: "ask-figure" });
        if (fr && !part && !frameNoted) {     // say once what was tried, in a form that can be passed on
          frameNoted = true; let host = "no address"; try { host = new URL(fr.src).host; } catch {}
          const reach = seen ? seen.frames.filter(f => !f.top).map(f => f.site).join(", ") || "none" : "not asked";
          const line = `No selection found inside this diagram. Diagram frame: ${host}. Frames Clean Chat can read: ${reach}.${seen && seen.error ? " " + seen.error : ""}`;
          console.info("[Clean Chat]", line); toast(line, 15000);
        }
      })();
      return;
    }
    // a phrase selected inside this block: ask about the phrase and highlight it, the same as the selection toolbar
    if (pending && pending.blk === h && pending.text) {
      const text = pending.text; if (!pending.hits.length) addHighlight(h, text); window.getSelection()?.removeAllRanges(); seltool.hidden = true; pending = null;
      insertIntoComposer(quoteLine(text), { quote: text, action: "ask" }); return;
    }
    const q = norm(h.textContent); insertIntoComposer(quoteLine(q), { quote: q, action: "ask" });
  }

  // the full text of a collapsed block on hover, since the stub shows one clipped line
  function setStubTitle(el, entry) {
    if (entry) { el.title = (entry.why === "later" ? "later: " : "understood: ") + entry.text; el.dataset.ccTitled = "1"; }
    else if (el.dataset.ccTitled) { el.removeAttribute("title"); delete el.dataset.ccTitled; }
  }
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  const norm = s => s.replace(/\s+/g, " ").trim().slice(0, 160);

  // ------------------------------------------------------------ scan & decorate
  let scanning = false;
  function scan() {
    if (scanning) return; scanning = true;
    try {
      const seen = {};
      const roots = assistantRoots();
      roots.forEach((root, mi) => {
        root.dataset.ccMsg = String(mi);
        blocksIn(root).forEach(el => {
          const h = hash(norm(el.textContent));
          seen[h] = (seen[h] || 0) + 1;
          const key = `${h}:${seen[h]}`;
          el.classList.add("cc-block");
          el.dataset.ccKey = key;
          const en = state.erased[key];
          el.classList.toggle("cc-erased", !!en);
          el.classList.toggle("cc-later", !!en && en.why === "later");
          // hidden behind the section's first line, but only while that line is really there to click
          el.classList.toggle("cc-under", !!(en && en.under && state.erased[en.under] && root.querySelector(`[data-cc-key="${CSS.escape(en.under)}"]`)));
          if (en && en.n) el.dataset.ccN = en.n; else delete el.dataset.ccN;
          setStubTitle(el, en);
        });
      });
      figuresIn(roots).forEach((el, i) => {
        const key = `fig:${i}:${hash(figRaw(el) + el.tagName)}`;
        el.classList.add("cc-figure"); el.dataset.ccFig = key;
        el.classList.toggle("cc-fig-hl", !!state.figs[key]);
      });
      turns().forEach(t => {
        t.user.classList.add("cc-turn"); t.user.dataset.ccTurn = t.key;
        const off = !!state.erasedTurns[t.key];
        t.user.classList.toggle("cc-turn-erased", off);
        t.user.classList.toggle("cc-later", off && state.erasedTurns[t.key].why === "later");
        setStubTitle(t.user, off ? state.erasedTurns[t.key] : null);
        t.replies.forEach(r => replyBox(r).classList.toggle("cc-reply-hidden", off));
        if (off) hideTurnExtras(t); else showTurnExtras(t);
      });
      applyHighlights();
    } finally { scanning = false; }
  }
  const debounce = (fn, ms) => { let t; return () => { clearTimeout(t); t = setTimeout(fn, ms); }; };
  const rescan = debounce(scan, 250);

  // ------------------------------------------------------------ erase / restore / undo
  // group: the keys are one section; it collapses to a single line (the first block) and the rest hide behind it
  function erase(keys, label, why = "done", group = false) {
    const changed = []; const head = group && keys.length > 1 ? keys[0] : null;
    const find = k => document.querySelector(`.cc-block[data-cc-key="${CSS.escape(k)}"]`);
    keys.forEach(k => {
      const el = find(k); if (!el) return;
      if (state.erased[k]) {       // erased earlier on its own: fold it into the section if it was for the same reason
        if (head && k !== head && (state.erased[k].why || "done") === why) { state.erased[k].under = head; el.classList.add("cc-under"); }
        return;
      }
      state.erased[k] = { text: norm(el.textContent), t: Date.now(), why };
      if (head && k !== head) state.erased[k].under = head;
      el.classList.add("cc-erased"); el.classList.toggle("cc-later", why === "later"); el.classList.toggle("cc-under", !!state.erased[k].under);
      setStubTitle(el, state.erased[k]);
      changed.push(k);
    });
    if (!changed.length) return;
    if (head && state.erased[head]) {
      const n = Object.values(state.erased).filter(v => v.under === head).length;
      if (n) { state.erased[head].n = n; const he = find(head); if (he) he.dataset.ccN = n; }
    }
    undoStack.push({ kind: "blocks", keys: changed });
    saveState(); renderPanel();
    toast(label || (why === "later" ? (changed.length > 1 ? `${changed.length} blocks parked for later` : "Parked for later") : (changed.length > 1 ? `${changed.length} blocks marked as understood` : "Marked as understood")));
  }
  function restore(keys) {
    const all = new Set(keys);
    Object.entries(state.erased).forEach(([k, v]) => { if (v.under && all.has(v.under)) all.add(k); });   // a section comes back whole
    all.forEach(k => {
      delete state.erased[k];
      const el = document.querySelector(`.cc-block[data-cc-key="${CSS.escape(k)}"]`);
      if (el) { el.classList.remove("cc-erased", "cc-later", "cc-under"); delete el.dataset.ccN; setStubTitle(el, null); }
    });
    saveState(); renderPanel();
  }
  function undo() {
    const u = undoStack.pop(); if (!u) return;
    if (u.kind === "hl") { state.highlights.push(...u.hs); saveState(); applyHighlights(); hideToast(); return; }
    (u.kind === "turns" ? restoreTurns : restore)(u.keys); hideToast();
  }
  // What counts as the start of a section: a real heading; a paragraph that works as a title (a bold lead-in that is
  // the whole paragraph, sits on its own line, or is numbered like "5. ..."); or a paragraph with a list right after it.
  const isH = el => /^H[1-6]$/.test(el.tagName);
  function isTitlePara(el) {
    if (el.tagName !== "P") return false;
    const kids = [...el.childNodes].filter(n => n.nodeType === 1 || n.textContent.trim());
    const first = kids[0]; if (!first || first.nodeType !== 1 || !/^(STRONG|B)$/.test(first.tagName)) return false;
    const bold = first.textContent.trim(), next = first.nextSibling;
    return kids.length === 1 || /^\d+[.)]\s/.test(bold) || (!!next && (next.nodeName === "BR" || (next.nodeType === 3 && /^[ \t]*\n/.test(next.textContent))));
  }
  const leadsList = el => el.tagName === "P" && !!el.nextElementSibling && /^(UL|OL)$/.test(el.nextElementSibling.tagName);
  const sectionKind = el => (isH(el) ? "h" : isTitlePara(el) ? "title" : leadsList(el) ? "lead" : "");
  function sectionKeys(el) {
    const root = el.closest("[data-cc-msg]"), kind = sectionKind(el); if (!root || !kind) return [el.dataset.ccKey];
    const blocks = [...root.querySelectorAll(".cc-block")];
    const i = blocks.indexOf(el); const out = []; const list = kind === "lead" ? el.nextElementSibling : null;
    for (let j = i; j < blocks.length; j++) {
      const b = blocks[j];
      if (j > i && kind === "h" && isH(b) && b.tagName <= el.tagName) break;       // next heading of the same or a higher level
      if (j > i && kind === "title" && (isH(b) || isTitlePara(b))) break;          // next title
      if (j > i && kind === "lead" && !list.contains(b)) break;                    // end of its list
      out.push(b.dataset.ccKey);
    }
    return out;
  }

  // ------------------------------------------------------------ turns: a question and its reply
  const replyBox = r => (SITE.replyContainer && r.closest(SITE.replyContainer)) || r;
  function userMessages() {
    for (const sel of USER_SELS) {
      let els; try { els = [...document.querySelectorAll(sel)].filter(el => !el.closest("[contenteditable]") && !layer.contains(el) && (el.textContent || "").trim()); } catch { continue; }
      if (els.length > 1) { const inner = new Set(els.filter(el => els.some(o => o !== el && el.contains(o)))); els = els.filter(el => !inner.has(el)); }   // outermost per message
      if (els.length) { matchedUserSel = sel; return els; }
    }
    matchedUserSel = "inferred";
    return inferUsers(assistantRoots());
  }
  // When a site's class names have changed and none of the selectors match: once there are two replies, the rows
  // of the conversation list that hold no reply are your messages.
  function inferUsers(roots) {
    if (roots.length < 2) return [];
    const last = roots[roots.length - 1];
    let list = roots[0].parentElement;
    while (list && !list.contains(last)) list = list.parentElement;
    if (!list) return [];
    const rowOf = el => { let n = el; while (n.parentElement && n.parentElement !== list) n = n.parentElement; return n; };
    const replyRows = new Set(roots.map(rowOf));
    const box = composer();
    return [...list.children].filter(row => !replyRows.has(row) && !(box && row.contains(box)) && !layer.contains(row) && (row.innerText || "").trim().length > 1);
  }
  function turns() {
    const users = userMessages(), roots = assistantRoots(), seen = {};
    return users.map((u, i) => {
      const next = users[i + 1];
      const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      const replies = roots.filter(r => after(u, r) && (!next || after(r, next)));
      const h = hash(norm(u.textContent)); seen[h] = (seen[h] || 0) + 1;
      return { key: `turn:${h}:${seen[h]}`, user: u, replies };
    });
  }
  // ---- a collapsed question takes its attachments with it
  // Sites render a question's images and files next to the message text, not inside it. Find the wrapper that belongs
  // to this question alone (it holds no reply, no other question, no message box) and hide everything in it that is
  // not the text itself: previews, file cards, and the message's own edit/copy buttons.
  const ATTACH_SEL = 'img, video, canvas, a[download], [data-testid*="file" i], [data-testid*="attach" i], [data-testid*="thumbnail" i], [class*="attachment" i], [class*="thumbnail" i], [class*="file-preview" i], [class*="filepreview" i]';
  function userGroup(u) {
    const roots = assistantRoots(), users = userMessages(), box = composer();
    const shared = p => roots.some(r => p.contains(r)) || users.some(x => x !== u && p.contains(x)) || (box && p.contains(box));
    let g = u;
    while (g.parentElement && g.parentElement !== document.body && !shared(g.parentElement)) g = g.parentElement;
    return g;
  }
  const looksLikeAttachment = el => el.matches(ATTACH_SEL) || !!el.querySelector(ATTACH_SEL);
  function hideTurnExtras(t) {
    const u = t.user, g = userGroup(u);
    let found = !!u.querySelector(ATTACH_SEL);
    const hide = el => { el.classList.add("cc-extra-hidden"); el.dataset.ccHiddenFor = t.key; };
    for (let node = u; node !== g && node.parentElement; node = node.parentElement) {
      [...node.parentElement.children].forEach(sib => {
        if (sib === node || sib.contains(u) || layer.contains(sib)) return;
        if (looksLikeAttachment(sib)) found = true;
        hide(sib);
      });
    }
    if (g === u) { // no wrapper of its own: attachments can only be loose siblings right before the message
      const roots = assistantRoots(), users = userMessages();
      for (let sib = u.previousElementSibling; sib; sib = sib.previousElementSibling) {
        if (roots.some(r => sib.contains(r) || r.contains(sib)) || users.some(x => sib.contains(x))) break;
        if (looksLikeAttachment(sib)) { found = true; hide(sib); }
      }
    }
    u.classList.toggle("cc-has-attach", found);
  }
  function showTurnExtras(t) {
    document.querySelectorAll(`[data-cc-hidden-for="${CSS.escape(t.key)}"]`).forEach(el => { el.classList.remove("cc-extra-hidden"); delete el.dataset.ccHiddenFor; });
    t.user.classList.remove("cc-has-attach");
  }

  function eraseTurn(key, why = "done") {
    const t = turns().find(x => x.key === key); if (!t || state.erasedTurns[key]) return;
    state.erasedTurns[key] = { text: userText(t.user), t: Date.now(), why };
    t.user.classList.add("cc-turn-erased"); t.user.classList.toggle("cc-later", why === "later"); setStubTitle(t.user, state.erasedTurns[key]); t.replies.forEach(r => replyBox(r).classList.add("cc-reply-hidden")); hideTurnExtras(t);
    undoStack.push({ kind: "turns", keys: [key] });
    saveState(); renderPanel(); toast(why === "later" ? "Question and answer parked for later" : "Question and answer marked as understood");
  }
  function restoreTurns(keys) {
    keys.forEach(k => { delete state.erasedTurns[k]; });
    turns().forEach(t => { if (keys.includes(t.key)) { t.user.classList.remove("cc-turn-erased", "cc-later"); setStubTitle(t.user, null); t.replies.forEach(r => replyBox(r).classList.remove("cc-reply-hidden")); showTurnExtras(t); } });
    saveState(); renderPanel();
  }

  // ------------------------------------------------------------ notes: question + answer to a Google Doc
  function toMarkdown(root) {
    const out = [];
    const inline = node => {
      let s = "";
      node.childNodes.forEach(n => {
        if (n.nodeType === 3) { s += n.data; return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName, inner = inline(n);
        if (tag === "BR") s += "\n";
        else if (tag === "STRONG" || tag === "B") s += `**${inner}**`;
        else if (tag === "EM" || tag === "I") s += `*${inner}*`;
        else if (tag === "CODE") s += "`" + inner + "`";
        else if (tag === "A") s += n.href && !n.href.startsWith("javascript") ? `[${inner}](${n.href})` : inner;
        else if (tag === "MARK") s += inner;
        else s += inner;
      });
      return s;
    };
    const walk = (el, depth) => {
      el.childNodes.forEach(n => {
        if (n.nodeType === 3) { const t = n.data.trim(); if (t) out.push(t); return; }
        if (n.nodeType !== 1) return;
        const tag = n.tagName;
        if (/^H[1-6]$/.test(tag)) out.push("#".repeat(Math.min(4, +tag[1] + 1)) + " " + inline(n).trim());
        else if (tag === "P") { const t = inline(n).trim(); if (t) out.push(t); }
        else if (tag === "PRE") out.push("```\n" + n.textContent.replace(/\n$/, "") + "\n```");
        else if (tag === "UL" || tag === "OL") {
          [...n.children].forEach((li, i) => {
            if (li.tagName !== "LI") return;
            const text = inline(li).trim().split("\n")[0];
            out.push("  ".repeat(depth) + (tag === "OL" ? `${i + 1}. ` : "- ") + text);
            [...li.children].filter(c => c.tagName === "UL" || c.tagName === "OL").forEach(sub => walk({ childNodes: [sub] }, depth + 1));
          });
        }
        else if (tag === "BLOCKQUOTE") out.push("> " + inline(n).trim().replace(/\n/g, "\n> "));
        else if (tag === "TABLE") { [...n.querySelectorAll("tr")].forEach((tr, i) => { const cells = [...tr.children].map(c => c.textContent.trim()); out.push("| " + cells.join(" | ") + " |"); if (i === 0) out.push("|" + cells.map(() => " --- ").join("|") + "|"); }); }
        else if (n.classList && (n.classList.contains("cc-block") || n.matches("div, section, article, span, message-content, model-response"))) walk(n, depth);
      });
    };
    walk(root, 0);
    return out.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
  }
  // The words of your own message, without the labels a site adds for screen readers (Gemini puts "You said" in front).
  const srOnly = el => {
    if (/visually-hidden|sr-only|screen-reader/i.test(el.className && el.className.baseVal === undefined ? el.className : "")) return true;
    const cs = getComputedStyle(el);
    return cs.display === "none" || cs.visibility === "hidden" || (cs.position === "absolute" && (parseFloat(cs.width) <= 1 || parseFloat(cs.height) <= 1)) || /inset\(50%\)/.test(cs.clipPath);
  };
  function userText(u) {
    const parts = []; const w = document.createTreeWalker(u, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) {
      const t = n.data; if (!t.trim()) { parts.push(t); continue; }
      if (!parts.join("").trim() && /^You said:?$/i.test(t.trim())) continue;       // a label standing alone before the message
      let hid = false; for (let p = n.parentElement; p && p !== u.parentElement; p = p.parentElement) if (srOnly(p)) { hid = true; break; }
      if (!hid) parts.push(t);
    }
    return norm(parts.join("")) || norm(u.textContent);
  }
  function questionFor(el) {
    const list = turns();
    if (el.classList.contains("cc-turn")) return { turn: list.find(t => t.user === el), text: userText(el) };
    const root = el.closest("[data-cc-msg]");
    const t = list.find(x => x.replies.includes(root)) || null;
    return { turn: t, text: t ? userText(t.user) : "" };
  }
  const SITE_WORDS = /(Claude|Gemini|ChatGPT|Grok|DeepSeek|Kimi|Qwen|通义|豆包|Doubao|元宝|Yuanbao|腾讯|Z\.ai|智谱|ChatGLM|文心|Yiyan|MiniMax|Copilot|Perplexity|Le Chat|Mistral|Meta AI)/;
  function pageTitle() { return document.title.replace(/\s+[-–|—]\s+[^-–|—]*$/, m => (SITE_WORDS.test(m) ? "" : m)).trim(); }
  // the words of a note with everything that can vary between two renders of the same text taken out:
  // whitespace, markdown marks, link addresses, a site's "You said" label
  const plain = t => String(t || "").replace(/^You said:?\s*/i, "").replace(/\]\([^)]*\)/g, "]").replace(/[*_`#>=]+/g, "").replace(/\s+/g, " ").trim();
  const noteKey = x => `${x.kind || ""}\n${plain(x.question)}\n${plain(x.answer)}`;
  // the same note with a different answer: a whole turn is the same turn; a paragraph or section is the same if one
  // answer is the start of the other (it was still being written) or they open with the same paragraph
  const firstPara = t => String(t || "").split(/\n\s*\n/)[0];
  const sameNote = (x, y) => x.url === y.url && x.kind === y.kind && plain(x.question) === plain(y.question) &&
    (x.kind === "turn" || (() => { const a = plain(x.answer), b = plain(y.answer), fa = plain(firstPara(x.answer)), fb = plain(firstPara(y.answer)); return !!a && !!b && (a.startsWith(b) || b.startsWith(a) || (Math.min(fa.length, fb.length) >= 20 && (fa.startsWith(fb) || fb.startsWith(fa)))); })());
  async function sendToNotes(h) {
    const { turn, text: question } = questionFor(h);
    let kind, answer;
    if (h.classList.contains("cc-turn")) { kind = "turn"; answer = (turn ? turn.replies.map(r => toMarkdown(r)).join("\n\n") : "").trim(); }
    else if (sectionKind(h) && sectionKeys(h).length > 1) { kind = "section"; const keys = sectionKeys(h); answer = keys.map(k => document.querySelector(`.cc-block[data-cc-key="${CSS.escape(k)}"]`)).filter(Boolean).map(el => toMarkdown({ childNodes: [el] })).join("\n\n"); }
    else { kind = "paragraph"; answer = toMarkdown({ childNodes: [h] }); }
    const payload = { site: SITE_NAME, url: location.href.split("#")[0], title: pageTitle(), t: Date.now(), kind, question, answer, qv: 2 };
    if (!answer.trim() && !question.trim()) { toast("Nothing to save here"); return; }
    const keys = kind === "turn" ? (turn ? turn.replies.flatMap(r => [...r.querySelectorAll(".cc-block")].map(b => b.dataset.ccKey)) : []) : kind === "section" ? sectionKeys(h) : [h.dataset.ccKey];
    const highlights = state.highlights.filter(hl => keys.includes(hl.key)).map(hl => ({ q: hl.quote, n: 0, note: "" }));
    // keep it inside the extension: one note per thing saved. The same words again is "already saved"; the same
    // question in the same conversation whose answer has grown or been re-rendered since (it was still being
    // written, a link changed) updates the note that is there instead of adding a second one.
    const saved = (await store.get("cc:saved")) || [];
    const same = saved.find(x => noteKey(x) === noteKey(payload));
    if (same) { toast("Already saved"); offerOpenSaved(); return; }
    const grown = saved.find(x => sameNote(x, payload));
    if (grown) {
      Object.assign(grown, { answer, title: payload.title, updated: payload.t, qv: 2 });
      const have = new Set((grown.highlights || []).map(h => h.q)); highlights.forEach(h => { if (!have.has(h.q)) (grown.highlights = grown.highlights || []).push(h); });
      await store.set("cc:saved", saved); renderPanel();
      toast("Saved note updated with the newer answer"); offerOpenSaved(); return;
    }
    saved.unshift(Object.assign({ id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), highlights, note: "" }, payload));
    await store.set("cc:saved", saved);
    state.notes.push({ t: payload.t, kind, question }); saveState(); renderPanel();
    toast(`Saved (${saved.length} kept)`); offerOpenSaved();
    // and, only if a doc is set up, send it there too
    if (settings.notesEndpoint) {
      const res = await postNotes(payload);
      if (!res.ok) { toast("Kept here, but the Google Doc didn't take it: " + (res.error || (res.data && res.data.error) || ("HTTP " + res.status))); log("notes error", res); }
    }
  }
  function offerOpenSaved() {
    $(".cc-undo").textContent = "Open saved"; $(".cc-undo").hidden = false; $(".cc-undo").onclick = openSavedPage;
    setTimeout(() => { if ($(".cc-undo").textContent === "Open saved") { $(".cc-undo").textContent = "Undo"; $(".cc-undo").onclick = undo; } }, 6000);
  }
  function openSavedPage(path) {
    path = typeof path === "string" ? path : "saved.html";
    if (globalThis.chrome?.runtime?.sendMessage) { try { chrome.runtime.sendMessage({ type: "cc:open", path }); return; } catch (e) { /* fall through */ } }
    window.open(path, "_blank");
  }
  function postNotes(payload) {
    return new Promise(resolve => {
      if (globalThis.chrome?.runtime?.sendMessage) {
        try { chrome.runtime.sendMessage({ type: "cc:notes", endpoint: settings.notesEndpoint, payload }, r => resolve(r || { ok: false, error: chrome.runtime.lastError ? chrome.runtime.lastError.message : "no response" })); return; } catch (e) { /* fall through */ }
      }
      fetch(settings.notesEndpoint, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), redirect: "follow" })
        .then(async r => { const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = { ok: r.ok, raw: text.slice(0, 300) }; } resolve({ ok: r.ok && data.ok !== false, status: r.status, data }); })
        .catch(e => resolve({ ok: false, error: String(e) }));
    });
  }

  // ------------------------------------------------------------ stay where you are reading when you send
  // Sites scroll to the new question and follow the answer as it streams. If you were reading further up, the
  // reading position is pinned: the site's own scrolls are undone until you scroll yourself, click "Go to answer",
  // or a few minutes pass. If you were already at the bottom, nothing changes.
  let pin = null, lastUserScrollInput = 0;
  const pinLog = [];                                       // the last few stay-put events, shown by "copy page info"
  const plog = t => { pinLog.push(new Date().toTimeString().slice(0, 8) + " " + t); if (pinLog.length > 12) pinLog.shift(); };
  const isDocScroller = c => c === document.scrollingElement || c === document.documentElement || c === document.body;
  const getTop = c => (isDocScroller(c) ? window.scrollY : c.scrollTop);
  const setTop = (c, y) => { if (isDocScroller(c)) window.scrollTo({ top: y, behavior: "auto" }); else c.scrollTop = y; };
  const maxTop = c => (isDocScroller(c) ? document.documentElement.scrollHeight - window.innerHeight : c.scrollHeight - c.clientHeight);
  const scrolls = n => n.nodeType === 1 && n.scrollHeight > n.clientHeight + 4 && /(auto|scroll|overlay)/.test(getComputedStyle(n).overflowY);
  const name = c => (isDocScroller(c) ? "the page" : shape(c).split(" ")[0]);
  // every box that can scroll between the conversation and the page, innermost first; the page itself last if it scrolls.
  // When none is found by walking up (the conversation sits in a box the walk cannot see), the biggest scrollable box on the page.
  function scrollContainersOf(el) {
    const out = [];
    for (let n = el; n && n !== document.body; n = n.parentElement) if (scrolls(n)) out.push(n);
    const doc = document.scrollingElement || document.documentElement;
    if (maxTop(doc) > 4) out.push(doc);
    if (!out.length) {
      let best = null;
      for (const n of document.querySelectorAll("div, main, section")) if (!layer.contains(n) && scrolls(n) && (!best || n.scrollHeight > best.scrollHeight)) best = n;
      out.push(best || doc);
    }
    return out;
  }
  function scrollContainerOf(el) { return scrollContainersOf(el)[0]; }
  function latestMessage() { const roots = assistantRoots(), users = userMessages(); return roots[roots.length - 1] || users[users.length - 1] || document.body; }
  function pinReadingPosition(how) {
    if (settings.stayPut === false) { plog(`${how}: stay put is switched off`); return; }
    if (pin) return;
    const cs = scrollContainersOf(latestMessage()), c = cs[0];
    const top = getTop(c);
    if (maxTop(c) - top < 240) { plog(`${how}: already at the bottom of ${name(c)} (${Math.round(maxTop(c) - top)}px left), the site may follow the answer`); return; }
    pin = { c, top, tops: new Map(cs.map(x => [x, getTop(x)])), until: Date.now() + 180000, holds: 0 };
    plog(`${how}: holding ${name(c)} at ${Math.round(top)} of ${Math.round(maxTop(c))}${cs.length > 1 ? ` (+${cs.length - 1} outer)` : ""}`);
    cs.forEach(x => x.style.setProperty("scroll-behavior", "auto", "important"));
    // scroll events can lag behind the site's own scrolling; a light poll keeps the position honest regardless
    pin.timer = setInterval(() => {
      if (!pin) return;
      if (Date.now() > pin.until) { releasePin(false, "time is up"); return; }
      if (!pin.c.isConnected) {                              // the site rebuilt its scroll box (Angular and React apps do): hold the new one at the same place
        const c2 = scrollContainerOf(latestMessage()); plog(`${name(pin.c)} was replaced by ${name(c2)}; holding it`);
        pin.tops.delete(pin.c); pin.c = c2; pin.tops.set(c2, pin.top); c2.style.setProperty("scroll-behavior", "auto", "important");
      }
      if (Date.now() - lastUserScrollInput > 400 && moved()) holdOrLetGo();
    }, 60);
    $(".cc-toast-text").textContent = "Staying where you were while the answer arrives";
    $(".cc-undo").textContent = "Go to answer"; $(".cc-undo").hidden = false; $(".cc-undo").onclick = () => releasePin(true, "go to answer");
    toastEl.hidden = false; clearTimeout(toastTimer);
  }
  const moved = () => [...pin.tops].some(([x, t]) => x.isConnected && Math.abs(getTop(x) - t) > 2);
  // While the pointer is inside an embedded frame (a diagram), the page cannot hear the wheel, so the reader's own
  // scrolling looks like the site's. The site's follow-scroll goes to the bottom; anything else is the reader: let go.
  function holdOrLetGo() {
    if (document.querySelector("iframe:hover") && maxTop(pin.c) - getTop(pin.c) > 400) { releasePin(false, "scrolled inside a frame"); return; }
    pin.holds++;
    for (const [x, t] of pin.tops) if (x.isConnected && Math.abs(getTop(x) - t) > 2) setTop(x, t);
  }
  function releasePin(goToAnswer, why) {
    if (!pin) return;
    const { c, tops, holds } = pin; clearInterval(pin.timer); pin = null;
    tops.forEach((t, x) => x.style.removeProperty("scroll-behavior"));
    plog(`let go (${why || "released"}) after holding ${holds} time${holds === 1 ? "" : "s"}`);
    $(".cc-undo").textContent = "Undo"; $(".cc-undo").onclick = undo; hideToast();
    if (goToAnswer) setTimeout(() => latestMessage().scrollIntoView({ block: "start", behavior: "auto" }), 0);   // instant: a smooth scroll can be dropped when the tab is not in front
    void c;
  }
  document.addEventListener("scroll", e => {
    if (!pin) return;
    if (Date.now() > pin.until || Date.now() - lastUserScrollInput < 400) { releasePin(false, Date.now() > pin.until ? "time is up" : "you scrolled"); return; }
    const c = e.target === document ? (document.scrollingElement || document.documentElement) : e.target;
    if (!pin.tops.has(c) && !(isDocScroller(c) && isDocScroller(pin.c))) {
      // the site scrolled a box this pin did not know about; if it holds the conversation, it is the one to hold
      if (c.nodeType === 1 && !layer.contains(c) && c.contains(latestMessage()) && scrolls(c)) { plog(`the site scrolled ${name(c)} instead; holding it`); pin.tops.set(c, Math.min(pin.top, maxTop(c))); c.style.setProperty("scroll-behavior", "auto", "important"); }
      else return;
    }
    if (moved()) holdOrLetGo();
  }, true);
  ["wheel", "touchmove"].forEach(ev => document.addEventListener(ev, () => { lastUserScrollInput = Date.now(); if (pin) releasePin(false, "you scrolled"); }, { passive: true, capture: true }));
  document.addEventListener("mousedown", e => { if (pin && (e.target === pin.c || e.target === document.documentElement || e.target === document.body)) lastUserScrollInput = Date.now(); }, true);   // scrollbar drag
  document.addEventListener("keydown", e => {
    const inBox = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA)$/.test(e.target.tagName));
    if (pin && !inBox && /^(ArrowUp|ArrowDown|PageUp|PageDown|Home|End| )$/.test(e.key)) releasePin(false, "you pressed a scroll key");
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.isComposing) { const ed = composer(); if (ed && (e.target === ed || ed.contains(e.target))) pinReadingPosition("Enter in the message box"); }
  }, true);
  document.addEventListener("click", e => {
    const b = e.target.closest && e.target.closest('button[aria-label*="send" i], button[data-testid*="send" i], button[type="submit"], button.send-button');
    if (b && !layer.contains(b)) pinReadingPosition("send button");
  }, true);

  // ------------------------------------------------------------ composer (never auto-sends)
  // sites built on React ignore a plain .value assignment; go through the native setter so their state updates
  function setNativeValue(el, value) {
    const proto = el.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, "value").set.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
  // querySelectorAll that also looks inside open shadow roots, where some sites now keep their editor
  function deepQueryAll(sel, root = document, out = [], depth = 0) {
    try { out.push(...root.querySelectorAll(sel)); } catch { /* bad selector */ }
    if (depth < 6) for (const el of root.querySelectorAll("*")) if (el.shadowRoot) deepQueryAll(sel, el.shadowRoot, out, depth + 1);
    return out;
  }
  const usable = e => !layer.contains(e) && !e.closest("[data-cc-msg]") && !e.closest("[aria-hidden='true']") && (e.getClientRects().length > 0 || e.offsetParent !== null);
  function composer() {           // the message box: never something inside a reply, such as a read-only code editor
    for (const sel of COMPOSER_SELS) { const el = [...document.querySelectorAll(sel)].find(usable); if (el) return el; }
    for (const sel of COMPOSER_SELS) { const el = deepQueryAll(sel).find(usable); if (el) return el; }                 // inside shadow roots
    const el = deepQueryAll('[contenteditable=""], [contenteditable="plaintext-only"], [role="textbox"]').find(usable);  // other spellings of "editable"
    if (el) return el;
    for (const doc of sameOriginFrameDocs()) {                                                                            // the box inside a frame of the same site
      for (const sel of [...COMPOSER_SELS, '[contenteditable=""]', '[contenteditable="plaintext-only"]', '[role="textbox"]']) {
        const e = deepQueryAll(sel, doc).find(usable); if (e) return e;
      }
    }
    return null;
  }
  function sameOriginFrameDocs() {    // documents of frames this page may read (same origin, or srcdoc); others stay sealed
    const out = [];
    for (const f of deepQueryAll("iframe")) { try { const d = f.contentDocument; if (d && d.body) out.push(d); } catch { /* another origin */ } }
    return out;
  }
  function insertIntoComposer(text, ask) {
    if (ask) { state.asks.push({ quote: ask.quote, action: ask.action, t: Date.now() }); saveState(); }
    const ed = composer();
    if (!ed) { toast("Couldn't find the message box. Copied to clipboard instead."); navigator.clipboard?.writeText(text); return; }
    ed.focus({ preventScroll: true });
    let ok = false;
    const doc = ed.ownerDocument || document;
    try { ok = doc.execCommand("insertText", false, text); } catch { ok = false; }
    if (!ok) {
      if (ed.tagName === "TEXTAREA") setNativeValue(ed, ed.value + text);
      else { ed.appendChild(doc.createTextNode(text)); ed.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text })); }
    }
    const r = ed.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) ed.scrollIntoView({ block: "nearest" });   // only if the box is not on screen
  }
  const quoteLine = q => q.includes("\n") ? `Re this part:\n\`\`\`\n${q}\n\`\`\`\n\n` : `Re: "${q.length > 220 ? q.slice(0, 217) + "…" : q}"\n\n`;

  // ------------------------------------------------------------ highlights
  // Mark a quote inside root even when it runs across bold, links or line breaks: one <mark> per stretch of text.
  // Matching ignores whitespace, because a selection's text and the page's text nodes disagree about spaces and breaks.
  function markQuote(root, quote, make) {
    const map = []; let flat = ""; const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n;
    while ((n = w.nextNode())) { const d = n.data; for (let i = 0; i < d.length; i++) if (!/\s/.test(d[i])) { flat += d[i]; map.push([n, i]); } }
    const q = quote.replace(/\s+/g, ""); const pos = q ? flat.indexOf(q) : -1; if (pos < 0) return [];
    const segs = []; let cur = null;
    for (let k = pos; k < pos + q.length; k++) { const [node, off] = map[k]; if (cur && cur.node === node) cur.end = off + 1; else segs.push(cur = { node, start: off, end: off + 1 }); }
    return segs.map(g => { const r = document.createRange(); r.setStart(g.node, g.start); r.setEnd(g.node, g.end); const m = make(); try { r.surroundContents(m); return m; } catch { return null; } }).filter(Boolean);
  }
  const hlSel = quote => `mark.cc-hl[data-cc-q="${hash(quote)}"]`;
  const hlMake = quote => () => { const m = document.createElement("mark"); m.className = "cc-hl"; m.dataset.ccQ = hash(quote); m.title = "Click to remove this highlight"; return m; };
  function applyHighlights() {
    state.highlights.forEach(h => {
      const el = document.querySelector(`.cc-block[data-cc-key="${CSS.escape(h.key)}"]`);
      if (el && !el.querySelector(hlSel(h.quote))) markQuote(el, h.quote, hlMake(h.quote));
    });
  }
  function addHighlight(blockEl, quote) {
    const key = blockEl.dataset.ccKey;
    if (!state.highlights.some(h => h.key === key && h.quote === quote)) { state.highlights.push({ key, quote, t: Date.now() }); saveState(); }
    if (!blockEl.querySelector(hlSel(quote))) markQuote(blockEl, quote, hlMake(quote));
  }
  // qs: the data-cc-q values of the highlights to take off this block (Undo on the toast brings them back)
  function removeHighlights(blk, qs) {
    const gone = [];
    qs.forEach(q => {
      let i; while ((i = state.highlights.findIndex(h => h.key === blk.dataset.ccKey && hash(h.quote) === q)) >= 0) gone.push(state.highlights.splice(i, 1)[0]);
      blk.querySelectorAll(`mark.cc-hl[data-cc-q="${q}"]`).forEach(x => x.replaceWith(...x.childNodes));
    });
    if (!gone.length) return;
    saveState(); undoStack.push({ kind: "hl", hs: gone }); toast("Highlight removed");
  }
  // click a highlight to remove it
  document.addEventListener("click", e => {
    const m = e.target.closest?.("mark.cc-hl"); const s = window.getSelection();
    if (!m || (s && !s.isCollapsed) || e.target.closest("a")) return;
    const blk = m.closest(".cc-block"); if (blk) removeHighlights(blk, [m.dataset.ccQ]);
  });

  // ------------------------------------------------------------ overlay UI
  const layer = document.createElement("div"); layer.id = "cc-layer";
  layer.innerHTML = `
    <div class="cc-gutter" hidden>
      <button class="cc-gbtn cc-got" title="Got it — erase this block (e)">✓</button>
      <button class="cc-gbtn cc-ask" title="Ask about this block (a)">?</button>
      <button class="cc-gbtn cc-mark-btn" title="Highlight this figure (m)" hidden>highlight</button>
      <button class="cc-gbtn cc-later-btn" title="Not central right now — park it to revisit later (l)">later</button>
      <button class="cc-gbtn cc-notes-btn" title="Save this question and answer to keep (s)">save</button>
    </div>
    <div class="cc-seltool" hidden>
      <button class="cc-primary" data-act="ask">Ask about this</button>
      <button data-act="simpler">Simpler</button>
      <button data-act="example">Example</button>
      <button data-act="unhl" hidden>Remove highlight</button>
    </div>
    <div class="cc-panel" hidden>
      <header><span>Clean Chat</span><span><button class="cc-close">Close</button></span></header>
      <div class="cc-list"></div>
      <footer><label><input type="checkbox" class="cc-show-stubs" checked> show stubs</label><label title="When you send a question while reading further up, keep the page where you were instead of jumping to the answer"><input type="checkbox" class="cc-stay-put" checked> stay put when I send</label><span><kbd>e</kbd> understood · <kbd>l</kbd> later · <kbd>s</kbd> save · <kbd>a</kbd> ask · <kbd>⌥L</kbd> park draft · <kbd>h</kbd> panel</span></footer>
    </div>
    <div class="cc-toast" hidden><span class="cc-toast-text"></span><button class="cc-undo">Undo</button></div>`;
  document.body.appendChild(layer);
  const $ = s => layer.querySelector(s);
  const gutter = $(".cc-gutter"), seltool = $(".cc-seltool"), panel = $(".cc-panel"), toastEl = $(".cc-toast");

  // gutter follows the hovered block
  let hovered = null, hideTimer;
  document.addEventListener("mouseover", e => {
    const blk = e.target.closest?.(".cc-block") || e.target.closest?.(".cc-turn") || e.target.closest?.(".cc-figure");
    if (blk && !blk.classList.contains("cc-erased") && !blk.classList.contains("cc-turn-erased")) { hovered = blk; showGutter(blk); clearTimeout(hideTimer); }
    else if (!layer.contains(e.target)) { hideTimer = setTimeout(() => { gutter.hidden = true; }, 350); }
    else clearTimeout(hideTimer);
  });
  function showGutter(blk) {
    const r = blk.getBoundingClientRect();
    const isHeading = /^H[1-6]$/.test(blk.tagName), isTurn = blk.classList.contains("cc-turn");
    gutter.querySelector(".cc-got").textContent = "✓";
    gutter.querySelector(".cc-got").title = isTurn ? "Understood: erase this question and its answer (e)" : (isHeading || (sectionKind(blk) && sectionKeys(blk).length > 1)) ? "Understood: collapse this and everything under it (e)" : "Got it — erase this block (e)";
    gutter.querySelector(".cc-got").classList.remove("cc-sec");
    const isFig = blk.classList.contains("cc-figure");
    gutter.querySelector(".cc-ask").hidden = isHeading || isTurn;
    gutter.querySelector(".cc-ask").title = isFig ? "Ask about this figure (a)" : "Ask about this block (a)";
    gutter.querySelector(".cc-got").hidden = isFig; gutter.querySelector(".cc-later-btn").hidden = isFig; gutter.querySelector(".cc-notes-btn").hidden = isFig;
    const mk = gutter.querySelector(".cc-mark-btn"); mk.hidden = !isFig; mk.textContent = isFig && state.figs[blk.dataset.ccFig] ? "unmark" : "highlight";
    gutter.hidden = false;
    placeGutter(blk);
  }
  // Put the buttons where they fit. Wide window: in the left margin beside the block. Narrow window or
  // split view, where there is no margin: floating just above the block, clamped inside the viewport.
  // For a block taller than the screen the buttons stay in view while you hover it.
  function placeGutter(blk) {
    const r = blk.getBoundingClientRect();
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const gw = gutter.offsetWidth, gh = gutter.offsetHeight, edge = 6, topSafe = 56;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    let left, top;
    if (r.left - gw - 8 >= edge) {
      gutter.classList.remove("cc-floating");
      left = r.left - gw - 8;
      top = clamp(r.top + 2, topSafe, Math.max(topSafe, r.bottom - gh - 2));
    } else {
      gutter.classList.add("cc-floating");
      left = clamp(r.right - gw, edge, vw - gw - edge);   // right-aligned: the line above usually ends short of the right edge
      top = r.top - gh - 4;
      if (top < topSafe) { top = clamp(r.top + 4, topSafe, Math.max(topSafe, r.bottom - gh - 4)); left = clamp(r.right - gw, edge, vw - gw - edge); }
    }
    gutter.style.left = Math.round(left) + "px";
    gutter.style.top = Math.round(clamp(top, 4, vh - gh - 4)) + "px";
  }
  function placeSeltool(rect) {
    const vw = document.documentElement.clientWidth, half = seltool.offsetWidth / 2, edge = 6;
    const cx = Math.max(half + edge, Math.min(vw - half - edge, rect.left + rect.width / 2));
    const below = rect.top < 70;
    seltool.classList.toggle("cc-below", below);
    seltool.style.left = Math.round(cx) + "px";
    seltool.style.top = Math.round(below ? rect.bottom : rect.top) + "px";
  }
  // keep things aligned when the window is resized (split view) or anything scrolls, including inner scrollers
  const reposition = () => {
    if (!gutter.hidden && hovered && document.contains(hovered)) placeGutter(hovered);
    if (!seltool.hidden) { const s = window.getSelection(); if (s && s.rangeCount && !s.isCollapsed) placeSeltool(s.getRangeAt(0).getBoundingClientRect()); else seltool.hidden = true; }
  };
  window.addEventListener("resize", reposition);
  document.addEventListener("scroll", reposition, true);
  function mark(h, why = "done") {
    if (h.classList.contains("cc-turn")) return eraseTurn(h.dataset.ccTurn, why);
    const keys = sectionKind(h) ? sectionKeys(h) : [h.dataset.ccKey]; const sec = keys.length > 1;
    erase(keys, sec ? (why === "later" ? "Section parked for later" : "Section marked as understood") : null, why, sec);
  }
  const gotIt = h => mark(h, "done");
  $(".cc-got").addEventListener("click", () => { if (!hovered) return; const h = hovered; gutter.hidden = true; mark(h, "done"); });
  $(".cc-later-btn").addEventListener("click", () => { if (!hovered) return; const h = hovered; gutter.hidden = true; mark(h, "later"); });
  $(".cc-notes-btn").addEventListener("click", () => { if (!hovered) return; const h = hovered; gutter.hidden = true; sendToNotes(h); });
  $(".cc-ask").addEventListener("click", () => { if (!hovered) return; gutter.hidden = true; askAbout(hovered); });
  $(".cc-mark-btn").addEventListener("click", () => { if (!hovered) return; gutter.hidden = true; toggleFigure(hovered); });

  // click a stub to restore it
  document.addEventListener("click", e => {
    const stub = e.target.closest?.(".cc-block.cc-erased");
    if (stub) { e.preventDefault(); e.stopPropagation(); restore([stub.dataset.ccKey]); return; }
    const tstub = e.target.closest?.(".cc-turn-erased");
    if (tstub) { e.preventDefault(); e.stopPropagation(); restoreTurns([tstub.dataset.ccTurn]); }
  }, true);

  // keep the overlay out of the clipboard: if a selection reaches into it (dragging past the end of a reply
  // does that, because the overlay sits at the end of the page), copy only the page's own text
  document.addEventListener("copy", e => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    let touches = false;
    for (let i = 0; i < sel.rangeCount; i++) { const r = sel.getRangeAt(i); if (r.intersectsNode(layer)) { touches = true; break; } }
    if (!touches) return;
    const parts = [];
    for (let i = 0; i < sel.rangeCount; i++) {
      const frag = sel.getRangeAt(i).cloneContents();
      frag.querySelectorAll("#cc-layer").forEach(n => n.remove());
      parts.push(frag.textContent);
    }
    e.clipboardData.setData("text/plain", parts.join("\n").replace(/\n{3,}/g, "\n\n").trim());
    e.preventDefault();
  }, true);

  // selection toolbar (the highlighter)
  let pending = null;
  document.addEventListener("mouseup", () => setTimeout(checkSelection, 0));
  // some sites' code viewers swallow the mouseup, so a selection that settles is checked too
  let selTimer; document.addEventListener("selectionchange", () => { clearTimeout(selTimer); selTimer = setTimeout(() => { if (seltool.hidden) checkSelection(); }, 350); });
  document.addEventListener("mousedown", e => { if (!seltool.contains(e.target)) seltool.hidden = true; });
  function checkSelection() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) { seltool.hidden = true; pending = null; return; }
    const range = sel.getRangeAt(0);
    let node = range.commonAncestorContainer;
    if (node.nodeType === 1 && node.shadowRoot && sel.getComposedRanges) {   // a code viewer in a shadow tree: look inside it
      let cr = null; try { cr = sel.getComposedRanges({ shadowRoots: [node.shadowRoot] })[0]; } catch { try { cr = sel.getComposedRanges(node.shadowRoot)[0]; } catch { /* older Chrome */ } }
      if (cr && cr.startContainer) node = cr.startContainer;
    }
    const host = node.nodeType === 1 ? node : node.parentElement;
    if (!host || layer.contains(host)) { seltool.hidden = true; pending = null; return; }
    // never the message box or a field; but a code viewer inside a reply is often an editable editor set read-only, and counts
    const inReply = host.closest("[data-cc-msg]");
    const box = composer();
    if (host.closest("input, textarea") || (host.closest("[contenteditable]") && (!inReply || (box && box.contains(host))))) { seltool.hidden = true; pending = null; return; }
    const CODE_SEL = "pre, code, .cc-block, .cm-editor, .cm-content, .monaco-editor, [class*='code' i], [class*='hljs' i], [class*='language-' i]";
    const code = host.closest(CODE_SEL) || (inReply && host.closest("[class*='window' i], [class*='terminal' i]"));   // a script or command shown in a reply counts, block or not
    const blk = host.closest(".cc-block"), fig = blk ? null : host.closest(".cc-figure");
    const text = fig ? norm(sel.toString()) : sel.toString().trim();
    const limit = code && !code.classList.contains("cc-block") || host.closest("pre") ? 2500 : 400;   // a stretch of code can be long
    if ((!blk && !fig && !code) || text.length < 2 || text.length > limit) { seltool.hidden = true; pending = null; return; }
    // highlights the selection already touches: offer to remove them, and never stack a second one on top
    const hits = blk ? [...new Set([...blk.querySelectorAll("mark.cc-hl")].filter(m => range.intersectsNode(m)).map(m => m.dataset.ccQ))] : [];
    pending = { blk, fig, text, hits };
    seltool.querySelector('[data-act="unhl"]').hidden = !hits.length;
    seltool.hidden = false;
    placeSeltool(range.getBoundingClientRect());
  }
  seltool.querySelectorAll("button").forEach(btn => btn.addEventListener("click", () => {
    if (!pending) return;
    const { blk, fig, text, hits } = pending; const act = btn.dataset.act;
    window.getSelection()?.removeAllRanges(); seltool.hidden = true; pending = null;
    if (act === "unhl") { removeHighlights(blk, hits); return; }
    if (blk && !hits.length) addHighlight(blk, text);
    const lead = fig ? figPrompt(fig, text) : quoteLine(text);
    if (act === "ask") insertIntoComposer(lead, { quote: text, action: "ask" });
    if (act === "simpler") insertIntoComposer(lead + "Explain this part more simply.", { quote: text, action: "simpler" });
    if (act === "example") insertIntoComposer(lead + "Give me a concrete example of this.", { quote: text, action: "example" });
  }));

  // history panel (press h)
  function togglePanel() { panel.hidden = !panel.hidden; renderPanel(); }
  $(".cc-close").addEventListener("click", () => { panel.hidden = true; });
  $(".cc-list").addEventListener("click", async e => {
    const b = e.target.closest("button"); if (!b) return;
    const { act, k, kind, i } = b.dataset;
    if (act === "restore") (kind === "turns" ? restoreTurns : restore)([k]);
    if (act === "draft-box") { const d = state.drafts.splice(+i, 1)[0]; saveState(); renderPanel(); if (d) insertIntoComposer(d.text); }
    if (act === "draft-drop") { state.drafts.splice(+i, 1); saveState(); renderPanel(); }
    if (act === "restore-all") { restore(Object.keys(state.erased)); restoreTurns(Object.keys(state.erasedTurns)); }
    if (act === "copy-later") copyText(laterMarkdown([indexEntry()]), "Later list copied as markdown");
    if (act === "copy-later-all") copyText(laterMarkdown(Object.values((await store.get("cc:index")) || {})), "Later list for all chats copied");
    if (act === "copy-figs") copyText(await figInfo(), "Page info copied");
    if (act === "copy-json") copyText(JSON.stringify((await store.get("cc:index")) || {}, null, 2), "Your data copied as JSON");
    if (act === "open-saved") openSavedPage();
    if (act === "open-journal") openSavedPage("saved.html?tab=journal");
    if (act === "unsave") { const saved = (await store.get("cc:saved")) || []; await store.set("cc:saved", saved.filter(x => x.id !== k)); renderPanel(); toast("Removed from saved"); }
    if (act === "notes-save") { settings.notesEndpoint = ($(".cc-endpoint").value || "").trim(); await saveSettings(); toast(settings.notesEndpoint ? "Notes doc URL saved" : "Notes doc URL cleared"); }
    if (act === "notes-test") { settings.notesEndpoint = ($(".cc-endpoint").value || "").trim(); await saveSettings(); if (!settings.notesEndpoint) { toast("Paste the Apps Script web app URL first"); return; } toast("Testing…"); const r = await postNotes({ ping: true, site: SITE_NAME, t: Date.now() }); toast(r.ok ? "Notes doc reachable" : "Test failed: " + (r.error || (r.data && (r.data.error || r.data.raw)) || ("HTTP " + r.status))); }
  });
  function parkDraft() {
    const ed = composer(); if (!ed) return;
    const text = (ed.tagName === "TEXTAREA" ? ed.value : ed.innerText).trim();
    if (!text) { toast("Nothing in the message box to park"); return; }
    state.drafts.push({ text, t: Date.now() });
    if (ed.tagName === "TEXTAREA") setNativeValue(ed, "");
    else { ed.focus(); document.execCommand("selectAll"); document.execCommand("delete"); }
    saveState(); renderPanel(); toast("Parked for later, unsent. Press h to see it.");
  }
  // ---- your data: a per-conversation record in one index, so it can be read across chats
  function indexEntry() {
    const pick = why => [
      ...Object.values(state.erased).filter(v => (v.why || "done") === why).map(v => ({ kind: "block", text: v.text, t: v.t })),
      ...Object.values(state.erasedTurns).filter(v => (v.why || "done") === why).map(v => ({ kind: "turn", text: v.text, t: v.t })),
    ];
    return { site: SITE_NAME, url: location.href.split("#")[0], title: pageTitle(), updated: Date.now(),
      later: [...pick("later"), ...state.drafts.map(d => ({ kind: "draft", text: d.text, t: d.t }))], understood: pick("done"), asks: state.asks, notes: state.notes || [] };
  }
  async function updateIndex() {
    const idx = (await store.get("cc:index")) || {};
    idx[storeKey()] = indexEntry();
    await store.set("cc:index", idx);
  }
  const queueIndex = debounce(updateIndex, 800);
  function laterMarkdown(entries) {
    const out = [];
    entries.forEach(e => {
      if (!e.later || !e.later.length) return;
      out.push(`## ${e.title || e.url}`, e.url, "");
      e.later.forEach(x => out.push(`- [ ] ${x.kind === "draft" ? "(unsent question) " : x.kind === "turn" ? "(question and answer) " : ""}${x.text}`));
      out.push("");
    });
    return out.join("\n") || "Nothing parked yet.";
  }
  async function copyText(text, msg) { try { await navigator.clipboard.writeText(text); toast(msg); } catch { toast("Couldn't reach the clipboard; the text is in the console."); log(text); } }
  $(".cc-stay-put").addEventListener("change", e => { settings.stayPut = e.target.checked; saveSettings(); if (!settings.stayPut) releasePin(false, "setting switched off"); });
  $(".cc-show-stubs").addEventListener("change", e => { state.showStubs = e.target.checked; document.documentElement.classList.toggle("cc-hide-stubs", !state.showStubs); saveState(); });
  async function renderPanel() {
    if (panel.hidden) return;
    const list = $(".cc-list");
    const savedAll = (await store.get("cc:saved")) || [];
    const savedHere = savedAll.filter(x => x.url === location.href.split("#")[0]).slice(0, 5);
    $(".cc-show-stubs").checked = !!state.showStubs;
    $(".cc-stay-put").checked = settings.stayPut !== false;
    const item = (kind, k, v, tag) => `<div class="cc-item">${tag ? `<span class="cc-kind">${tag}</span>` : ""}<span class="cc-txt" title="${escapeAttr(v.text)}">${escapeHtml(v.text)}</span><button data-act="restore" data-k="${escapeAttr(k)}" data-kind="${kind}">restore</button></div>`;
    const byWhy = why => [
      ...Object.entries(state.erased).filter(([, v]) => !v.under && (v.why || "done") === why).map(([k, v]) => ({ t: v.t, html: item("blocks", k, v, v.n ? `+${v.n}` : "") })),
      ...Object.entries(state.erasedTurns).filter(([, v]) => (v.why || "done") === why).map(([k, v]) => ({ t: v.t, html: item("turns", k, v, "Q+A") })),
    ].sort((a, b) => b.t - a.t).map(x => x.html);
    const later = byWhy("later"), done = byWhy("done");
    const drafts = state.drafts.map((d, i) => `<div class="cc-item"><span class="cc-kind">draft</span><span class="cc-txt" title="${escapeAttr(d.text)}">${escapeHtml(d.text)}</span><button data-act="draft-box" data-i="${i}">to box</button><button data-act="draft-drop" data-i="${i}">drop</button></div>`);
    list.innerHTML = `
      <div class="cc-sec"><span>Later <b>${later.length + drafts.length}</b></span><span><button data-act="copy-later">copy</button><button data-act="copy-later-all">copy all chats</button></span></div>
      ${later.length + drafts.length ? later.join("") + drafts.join("") : '<div class="cc-empty">Nothing parked. Hover a paragraph or your own message and click "later", or press ⌥L while typing a question to park it unsent.</div>'}
      <div class="cc-sec"><span>Understood <b>${done.length}</b></span><span><button data-act="restore-all">restore all</button></span></div>
      ${done.length ? done.join("") : '<div class="cc-empty">Nothing erased yet. Hover a paragraph and click ✓, or hover your own message and click ✓.</div>'}
      <div class="cc-sec"><span>Saved <b>${savedAll.length}</b></span><span><button data-act="open-saved">open saved</button><button data-act="open-journal">journal</button></span></div>
      ${savedHere.length ? savedHere.map(x => `<div class="cc-item"><span class="cc-txt" title="${escapeAttr(x.question)}">${escapeHtml(x.question || "(no question)")}</span><button data-act="unsave" data-k="${escapeAttr(x.id)}">remove</button></div>`).join("") : '<div class="cc-empty">Hover your own message, or a paragraph, and click "save" (or press s) to keep that question and answer inside the extension. The saved page lists everything you have kept, across chats.</div>'}
      <div class="cc-sec"><span>Google Doc, optional</span><span><button data-act="notes-test">send test</button></span></div>
      <div class="cc-item"><input class="cc-endpoint" type="url" placeholder="Apps Script web app URL (…/exec), if you also want a doc" value="${escapeAttr(settings.notesEndpoint || "")}"><button data-act="notes-save">save</button></div>
      <div class="cc-sec"><span>Your data</span><span><button data-act="copy-figs" title="Which hooks matched on this site, and what the figures are made of. No words from the conversation.">copy page info</button> <button data-act="copy-json">copy JSON</button></span></div>
      <div class="cc-empty">Everything you erase, park and ask is kept per conversation. Copy it as JSON to build a backlog page or a learning review.</div>`;
  }

  // toast
  let toastTimer;
  function toast(text, ms = 4000) { $(".cc-toast-text").textContent = text; toastEl.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, ms); }
  function hideToast() { toastEl.hidden = true; }
  $(".cc-undo").addEventListener("click", undo);

  // keyboard (ignored while typing)
  document.addEventListener("keydown", e => {
    const t = e.target;
    const typing = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && !typing) { if (undoStack.length) { e.preventDefault(); undo(); } return; }
    if (e.altKey && e.code === "KeyL" && typing) { e.preventDefault(); parkDraft(); return; }
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "Escape") { panel.hidden = true; seltool.hidden = true; gutter.hidden = true; return; }
    if (e.key === "h") { e.preventDefault(); togglePanel(); return; }
    if (!hovered || !document.contains(hovered)) return;
    if (hovered.classList.contains("cc-figure")) { if (e.key === "a") { e.preventDefault(); askAbout(hovered); } if (e.key === "m") { e.preventDefault(); toggleFigure(hovered); } return; }
    if (e.key === "e") { e.preventDefault(); gotIt(hovered); }
    if (e.key === "l") { e.preventDefault(); mark(hovered, "later"); }
    if (e.key === "s" || e.key === "n") { e.preventDefault(); sendToNotes(hovered); }
    if (e.key === "a" && !/^H[1-6]$/.test(hovered.tagName) && !hovered.classList.contains("cc-turn")) { e.preventDefault(); askAbout(hovered); }
  });

  const escapeHtml = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const escapeAttr = escapeHtml;

  // ------------------------------------------------------------ boot: observe the page and the URL
  (async () => {
    await loadState();
    scan();
    new MutationObserver(muts => {
      if (muts.every(m => layer.contains(m.target))) return;
      rescan();
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    setInterval(async () => { if (convoId() !== currentConvo) { await loadState(); scan(); renderPanel(); } }, 600);
    log(`ready on ${SITE_NAME}${location.pathname}`);
  })();
})();
