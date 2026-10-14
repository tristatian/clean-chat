---
name: later
description: Park a curiosity question in the user's Clean Chat backlog instead of answering it now. Use when the user types /later followed by a question.
argument-hint: <the question to come back to>
allowed-tools: Bash(python3:*)
---
Park this question in my Clean Chat backlog. Do not answer it.

Question: $ARGUMENTS

If the line above is empty or still shows a placeholder, the question is the text I typed after /later.

Run this with the Bash tool, passing the question as one properly quoted argument:
python3 __CLEAN_CHAT__/claude-code/cc_note.py later "<question>"

Then confirm in one short line and go back to what we were doing.
