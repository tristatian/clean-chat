// Clean Chat, inside embedded frames only (the separate little pages a chat site uses to show a diagram or artifact).
// It does two small things: it notes when you scroll with the pointer inside the frame, and when you select text in such a frame, it tells the Clean Chat script in the chat page what the
// selected text is, so "ask about this" can name the part you meant. Nothing is stored here and nothing leaves the browser.
(() => {
  if (window.top === window || !globalThis.chrome?.runtime?.sendMessage) return;
  const say = msg => { try { chrome.runtime.sendMessage(msg); } catch { /* extension was reloaded */ } };
  let last = "", timer;
  const report = () => {
    const s = window.getSelection();
    const text = s && !s.isCollapsed ? s.toString().replace(/\s+/g, " ").trim().slice(0, 400) : "";
    if (text === last) return;
    last = text; say({ type: "cc:framesel", text });
  };
  document.addEventListener("selectionchange", () => { clearTimeout(timer); timer = setTimeout(report, 150); });
  setInterval(report, 500);   // a page that rewrites itself drops listeners; the timer survives
  // scrolling with the pointer inside the frame: tell the chat page, so "stay put" lets go instead of holding the page
  let lastInput = 0;
  const input = () => { const now = Date.now(); if (now - lastInput < 250) return; lastInput = now; say({ type: "cc:frameinput" }); };
  ["wheel", "touchmove"].forEach(ev => window.addEventListener(ev, input, { passive: true, capture: true }));
  say({ type: "cc:framehello" });
})();
