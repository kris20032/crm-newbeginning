#!/usr/bin/env python3
"""Generator PDF-ów dokumentów prawnych Impulseo.

Po co: regulamin i polityka prywatności muszą być wysyłane klientowi w postaci
"umożliwiającej przechowywanie i odtwarzanie" (§4 ust. 4 regulaminu) oraz
zapisywane w logu akceptacji zamówienia razem z sumą kontrolną, żeby dało się
odtworzyć co do bajtu, na jaką wersję klient się zgodził.

Użycie:
    python3 generuj-pdf.py regulamin.md polityka-prywatnosci.md

Efekt: obok każdego pliku .md powstaje <nazwa>-RRRR-MM-DD.pdf, a na koniec
plik SUMY-KONTROLNE.txt z SHA-256 każdego PDF-a.

Zależności: żadnych bibliotek zewnętrznych. Do renderu używa Chrome w trybie
headless (jest na Macu Krzysztofa) - świadomie, żeby nie instalować pakietów
Pythona, bo system blokuje pip (PEP 668).
"""
import hashlib
import html
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

CSS = """
@page { size: A4; margin: 20mm 18mm; }
body { font: 10.5pt/1.55 "Times New Roman", Georgia, serif; color: #111; }
h1 { font-size: 16pt; margin: 0 0 4pt; text-align: center; }
h2 { font-size: 12pt; margin: 6pt 0 10pt; text-align: center; font-weight: normal; color: #333; }
h3 { font-size: 11pt; margin: 14pt 0 4pt; }
p { margin: 0 0 6pt; text-align: justify; }
strong { font-weight: bold; }
table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; }
th, td { border: 1px solid #999; padding: 4pt 6pt; text-align: left; vertical-align: top; }
th { background: #f0f0f0; }
hr { border: none; border-top: 1px solid #bbb; margin: 14pt 0; }
ul { margin: 0 0 6pt 16pt; padding: 0; }
li { margin-bottom: 3pt; }
blockquote { margin: 6pt 0; padding-left: 10pt; border-left: 2px solid #ccc; color: #444; }
"""


def inline(text):
    """Pogrubienia, kursywa i znaki specjalne w jednej linii."""
    # W źródle numeracja ustępów jest zapisana jako `1\.` (escape markdowna,
    # inaczej edytory robią z tego listę numerowaną i gubią numery paragrafów).
    # W PDF-ie ma być zwykłe `1.`, więc zdejmujemy escape zanim cokolwiek innego.
    text = re.sub(r"(\d)\\\.", r"\1.", text)
    text = html.escape(text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\*)\*([^*]+)\*(?!\*)", r"<em>\1</em>", text)
    text = text.replace("&amp;nbsp;", "&nbsp;")
    return text


def md_to_html(md):
    """Mini-konwerter: nagłówki, tabele, listy, cytaty, akapity.

    Celowo prosty - obsługuje dokładnie te konstrukcje, których używamy
    w dokumentach prawnych. Nie jest to pełny parser markdown.
    """
    out, lines, i = [], md.split("\n"), 0
    while i < len(lines):
        ln = lines[i].rstrip()
        if not ln.strip():
            i += 1
            continue
        if ln.startswith("# "):
            out.append(f"<h1>{inline(ln[2:])}</h1>")
        elif ln.startswith("## "):
            out.append(f"<h2>{inline(ln[3:])}</h2>")
        elif ln.startswith("### "):
            out.append(f"<h3>{inline(ln[4:])}</h3>")
        elif ln.startswith("---"):
            out.append("<hr>")
        elif ln.startswith("> "):
            out.append(f"<blockquote>{inline(ln[2:])}</blockquote>")
        elif ln.startswith("|"):
            rows = []
            while i < len(lines) and lines[i].startswith("|"):
                rows.append(lines[i])
                i += 1
            i -= 1
            cells = [[c.strip() for c in r.strip("|").split("|")] for r in rows]
            body = [r for r in cells if not all(set(c) <= set("-: ") for c in r)]
            if body:
                head = "".join(f"<th>{inline(c)}</th>" for c in body[0])
                rest = "".join(
                    "<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>"
                    for r in body[1:]
                )
                out.append(f"<table><tr>{head}</tr>{rest}</table>")
        elif ln.startswith("- "):
            items = []
            while i < len(lines) and lines[i].startswith("- "):
                items.append(f"<li>{inline(lines[i][2:])}</li>")
                i += 1
            i -= 1
            out.append("<ul>" + "".join(items) + "</ul>")
        else:
            out.append(f"<p>{inline(ln)}</p>")
        i += 1
    return "\n".join(out)


def main(paths):
    stamp = date.today().isoformat()
    sums = []
    for src in paths:
        src = Path(src)
        if not src.exists():
            print(f"POMINIĘTO (brak pliku): {src}")
            continue
        body = md_to_html(src.read_text(encoding="utf8"))
        page = (
            "<!doctype html><html><head><meta charset='utf-8'>"
            f"<title>{html.escape(src.stem)}</title><style>{CSS}</style></head>"
            f"<body>{body}</body></html>"
        )
        tmp = src.with_suffix(".tmp.html")
        tmp.write_text(page, encoding="utf8")
        pdf = src.with_name(f"{src.stem}-{stamp}.pdf")
        subprocess.run(
            [CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
             f"--print-to-pdf={pdf}", str(tmp.resolve().as_uri())],
            check=True, capture_output=True,
        )
        tmp.unlink()
        digest = hashlib.sha256(pdf.read_bytes()).hexdigest()
        sums.append((pdf.name, digest, pdf.stat().st_size))
        print(f"OK  {pdf.name}  ({pdf.stat().st_size // 1024} KB)")

    if sums:
        listing = Path(paths[0]).with_name("SUMY-KONTROLNE.txt")
        listing.write_text(
            "Sumy kontrolne dokumentów prawnych Impulseo sp. z o.o.\n"
            f"Wygenerowano: {stamp}\n"
            "Do wpisania w log akceptacji zamówienia (nazwa pliku + SHA-256).\n\n"
            + "\n".join(f"{n}\n  SHA-256: {d}\n  rozmiar: {s} B\n" for n, d, s in sums),
            encoding="utf8",
        )
        print(f"\nSumy kontrolne: {listing}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["regulamin.md", "polityka-prywatnosci.md"])
