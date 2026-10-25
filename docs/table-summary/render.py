import json, re, sys, html

COLORS = ["#E8F1FB", "#FDF1E4", "#EAF6EE", "#F3ECFB", "#FBEAEC", "#E9F6F7", "#FBF7E3"]
EDGE = ["#2F6FB5", "#C7741B", "#2E8B57", "#7A4FC0", "#C0475A", "#20878F", "#A68A12"]
AR = str.maketrans("0123456789", "٠١٢٣٤٥٦٧٨٩")


def kc(n):
    return "🔟" if n == 10 else "".join(d + "\ufe0f\u20e3" for d in str(n))


D = r"[0-9٠-٩]"
W = r"(?:ثلاثة|أربعة|خمسة|ستة|سبعة|ثمانية|تسعة|عشرة|خمسة عشر|عشرين|عشرون|ثلاثين|ثلاثون|أربعين|ستين|ستون|تسعين|مائة وثمانين|مائة)"
NUM_RULES = [
    (re.compile(rf"(?:المرسوم الملكي|مرسوم ملكي|المرسوم|بالمرسوم)?\s*\(?م\s*/\s*{D}+\)?"), "📜", "decree"),
    (re.compile(rf"{D}{{1,2}}/{D}{{1,2}}/{D}{{3,4}}\s*هـ?|{D}{{3,4}}\s*هـ|عام\s+{D}{{4}}|(?<![0-9٠-٩/])(?:1[34]|١[٣٤])[0-9٠-٩]{{2}}(?![0-9٠-٩/])"), "📅", "date"),
    (re.compile(rf"(?:(?:ال)?مادة|(?<![\u0600-\u06FF])م)\s*\(?{D}+\)?(?:\s*(?:من|في)\s+(?:نظام|اللائحة)[^،.؛:)]*)?"), "📘", "art"),
    (re.compile(rf"(?:غرامة[^،.؛]{{0,25}}?)?{D}[{D[1:-1]},٬.]*\s*(?:ألف|مليون)?\s*ريال"), "💰", "money"),
    (re.compile(rf"(?:السجن|سجن|الحبس|حبس)[^،.؛]{{0,30}}?(?:{D}+|"+W+r")\s*(?:يوم|يومًا|أيام|شهر|شهرًا|أشهر|سنة|سنوات)"), "⛓️", "jail"),
    (re.compile(rf"(?:{D}+|"+W+r")\s*(?:يومًا|يوما|يوم|أيام|ساعة|ساعات|شهرًا|شهر|أشهر|سنة|سنوات|أسبوع|أسابيع)"), "⏳", "dur"),
]


def mark_numbers(t):
    spans = []
    for rx, emo, cls in NUM_RULES:
        for m in rx.finditer(t):
            if any(not (m.end() <= a or m.start() >= b) for a, b, _, _ in spans):
                continue
            spans.append((m.start(), m.end(), emo, cls))
    for a, b, emo, cls in sorted(spans, reverse=True):
        t = t[:a] + f'<span class="num {cls}">{emo} ' + t[a:b] + "</span>" + t[b:]
    return t


def fmt(t):
    t = html.escape(str(t))
    t = re.sub(r"\((م\s*[0-9٠-٩][^)]{0,30})\)", r'<span class="ref">\1</span>', t)
    t = "".join(x if x.startswith('<span class="ref">') else mark_numbers(x) for x in re.split(r'(<span class="ref">[^<]*</span>)', t))
    t = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", t)
    warn = t.startswith("⚠️")
    if warn:
        t = '<span class="warn">' + t + "</span>"
    return t


EMO = re.compile(r"^(?:[\U0001F000-\U0001FAFF\u2600-\u27BF\u2B00-\u2BFF\uFE0F\u200D\u20E3]|\s)+")


def plain(x):
    """عنصر التعداد بلا إيموجي في أوله (طلب نهلة: التعداد عادي)"""
    x = str(x)
    return x if x.startswith("⚠️") else EMO.sub("", x)


