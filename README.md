# Clean Chat

A reading layer for AI chats. Erase what you understand, park what can wait, highlight and ask about what you don't, and keep what matters: on the chat sites you already use, and on your Claude Code sessions.

Built by Ziyao (Trista) Tian. Used daily on my own reading; not yet on any store. Built with Claude Code, with every change reviewed by me.

## Two parts

| Part | What it is | Where |
|---|---|---|
| **Extension** | A Chrome (Manifest V3) extension for 19 chat sites: ChatGPT, Claude, Gemini, Grok, DeepSeek, Doubao, Kimi, Qwen, Z.ai, Yuanbao, ChatGLM, Yiyan, MiniMax, Perplexity, Copilot, Le Chat and Meta AI. Checked live on Claude, Gemini, ChatGPT and Grok; the others run on hooks taken from public page descriptions plus a structural fallback, so expect to send a "copy page info" paste when one misbehaves. | [`extension/`](extension/README.md) |
| **Reader for Claude Code** | A local page that renders a Claude Code session as the same reading surface, answers questions asked on the page by forking the session (never the session itself), and adds learning tools driven by your own marks: suggested questions, a gaps summary, a concept map. | [`claude-code/`](claude-code/README.md) |

Each folder's README has the install steps and the full list of gestures.

## What it does, in one screen

- **Erase** a paragraph, a section or a whole question-and-answer once you understand it. It collapses to a stub; undo any time. Nothing is deleted.
- **Later** parks a passage or a question you are curious about, so a deadline is not derailed.
- **Highlight** a phrase, or ask about it: a follow-up answered right under the passage (on the reader), or a ready prompt put into the message box for you to send (on the sites; the extension never sends anything for you).
- **Save** a question and answer, a section or a paragraph into one local list across every site, searchable, taggable, exportable, with notes and highlights on top. One note per thing saved. Ask further on any saved note.
- **Reader only:** follow-ups nest; the bottom box knows what you highlighted, asked and parked; one click gives you five questions to ask next, the big picture behind your questions, or a concept map drawn as a tree.

## Privacy

Everything stays in your browser (the extension's own storage) or on your Mac (the reader's folder and `~/.clean-chat/`). The extension reads the chat page it is on and writes to its own storage. It sends nothing anywhere unless you configure the optional Google Doc endpoint, and then only the one note you chose to save. The reader serves pages to `127.0.0.1` only and takes questions only from its own page and from the extension once introduced. Answers asked from the reader run through your own `claude` command, on your own account.

## Install

- Extension: `chrome://extensions`, Developer mode, **Load unpacked**, pick the `extension` folder. Details in [`extension/README.md`](extension/README.md).
- Reader: Python 3 and the `claude` command. Double-click `Start Reader.command`, or install the slash commands with `claude-code/install_skills.sh` and type `/reader` in any Claude Code session. Details in [`claude-code/README.md`](claude-code/README.md).

## Layout

```
extension/      the Chrome extension (content.js, saved.html, bridge.js, …) and test fixtures
claude-code/    cc_reader.py (the reader server), cc_note.py (/note, /later), skills/ (slash commands)
mockup-v0.html  the page template the reader renders into; opens on its own as a demo with example content
build_page.py   markdown to page blocks, shared by the reader
build_backlog.py  turns parked questions into one backlog page
```

## Licence

AGPL-3.0. Use it, change it, share it; if you distribute a changed copy or run one as a service, publish your changes under the same licence. See [LICENSE](LICENSE).
