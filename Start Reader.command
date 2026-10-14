#!/bin/zsh
# Double-click to start the Clean Chat reader. It follows whichever Claude Code session you used last,
# in any project, and serves the page to this Mac only. Close this window (or press Ctrl+C) to stop it.
cd "$(dirname "$0")"
exec python3 claude-code/cc_reader.py --serve
