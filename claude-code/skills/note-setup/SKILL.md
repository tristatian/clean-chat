---
name: note-setup
description: Store the Apps Script web app URL that Clean Chat notes are saved to. Only when the user types /note-setup with a URL.
argument-hint: <Apps Script web app URL ending in /exec>
disable-model-invocation: true
allowed-tools: Bash(python3:*)
---
Save this notes URL by running, with the Bash tool:
python3 __CLEAN_CHAT__/claude-code/cc_note.py set-url "<url>"

URL: $ARGUMENTS

If the line above is empty or still shows a placeholder, the URL is the text I typed after /note-setup. Tell the user in one short line whether it was saved.
