"""Build the Chrome Web Store zip from extension/: only the files the extension needs, nothing from testing."""
import json, pathlib, zipfile
ROOT = pathlib.Path(__file__).resolve().parent
EXT = ROOT / "extension"
KEEP = {"manifest.json", "content.js", "content.css", "saved.html", "saved.js", "bridge.js", "background.js", "frame.js"}
m = json.loads((EXT / "manifest.json").read_text())
out = ROOT / "dist" / f"clean-chat-{m['version']}.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
    for f in sorted(EXT.iterdir()):
        if f.name in KEEP: z.write(f, f.name)
    for f in sorted((EXT / "icons").glob("*.png")): z.write(f, f"icons/{f.name}")
print(out, out.stat().st_size, "bytes;", len(z.namelist()) if False else "")
with zipfile.ZipFile(out) as z: print("\n".join(z.namelist()))
