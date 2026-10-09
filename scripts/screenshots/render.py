"""Turns the trees a mod drew (claude plugin test output) into terminal-style SVG images."""
import json, sys, os, textwrap, unicodedata
from xml.sax.saxutils import escape

FG, DIM, BG, CHROME, BORDER, CAP = '#d4d4d8', '#7c7c88', '#16161e', '#22222c', '#3a3a48', '#8a8aa0'
COLORS = {'claude': '#d97757', 'yellow': '#e5c07b', 'red': '#e06c75', 'green': '#98c379', 'warning': '#e5c07b', 'error': '#e06c75', 'success': '#98c379', 'cyan': '#56b6c2', 'blue': '#61afef', 'magenta': '#c678dd', 'gray': DIM}
CW, LH, FS = 8.4, 20, 14

def merge(style, props):
    s = dict(style)
    for k in ('bold', 'dimColor', 'color'):
        if k in props and props[k] is not None and props[k] is not False:
            s[k] = props[k]
        elif props.get(k) is False:
            s.pop(k, None)
    return s

def spans(node, style):
    if node is None or isinstance(node, bool): return []
    if isinstance(node, (str, int, float)): return [(str(node), style)]
    p = node.get('props') or {}
    if node['type'] == 'Button':
        return [(p['label'] if p.get('plain') else f"[ {p['label']} ]", merge(style, {'dimColor': True} if p.get('dimColor') else {'color': 'cyan'}))]
    out = []
    for c in node.get('children') or []:
        out += spans(c, merge(style, p))
    return out

def cells(t):
    """Cells a string takes in a terminal: emoji two, variation selectors and joiners none."""
    n = 0
    for i, ch in enumerate(t):
        o = ord(ch)
        if o in (0xFE0F, 0x200D): continue
        emoji = o >= 0x1F000 or unicodedata.east_asian_width(ch) in ('W', 'F') or (0x2190 <= o <= 0x2BFF and i + 1 < len(t) and t[i + 1] == '\uFE0F')
        n += 2 if emoji else 1
    return n

def width(line): return sum(cells(t) for t, _ in line)

ROUND = '╭╮╰╯─│'

# The terminal's width for a row that wraps (flexWrap), when a section sets one; None: no wrap.
WRAP = None

def lines(node, style=None, avail=None):
    """Rows of spans for a tree. `avail` is the width a flexGrow Box stretches to."""
    style = style or {}
    if node is None or isinstance(node, bool): return []
    if isinstance(node, str) or node['type'] in ('Text', 'Button'): return [spans(node, style)]
    p = node.get('props') or {}
    border = p.get('borderStyle')
    pad, right = p.get('paddingX', 0), p.get('paddingRight', 0)
    own = p['width'] if isinstance(p.get('width'), int) else (avail if p.get('flexGrow') else None)
    inner = own - right - (pad * 2 + 2 if border else pad) if own else None
    kids = [lines(c, style, inner) for c in node.get('children') or [] if c not in (None, False, True)]
    kids = [k for k in kids if k]
    gap = p.get('gap', 0)
    if p.get('flexDirection', 'row') == 'column':
        out = []
        for i, k in enumerate(kids):
            if i and gap: out += [[] for _ in range(gap)]
            out += k
    else:
        # A wrapping row breaks into runs that fit WRAP, each laid out as a row of its own.
        runs, run, used = [], [], 0
        for k in kids:
            w = max((width(l) for l in k), default=0)
            if WRAP and p.get('flexWrap') == 'wrap' and run and used + gap + w > WRAP - pad * 2:
                runs.append(run)
                run, used = [], 0
            used += (gap if run else 0) + w
            run.append(k)
        runs.append(run)
        out = []
        for run in runs:
            h = max((len(k) for k in run), default=0)
            rows = [[] for _ in range(h)]
            for i, k in enumerate(run):
                w = max((width(l) for l in k), default=0)
                for r in range(h):
                    l = k[r] if r < len(k) else []
                    if i and gap: rows[r].append((' ' * gap, {}))
                    rows[r] += l + [(' ' * (w - width(l)), {})]
            out += rows
    if inner is not None:
        out = [l + [(' ' * max(0, inner - width(l)), {})] for l in out]
    if border:
        w = max((width(l) for l in out), default=0) + pad * 2
        b = {'color': p['borderColor']} if p.get('borderColor') else {'dimColor': True}
        tl, tr, bl, br, hz, vt = ROUND
        out = ([[(tl + hz * w + tr, b)]] +
               [[(vt, b), (' ' * pad, {})] + l + [(' ' * (w - pad - width(l)), {}), (vt, b)] for l in out] +
               [[(bl + hz * w + br, b)]])
        pad = 0
    if pad or right: out = [[(' ' * pad, {})] + l + [(' ' * right, {})] for l in out]
    return out