def row_html(r, ci):
    out = []
    for ln in r.get("lines") or []:
        out.append(f'<div class="ln">{fmt(ln)}</div>')
    items = r.get("items") or []
    if items:
        L = max(len(re.sub(r"\\(م[^)]*\\)|\\*", "", str(x))) for x in items)
        cols = 1 if L > 34 or len(items) < 3 else (3 if L <= 16 and len(items) >= 6 else 2)
        lis = "".join(f'<li><span class="n" style="background:{EDGE[ci]}">{str(i+1).translate(AR)}</span>{fmt(plain(x))}</li>' for i, x in enumerate(items))
        out.append(f'<ol class="items" style="grid-template-columns:repeat({cols},1fr)">{lis}</ol>')
    for e in r.get("ex") or []:
        out.append(f'<div class="ex">💡 {fmt(e)}</div>')
    groups = r.get("groups") or []
    if groups:
        k = 0
        boxes = []
        for g in groups:
            lis = []
            for x in g.get("items", []):
                k += 1
                lis.append(f'<li><span class="n" style="background:{EDGE[ci]}">{str(k).translate(AR)}</span>{fmt(plain(x))}</li>')
            boxes.append(f'<div class="grp"><div class="gt" style="color:{EDGE[ci]};border-color:{EDGE[ci]}">{fmt(re.sub(r"\s*\([0-9٠-٩]+\)\s*$", "", g.get("title","")))} <span class="gc">({str(len(g.get("items",[]))).translate(AR)})</span></div><ol class="items">{"".join(lis)}</ol></div>')
        out.append(f'<div class="grps">{"".join(boxes)}</div>')
    if r.get("key"):
        out.append(f'<div class="key">🗝️ {fmt(r["key"])}</div>')
    c = r.get("compare")
    if c:
        th = "".join(f"<th>{fmt(h)}</th>" for h in c.get("headers", []))
        trs = "".join("<tr>" + "".join(f"<td>{fmt(x)}</td>" for x in row) + "</tr>" for row in c.get("rows", []))
        out.append(f'<table class="cmp"><tr>{th}</tr>{trs}</table>')
    return "".join(out)


def render(d, label):
    parts = []
    for ti, t in enumerate(d.get("topics", [])):
        ci = ti % len(COLORS)
        rows = t.get("rows", [])
        n = max(1, len(rows))
        for ri, r in enumerate(rows):
            tr = "<tr>"
            if ri == 0:
                hook = f'<div class="hook">🔗 {fmt(t["hook"])}</div>' if t.get("hook") else ""
                tr += f'<td class="topic" rowspan="{n}" style="background:{COLORS[ci]};border-inline-start:5px solid {EDGE[ci]}"><div class="tname" style="color:{EDGE[ci]}">{fmt(t["topic"])}</div>{hook}</td>'
            tr += f'<td class="sub" style="background:{COLORS[ci]}">{fmt(r.get("label",""))}</td><td class="body">{row_html(r, ci)}</td></tr>'
            parts.append(tr)
    links = d.get("links") or []
    lk = ""
    if links:
        lk = '<div class="links"><div class="lh">🔗 روابط الوحدة — اربط ولا تحفظ منفصلًا</div><ul>' + "".join(f"<li>{fmt(x)}</li>" for x in links) + "</ul></div>"
    return f'<section><div class="badge">{label}</div><h1>{fmt(d.get("title",""))}</h1><table class="map">{"".join(parts)}</table>{lk}</section>'


