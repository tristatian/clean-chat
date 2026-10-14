#!/usr/bin/env python3
"""Turn a pasted chat transcript into a Clean Chat mockup page.

Usage:
    python3 build_page.py transcript.md [output.html] [--title "Page title"]

Transcript format (any of these work):
  * Turns marked with a line that is just  You:  /  User:  /  Human:
    or  Claude:  /  Assistant:  /  AI:   (case-insensitive, trailing colon optional
    when the line is only that word).
  * Turns separated by a line that is just  ---  , alternating user / assistant,
    starting with the user.
  * No markers at all: the whole file is treated as one assistant answer.

The first user turn becomes the page title. The first assistant turn becomes the
page. Every later user turn becomes a "You asked" block followed by that answer,
so a linear chat reads as one page you can erase section by section.
"""
import html
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
TEMPLATE = HERE / "mockup-v0.html"

USER_MARK = re.compile(r"^\s*(you|user|human|me)\s*:?\s*$", re.I)
ASSIST_MARK = re.compile(r"^\s*(claude|assistant|ai|gemini|chatgpt|model)\s*:?\s*$", re.I)
INLINE_USER = re.compile(r"^\s*(you|user|human|me)\s*:\s+(.*)$", re.I)
INLINE_ASSIST = re.compile(r"^\s*(claude|assistant|ai|gemini|chatgpt|model)\s*:\s+(.*)$", re.I)


# ---------------------------------------------------------------- transcript
def split_turns(text: str):
    """Return a list of (role, text) tuples."""
    lines = text.splitlines()
    turns, role, buf = [], None, []

    def flush():
        if role is not None and "".join(buf).strip():
            turns.append((role, "\n".join(buf).strip("\n")))

    has_marker = any(USER_MARK.match(l) or ASSIST_MARK.match(l) or INLINE_USER.match(l) or INLINE_ASSIST.match(l) for l in lines)
    if has_marker:
        for l in lines:
            if USER_MARK.match(l):
                flush(); role, buf = "user", []
            elif ASSIST_MARK.match(l):
                flush(); role, buf = "assistant", []
            elif INLINE_USER.match(l):
                flush(); role, buf = "user", [INLINE_USER.match(l).group(2)]
            elif INLINE_ASSIST.match(l):
                flush(); role, buf = "assistant", [INLINE_ASSIST.match(l).group(2)]
            else:
                if role is None:
                    role, buf = "user", []
                buf.append(l)
        flush()
        return turns

    chunks = re.split(r"^\s*---+\s*$", text, flags=re.M)
    chunks = [c.strip("\n") for c in chunks if c.strip()]
    if len(chunks) > 1:
        return [("user" if i % 2 == 0 else "assistant", c) for i, c in enumerate(chunks)]
    return [("assistant", text.strip("\n"))]


# ---------------------------------------------------------------- markdown -> blocks
def inline(md: str) -> str:
    """Escape HTML, then render a small subset of inline markdown."""
    s = html.escape(md, quote=False)
    s = re.sub(r"`([^`]+)`", r"<code>\1</code>", s)
    s = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", s)
    s = re.sub(r"__(.+?)__", r"<strong>\1</strong>", s)
    s = re.sub(r"(?<![\w*])\*(?!\s)(.+?)(?<!\s)\*(?!\w)", r"<em>\1</em>", s)
    s = re.sub(r"(?<![\w_])_(?!\s)(.+?)(?<!\s)_(?!\w)", r"<em>\1</em>", s)
    s = re.sub(r"\[([^\]]+)\]\((https?://[^)\s]+)\)", r'<a href="\2" target="_blank" rel="noopener">\1</a>', s)
    return s


