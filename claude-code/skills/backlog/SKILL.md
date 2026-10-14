---
name: backlog
description: Build the user's Clean Chat backlog page from every question parked for later. Use when the user types /backlog.
allowed-tools: Bash(python3:*)
---
!`cd __CLEAN_CHAT__ && python3 build_backlog.py ~/.clean-chat/later.json backlog.html`

Tell the user in one short line how many items it holds and that the page is at __CLEAN_CHAT__/backlog.html.
