---
name: note
description: Save the last question the user typed and its final answer to the user's Clean Chat notes Google Doc. Use when the user types /note.
allowed-tools: Bash(python3:*)
---
Result of saving the last exchange to the notes doc:

!`python3 __CLEAN_CHAT__/claude-code/cc_note.py note`

Tell the user in one short line what was saved, or what went wrong and how to fix it. Do nothing else.
