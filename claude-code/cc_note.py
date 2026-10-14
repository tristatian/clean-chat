#!/usr/bin/env python3
"""Clean Chat for Claude Code: the data half of the browser extension, for sessions that have no web page.

  cc_note.py note [--dry-run]     save the last question and its final answer to your notes Google Doc
  cc_note.py later "question"     park a question for later, in the same format the extension exports
  cc_note.py set-url <url>        remember your Apps Script web app URL (the same one the extension uses)
  cc_note.py show                 print where things are stored and what is parked

It reads the current session's transcript, which Claude Code keeps on your machine under ~/.claude/projects/.
Nothing is sent anywhere except the one question and answer you ask it to save, to your own Apps Script URL.
"""
import json
import os
import re
import sys
import time
import urllib.request
from pathlib import Path

HOME = Path.home()
STORE = Path(os.environ.get("CLEAN_CHAT_HOME") or HOME / ".clean-chat")   # CLEAN_CHAT_HOME is for testing
CONFIG = STORE / "config.json"
LATER = STORE / "later.json"


# ---------------------------------------------------------------- small helpers
def load(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def save(path, data):
    STORE.mkdir(exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def project_dir():
    return Path(os.environ.get("CLAUDE_PROJECT_DIR") or os.getcwd()).resolve()


def transcript_dir(proj):
    # Claude Code names the folder after the project path with every non-alphanumeric character turned into "-"
    return HOME / ".claude" / "projects" / re.sub(r"[^A-Za-z0-9]", "-", str(proj))


def latest_transcript(proj):
    d = transcript_dir(proj)
    files = sorted(d.glob("*.jsonl"), key=lambda f: f.stat().st_mtime, reverse=True) if d.is_dir() else []
    return files[0] if files else None


# ---------------------------------------------------------------- reading the transcript
NOISE = re.compile(r"^\s*<(command-name|command-message|command-args|local-command|system-reminder|task-notification|bash-input|bash-stdout)", re.I)


def user_text(msg):
    """The text of a real, typed prompt; None for tool results, slash commands and harness messages."""
    content = msg.get("content")
    if isinstance(content, str):
        text = content
    elif isinstance(content, list):
        if any(isinstance(b, dict) and b.get("type") == "tool_result" for b in content):
            return None
        text = "\n".join(b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text")
    else:
        return None
    text = re.sub(r"<system-reminder>.*?</system-reminder>", "", text, flags=re.S).strip()
    if not text or NOISE.match(text) or text.startswith("[Request interrupted"):
        return None
    return text


def last_exchange(path):
    """(question, answer) for the most recent prompt that already has a written answer."""
    pairs, current = [], None
    for line in path.read_text(encoding="utf-8", errors="replace").splitlines():
        try:
            row = json.loads(line)
        except Exception:
            continue
        if row.get("isSidechain") or row.get("isMeta"):
            continue
        msg = row.get("message") or {}
        if row.get("type") == "user":
            q = user_text(msg)
            if q:
                current = {"q": q, "texts": []}
                pairs.append(current)
        elif row.get("type") == "assistant" and current is not None:
            for b in msg.get("content") or []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_use":
                    current["texts"] = []          # keep only what was written after the last tool call: the final answer
                elif b.get("type") == "text" and b.get("text", "").strip():
                    current["texts"].append(b["text"].strip())
    for p in reversed(pairs):
        if p["texts"]:
            return p["q"], "\n\n".join(p["texts"])
    return None, None


# ---------------------------------------------------------------- commands
def cmd_note(args):
    proj = project_dir()
    tr = latest_transcript(proj)
    if not tr:
        print(f"No Claude Code transcript found for {proj}. Looked in {transcript_dir(proj)}")
        return 1
    question, answer = last_exchange(tr)
    if not question:
        print("Couldn't find a finished question and answer in this session yet.")
        return 1
    payload = {"site": "claude-code", "url": "", "title": f"Claude Code · {proj.name}", "t": int(time.time() * 1000),
               "kind": "turn", "question": question, "answer": answer}
    if "--dry-run" in args:
        print("Would save to notes:\n")
        print("QUESTION:", question[:400])
        print("\nANSWER (first 600 characters):\n" + answer[:600])
        return 0
    url = os.environ.get("CLEAN_CHAT_NOTES_URL") or load(CONFIG, {}).get("notesEndpoint")
    if not url:
        print("No notes doc URL yet. Run:  /note-setup <your Apps Script /exec URL>   (the same URL the browser extension uses)")
        return 1
    req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "text/plain;charset=utf-8"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            body = r.read().decode("utf-8", "replace")
        res = json.loads(body)
    except Exception as e:
        print(f"Couldn't reach the notes doc: {e}")
        return 1
    if res.get("ok"):
        print(f"Saved to notes as: {res.get('question') or question[:120]}")
        if res.get("docUrl"):
            print(f"Doc: {res['docUrl']}")
        return 0
    print(f"The notes script answered with an error: {res.get('error') or body[:200]}")
    return 1


def cmd_later(args):
    text = " ".join(a for a in args if not a.startswith("--")).strip()
    if not text:
        print('Usage: /later <the question you want to come back to>')
        return 1
    proj = project_dir()
    idx = load(LATER, {})
    key = f"cc:claude-code:{proj}"
    entry = idx.setdefault(key, {"site": "claude-code", "url": "", "title": f"Claude Code · {proj.name}", "later": [], "understood": [], "asks": [], "notes": []})
    entry["later"].append({"kind": "draft", "text": text, "t": int(time.time() * 1000)})
    entry["updated"] = int(time.time() * 1000)
    save(LATER, idx)
    print(f"Parked for later ({len(entry['later'])} in this project). Build the backlog page with /backlog.")
    return 0


def cmd_set_url(args):
    if not args or not args[0].startswith("https://script.google.com/"):
        print("Give the Apps Script web app URL, the one that ends in /exec and starts with https://script.google.com/")
        return 1
    cfg = load(CONFIG, {})
    cfg["notesEndpoint"] = args[0].strip()
    save(CONFIG, cfg)
    print(f"Saved. /note will now append to that doc. (Stored in {CONFIG})")
    return 0


def cmd_show(_):
    idx = load(LATER, {})
    total = sum(len(e.get("later", [])) for e in idx.values())
    print(f"Config: {CONFIG}  ({'notes URL set' if load(CONFIG, {}).get('notesEndpoint') else 'no notes URL yet'})")
    print(f"Backlog: {LATER}  ({total} parked across {len(idx)} project(s))")
    for e in idx.values():
        for item in e.get("later", []):
            print(f"  - [{e.get('title')}] {item['text']}")
    return 0


def main():
    cmds = {"note": cmd_note, "later": cmd_later, "set-url": cmd_set_url, "show": cmd_show}
    if len(sys.argv) < 2 or sys.argv[1] not in cmds:
        print(__doc__)
        return 1
    return cmds[sys.argv[1]](sys.argv[2:])


if __name__ == "__main__":
    sys.exit(main())
