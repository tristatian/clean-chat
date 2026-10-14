# Clean Chat (extension v0)

A reading-mode layer for LLM chat sites: Claude, Gemini, ChatGPT, Grok, DeepSeek, Doubao, Kimi, Qwen, Z.ai, Yuanbao, ChatGLM, Yiyan, MiniMax, Copilot, Perplexity, Le Chat and Meta AI. Erase what you understand, highlight what you don't.
Nothing is ever sent on your behalf: "ask" only puts the quote into the message box for you to finish.

## Install (Chrome, Arc, Brave, Edge)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this `extension` folder.
4. Open any conversation on a supported site (list below) and reload the page once. After an update that adds sites, Chrome disables the extension until you approve the new site permissions on its card; you can also limit it to the sites you use under the card's **Site access** ("On specific sites").

Updating the code: edit the files, then press the ↻ reload icon on the extension card, and reload the claude.ai tab.

## What it does

| Action | How |
|---|---|
| Erase a paragraph you understand | Hover it, click ✓ (or press `e`). It collapses to a faint one-line stub. |
| Erase a whole section | Hover a heading, click ✓. The section collapses to one line ("+N more"); click it to bring the whole section back. The same happens on a paragraph that works as a title (a bold or numbered lead-in such as **5. Something**), which takes everything up to the next title, and on a paragraph that introduces a list, which takes its bullets. Bullets and ordinary paragraphs still collapse one at a time. |
| Park a paragraph for later | Hover it, click "later" (or press `l`). It collapses to a violet stub, kept apart from the understood ones. Same on headings (whole section) and on your own messages (question and answer). |
| Park a question before sending it | While typing in the message box, press `⌥L`. The draft is saved to the Later list and the box is cleared, so a curiosity question never derails a deadline. "to box" in the panel puts it back. |
| Ask about code | Select a stretch of a script, a command or a diagram drawn in text inside a reply, up to 2,500 characters, and the same toolbar appears; the quote keeps its lines. It works even on sites whose code viewer swallows the mouse-up, on code the extension could not map to a paragraph (then it can be asked about but not highlighted), and in editor-style code viewers that the site builds as a read-only editable field. |
| Keep a question and answer | Hover your own message (whole exchange) or a paragraph (that paragraph plus its question), click "save" or press `s`. It is kept inside the extension. Press `h` and open the saved page to read everything you have kept, across chats, search it, copy it as markdown, or remove it. Nothing leaves your browser. A note is kept once: saving the same words again says "Already saved", and saving the same question or section again after its answer has grown or been re-rendered updates the note that is there instead of adding a second one. |
| Keep what you read in Claude Code | On the Claude Code reader page (`/reader`, see `claude-code/README.md`), the same "save" button keeps a question and answer, a section or a paragraph here, beside the notes from the chat sites. The extension's bridge script runs only on the reader's local address (`http://127.0.0.1:8379`) and takes the note from the page through `postMessage`; nothing is sent anywhere. |
| Ask further about anything you kept | Under every saved note, whichever site it came from, an **Ask further** box puts a question to the Clean Chat reader running on this computer. Claude is given that note, the follow-ups already answered on it, and your question, nothing else, about 20k tokens of your Claude subscription a time. The answer is kept with the note, searched and exported with it, and removable one by one. The reader has to be running (Start Reader.command in the `clean_chat` folder, or `/reader` in Claude Code) and, once, you open the reader page with the extension on so it learns which extension may ask. |
| Annotate what you kept | On the saved page, a "Your notes" box above each answer saves as you type. Select any phrase in the answer to highlight it, or to highlight it and attach a note; click a highlight to edit its note or remove it. Highlights you made while reading travel with the save. Notes and highlights are searched, exported with the item, and included in the backup. |
| Erase a whole question and answer | Hover your own message, click ✓ (or press `e`). Your question becomes a one-line stub, and Claude's reply, any images or files attached to the question, and that message's own buttons are hidden until you restore it. |
| Bring a block or a question back | Click its stub, or press `h` for the list and click restore. |
| Undo | `⌘Z` (when you're not typing), or the Undo on the toast. |
| Ask about a paragraph | Hover it, click ? (or press `a`). The quote is put in the message box. |
| Ask about a phrase | Select the phrase, click "Ask about this", "Simpler", or "Example". The phrase stays highlighted. |
| Highlight or ask about a graph | Hover a chart, diagram or image in a reply. **highlight** (or `m`) puts a yellow ring around it that stays; **?** (or `a`) puts a reference to that figure in the message box, by its label and by the sentence just before it, for you to finish your question. Select a label inside the figure first and the reference names that part. Figures that the site embeds as a separate page (Claude's interactive diagrams) are handled by `frame.js`, a 15-line script that runs inside those frames and only reports the text you select there to the chat page; for this the extension also runs on Anthropic's two content sites, claudeusercontent.com and claudemcpcontent.com. If a selection is not picked up, press `h` and click **copy page info**: it lists what each figure is made of. |
| Organise what you kept | On the saved page: **pin** an item to hold it at the top (`p`), **rename** it to a title of your own, and give it **tags**. Filter chips above the list show All, Pinned, and each tag. Removing asks once more before it deletes. |
| Keep a journal | The saved page has a second tab, **Journal** (`2`, and `1` goes back). **New entry** (`n`) starts a free-standing entry that is not attached to any saved answer. The first line is the title, it saves as you type, and entries can be pinned, tagged, searched and exported the same way. "download backup" writes one file with both. |
| Panel | Press `h` (when not typing). Sections: Later, Understood, Saved, an optional Google Doc, and Your data. Later has "copy" (this chat, as a markdown checklist) and "copy all chats". Your data has "copy JSON" for everything across conversations. |
| Hide stubs completely | Untick "show stubs" in the history panel. |
| Keep reading while the answer arrives | On by default. When you send a question while you are reading further up, the page stays where you were instead of jumping to the new answer, until you scroll yourself or click "Go to answer" on the toast. If you were already at the bottom, nothing changes. Switch it off with "stay put when I send" in the panel. |

## Where your data lives

Everything, including saved answers, is in Chrome's own storage for this extension, on this computer: a folder inside
your Chrome profile. It is not synced, not uploaded, and there is no account or server. It costs nothing and has no
cap beyond your disk (the extension asks for Chrome's "unlimited storage" permission, which shows no warning). The
saved page shows how much is in use.

Two things to know. Removing the extension from Chrome deletes its storage; reloading or updating it does not. And the
data lives in this one Chrome profile, so it is not on your phone or in another browser; "download backup" on the
saved page writes a JSON file you can keep anywhere, and "copy JSON" in the panel exports the activity index.

State is saved per conversation in the extension's local storage, so erasures survive reloads. A second record, one entry per conversation with what you parked, understood and asked, is kept in an index so it can be read across chats and exported.

## Using the data

`copy JSON` in the panel gives you the index. Save it as a file and run:

```bash
python3 build_backlog.py clean-chat-export.json backlog.html
```

That turns every parked item across every conversation into one Clean Chat page, with a link back to each chat, so the backlog is read and erased with the same tools. The design doc has a review prompt you can paste the JSON into for a weekly summary of what you asked, what you parked, and where your questions cluster.

## Google Doc, optional

Saving keeps things inside the extension. If you also want a running Google Doc, the same "save" button can append to one.
This is off until you set it up, and most people will not need it.

One button appends a question and its answer to a Google Doc. It works through a short script that lives inside
your own Google account (Google calls this Apps Script; think of it as a macro attached to your Drive). The extension
never signs in to Google. It only sends text to the script's address, and the script writes the doc.

### What it can and cannot touch

The script asks for three permissions, and nothing else:

| Permission Google will show | What it is for | What it cannot do |
|---|---|---|
| See, edit, create and delete files that this app created | Make the "Clean Chat notes" folder and the docs inside it | See or touch any other file in your Drive |
| See, edit, create and delete your Google Docs documents | Write into the notes doc | Anything outside Docs |
| Connect to an external service | Only if you add a model key for the clarity rewrite; it calls that one API | Nothing else on the internet |

You can read everything the script does: it is the one file `apps-script/Code.gs`, about 150 lines. The notes
folder is created by the script the first time, so it only ever sees that folder. Move or rename the folder afterwards;
the script keeps track of it by id.

### Setup, about ten minutes

1. **Make the script.** Go to https://script.google.com, click **New project**. In the editor, select the sample code
   and replace it with the contents of `apps-script/Code.gs`. Rename the project (top left) to "Clean Chat notes".
2. **Limit its permissions.** Click the gear icon (Project Settings), tick **Show "appsscript.json" manifest file in
   editor**. Back in the editor, open `appsscript.json` and replace its contents with `apps-script/appsscript.json`.
   This is the file that pins the three permissions above. Without it, Google would ask for full Drive access.
3. **Optional, the clarity rewrite.** Still in Project Settings, under **Script Properties**, add a property named
   `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` with your key. The key stays on Google's servers, never in the browser.
   Without a key the question is saved exactly as typed.
4. **Deploy.** Click **Deploy**, **New deployment**, choose type **Web app**. Execute as: **Me**. Who has access:
   **Anyone**. Click Deploy. Google will now show a screen saying it has not verified this app: that is its generic
   warning for any personal script, and the "app" is the code you just pasted. Click **Advanced**, then
   **Go to Clean Chat notes (unsafe)**, then **Allow**. Copy the web app URL that ends in `/exec`.
5. **Connect the extension.** On claude.ai or Gemini press `h`, paste the URL under **Google Doc, optional**, click **save**,
   then **send test**. It should answer with the name of the folder it made. Chrome may also ask once to let the
   extension "read and change data on script.google.com"; that is the extension being allowed to talk to your script.

From then on every **save** also goes to the doc. If the doc ever rejects one, the item is still kept in the
extension and the toast says so.

### Why "Anyone" is acceptable

"Who has access: Anyone" means anyone who holds the exact `/exec` URL can send text to your notes doc. They cannot read
the doc, and cannot reach anything else in your account. The URL is long and random, so treat it like a password for
one file. If it ever leaks, Deploy, Manage deployments, Archive, and make a new one; the old URL dies. The stricter
setting, "Only myself", would require the extension to sign in to Google, which is the bigger permission.

### Where your text goes

Extension, over HTTPS, to your script at script.google.com, into your doc. If you add a model key, the question text
(not the answer) also goes to that one API for the rewrite. Nothing goes anywhere else.

To use an existing folder of your choosing instead of the one the script makes, set `FOLDER_ID` at the top of
`Code.gs` and remove the `oauthScopes` block from `appsscript.json`; that costs the full Drive permission.
After any edit to `Code.gs`, redeploy with Deploy, Manage deployments, pencil icon, Version: New version. The URL stays
the same.

For testing without Google, `mock-notes.js` is a local stand-in endpoint. It is only for development and you do not
need it.

## Claude Code and the desktop app

A browser extension cannot run inside the Claude desktop app or a terminal. For Claude Code, the notes and
parked-question features are available as slash commands instead: see `../claude-code/README.md`. For the desktop
app's chat window, open the same conversation at claude.ai in Chrome; conversations sync, and the extension works there.

## What it cannot do

Erasing changes what you see, not what Claude sees. Claude's context is still the full transcript,
and its replies still arrive at the bottom of the page. That is the ceiling of any extension; the
independent app in the design doc is where erasing changes the model's context too.

## Sites

| Site | Address | Hooks |
|---|---|---|
| Claude | claude.ai | checked on the live site |
| Gemini | gemini.google.com | checked on the live site |
| ChatGPT | chatgpt.com, chat.openai.com | checked on the live site |
| Grok | grok.com (not Grok inside x.com) | checked on the live site |
| DeepSeek | chat.deepseek.com | from open-source exporters: `.ds-markdown` replies, `.ds-collapsible-text` questions |
| Doubao 豆包 | doubao.com | from open-source exporters: `data-testid="receive_message"` replies |
| Kimi | kimi.com, kimi.moonshot.cn | best guess (`.chat-content-item-assistant` / `-user`), then the generic hooks |
| Qwen 千问 | chat.qwen.ai, chat.qwenlm.ai | Open WebUI markup: `.chat-assistant` / `.chat-user`, `#chat-input` |
| Qwen 通义 | tongyi.com | generic hooks only |
| Z.ai (GLM) | chat.z.ai | Open WebUI markup, as Qwen |
| ChatGLM 智谱清言 | chatglm.cn | generic hooks only |
| Yuanbao 元宝 | yuanbao.tencent.com | from open-source exporters: `.agent-chat__list__item--human` questions, `.hyc-content-md` replies |
| Yiyan 文心一言 | yiyan.baidu.com | generic hooks only |
| MiniMax | chat.minimax.io, chat.minimaxi.com | generic hooks only |
| Copilot | copilot.microsoft.com, copilot.com | from open-source exporters: `data-content="ai-message"` / `"user-message"` |
| Perplexity | perplexity.ai | `.prose` answers; questions inferred |
| Le Chat | chat.mistral.ai | generic hooks only |
| Meta AI | meta.ai | generic hooks only |

Every site goes through the same three stages: the site's own hooks, then the **generic hooks** most chat apps share
(`data-message-author-role`, `data-role`, markdown containers such as `.markdown-body`, `.markdown-prose`, `.prose`),
then a **structural fallback** that needs no hooks at all: the innermost containers of rendered paragraphs are the
replies, and once there are two replies, the rows of the list that hold no reply are your messages. Paragraph-level
features (erase, highlight, ask) work on anything the fallback finds; only the question-level features need the
question hook. The conversation id comes from the address: a site's own pattern, or `?id=` / the last path segment.

Only the first four sites were run against the live pages. The others were written from open-source exporters' hooks
and the Open WebUI markup; the first visit may need an adjustment, which the next section makes easy. The local
fixtures `test-fixture.html` (Claude), `-gemini`, `-chatgpt`, `-grok`, `-deepseek` and `-generic` (a site with no
known hooks at all) exercise the three stages.

## If nothing appears

Press `h` and click **copy page info**, then paste it into a message to whoever maintains the code (or into a
chat with Claude Code). It contains no words from the conversation: which profile was used, how many replies and
questions were found and through which hook, the tag and class names around the first reply and the first
question, and, when nothing matched, the shapes of the elements that hold paragraphs. That is enough to write the
missing hook.

To fix it by hand: open DevTools (⌥⌘I) and look for lines starting with `[Clean Chat]`.

- `found N replies via ...` means it attached. If N is 0 or the line is missing, the page markup has
  changed. Right-click a reply, choose Inspect, and note the tag and attributes of the container
  that holds the reply's paragraphs. Add a selector for it to that site's `assistant` list in the
  `SITES` table near the top of `content.js`. The `user` entry is the selector for your own messages
  and `composer` is the message box; `replyContainer` is the box that holds a whole reply (its
  thinking block included) and is hidden when a question is erased.
- "Couldn't find the message box" means the composer selector needs updating.
