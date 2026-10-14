#!/usr/bin/env python3
"""Turn a Clean Chat data export (the JSON copied from the extension panel) into a backlog page.

Usage:
    python3 build_backlog.py clean-chat-export.json [more-exports.json ...] [backlog.html]

Claude Code's parked questions live in ~/.clean-chat/later.json and can be passed alongside the extension's export.

Every parked item across every conversation becomes a block on one Clean Chat page,
grouped by conversation with a link back, newest conversation first.
"""
import html
import json
import sys
import time
from pathlib import Path

from build_page import render


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    args = [Path(a).expanduser() for a in sys.argv[1:]]
    sources = [a for a in args if a.suffix == ".json"]
    outs = [a for a in args if a.suffix == ".html"]
    out = outs[0] if outs else sources[0].with_name("backlog.html")
    idx = {}
    for src in sources:
        if src.exists():
            idx.update(json.loads(src.read_text(encoding="utf-8")))
    entries = [e for e in idx.values() if e.get("later")]
    entries.sort(key=lambda e: e.get("updated", 0), reverse=True)
    blocks, n = [], 0
    for e in entries:
        n += 1
        title = html.escape(e.get("title") or e.get("url") or "Conversation")
        url = html.escape(e.get("url", ""), quote=True)
        blocks.append({"id": f"c{n}h", "type": "h2", "html": title})
        if url:
            blocks.append({"id": f"c{n}l", "type": "p", "html": f'<a href="{url}" target="_blank" rel="noopener">Open the conversation on {html.escape(e.get("site", "the site"))}</a>'})
        for j, item in enumerate(sorted(e["later"], key=lambda x: x.get("t", 0))):
            kind = item.get("kind")
            lead = {"draft": "Unsent question", "turn": "Question and answer"}.get(kind, "")
            text = html.escape(item.get("text", ""))
            when = time.strftime("%d %b", time.localtime(item.get("t", 0) / 1000)) if item.get("t") else ""
            body = (f"<em>{lead}:</em> " if lead else "") + text + (f' <span style="color:var(--muted);font-size:0.8em">· {when}</span>' if when else "")
            blocks.append({"id": f"c{n}i{j}", "type": "li" if kind == "block" else "p", "html": body, "marker": ""})
    total = sum(len(e["later"]) for e in entries)
    page = {
        "title": "Parked for later",
        "meta": f"{total} item{'s' if total != 1 else ''} across {len(entries)} conversation{'s' if len(entries) != 1 else ''}, from your Clean Chat export. Erase what no longer matters; highlight what still does.",
        "blocks": blocks or [{"id": "empty", "type": "p", "html": "Nothing parked yet. In the extension, hover a paragraph or your own message and click \"later\", or press Option+L while typing a question."}],
    }
    render(page, out)
    print(f"wrote {out}  |  {len(entries)} conversations, {total} parked items")


if __name__ == "__main__":
    main()
