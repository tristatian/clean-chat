// Local stand-in for the Apps Script endpoint, for testing the extension without Google.
// Logs every payload it receives and answers like the real script would.
const http = require("http");
http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") { res.writeHead(204); return res.end(); }
  let body = "";
  req.on("data", c => { body += c; });
  req.on("end", () => {
    let p = {}; try { p = JSON.parse(body || "{}"); } catch (e) { /* not json */ }
    console.log("[mock-notes]", req.method, JSON.stringify(p).slice(0, 800));
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(p.ping ? { ok: true, pong: true, folder: "mock" } : { ok: true, docUrl: "https://docs.google.com/document/d/mock", question: p.question ? "Cleaned: " + p.question : "" }));
  });
}).listen(8390, "127.0.0.1", () => console.log("mock notes endpoint on http://127.0.0.1:8390"));
