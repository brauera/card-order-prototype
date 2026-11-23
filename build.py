#!/usr/bin/env python3
"""Assemble index.html from shell.html + parts/*.html.

    python3 build.py                 -> index.html (all parts)
    python3 build.py --only order1   -> preview-order1.html (one part)
"""
import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent
ORDER = ["home", "order1", "order2", "delivery", "errors"]


def main() -> None:
    only = None
    if "--only" in sys.argv:
        only = sys.argv[sys.argv.index("--only") + 1]
    parts_dir = ROOT / "parts"
    files = sorted(parts_dir.glob("*.html"), key=lambda p: (ORDER.index(p.stem) if p.stem in ORDER else 99, p.stem))
    if only:
        files = [p for p in files if p.stem == only]
        if not files:
            sys.exit(f"parts/{only}.html not found")
    chunks = [f"<!-- ===== part: {p.stem} ===== -->\n" + p.read_text(encoding="utf-8") for p in files]
    shell = (ROOT / "shell.html").read_text(encoding="utf-8")
    if "<!--PARTS-->" not in shell:
        sys.exit("shell.html has no <!--PARTS--> marker")
    html = shell.replace("<!--PARTS-->", "\n".join(chunks))
    app = ROOT / "app.js"
    if not only and app.exists():  # previews run without the flow logic
        i18n = ROOT / "i18n" / "strings.json"
        dict_js = ""
        if i18n.exists():
            data = json.loads(i18n.read_text(encoding="utf-8"))
            dict_js = "<script>window.I18N = " + json.dumps(data, ensure_ascii=False).replace("</", "<\\/") + ";</script>\n"
        html = html.replace("<!--APP-->", dict_js + "<script>\n" + app.read_text(encoding="utf-8") + "\n</script>")
    out = ROOT / (f"preview-{only}.html" if only else "index.html")
    out.write_text(html, encoding="utf-8")
    print(f"wrote {out.name} ({len(files)} part(s), {len(html)//1024} KB)")


if __name__ == "__main__":
    main()
