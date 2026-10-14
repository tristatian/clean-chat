#!/usr/bin/env python3
"""Clean Chat reader for Claude Code: your session as a page you can highlight, erase (with undo) and park.

  cc_reader.py                 build the page for the newest session in this project and open it
  cc_reader.py --no-open       build only
  cc_reader.py --serve         build, serve at http://127.0.0.1:8379/ and rebuild whenever the session moves on;
                               the page refreshes itself, and your marks are kept. Follows whichever Claude Code
                               session you used last, in any project, unless --project is given. While served,
                               a question asked on the page is answered on the page, by a forked copy of the
                               session (claude -p --resume --fork-session); the session itself is not changed
  cc_reader.py --open-served   what /reader runs: start the server for this project if none is running (or if the
                               running one is from an older version of this file), then open it
  cc_reader.py --port N        serve on another port (default 8379)
  cc_reader.py --any           the newest session in any project, not just the current folder's
  cc_reader.py --project DIR   the newest session of that project folder
  cc_reader.py --session ID    a specific session instead of the newest

It reads the transcript Claude Code already keeps under ~/.claude/projects/. Nothing leaves your machine.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import shlex
import shutil
import socket
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(HERE))
from build_page import inline, md_to_blocks, render   # noqa: E402
import cc_note                                           # noqa: E402

OUT_DIR = ROOT / "reader"
PAGE_DIR = OUT_DIR          # the page itself; a reader on another port keeps its page in a folder of its own, so two never overwrite each other
PORT = 8379
CODE = int(Path(__file__).stat().st_mtime)      # which version of this file a running server was started from
FORKS_FILE = OUT_DIR / "forks.json"       # sessions created by asks from the page: never the one the reader follows
try:
    FORKS = set(json.loads(FORKS_FILE.read_text()))
except Exception:
    FORKS = set()
BUSY = {"asks": 0}
EXT_FILE = OUT_DIR / "extension.json"     # the Clean Chat extension's origin, learned from the reader page: its saved page may ask here too
EXT_RE = re.compile(r"^chrome-extension://[a-p]{32}$")


def known_exts():
    try:
        return set(json.loads(EXT_FILE.read_text()))
    except Exception:
        return set()


def remember_ext(origin):
    exts = known_exts()
    if origin in exts:
        return
    exts.add(origin)
    try:
        OUT_DIR.mkdir(exist_ok=True)
        EXT_FILE.write_text(json.dumps(sorted(exts)))
    except Exception:
        pass


def exchanges(path):
    """Every typed prompt with the final answer written for it (text after the last tool call)."""
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
            q = cc_note.user_text(msg)
            if q:
                current = {"q": q, "texts": [], "tools": 0, "t": row.get("timestamp", "")}
                pairs.append(current)
        elif row.get("type") == "assistant" and current is not None:
            for b in msg.get("content") or []:
                if not isinstance(b, dict):
                    continue
                if b.get("type") == "tool_use":
                    current["tools"] += 1
                    current["texts"] = []
                elif b.get("type") == "text" and b.get("text", "").strip():
                    current["texts"].append(b["text"].strip())
    return pairs


def stable(prefix, text, seen):
    h = hashlib.sha1(text.encode("utf-8")).hexdigest()[:10]
    seen[h] = seen.get(h, 0) + 1
    return f"{prefix}{h}-{seen[h]}"


def build(transcript, proj):
    pairs = exchanges(transcript)
    blocks, seen = [], {}
    for p in pairs:
        q = p["q"].strip()
        shown = q if len(q) <= 700 else q[:700].rstrip() + " …"
        answer = "\n\n".join(p["texts"])
        blocks.append({"id": stable("q", q, seen), "type": "ask", "html": inline(shown).replace("\n", "<br>"),
                       "question": q, "answerMd": answer})
        if not answer:
            note = "Claude Code is still working on this." if p is pairs[-1] else "No written answer; this turn ended in tool work only."
            blocks.append({"id": stable("w", q + "|pending", seen), "type": "quote", "html": note})
            continue
        for b in md_to_blocks(answer, "x"):
            b["id"] = stable("b", b["type"] + "|" + b["html"], seen)
            blocks.append(b)
    cfg = cc_note.load(cc_note.CONFIG, {})
    return {
        "title": f"Claude Code · {proj.name}",
        "meta": f"Session {transcript.stem[:8]} · {len(pairs)} question{'s' if len(pairs) != 1 else ''} · built {time.strftime('%H:%M:%S')}. "
                "Only your typed prompts and Claude's final answers are shown. Your marks are saved with this session and survive every rebuild.",
        "blocks": blocks,
        "reader": {"session": transcript.stem, "project": str(proj), "notesEndpoint": cfg.get("notesEndpoint", ""), "built": int(time.time() * 1000)},
    }


def pick_transcript(proj, session, anywhere=False):
    base = cc_note.HOME / ".claude" / "projects"
    if session:
        hits = sorted(base.glob(f"*/{session}*.jsonl"))
        return hits[0] if hits else None
    where = base.glob("*/*.jsonl") if anywhere else Path(cc_note.transcript_dir(proj)).glob("*.jsonl")
    files = sorted((f for f in where if f.stem not in FORKS), key=lambda f: f.stat().st_mtime, reverse=True)
    return files[0] if files else None


# ---------------------------------------------------------------- asking from the page
# The page posts a question; it is put to a forked copy of the session with `claude -p`, so Claude answers with the
# whole session in mind but the session itself gains nothing. The fork can read files and nothing more. Only the
# reader page can call this: the browser sends the custom header only to the same origin without a preflight,
# and a page on any other site gets no CORS answer, so its request never leaves the browser.
PROMPT_FRAME = ("This question comes from the Clean Chat reader page, about a passage of your earlier answer in this session. "
                "Answer it directly, in plain prose, as briefly as the question allows: no headings, no preamble, and change no files.")
PROMPT_LIGHT = ("This question comes from the Clean Chat reader page, about a passage of an answer Claude gave earlier in a Claude Code "
                "session in this folder. You are given the question asked then, the answer or the part of it that matters, and the passage. "
                "Answer directly, in plain prose, as briefly as the question allows: no headings, no preamble, and change no files.")
PROMPT_PAGE = ("This question comes from the Clean Chat reader page for a Claude Code session in this folder, from the box at the "
               "bottom of the page, so it is about the page as a whole rather than one passage. You are given what the reader has "
               "highlighted, asked and parked on the page. Answer directly, in plain prose unless the question asks for another shape, "
               "as briefly as the question allows: no preamble, and change no files.")
READ_ONLY = "Bash,Edit,Write,NotebookEdit,WebFetch,WebSearch,Agent,Task"


def light_frame(source):
    """The passage-only framing; from the extension's saved page the answer may come from any chat site."""
    if source:
        return (f"This question comes from Clean Chat's saved notes, about an answer saved from {source}. You are given the question "
                "asked then, the answer or the part of it that matters, and any follow-ups already answered. Answer directly, in "
                "plain prose, as briefly as the question allows: no headings, no preamble, and change no files.")
    return PROMPT_LIGHT