CSS = """
@page { size: A4 landscape; margin: 8mm; }
* { box-sizing: border-box; }
body { margin: 0; padding: 16px; background: #f4f5f7; font-family: 'Noto Naskh Arabic', 'Geeza Pro', Tahoma, sans-serif; color: #1d2330; direction: rtl; }
section { background: #fff; max-width: 1400px; margin: 0 auto 28px; padding: 18px; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.06); }
.badge { display: inline-block; background: #1d2330; color: #fff; font-size: 12px; padding: 3px 10px; border-radius: 99px; margin-bottom: 6px; }
h1 { font-size: 20px; margin: 4px 0 12px; text-align: center; border: 2px solid #1d2330; padding: 8px; border-radius: 8px; }
table.map { width: 100%; border-collapse: collapse; font-size: 13.5px; line-height: 1.75; }
table.map td { border: 1px solid #c9ced8; vertical-align: middle; padding: 6px 9px; }
td.topic { width: 15%; text-align: center; }
.tname { font-weight: 800; font-size: 15px; }
.hook { margin-top: 6px; font-size: 12px; color: #39404d; background: rgba(255,255,255,.75); border-radius: 6px; padding: 4px 6px; line-height: 1.6; }
td.sub { width: 14%; font-weight: 700; text-align: center; }
td.body { background: #fff; }
.ln { padding: 1px 0; }
.ln + .ln { border-top: 1px dashed #e3e6ec; }
ol.items { list-style: none; margin: 3px 0; padding: 0; display: grid; gap: 2px 18px; }
ol.items li { display: flex; gap: 6px; align-items: baseline; min-width: 0; overflow-wrap: anywhere; }
.num { display: inline-block; border-radius: 6px; padding: 0 5px; font-weight: 700; white-space: nowrap; }
.num.decree { background: #F1E9FF; color: #4B2A8A; }
.num.art { background: #E7EEFF; color: #1E3F8F; }
.num.date { background: #E9F7EF; color: #1F6B3A; }
.num.dur { background: #FFF1DD; color: #8A4B00; }
.num.money { background: #FFF7D1; color: #7A5D00; }
.num.jail { background: #FCE4E4; color: #8E1F1F; }
.grps { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 8px; margin: 4px 0; }
.grp { border: 1px solid #dfe3ea; border-radius: 8px; padding: 6px 8px; background: #fbfcfe; }
.gt { font-weight: 800; font-size: 13px; border-bottom: 2px solid; padding-bottom: 3px; margin-bottom: 4px; }
.gc { font-weight: 600; color: #8a93a3; }
.grp ol.items { grid-template-columns: 1fr; }
.ref { font-size: 11px; color: #8a93a3; margin-inline-start: 4px; white-space: nowrap; }
.kc { flex: none; font-size: 15px; }
.n { flex: none; color: #fff; border-radius: 99px; min-width: 19px; height: 19px; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; font-weight: 700; }
.ex { font-size: 12.5px; color: #2E6B3F; margin-top: 2px; }
.key { margin-top: 4px; font-size: 12.5px; background: #FFF7D6; border-radius: 6px; padding: 3px 8px; display: inline-block; }
.warn { color: #9a2a12; font-weight: 600; }
b { color: #0f3d78; background: #EAF2FF; border-radius: 4px; padding: 0 3px; }
table.cmp { border-collapse: collapse; margin: 4px 0; font-size: 12.5px; }
table.cmp th, table.cmp td { border: 1px solid #d5d9e1; padding: 3px 8px; }
table.cmp th { background: #eef1f6; }
.links { margin-top: 12px; border: 2px dashed #7A4FC0; border-radius: 10px; padding: 8px 14px; background: #FAF7FF; }
.lh { font-weight: 800; color: #5b36a0; margin-bottom: 4px; }
.links ul { margin: 0; padding-inline-start: 20px; line-height: 1.9; }
@media print { body { background: #fff; padding: 0; } section { box-shadow: none; page-break-after: always; margin: 0; max-width: none; } }
"""


def parse(text):
    a, b = text.find("{"), text.rfind("}")
    return json.loads(text[a : b + 1])


if __name__ == "__main__":
    full = parse(open(sys.argv[1]).read())
    final = parse(open(sys.argv[2]).read())
    body = render(full, "المختصر الجدولي — كل الوحدة") + render(final, "⚡ المراجعة الأخيرة الجدولية")
    open(sys.argv[3], "w").write(f'<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>نموذج المختصر الجدولي</title><style>{CSS}</style></head><body>{body}</body></html>')
