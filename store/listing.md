# Chrome Web Store listing — Clean Chat

Everything below is ready to paste into the Developer Dashboard. Fields are in the order the dashboard shows them.

## Store listing

**Name:** Clean Chat

**Summary (132 max):**
Erase what you understand, park what can wait, save what matters. A reading mode for ChatGPT, Claude, Gemini and 16 more.

**Description:**

Clean Chat turns a chat with an AI into something you can read like a textbook: with an eraser, a highlighter, and a notebook.

ERASE what you understand. Hover a paragraph, a section, or a whole question and answer, and press e. It collapses to a one-line stub. Undo any time; nothing is deleted.

PARK what can wait. Press l to set a passage aside for later. It stays visible in colour so you can come back when the deadline has passed.

ASK about a phrase. Select any words in an answer and a small toolbar offers "Ask about this", "Simpler" and "Example". It puts a ready prompt into the message box for you to send. Clean Chat never sends anything for you.

SAVE what matters. Press s on a question and answer, a section, or a paragraph to keep it in one list across every site: searchable, taggable, pinnable, exportable as markdown or a backup file, with your own notes and highlights on top. The same thing saved twice is refused; the same question whose answer grew is updated in place.

WORKS ON 19 CHAT SITES: ChatGPT, Claude, Gemini, Grok, DeepSeek, Perplexity, Copilot, Le Chat, Meta AI, Doubao, Kimi, Qwen, Z.ai, ChatGLM, Yuanbao, Yiyan, MiniMax and variants. Four are checked live by the author; the rest run on shared markup rules and a structural fallback. If a site breaks, press h on the page, click "copy page info", and paste it into a GitHub issue: markup names only, no words from your conversation.

PRIVATE BY CONSTRUCTION. There is no Clean Chat server. Everything stays in your browser's extension storage. The only network calls are to your own computer (an optional local reader for Claude Code) and to an endpoint you type in yourself. No analytics, no accounts, no tracking.

Free and open source (AGPL-3.0): github.com/tristatian/clean-chat

**Category:** Productivity → Tools (or Education if the dashboard offers it)

**Language:** English

**Icon:** store/icon128.png (128 × 128)

**Screenshots (1280 × 800):**
1. store/screenshots/1-chat.png — a ChatGPT-shaped page with an understood stub, a parked code block, and the selection toolbar.
2. store/screenshots/2-saved.png — the saved page: four notes from four sites, a pinned note with tags, a highlight with a note, and an "Ask further" thread.
3. store/screenshots/3-reader.png — the Claude Code reader page.

**Official URL / homepage:** https://github.com/tristatian/clean-chat
**Support URL:** https://github.com/tristatian/clean-chat/issues

## Privacy tab

**Single purpose:** Clean Chat lets the user mark, hide, highlight, and save parts of an AI chat page they are reading, so the page becomes a readable document.

**Permission justifications:**

- `storage` and `unlimitedStorage`: all marks, highlights, notes and saved answers are kept in the extension's own local storage on the user's computer. Saved answers can be long and numerous, hence unlimited.
- `scripting`: used for one thing, on demand: when the user clicks "ask" on a diagram, the background script reads the text currently selected inside the chat page's embedded frames (`executeScript` with `allFrames`), so the question can name the part of the diagram they meant. Nothing is injected persistently and nothing is stored from it.
- Host permissions (the 23 chat-site addresses): the content script must run on each chat site to read the page the user is looking at and draw the marks on it. It reads only the page it is on. The two `claudeusercontent.com` / `claudemcpcontent.com` entries are the frames Claude uses for diagrams, so a diagram can be marked like a paragraph. `127.0.0.1:8379` and `localhost:8379` are the user's own optional local reader.

**Remote code:** No. All code is in the package.

**Data usage:** Select "I do not collect or use user data". The extension collects nothing. It does not transmit anything to the developer.

**Privacy policy URL:** https://github.com/tristatian/clean-chat#privacy

## Distribution tab

**Visibility:** Unlisted (for the first version; switch to Public after the first round of fixes).
**Deferred publishing:** on, so an approved review waits for your Publish click.
**Regions:** all.

## Package

Run `python3 build_store_zip.py` from the repository root. Upload `dist/clean-chat-<version>.zip`. The zip holds the eight files the extension needs plus the icons; no test fixtures.

Before each upload: bump `version` in `extension/manifest.json`, rebuild, and commit.
