/**
 * Clean Chat → Google Doc
 *
 * The extension POSTs {question, answer, title, url, site, kind, t} here. This script rewrites the
 * question for clarity with a model (optional), then appends the question and answer to a Google Doc
 * in the Drive folder you choose. Setup steps are in extension/README.md under "Notes doc".
 */

// ---------- settings ----------
const FOLDER_NAME = "Clean Chat notes";   // the script creates this folder in My Drive the first time and remembers it. Move or rename it afterwards if you like.
const FOLDER_ID = "";                       // optional: use an existing folder instead (needs the broad Drive permission, see README). Leave "" for the safer default.
const DOC_MODE = "one";               // "one" = a single running doc named DOC_NAME. "per-conversation" = one doc per chat title.
const DOC_NAME = "Clean Chat notes";
const CLEAN_QUESTION = true;          // rewrite the question for clarity with a model. Needs a key in Script Properties (see README).
const KEEP_ORIGINAL = false;          // also keep the question exactly as typed, in small grey text under the rewritten one.
const ANTHROPIC_MODEL = "claude-opus-5";   // "claude-haiku-4-5" is the cheapest option and fine for this job
const GEMINI_MODEL = "gemini-3.8-flash";

// ---------- entry points ----------
function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (p.ping) {
      const folder = getFolder_();
      return json_({ ok: true, pong: true, folder: folder.getName(), folderUrl: folder.getUrl(), mode: DOC_MODE });
    }
    const original = String(p.question || "").trim();
    const question = CLEAN_QUESTION && original ? cleanQuestion_(original) : original;
    const doc = getDoc_(p);
    appendEntry_(doc.getBody(), p, question, original);
    doc.saveAndClose();
    return json_({ ok: true, docUrl: doc.getUrl(), question: question });
  } catch (err) {
    return json_({ ok: false, error: String((err && err.message) || err) });
  }
}

function doGet() {
  return json_({ ok: true, hint: "Clean Chat notes endpoint. The extension POSTs here; nothing to see in a browser." });
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------- which doc, in which folder ----------
// The folder: made by the script itself the first time, then remembered. With the narrow Drive permission
// the script can only see files and folders it created, which is exactly the point.
function getFolder_() {
  if (FOLDER_ID) return DriveApp.getFolderById(FOLDER_ID);
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty("CC_FOLDER_ID");
  if (saved) {
    try { const f = DriveApp.getFolderById(saved); if (!f.isTrashed()) return f; } catch (e) { /* recreate below */ }
  }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty("CC_FOLDER_ID", folder.getId());
  return folder;
}

function getDoc_(p) {
  const folder = getFolder_();
  const name = DOC_MODE === "per-conversation" ? String(p.title || "Untitled conversation").slice(0, 100) : DOC_NAME;
  const files = folder.getFilesByName(name);
  while (files.hasNext()) {
    const f = files.next();
    if (f.getMimeType() === MimeType.GOOGLE_DOCS) return DocumentApp.openById(f.getId());
  }
  const doc = DocumentApp.create(name);
  DriveApp.getFileById(doc.getId()).moveTo(folder);
  return doc;
}

// ---------- writing the entry ----------
function appendEntry_(body, p, question, original) {
  const when = Utilities.formatDate(new Date(p.t || Date.now()), Session.getScriptTimeZone(), "d MMM yyyy, HH:mm");
  const convTitle = String(p.title || "").trim();
  if (convTitle && lastHeading_(body, DocumentApp.ParagraphHeading.HEADING1) !== convTitle) {
    const h1 = body.appendParagraph(convTitle);
    h1.setHeading(DocumentApp.ParagraphHeading.HEADING1);
    if (p.url) h1.setLinkUrl(p.url);
  }
  const q = body.appendParagraph(question || "(no question)");
  q.setHeading(DocumentApp.ParagraphHeading.HEADING2);
  const meta = body.appendParagraph((p.site || "") + " · " + when + (p.kind && p.kind !== "turn" ? " · " + p.kind : ""));
  meta.setHeading(DocumentApp.ParagraphHeading.NORMAL).setFontSize(9).setForegroundColor("#888888");
  if (p.url) meta.setLinkUrl(p.url);
  if (KEEP_ORIGINAL && original && original !== question) {
    const o = body.appendParagraph("as typed: " + original);
    o.setItalic(true).setFontSize(9).setForegroundColor("#999999");
  }
  renderMarkdown_(body, String(p.answer || ""));
  body.appendParagraph("");
}

function lastHeading_(body, level) {
  const ps = body.getParagraphs();
  for (let i = ps.length - 1; i >= 0; i--) if (ps[i].getHeading() === level) return ps[i].getText();
  return null;
}

function renderMarkdown_(body, md) {
  const lines = md.split("\n");
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      const code = []; i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) code.push(lines[i++]);
      i++;
      const para = body.appendParagraph(code.join("\n") || " ");
      para.setFontFamily("Courier New").setFontSize(9).setBackgroundColor("#f3f3f3");
      continue;
    }
    const h = line.match(/^\s*(#{1,6})\s+(.*)$/);
    if (h) {
      const para = body.appendParagraph("");
      applyInline_(para, h[2]);
      para.setHeading(h[1].length <= 2 ? DocumentApp.ParagraphHeading.HEADING3 : DocumentApp.ParagraphHeading.HEADING4);
      i++; continue;
    }
    const li = line.match(/^(\s*)(?:[-*+]|(\d+)[.)])\s+(.*)$/);
    if (li) {
      const item = body.appendListItem("");
      applyInline_(item, li[3]);
      item.setGlyphType(li[2] ? DocumentApp.GlyphType.NUMBER : DocumentApp.GlyphType.BULLET);
      item.setNestingLevel(Math.min(3, Math.floor(li[1].length / 2)));
      i++; continue;
    }
    const bq = line.match(/^\s*>\s?(.*)$/);
    if (bq) {
      const para = body.appendParagraph("");
      applyInline_(para, bq[1]);
      para.setItalic(true).setIndentStart(24);
      i++; continue;
    }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) {
        if (!/^\s*\|\s*:?-{2,}/.test(lines[i])) rows.push(lines[i].trim().replace(/^\||\|$/g, "").split("|").map(c => c.trim()));
        i++;
      }
      if (rows.length) body.appendTable(rows).setFontSize(9);
      continue;
    }
    if (!line.trim()) { i++; continue; }
    const para = body.appendParagraph("");
    applyInline_(para, line);
    i++;
  }
}

