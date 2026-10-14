# Clean Chat for Claude Code

Claude Code has no web page to draw an overlay on, in the terminal or in the desktop app. What carries over is the
half of Clean Chat that is about your data: saving a question and answer to your notes doc, and parking questions
for later. The erasing half does not need rebuilding, because Claude Code already has it natively, and there it
changes what the model sees, which the browser extension never could.

## The reader: the extension's gestures, for a Claude Code session

`/reader` turns the current session into a Clean Chat page and opens it in your browser. Put it beside Claude Code
in split view. It shows your typed prompts and Claude's final answers, and gives you what the terminal cannot:

| Gesture | What happens |
|---|---|
| ✓ on a paragraph, a section or a whole question | It collapses to a stub. Click the stub or press `⌘Z` to bring it back. Nothing is ever lost, unlike `/clear`. |
| later | Same, in orange, for things to revisit. |
| Select a phrase, then **Highlight** | Yellow highlight that stays. Click a highlight to remove it. |
| Select a phrase, then **Ask about this**, **Simpler** or **Example** | The answer appears right there, under the passage, and stays through every rebuild (see "Asking from the page" below). Select a phrase *in that answer* and do it again: the next answer nests under it, as deep as you like. **Ask further** under an answer does the same without a quote. Opened as a plain file instead of served, a ready-made prompt with the quote is copied to your clipboard to paste into Claude Code. Works inside a code block too (a script, a command, a diagram drawn in text): a selection there may run to 2,500 characters and keeps its line breaks in the question. |
| The box at the bottom | Enter asks a new question; the answer is added as a question-and-answer at the end of the page. The question is given what you have done on the page (your highlights, the follow-ups you asked and their answers, what you parked), so "why did I keep asking about X" makes sense to it. **Copy for Claude Code** copies it instead, for when the session itself should get it. Every ask from here, and the three buttons above it, also carries a digest of the page: every question on it with how its answer opens (the ones marked understood included, labelled so), your highlights, your follow-ups with their answers, and what you parked. |
| Suggest questions | Above the box. Five questions worth asking next, worked out from your highlights, follow-ups and parked passages; click one to put it in the box. |
| Where are my gaps? | Above the box. A big-picture introduction to the context behind what you have been asking: the ideas under your questions, how they connect, what to understand first. Added at the end of the page like any other answer. |
| Concept map | Above the box. A tree of the concepts behind your questions, drawn on the page: the trunk (the one idea everything hangs on), the branches under it, and the shaded twigs where your questions sit, with two sentences on which branch to understand first. |
| save | Appears when the Clean Chat extension is installed. Keeps that question and answer, that section, or that paragraph with its question, in the extension's saved list, next to what you save from Claude, ChatGPT and the other sites, with the same one-note-per-thing rule. Press `s` on a focused block for the same. |
| notes | Appears once you have run `/note-setup`. Saves that question and answer, or that paragraph, to your Google Doc. |

Your marks are saved per session in the browser and keyed to the text they belong to, so they survive every rebuild
and refresh. Run `/reader` again whenever you want the newest answers pulled in.

The way that needs no slash command at all, and works whatever kind of session you are in: double-click
**Start Reader.command** in the `clean_chat` folder. A Terminal window opens and the reader follows whichever Claude
Code session you used last, in any project. The same thing from a terminal:

```bash
python3 claude-code/cc_reader.py --serve      # from the clean_chat folder
```

It serves the page at http://127.0.0.1:8379/ to your own machine only, rebuilds whenever Claude Code writes a new
answer, and the page refreshes itself without disturbing your marks or your scroll position. macOS may ask once
whether Terminal or Python can read your Desktop folder, because that is where this project lives.

The page changes what you see, not what Claude Code remembers. To make Claude Code itself forget, that is still
`/compact` with instructions.

## Asking from the page

When the page is served (by `/reader` or Start Reader.command, not opened as a file), a question asked on it is
answered on it. The server runs `claude -p --resume <session> --fork-session` with your question, the highlighted
phrase and the paragraph it is in, and streams the answer back under the passage as it is written.

- **It uses your subscription, so choose how much it reads.** Every answer is a Claude Code run under your own
  login, from the same allowance as the session. By default (**with the whole session** unticked) the run is given
  only the passage, the question it answers and that answer: a short session's worth of tokens, roughly 20k, most
  of it Claude Code's own setup. Tick **with the whole session** and a forked copy of the session answers instead,
  which re-reads everything in it, like one more step: cheap while the session's cache is warm (within an hour of
  its last step), the price of a cold start otherwise. The choice is remembered; the footer under each answer says
  which it was and how many tokens were read.