def remember_fork(sid):
    if not sid or sid in FORKS:
        return
    FORKS.add(sid)
    try:
        OUT_DIR.mkdir(exist_ok=True)
        FORKS_FILE.write_text(json.dumps(sorted(FORKS)))
    except Exception:
        pass


def ask_fork(session, proj, question, quote, context, scope="passage", turn=None, source="", thread=None, digest=""):
    """Yield {delta}, then {done}, or {error}, while `claude -p` answers the question.

    scope "passage": a fresh run that is given only the passage, its question and answer; it costs about a short
    session's worth of tokens. scope "session": a fork of the whole session, which re-reads all of it.
    `thread`: follow-ups already answered that this question builds on, oldest first, each {"q", "a"}.
    `digest`: what the reader has done on the page (highlights, questions asked, what is parked), for page-level questions."""
    whole = scope == "session"
    page_level = bool(digest) and not source and not quote and not context and not (turn or {}).get("question")
    parts = [PROMPT_PAGE if page_level else PROMPT_FRAME if whole else light_frame(source)]
    if not whole and turn:
        if turn.get("question"):
            parts.append(f"The question asked then:\n{turn['question']}")
        if turn.get("answer"):
            parts.append(f"The answer it got (or the part that matters):\n{turn['answer']}")
    for f in (thread or []):
        if f.get("q"):
            parts.append(f"An earlier follow-up question:\n{f['q']}" + (f"\nIts answer:\n{f['a']}" if f.get("a") else ""))
    if digest:
        parts.append("What the reader has done on this page so far (highlights, follow-up questions and the answers they got, "
                     "passages parked for later, how much is marked understood):\n" + digest)
    if quote:
        parts.append(f'The highlighted phrase: "{quote}"')
    if context:
        parts.append(f"The passage it is in:\n{context}")
    parts.append(f"Question: {question}")
    cmd = ["claude", "-p"] + (["--resume", session, "--fork-session"] if whole else []) + \
          ["--output-format", "stream-json", "--verbose", "--include-partial-messages", "--disallowedTools", READ_ONLY]
    cwd = str(proj) if proj and Path(proj).is_dir() else None
    # Started from inside a Claude Code session (the /reader skill does that), the environment carries that session's
    # own login variables, which a fresh `claude` must not inherit: without them it signs in the normal way.
    env = {k: v for k, v in os.environ.items() if not (k.startswith(("ANTHROPIC_", "CLAUDE_CODE_")) or k == "CLAUDECODE")}
    try:
        p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, cwd=cwd, env=env,
                             text=True, encoding="utf-8", errors="replace")
    except FileNotFoundError:
        yield {"error": "The claude command was not found. Open a terminal where `claude` works and start the reader from there."}
        return
    BUSY["asks"] += 1
    streamed, final_text, finished = False, "", False
    try:
        p.stdin.write("\n\n".join(parts))
        p.stdin.close()
        for line in p.stdout:
            try:
                r = json.loads(line)
            except ValueError:
                continue
            t = r.get("type")
            if t == "system" and r.get("subtype") == "init":
                remember_fork(r.get("session_id"))        # a passage-only run is a session of its own too: never followed
            elif t == "stream_event":
                ev = r.get("event") or {}
                if ev.get("type") == "content_block_delta" and (ev.get("delta") or {}).get("type") == "text_delta":
                    streamed = True
                    yield {"delta": ev["delta"].get("text", "")}
            elif t == "assistant":
                text = "".join(b.get("text", "") for b in (r.get("message") or {}).get("content", []) if b.get("type") == "text")
                final_text = text or final_text
            elif t == "result":
                finished = True
                remember_fork(r.get("session_id"))
                if r.get("is_error"):
                    print(f"[ask] failed: {r.get('result')}  (claude at {shutil.which('claude') or 'not on PATH'})", flush=True)
                    yield {"error": r.get("result") or "Claude Code reported an error"}
                else:
                    if not streamed and final_text:
                        yield {"delta": final_text}
                    u = r.get("usage") or {}
                    yield {"done": True, "fork": r.get("session_id"), "scope": scope, "ms": r.get("duration_ms"),
                           "tokens": {"input": u.get("input_tokens", 0), "cache_read": u.get("cache_read_input_tokens", 0),
                                      "cache_write": u.get("cache_creation_input_tokens", 0), "output": u.get("output_tokens", 0)}}
        try:
            p.wait(timeout=10)
        except subprocess.TimeoutExpired:
            pass
        if not finished:
            err = [l for l in (p.stderr.read() or "").splitlines() if l.strip() and "matches no known tool" not in l]
            yield {"error": (err[-1] if err else f"claude stopped without an answer (exit code {p.returncode})")}
    except GeneratorExit:
        pass
    except Exception as e:                      # noqa: BLE001 - whatever went wrong, the page should hear it
        yield {"error": str(e)}
    finally:
        BUSY["asks"] -= 1
        if p.poll() is None:
            p.terminate()