// **bold**, *italic*, `code` and [text](url); everything else is literal
function applyInline_(para, raw) {
  const re = /(\*\*(.+?)\*\*)|(`([^`]+)`)|(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|((?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w))/g;
  let text = "", last = 0, m;
  const spans = [];
  while ((m = re.exec(raw)) !== null) {
    text += raw.slice(last, m.index);
    const start = text.length;
    if (m[2] !== undefined) { text += m[2]; spans.push({ start: start, end: text.length - 1, bold: true }); }
    else if (m[4] !== undefined) { text += m[4]; spans.push({ start: start, end: text.length - 1, code: true }); }
    else if (m[6] !== undefined) { text += m[6]; spans.push({ start: start, end: text.length - 1, url: m[7] }); }
    else if (m[9] !== undefined) { text += m[9]; spans.push({ start: start, end: text.length - 1, italic: true }); }
    last = m.index + m[0].length;
  }
  text += raw.slice(last);
  para.setText(text || " ");
  const t = para.editAsText();
  spans.forEach(s => {
    if (s.end < s.start) return;
    if (s.bold) t.setBold(s.start, s.end, true);
    if (s.italic) t.setItalic(s.start, s.end, true);
    if (s.code) { t.setFontFamily(s.start, s.end, "Courier New"); t.setBackgroundColor(s.start, s.end, "#f3f3f3"); }
    if (s.url) t.setLinkUrl(s.start, s.end, s.url);
  });
}

// ---------- rewriting the question for clarity ----------
function cleanQuestion_(text) {
  const props = PropertiesService.getScriptProperties();
  const anthropicKey = props.getProperty("ANTHROPIC_API_KEY");
  const geminiKey = props.getProperty("GEMINI_API_KEY");
  const instructions =
    "The user typed a question to an AI assistant quickly and loosely. Rewrite it as a clear, well-formed question " +
    "they can read back in their own notes later. Keep exactly what they asked, including any specifics, names, numbers " +
    "and constraints. Fix typos, remove filler and asides, and keep it to one or two sentences. Do not answer it and do " +
    "not add anything they did not ask. Return only the rewritten question.";
  try {
    if (anthropicKey) {
      const r = UrlFetchApp.fetch("https://api.anthropic.com/v1/messages", {
        method: "post", contentType: "application/json", muteHttpExceptions: true,
        headers: { "x-api-key": anthropicKey, "anthropic-version": "2023-06-01", "anthropic-beta": "server-side-fallback-2026-07-01" },
        payload: JSON.stringify({
          model: ANTHROPIC_MODEL, max_tokens: 300, system: instructions,
          output_config: { effort: "low" }, fallbacks: "default",
          messages: [{ role: "user", content: text }],
        }),
      });
      const d = JSON.parse(r.getContentText());
      const block = (d.content || []).find(b => b.type === "text");
      if (block && block.text && block.text.trim()) return block.text.trim();
    } else if (geminiKey) {
      const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + GEMINI_MODEL + ":generateContent", {
        method: "post", contentType: "application/json", muteHttpExceptions: true,
        headers: { "x-goog-api-key": geminiKey },
        payload: JSON.stringify({
          system_instruction: { parts: [{ text: instructions }] },
          contents: [{ role: "user", parts: [{ text: text }] }],
        }),
      });
      const d = JSON.parse(r.getContentText());
      const parts = d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts;
      const out = parts ? parts.map(x => x.text || "").join("").trim() : "";
      if (out) return out;
    }
  } catch (err) {
    // fall through: keep the question as typed rather than lose the note
  }
  return text;
}
