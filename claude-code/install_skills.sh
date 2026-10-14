#!/bin/zsh
# Installs the Clean Chat slash commands (/reader, /note, /later, /backlog, /note-setup) as personal Claude Code
# skills in ~/.claude/skills, pointed at this checkout. Run it again after moving the folder. Delete a skill's
# folder in ~/.claude/skills to remove it.
set -e
here="$(cd "$(dirname "$0")/.." && pwd)"
for s in reader note later backlog note-setup; do
  mkdir -p ~/.claude/skills/$s
  sed "s#__CLEAN_CHAT__#$here#g" "$here/claude-code/skills/$s/SKILL.md" > ~/.claude/skills/$s/SKILL.md
  echo "installed /$s"
done
echo "Claude Code picks these up without a restart."
