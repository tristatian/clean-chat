---
name: reader
description: Open the current Claude Code session as a Clean Chat reader page in the browser, where the user can highlight, erase with undo, and park passages for later. Use when the user types /reader or asks for the reader page.
allowed-tools: Bash(python3:*)
---
Result of building the reader page for this session:

!`python3 __CLEAN_CHAT__/claude-code/cc_reader.py --open-served`

Tell the user in one short line that the reader page opened in their browser and how many questions it holds, or what went wrong. If the output notes that the running reader follows another session, pass that on. Do nothing else.
