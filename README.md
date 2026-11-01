# Clean Chat

LLM chat is linear. Human learning is often a tree. Some answers you understand right away; others raise more questions than they answer. Clean Chat lets you collapse the answers you understand, highlight what you don't, ask follow-ups on the sub-questions (one click for a simpler version or an example), and get suggested questions that fill the gaps in what you know. It works on 19 LLM chat sites and as a reader for Claude Code sessions.


## Two parts

| Part | What it is | Where |
|---|---|---|
| **Extension** | A Chrome (Manifest V3) extension for 19 chat sites: ChatGPT, Claude, Gemini, Grok, DeepSeek, Doubao, Kimi, Qwen, Z.ai, Yuanbao, ChatGLM, Yiyan, MiniMax, Perplexity, Copilot, Le Chat and Meta AI. Checked live on Claude, Gemini, ChatGPT and Grok; the others run on hooks taken from public page descriptions plus a structural fallback, so expect to send a "copy page info" paste when one misbehaves. | [`extension/`](extension/README.md) |
| **Reader for Claude Code** | A local page that renders a Claude Code session as the same reading surface, answers questions asked on the page by forking the session (never the session itself), and adds learning tools driven by your own marks: suggested questions, a gaps summary, a concept map. | [`claude-code/`](claude-code/README.md) |

Each folder's README has the install steps and the full list of gestures.

## What it does, in one screen

- **Collapse** a paragraph, a section or a whole question-and-answer once you understand it. It folds to a one-line stub; undo any time. Nothing is deleted.
- **Later** parks a passage or a question you are curious about, so a deadline is not derailed.
- **Highlight** a phrase, or ask about it: a follow-up answered right under the passage (on the reader), or a ready prompt put into the message box for you to send (on the sites; the extension never sends anything for you).
- **Save** what matters, from any of the sites or from a Claude Code session, into **one list on your computer**: a question and answer, a section or a paragraph, with your notes and highlights on top, searchable, taggable, pinnable, exported as markdown or a backup file. One note per thing saved: the same words again are refused, and a question whose answer has grown is updated in place. **Ask further** on any saved note, weeks later, from any site.
- **Questions from your own gaps** (reader): the page keeps what you highlighted, asked and parked, and one click turns that into **five questions to ask next**, a **"Where are my gaps?"** introduction to the context under your questions, or a **concept map** drawn as a tree with the branches your questions touched shaded. Follow-ups nest as deep as you need.

## Privacy

Everything stays in your browser (the extension's own storage) or on your Mac (the reader's folder and `~/.clean-chat/`). The extension reads the chat page it is on and writes to its own storage. It sends nothing anywhere unless you configure the optional Google Doc endpoint, and then only the one note you chose to save. The reader serves pages to `127.0.0.1` only and takes questions only from its own page and from the extension once introduced. Answers asked from the reader run through your own `claude` command, on your own account.

There is no Clean Chat server. Nothing you read, mark, save or ask is sent to the author, and there is no analytics, crash reporting or install tracking. You can check this yourself: the extension's only network calls are to `127.0.0.1` (the reader) and to the endpoint you typed in yourself, and the reader's only outbound call is the `claude` command. This section is the extension's privacy policy.

## Your own model access

Asking a question from the reader, or from a saved note, runs the official `claude` command on your machine. Whatever that command is signed in as is what pays for the answer:

- A Claude subscription (Pro or Max): run `claude` once in a terminal and `/login`. The reader does nothing with your login besides calling the command.
- An API key: set `ANTHROPIC_API_KEY` in your shell as you would for Claude Code itself. `ANTHROPIC_BASE_URL` is passed through too, so a compatible endpoint works the same way.

Clean Chat never reads, stores or copies your credentials or tokens, and it never signs in for you. Every answer is run read-only: the forked session may read your project, never edit it or run commands.

## Install

- Extension: one click from the [Chrome Web Store](https://chromewebstore.google.com/detail/clean-chat/jnaancgndlpgaeckmnebcomdoldkijkh) (unlisted: only this link reaches it). To run the latest code instead: `chrome://extensions`, Developer mode, **Load unpacked**, pick the `extension` folder. Details in [`extension/README.md`](extension/README.md).
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