def text_el(x, y, line):
    parts = []
    # Emoji and box-drawing runs are drawn cell by cell: the font gives neither one cell's width.
    box = lambda t: any(c in ROUND for c in t)
    wide = any(cells(t) != len(t) or box(t) for t, _ in line)
    at = 0
    for t, s in line:
        sx = f' x="{x + at * CW:.1f}"' if wide else ''
        if box(t): sx += f' textLength="{cells(t) * CW:.1f}" lengthAdjust="spacingAndGlyphs"'
        at += cells(t)
        if not t: continue
        fill = COLORS.get(s.get('color'), s.get('color')) if s.get('color') else (DIM if s.get('dimColor') else FG)
        if s.get('dimColor') and s.get('color'): fill = DIM
        w = ' font-weight="700"' if s.get('bold') else ''
        parts.append(f'<tspan{sx} fill="{fill}"{w}>{escape(t)}</tspan>')
    return f'<text x="{x}" y="{y}" xml:space="preserve">{"".join(parts)}</text>' if parts else ''

def plain(t, **s): return [(t, s)]

def svg(sections, cols, title):
    """sections: list of (caption, kind, lines); kind in 'raw' | 'pane:<title>' | 'toast' | 'box'."""
    pad, y, body = 20, 52, []
    cols = max([cols] + [width(l) + 2 for _, _, ls in sections for l in ls])
    W = int(cols * CW + pad * 2 + 24)
    split = []
    for caption, kind, ls in sections:
        if kind == 'toast': split += [(caption if i == 0 else '', kind, [l]) for i, l in enumerate(ls)]
        else: split.append((caption, kind, ls))
    for caption, kind, ls in split:
        if not caption:
            y -= 26
            body.append('')
        else: body.append(f'<text x="{pad}" y="{y}" fill="{CAP}" font-size="11" letter-spacing="1">{escape(caption.upper())}</text>')
        y += 14
        inner = pad + 12
        if not caption: y -= 2
        if kind == 'raw':
            for l in ls:
                y += LH; body.append(text_el(pad, y - 5, l))
            y += 26
            continue
        h = len(ls) * LH + 20
        bw = W - pad * 2 if kind != 'toast' else min(W - pad * 2, int(max(width(l) for l in ls) * CW + 28))
        r = 10 if kind == 'toast' else 6
        fill = '#202a33' if kind == 'toast' else 'none'
        body.append(f'<rect x="{pad}" y="{y}" width="{bw}" height="{h}" rx="{r}" fill="{fill}" stroke="{BORDER}"/>')
        if kind.startswith('pane:'):
            t = kind[5:]
            body.append(f'<rect x="{pad + 10}" y="{y - 8}" width="{len(t) * CW + 12}" height="16" fill="{BG}"/>')
            body.append(f'<text x="{pad + 16}" y="{y + 4}" fill="{FG}" font-weight="700">{escape(t)}</text>')
        yy = y + 10
        for l in ls:
            yy += LH; body.append(text_el(inner, yy - 5, l))
        y += h + 26
    H = y
    head = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
            f'font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="{FS}">'
            f'<rect width="{W}" height="{H}" rx="10" fill="{BG}"/>'
            f'<rect width="{W}" height="30" rx="10" fill="{CHROME}"/><rect y="20" width="{W}" height="10" fill="{CHROME}"/>'
            f'<circle cx="18" cy="15" r="5.5" fill="#ff5f57"/><circle cx="36" cy="15" r="5.5" fill="#febc2e"/><circle cx="54" cy="15" r="5.5" fill="#28c840"/>'
            f'<text x="{W / 2}" y="19" fill="{DIM}" font-size="12" text-anchor="middle">{escape(title)}</text>')
    return head + ''.join(body) + '</svg>\n'

def load(path):
    out = {}
    for row in open(path):
        k, _, v = row.rstrip('\n').partition(' ')
        out.setdefault(k, []).append(v)
    return out

def tree(s): return lines(json.loads(s))

def trim(ls):
    while ls and width(ls[-1]) == 0: ls = ls[:-1]
    return [[(t.rstrip() if i == len(l) - 1 else t, s) for i, (t, s) in enumerate(l)] for l in ls]

# Usage: python3 render.py <dir with the captured .txt files> <output dir>
snap, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)

