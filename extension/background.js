// Clean Chat background worker: forwards "save to notes" requests to the Apps Script web app.
// Runs outside the page so the request is not subject to the site's CORS rules.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // a selection made inside an embedded frame (frame.js): pass it to Clean Chat in the same tab's main page
  if (msg && (msg.type === "cc:framesel" || msg.type === "cc:framehello" || msg.type === "cc:frameinput")) {
    if (sender.tab) chrome.tabs.sendMessage(sender.tab.id, { type: msg.type, text: String(msg.text || "").slice(0, 400), from: sender.origin || "" }, { frameId: 0 }).catch(() => {});
    return;
  }
  // read the selected text in every frame of the asking tab (the chat page asks when you click ? on a diagram)
  if (msg && msg.type === "cc:framesels") {
    if (!sender.tab || !chrome.scripting) { sendResponse({ ok: false, frames: [], error: "scripting unavailable" }); return; }
    chrome.scripting.executeScript({
      target: { tabId: sender.tab.id, allFrames: true },
      func: () => {
        const s = window.getSelection();
        return { top: window.top === window, site: location.origin === "null" ? location.protocol + " (sandboxed)" : location.origin,
                 text: s && !s.isCollapsed ? s.toString().replace(/\s+/g, " ").trim().slice(0, 400) : "" };
      },
    }).then(res => sendResponse({ ok: true, frames: res.map(r => r.result).filter(Boolean) }))
      .catch(e => sendResponse({ ok: false, frames: [], error: String(e) }));
    return true;
  }
  if (msg && msg.type === "cc:open") { chrome.tabs.create({ url: chrome.runtime.getURL(msg.path || "saved.html") }); sendResponse({ ok: true }); return; }
  if (!msg || msg.type !== "cc:notes") return;
  fetch(msg.endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" }, // a "simple" request: Apps Script does not answer preflights
    body: JSON.stringify(msg.payload),
    redirect: "follow",
  })
    .then(async r => {
      const text = await r.text();
      let data; try { data = JSON.parse(text); } catch { data = { ok: r.ok, raw: text.slice(0, 300) }; }
      sendResponse({ ok: r.ok && data.ok !== false, status: r.status, data });
    })
    .catch(e => sendResponse({ ok: false, error: String(e) }));
  return true; // keep the channel open for the async response
});
