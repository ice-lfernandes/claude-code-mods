"""Turns the trees a mod drew (claude plugin test output) into terminal-style SVG images."""
import json, sys, os
from xml.sax.saxutils import escape

FG, DIM, BG, CHROME, BORDER, CAP = '#d4d4d8', '#7c7c88', '#16161e', '#22222c', '#3a3a48', '#8a8aa0'
COLORS = {'yellow': '#e5c07b', 'red': '#e06c75', 'green': '#98c379', 'cyan': '#56b6c2', 'blue': '#61afef', 'magenta': '#c678dd', 'gray': DIM}
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
        return [(p['label'] if p.get('plain') else f"[ {p['label']} ]", merge(style, {'color': 'cyan'}))]
    out = []
    for c in node.get('children') or []:
        out += spans(c, merge(style, p))
    return out

def width(line): return sum(len(t) for t, _ in line)

def lines(node, style=None):
    style = style or {}
    if node is None or isinstance(node, bool): return []
    if isinstance(node, str) or node['type'] in ('Text', 'Button'): return [spans(node, style)]
    p = node.get('props') or {}
    kids = [lines(c, style) for c in node.get('children') or [] if c not in (None, False, True)]
    kids = [k for k in kids if k]
    gap, pad = p.get('gap', 0), p.get('paddingX', 0)
    if p.get('flexDirection', 'row') == 'column':
        out = []
        for i, k in enumerate(kids):
            if i and gap: out += [[] for _ in range(gap)]
            out += k
    else:
        h = max((len(k) for k in kids), default=0)
        out = [[] for _ in range(h)]
        for i, k in enumerate(kids):
            w = max((width(l) for l in k), default=0)
            for r in range(h):
                l = k[r] if r < len(k) else []
                if i and gap: out[r].append((' ' * gap, {}))
                out[r] += l + [(' ' * (w - width(l)), {})]
    return [[(' ' * pad, {})] + l for l in out] if pad else out

def text_el(x, y, line):
    parts = []
    for t, s in line:
        if not t: continue
        fill = COLORS.get(s.get('color'), s.get('color')) if s.get('color') else (DIM if s.get('dimColor') else FG)
        if s.get('dimColor') and s.get('color'): fill = DIM
        w = ' font-weight="700"' if s.get('bold') else ''
        parts.append(f'<tspan fill="{fill}"{w}>{escape(t)}</tspan>')
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
notice = next(n for n in d['NOTICE'] if n.startswith('allowlist-coach: approved 4 times here; 1 more'))
dialog = [plain('Bash command', bold=True), plain('  ./mvnw test -Dtest=OrderServiceTest'), plain('  Run the order service tests', dimColor=True), [],
          plain('Do you want to proceed?'), plain('❯ 1. Yes', color='cyan'), plain("  2. Yes, and don't ask again for ./mvnw test commands in /repo"), plain('  3. No'), [],
          plain(notice, dimColor=True)]
open(f'{out}/allowlist-coach.svg', 'w').write(svg([
    ('under the permission dialog (last line)', 'box', dialog),
    ('toast after 5 approvals', 'toast', [plain(d['TOAST'][0])]),
    ('/allowlist', 'pane:Allowlist coach', trim(tree(d['PANE'][0]))),
], 60, 'allowlist-coach'))

# agent-watch
d = load(f'{snap}/agent-watch.txt')
status = [plain('  ' + [x for x in d['STATUS'] if 'stalled' in x][-1], dimColor=True)]
open(f'{out}/agent-watch.svg', 'w').write(svg([
    ('/watch', 'pane:Agents', trim(tree(d['TREE'][-1]))),
    ('status line while agents run', 'raw', status),
    ('toasts', 'toast', [plain(t) for t in d['TOAST']]),
], 60, 'agent-watch'))
print('ok')