- **Never the session itself.** Either way the session gains nothing: a fork is a separate copy, a passage-only run
  is a session of its own, and the reader follows neither. Side questions stay out of the context you are paying
  for. When Claude Code itself should get a question, use **Copy for Claude Code**.
- **What it can do.** Read files, nothing else: Bash, editing, writing, web access and subagents are switched off
  for the fork.
- **Who can call it.** Only the page itself. The server listens on this Mac only, and the browser never sends the
  request from any other site (the custom header it needs forces a cross-origin preflight that the server refuses).
- **Where answers live.** With your other marks, in the browser, per session; they come back after every rebuild.
  **✓ Got it** folds an answer away, with undo. Each fork is also a Claude Code session of its own under
  `~/.claude/projects/`, listed in `reader/forks.json` so the reader skips them; delete them whenever you like.

`/reader` starts the server in a Terminal window, exactly as Start Reader.command does: that window is the reader;
close it or press Ctrl+C to stop it. There is one reader at a time: a newer start takes the port over from an older
one, and `/reader` restarts it when it follows another chat or an older version of the code. If an answer ever says
**401** or **Failed to authenticate**, the `claude` command's stored sign-in has lapsed (the app you chat in signs in
separately): in Terminal run `claude`, send any message, and `/login` if that fails; then ask again. The reader is
not involved in signing in and never asks for credentials.

## Saving into the extension, and asking from the saved page

With the Clean Chat extension installed, the reader page gets a **save** button on every question, section and
paragraph. The extension's bridge script runs on the reader's own address only (`http://127.0.0.1:8379`), and the
page hands it the note with `postMessage`; the bridge writes it into the extension's saved list exactly as "save"
on a chat site does, so the saved page shows Claude Code notes beside the others, searchable and exportable, with
"Claude Code · <project>" as the source. Nothing is sent anywhere: the page and the extension talk inside the browser.

On the saved page, every note now has an **Ask further** box, whichever site it came from. A question from there is
answered by the reader on this computer, passage-only: Claude is given the note, the follow-ups already answered on
it, and your question, about 20k tokens of your subscription a time, and the answer is kept with the note (exported
with it, searched with it, removable one by one). It needs the reader running (Start Reader.command, or `/reader`),
and it needs the reader to know your extension: the first time, open the reader page once with the extension on,
and the page introduces the extension's id to the server. From then on the server answers that extension and nothing
else; a web page gets no CORS answer and its request never leaves the browser.

## Commands

| Command | What it does |
|---|---|
| `/reader` | Opens this session as a Clean Chat page: highlight, erase with undo, park for later, ask in place, save into the extension. |
| `/note` | Saves the last question you typed and Claude's final answer to it to the same Google Doc the extension uses. The Apps Script rewrites the question for clarity, as in the browser. |
| `/later <question>` | Parks a curiosity question instead of asking it. Claude confirms in a line and carries on with the task. |
| `/backlog` | Builds `clean_chat/backlog.html` from everything parked in Claude Code. Add the extension's JSON export to the same command line to merge both. |
| `/note-setup <url>` | One time: the Apps Script `/exec` URL, the same one you pasted into the extension. Only `https://script.google.com/` URLs are accepted. |

Install them once with `claude-code/install_skills.sh`: it copies the five skill folders from `claude-code/skills/`
into `~/.claude/skills/`, pointed at this checkout, so they work in every project, not just this one. Claude Code watches that folder, so a running
session picks them up without a restart. To remove one, delete its folder.

`/reader` shows the session you run it from. To look at a different one, run the script yourself with
`--project "<folder>"`, `--session <id>`, or `--any` for whichever session you used last. `--port N` runs a second
reader beside the first; it keeps its page in `reader/port-N/` so the two never overwrite each other.

## The native eraser

| Browser extension | Claude Code |
|---|---|
| ✓ understood, which hides text from you only | `/compact keep X, drop the discussion of Y`, which summarises the session and really removes Y from the model's context |
| Undo | Press Esc twice to rewind the conversation to an earlier message |
| Start a clean page | `/clear` |

## Where things live, and what leaves your machine

- `cc_note.py` reads the current session's transcript, which Claude Code already keeps locally under
  `~/.claude/projects/`. It takes the last typed prompt that has a finished answer and only the text written after
  the last tool call, so you get the answer, not the narration.
- Parked questions: `~/.clean-chat/later.json`, in the same shape as the extension's export.
- The notes URL: `~/.clean-chat/config.json`.
- Nothing is sent anywhere except the one question and answer you save with `/note`, to your own Apps Script URL.

Try `python3 cc_note.py note --dry-run` to see exactly what `/note` would send, without sending it.