class ReaderHandler(SimpleHTTPRequestHandler):
    """The page's files, GET /status, POST /hello and POST /ask (one question in, the answer streamed out as JSON lines).

    Who may ask: the reader page itself, and the Clean Chat extension's saved page once the reader page has introduced
    that extension (POST /hello with its id). Any other origin gets no CORS answer, so its request stops in the browser."""
    primary = (None, None)      # (transcript, project) being followed; set by serve()

    def log_message(self, *a, **k):
        pass

    def caller(self):
        """"page" for the reader page, "extension" for the extension the page introduced, else None."""
        o = self.headers.get("Origin", "")
        if o in (f"http://127.0.0.1:{PORT}", f"http://localhost:{PORT}"):
            return "page"
        if o in known_exts():
            return "extension"
        return None

    def cors(self, origin=None):     # only the introduced extension gets a cross-origin answer
        origin = origin or (self.headers.get("Origin") if self.caller() == "extension" else None)
        if origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")

    def do_OPTIONS(self):       # a preflight from anywhere else gets no CORS headers, so the browser stops it there
        self.send_response(204)
        self.send_header("Allow", "GET, HEAD, POST")
        if self.caller() == "extension":
            self.cors()
            self.send_header("Access-Control-Allow-Methods", "GET, POST")
            self.send_header("Access-Control-Allow-Headers", "Content-Type, X-CC-Ask")
            self.send_header("Access-Control-Max-Age", "600")
        self.end_headers()

    def do_GET(self):
        if self.path.split("?")[0] == "/status":
            origin = self.headers.get("Origin", "")
            if origin.startswith("chrome-extension://") and self.caller() != "extension":
                # an extension the page has not introduced learns only that, so its saved page can say what to do
                return self.send_json(200, {"known": False, "port": PORT}, allow=origin)
            tr, proj = self.primary
            return self.send_json(200, {"session": tr.stem if tr else None, "project": str(proj) if proj else None, "asks_running": BUSY["asks"],
                                        "code": CODE, "port": PORT, "known": self.caller() == "extension"})
        return super().do_GET()

    def body(self):
        try:
            n = int(self.headers.get("Content-Length", "0"))
            data = json.loads(self.rfile.read(min(max(n, 0), 200000)) or b"{}")
            return data if isinstance(data, dict) else {}
        except Exception:
            return None

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/quit":                   # --open-served replacing an older server; the header rule keeps web pages out
            if self.headers.get("X-CC-Ask") != "1" or self.headers.get("Origin"):
                return self.send_error(403)
            self.send_json(200, {"bye": True})
            threading.Thread(target=lambda: (time.sleep(0.2), os._exit(0)), daemon=True).start()
            return
        who = self.caller()
        if self.headers.get("X-CC-Ask") != "1" or not who:
            return self.send_error(403, "Questions are taken only from the reader page and from Clean Chat's saved page")
        body = self.body()
        if body is None:
            return self.send_error(400, "Bad request body")
        if path == "/hello":                  # the page introduces the extension that is on it
            if who != "page":
                return self.send_error(403)
            origin = f"chrome-extension://{body.get('ext', '')}"
            if not EXT_RE.match(origin):
                return self.send_error(400, "Not an extension id")
            remember_ext(origin)
            return self.send_json(200, {"ok": True})
        if path != "/ask":
            return self.send_error(404)
        question = str(body.get("question", "")).strip()[:4000]
        quote = str(body.get("quote", "")).strip()[:3000]
        context = str(body.get("context", "")).strip()[:2000]
        scope = "session" if body.get("scope") == "session" and who == "page" else "passage"     # the saved page never forks a session
        source = str(body.get("source", "")).strip()[:60] if who == "extension" else ""
        turn = body.get("turn") if isinstance(body.get("turn"), dict) else {}
        turn = {"question": str(turn.get("question", ""))[:2000], "answer": str(turn.get("answer", ""))[:8000]}
        thread = [{"q": str(f.get("q", ""))[:2000], "a": str(f.get("a", ""))[:6000]}
                  for f in (body.get("thread") if isinstance(body.get("thread"), list) else [])[:8] if isinstance(f, dict)]
        digest = str(body.get("digest", "")).strip()[:24000] if who == "page" else ""
        tr, proj = self.primary
        if not question:
            return self.send_error(400, "No question")
        if scope == "session" and (not tr or str(body.get("session", "")) != tr.stem):
            return self.send_error(409, "This page is for a different session than the one the reader is following now; reload it")
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.cors()
        self.end_headers()
        gen = ask_fork(tr.stem if tr else "", proj, question, quote, context, scope, turn, source, thread, digest)
        try:
            for event in gen:
                self.wfile.write((json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8"))
                self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass                                        # the page stopped listening; the fork is stopped below
        finally:
            gen.close()

    def send_json(self, code, obj, allow=None):
        data = json.dumps(obj).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.cors(allow)
        self.end_headers()
        self.wfile.write(data)

def port_open(port):
    with socket.socket() as sk:
        sk.settimeout(0.3)
        return sk.connect_ex(("127.0.0.1", port)) == 0


def status():
    try:
        import urllib.request
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}/status", timeout=1) as r:
            return json.loads(r.read())
    except Exception:
        return None


def quit_server():
    """Stop the reader on PORT: ask it to quit; a reader from before that request existed is stopped by its process id."""
    if not port_open(PORT):
        return True
    st = status()
    if not st or "session" not in st:
        return False                                   # not a Clean Chat reader: leave it alone
    try:
        import urllib.request
        req = urllib.request.Request(f"http://127.0.0.1:{PORT}/quit", data=b"{}", method="POST", headers={"X-CC-Ask": "1", "Content-Type": "application/json"})
        urllib.request.urlopen(req, timeout=2).read()
    except Exception:
        pass
    for _ in range(20):
        if not port_open(PORT):
            return True
        time.sleep(0.1)
    try:                                               # an older reader has no /quit: it is ours all the same, so stop it
        pids = subprocess.run(["lsof", "-nP", f"-iTCP:{PORT}", "-sTCP:LISTEN", "-t"], capture_output=True, text=True, timeout=5).stdout.split()
        for pid in pids:
            os.kill(int(pid), 15)
    except Exception:
        return False
    for _ in range(30):
        if not port_open(PORT):
            return True
        time.sleep(0.1)
    return False


def project_of(transcript, fallback):
    """The folder the session actually ran in, read from the transcript itself."""
    try:
        with transcript.open(encoding="utf-8", errors="replace") as fh:
            for i, line in enumerate(fh):
                if i > 200:
                    break
                try:
                    cwd = json.loads(line).get("cwd")
                except Exception:
                    continue
                if cwd:
                    return Path(cwd)
    except Exception:
        pass
    return fallback


def write(page):
    PAGE_DIR.mkdir(parents=True, exist_ok=True)
    out = PAGE_DIR / "index.html"
    render(page, out)
    return out


def main():
    args = sys.argv[1:]
    global PORT, PAGE_DIR
    if "--port" in args:
        PORT = int(args[args.index("--port") + 1])
        if PORT != 8379:
            PAGE_DIR = OUT_DIR / f"port-{PORT}"
    proj = Path(args[args.index("--project") + 1]).expanduser().resolve() if "--project" in args else cc_note.project_dir()
    session = args[args.index("--session") + 1] if "--session" in args else None
    anywhere = "--any" in args or ("--serve" in args and "--project" not in args)
    tr = pick_transcript(proj, session, anywhere)
    if not tr and not anywhere:
        tr = pick_transcript(proj, session, True)      # nothing for this folder: fall back to the newest session anywhere
    if not tr:
        print(f"No Claude Code transcript found. Looked in {cc_note.transcript_dir(proj)} and across ~/.claude/projects")
        return 1
    out = write(build(tr, project_of(tr, proj)))
    n = len(exchanges(tr))
    url = f"http://127.0.0.1:{PORT}/"
    if "--open-served" in args:
        # /reader: a served page can answer questions in place; start the server if there is none, then open it
        running = status() if port_open(PORT) else None
        here = str(project_of(tr, proj))
        # one reader at a time, following the chat /reader was run from: replace a server that is from an older
        # version of this file or follows another project (never while it is answering a question)
        if running and (running.get("code") != CODE or (running.get("project") != here and not running.get("asks_running"))):
            quit_server()
            running = None
        if not running:
            # A claude started from inside the Claude Code app cannot reach your sign-in (401), so the server is
            # started in a Terminal window, as Start Reader.command does. Closing that window stops the reader.
            OUT_DIR.mkdir(exist_ok=True)
            cmd = ["python3", str(Path(__file__).resolve()), "--serve", "--no-open", "--port", str(PORT), "--project", here] + (["--session", session] if session else [])
            script = OUT_DIR / "Reader (started by slash-reader).command"
            script.write_text("#!/bin/zsh\n# Started by /reader. Close this window, or press Ctrl+C, to stop the reader.\n"
                              "exec " + " ".join(shlex.quote(c) for c in cmd) + "\n")
            script.chmod(0o755)
            subprocess.run(["open", "-a", "Terminal", str(script)], check=False)
            for _ in range(120):
                if port_open(PORT):
                    break
                time.sleep(0.1)
            running = status()
        if not running:
            print(f"Reader built: {out}  ({n} questions from session {tr.stem[:8]}); the server did not start in Terminal. Double-click Start Reader.command in the clean_chat folder instead.")
            subprocess.run(["open", str(out)], check=False)
            return 0
        other = running.get("session") and running["session"] != tr.stem
        subprocess.run(["open", url], check=False)
        print(f"Reader live at {url}  ({n} questions from session {tr.stem[:8]}). Questions asked on the page are answered on the page; "
              "your marks are kept in the browser under this address and this session."
              + (f" Note: the running reader is busy answering and follows session {running['session'][:8]}; run /reader again in a moment to switch." if other else ""))
        return 0
    if "--serve" not in args:
        print(f"Reader built: {out}  ({n} questions from session {tr.stem[:8]})")
        if "--no-open" not in args:
            subprocess.run(["open", str(out)], check=False)
        return 0

    ReaderHandler.primary = (tr, project_of(tr, proj))
    handler = partial(ReaderHandler, directory=str(PAGE_DIR))
    if port_open(PORT) and not quit_server():       # one reader at a time: the newer start wins
        print(f"Port {PORT} is taken by something that is not a Clean Chat reader. Stop it, or use --port.")
        return 1
    try:
        httpd = ThreadingHTTPServer(("127.0.0.1", PORT), handler)
    except OSError:
        print(f"Port {PORT} is still taken. Try again in a moment, or use --port.")
        return 1
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    print(f"Reader live at {url}  (Ctrl+C to stop). It follows {'the session you used last, in any project' if anywhere else 'the newest session in ' + proj.name} and rebuilds as it moves on. "
          "A question asked on the page is answered on the page by a forked copy of the session.")
    if "--no-open" not in args:
        subprocess.run(["open", url], check=False)
    last = (tr, tr.stat().st_mtime)
    try:
        while True:
            time.sleep(2)
            if BUSY["asks"]:
                continue                                   # never switch sessions under a running answer
            cur = pick_transcript(proj, session, anywhere)
            if cur and (cur, cur.stat().st_mtime) != last:
                last = (cur, cur.stat().st_mtime)
                ReaderHandler.primary = (cur, project_of(cur, proj))
                write(build(cur, project_of(cur, proj)))
    except KeyboardInterrupt:
        print("\nstopped")
    return 0


if __name__ == "__main__":
    sys.exit(main())