def md_to_blocks(md: str, prefix: str):
    blocks, n = [], 0

    def add(kind, body, **extra):
        nonlocal n
        n += 1
        b = {"id": f"{prefix}{n}", "type": kind, "html": body}
        b.update(extra)
        blocks.append(b)

    lines = md.splitlines()
    i, para = 0, []

    def flush_para():
        if para:
            add("p", inline(" ".join(x.strip() for x in para)))
            para.clear()

    while i < len(lines):
        l = lines[i]
        fence = re.match(r"^\s*```", l)
        if fence:
            flush_para()
            code = []
            i += 1
            while i < len(lines) and not re.match(r"^\s*```", lines[i]):
                code.append(lines[i]); i += 1
            add("code", html.escape("\n".join(code), quote=False))
            i += 1
            continue
        h = re.match(r"^\s*(#{1,6})\s+(.*)$", l)
        if h:
            flush_para()
            add("h2" if len(h.group(1)) <= 2 else "h3", inline(h.group(2).strip()))
            i += 1
            continue
        li = re.match(r"^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$", l)
        if li:
            flush_para()
            body = [li.group(2)]
            i += 1
            while i < len(lines) and lines[i].strip() and not re.match(r"^\s*(?:[-*+]|\d+[.)]|#{1,6}\s|```|>)", lines[i]):
                body.append(lines[i].strip()); i += 1
            add("li", inline(" ".join(body)), marker=(li.group(1) + "." if li.group(1) else ""))
            continue
        q = re.match(r"^\s*>\s?(.*)$", l)
        if q:
            flush_para()
            body = [q.group(1)]
            i += 1
            while i < len(lines) and re.match(r"^\s*>\s?", lines[i]):
                body.append(re.sub(r"^\s*>\s?", "", lines[i])); i += 1
            add("quote", inline(" ".join(body).strip()))
            continue
        if re.match(r"^\s*\|", l):
            flush_para()
            rows = []
            while i < len(lines) and re.match(r"^\s*\|", lines[i]):
                rows.append(lines[i].rstrip()); i += 1
            add("code", html.escape("\n".join(rows), quote=False))
            continue
        if not l.strip():
            flush_para(); i += 1; continue
        para.append(l)
        i += 1
    flush_para()
    return blocks


# ---------------------------------------------------------------- page
def build(turns, title=None):
    blocks, section = [], 0
    if not title:
        first_user = next((t for r, t in turns if r == "user"), None)
        title = (first_user or "Imported conversation").strip().splitlines()[0]
        if len(title) > 90:
            title = title[:87].rstrip() + "…"
    seen_first_answer = False
    for role, text in turns:
        section += 1
        if role == "user":
            if seen_first_answer:
                blocks.append({"id": f"ask{section}", "type": "ask", "html": inline(text.strip())})
            continue
        blocks.extend(md_to_blocks(text, f"s{section}b"))
        seen_first_answer = True
    return {
        "title": title,
        "meta": "Imported from your conversation. Every answer is now one page: erase what you understand, highlight what you don't. Follow-up answers in this mockup are canned; the real app streams them from the model.",
        "blocks": blocks,
    }


def render(page, out_path):
    tpl = TEMPLATE.read_text(encoding="utf-8")
    data = json.dumps(page, ensure_ascii=False).replace("</", "<\\/")
    new = re.sub(r'(<script type="application/json" id="page-data">)(.*?)(</script>)',
                 lambda m: m.group(1) + data + m.group(3), tpl, count=1, flags=re.S)
    if new == tpl:
        raise SystemExit("template has no page-data tag")
    new = new.replace("<title>Clean Chat</title>", f"<title>Clean Chat · {html.escape(page['title'][:40])}</title>", 1)
    Path(out_path).write_text(new, encoding="utf-8")


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    title = None
    if "--title" in sys.argv:
        title = sys.argv[sys.argv.index("--title") + 1]
        args = [a for a in args if a != title]
    if not args:
        print(__doc__); sys.exit(1)
    src = Path(args[0])
    out = Path(args[1]) if len(args) > 1 else src.with_suffix(".html")
    turns = split_turns(src.read_text(encoding="utf-8"))
    page = build(turns, title)
    render(page, out)
    kinds = {}
    for b in page["blocks"]:
        kinds[b["type"]] = kinds.get(b["type"], 0) + 1
    print(f"wrote {out}  |  {len(turns)} turns  |  blocks: {kinds}")


if __name__ == "__main__":
    main()