# limits-meter
d = load(f'{snap}/limits-meter.txt')
band = trim(tree(d['BAND'][0]))
bw = max(width(l) for l in band) - 2
prompt = [plain('╭' + '─' * bw + '╮', dimColor=True), plain('│ ', dimColor=True) + plain('> ') + plain(' ' * (bw - 3)) + plain('│', dimColor=True), plain('╰' + '─' * bw + '╯', dimColor=True)]
open(f'{out}/limits-meter.svg', 'w').write(svg([
    ('band above the prompt', 'raw', band + prompt),
    ('/limits', 'pane:Limits & context', trim(tree(d['PANE'][0]))),
    ('toasts', 'toast', [plain(t) for t in d['TOAST']]),
], 60, 'limits-meter'))

# allowlist-coach
d = load(f'{snap}/allowlist-coach.txt')
notice = next(n for n in d['NOTICE'] if '4/5' in n)
dialog = [plain('Bash command', bold=True), plain('  ./mvnw test -Dtest=OrderServiceTest'), plain('  Run the order service tests', dimColor=True), [],
          plain('Do you want to proceed?'), plain('❯ 1. Yes', color='cyan'), plain("  2. Yes, and don't ask again for ./mvnw test commands in /repo"), plain('  3. No'), [],
          plain(notice, dimColor=True)]
open(f'{out}/allowlist-coach.svg', 'w').write(svg([
    ('under the permission dialog (last line)', 'box', dialog),
    ('toast after 5 approvals', 'toast', [plain(d['TOAST'][0])]),
    ('/allowlist', 'pane:Allowlist', trim(tree(d['PANE'][0]))),
], 60, 'allowlist-coach'))

# agent-watch
d = load(f'{snap}/agent-watch.txt')
status = [plain('  ' + [x for x in d['STATUS'] if 'stalled' in x][-1], dimColor=True)]
open(f'{out}/agent-watch.svg', 'w').write(svg([
    ('/watch', 'pane:Agents', trim(tree(d['TREE'][-1]))),
    ('status line while agents run', 'raw', status),
    ('toasts', 'toast', [plain(t) for t in d['TOAST']]),
], 60, 'agent-watch'))

# test-hud
d = load(f'{snap}/test-hud.txt')
red = [x for x in d['STATUS'] if x.startswith('✗')][-1]
green = d['STATUS'][-1]
open(f'{out}/test-hud.svg', 'w').write(svg([
    ('/test-hud', 'pane:Tests', trim(tree(d['PANE'][-1]))),
    ('status line', 'raw', [plain('  ' + red, dimColor=True), plain('  ' + green, dimColor=True)]),
    ('toast when the suite turns green', 'toast', [plain(t) for t in d['TOAST']]),
], 60, 'test-hud'))
def wrapped(s, cols):
    """A tree laid out with its wrapping rows broken at `cols`, as a terminal that wide shows it."""
    global WRAP
    WRAP = cols
    try: return trim(tree(s))
    finally: WRAP = None

# launchpad
d = load(f'{snap}/launchpad.txt')
menu = trim(tree(d['MENU'][0]))
cw = max(width(l) for l in menu)
box = lambda rows: [plain('╭' + '─' * (cw - 2) + '╮', dimColor=True)] + [plain('│ ', dimColor=True) + r + plain(' ' * max(0, cw - 3 - width(r)) + '│', dimColor=True) for r in rows] + [plain('╰' + '─' * (cw - 2) + '╯', dimColor=True)]
fill = d['FILL'][0]
rows = []
for i, chunk in enumerate(textwrap.wrap(fill, cw - 6)):
    lead = plain('> ' if i == 0 else '  ')
    a, b = chunk.find('['), chunk.find(']')
    rows.append(lead + (plain(chunk[:a]) + plain(chunk[a:b + 1], bold=True, color='yellow') + plain(chunk[b + 1:]) if a >= 0 and b > a else plain(chunk)))
open(f'{out}/launchpad.svg', 'w').write(svg([
    ('welcome menu under the header, before the first request', 'raw', menu),
    ('after 🔍 Explorar código: the request waits, blank marked', 'raw', box(rows)),
    ('/pad place prompt: the menu in a row right above the prompt, ◆ pad after the hint', 'raw', wrapped(d['BAND'][0], cw) + box([plain('> ')]) + trim(tree(d['TREE'][0]))),
    ('◆ pad: the panel, 5h at 74%', 'pane:Painel', wrapped(d['PANE'][0], cw - 4)),
    ('/pad place pane', 'pane:Atalhos', wrapped(d['PANE'][1], cw - 4)),
], 60, 'launchpad'))
