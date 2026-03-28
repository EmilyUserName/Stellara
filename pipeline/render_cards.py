#!/usr/bin/env python3
"""
render_cards.py — Stellara social card renderer
Follows brand book exactly: #1a0a2e→#000 gradient, gold accents, Georgia italic body text
"""

import os, sys, json, math, random, datetime, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

W, H          = 1080, 1920
VIDEO_SECONDS = 30
BASE_DIR      = Path(__file__).parent
MUSIC_DIR     = BASE_DIR / "music"

# ── Brand palette (from brand book) ─────────────────────────
BG_INNER   = (26,  10,  46)    # #1a0a2e — gradient center
BG_OUTER   = (0,   0,   0)     # #000000 — gradient edge
GOLD       = (212, 175, 55)    # #D4AF37 — all accents
STEEL_BLUE = (126, 168, 212)   # #7EA8D4 — icon/star
OFF_WHITE  = (240, 244, 248)   # #F0F4F8 — body text
MUTED      = (136, 153, 170)   # #8899AA — secondary text
WHITE      = (255, 255, 255)   # #FFFFFF — wordmark

# ── Fonts ────────────────────────────────────────────────────
def _try(paths, size):
    for p in paths:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, size)
            except: pass
    return ImageFont.load_default()

GEORGIA      = ["/System/Library/Fonts/Supplemental/Georgia.ttf", "/System/Library/Fonts/Times.ttc"]
GEORGIA_BOLD = ["/System/Library/Fonts/Supplemental/Georgia Bold.ttf"]
ARIAL        = ["/System/Library/Fonts/Supplemental/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"]
ARIAL_BOLD   = ["/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc"]

def geo(s):       return _try(GEORGIA,      s)
def geo_bold(s):  return _try(GEORGIA_BOLD + GEORGIA, s)
def arial(s):     return _try(ARIAL,        s)
def arial_bold(s):return _try(ARIAL_BOLD,   s)

# ── Background ───────────────────────────────────────────────
def make_bg():
    img = Image.new("RGB", (W, H), BG_OUTER)
    px  = img.load()
    cx, cy = W//2, H//2
    md = math.sqrt(cx**2 + cy**2)
    for y in range(0, H, 2):
        for x in range(0, W, 2):
            d = math.sqrt((x-cx)**2 + (y-cy)**2) / md
            t = min(d * 1.4, 1.0)
            r = int(BG_INNER[0]*(1-t))
            g = int(BG_INNER[1]*(1-t))
            b = int(BG_INNER[2]*(1-t))
            for dy in range(2):
                for dx in range(2):
                    if x+dx < W and y+dy < H:
                        px[x+dx, y+dy] = (r, g, b)
    return img

def add_nebula(img):
    ov = Image.new("RGBA", (W, H), (0,0,0,0))
    d  = ImageDraw.Draw(ov)
    for cx,cy,rad,col in [
        (W*.3,  H*.25, 400, (120, 20,160, 25)),
        (W*.75, H*.6,  350, (160, 10, 80, 20)),
        (W*.5,  H*.1,  280, (80,  30,180, 18)),
        (W*.2,  H*.75, 300, (100, 15,140, 22)),
        (W*.8,  H*.85, 260, (140, 20, 90, 16)),
    ]:
        for i in range(14):
            r  = int(rad*(1-i/16))
            op = max(0, col[3]-i*2)
            d.ellipse([cx-r,cy-r,cx+r,cy+r], fill=(*col[:3], op))
    img = img.convert("RGBA")
    img.alpha_composite(ov)
    return img.convert("RGB")

def add_stars(draw, n=200, seed=1):
    random.seed(seed)
    for _ in range(n):
        x  = random.randint(0, W)
        y  = random.randint(0, H)
        r  = random.uniform(0.4, 2.6)
        op = random.randint(50, 210)
        draw.ellipse([x-r,y-r,x+r,y+r], fill=(op+40, op+40, min(255,op+60)))

# ── Drawing primitives ───────────────────────────────────────
def draw_4star(draw, cx, cy, size, color):
    pts = []
    for i in range(8):
        angle = math.pi/4*i - math.pi/2
        r     = size if i%2==0 else size*0.18
        pts.append((cx+r*math.cos(angle), cy+r*math.sin(angle)))
    draw.polygon(pts, fill=color)

def gold_divider(draw, y, margin=80):
    # Fade-in/out gold line
    steps  = 60
    seg_w  = (W - margin*2) / steps
    for i in range(steps):
        t   = i / (steps-1)
        op  = int(180 * math.sin(t * math.pi))
        x0  = margin + i*seg_w
        x1  = x0 + seg_w + 1
        draw.line([(x0,y),(x1,y)], fill=(*GOLD, op), width=1)

def branding(draw, y=70):
    """✦ Stellara ✦ in gold, wide spaced — from brand book"""
    # Draw the ✦ stars manually so no font issues
    f    = arial_bold(52)
    txt  = "S T E L L A R A"
    bb   = draw.textbbox((0,0), txt, font=f)
    tw   = bb[2]-bb[0]
    tx   = (W-tw)//2
    # stars flanking
    draw_4star(draw, tx - 44, y+34, 18, GOLD)
    draw_4star(draw, tx+tw+44, y+34, 18, GOLD)
    draw.text((tx, y), txt, font=f, fill=WHITE)

def cta(draw):
    f   = arial(28)
    txt = "stellara-horoscope.com"
    bb  = draw.textbbox((0,0), txt, font=f)
    tw, th = bb[2]-bb[0], bb[3]-bb[1]
    pad = 22
    rx  = (W-tw-pad*2)//2
    ry  = H - 175
    draw.rounded_rectangle(
        [rx, ry, rx+tw+pad*2, ry+th+pad*2],
        radius=26, outline=GOLD, width=2
    )
    draw.text((rx+pad, ry+pad), txt, font=f, fill=GOLD)

# ── Text helpers ─────────────────────────────────────────────
def wrap(text, font, max_w, draw):
    words, lines, line = text.split(), [], ""
    for w in words:
        test = (line+" "+w).strip()
        if draw.textbbox((0,0),test,font=font)[2] <= max_w:
            line = test
        else:
            if line: lines.append(line)
            line = w
    if line: lines.append(line)
    return lines

def block_h(lines, font, draw, spacing):
    h = 0
    for l in lines:
        bb = draw.textbbox((0,0),l,font=font)
        h += (bb[3]-bb[1]) + spacing
    return h - spacing if lines else 0

def draw_centered(draw, lines, font, y, color, spacing=18):
    for line in lines:
        bb = draw.textbbox((0,0),line,font=font)
        tw,th = bb[2]-bb[0], bb[3]-bb[1]
        draw.text(((W-tw)//2, y), line, font=font, fill=color)
        y += th+spacing
    return y

def fill_font(text, font_fn, max_w, max_h, draw, lo=28, hi=180):
    """Return (font, lines, spacing) scaled to fill max_w × max_h."""
    best = None
    for size in range(hi, lo-1, -2):
        f       = font_fn(size)
        spacing = max(10, size//5)
        lines   = wrap(text, f, max_w, draw)
        h       = block_h(lines, f, draw, spacing)
        if h <= max_h:
            best = (f, lines, spacing)
            break
    if best is None:
        f       = font_fn(lo)
        spacing = max(10, lo//5)
        lines   = wrap(text, f, max_w, draw)
        best    = (f, lines, spacing)
    return best

# ── SLOT 1 — Daily Reading ───────────────────────────────────
def render_slot1(slot, out_dir):
    img  = make_bg()
    img  = add_nebula(img)
    draw = ImageDraw.Draw(img)
    add_stars(draw, seed=hash(slot["sign"]) % 999)

    sign = slot["sign"]
    text = slot["card_text"]

    # ── Top: branding
    branding(draw, y=80)
    gold_divider(draw, 185)

    # ── Sign name
    name_top    = 215
    name_bottom = 530
    name_h      = name_bottom - name_top
    name_margin = 140
    nf, nlines, nsp = fill_font(sign.upper(), arial_bold, W-name_margin*2, name_h, draw, lo=60, hi=160)
    nbh  = block_h(nlines, nf, draw, nsp)
    ny   = name_top + (name_h - nbh)//2
    draw_centered(draw, nlines, nf, ny, WHITE, nsp)

    # "DAILY READING" label
    lf  = arial(28)
    lbl = "D A I L Y   R E A D I N G"
    lb  = draw.textbbox((0,0),lbl,font=lf)
    lw  = lb[2]-lb[0]
    draw.text(((W-lw)//2, 548), lbl, font=lf, fill=GOLD)

    gold_divider(draw, 598)

    # ── Body text — starts just below divider, no extra centering gap
    body_top    = 640
    body_bottom = H - 230
    body_h      = body_bottom - body_top
    body_margin = 140
    bf, blines, bsp = fill_font(text, geo, W-body_margin*2, body_h, draw, lo=32, hi=58)
    draw_centered(draw, blines, bf, body_top, OFF_WHITE, bsp)

    gold_divider(draw, H-210)
    cta(draw)

    path = out_dir / f"{slot['filename']}.png"
    img.save(path, "PNG")
    print(f"  ✓ {path.name}")
    return path

# ── SLOT 2 — Cosmic Truth ────────────────────────────────────
def render_slot2(slot, out_dir):
    img  = make_bg()
    img  = add_nebula(img)
    draw = ImageDraw.Draw(img)
    add_stars(draw, n=240, seed=77)

    text = slot["card_text"]

    # Top branding
    branding(draw, y=70)
    gold_divider(draw, 168)

    # ── Truth text fills the center — Georgia, large, centered
    body_top    = 220
    body_bottom = H - 210
    body_h      = body_bottom - body_top
    body_margin = 120

    bf, blines, bsp = fill_font(text, geo_bold, W-body_margin*2, body_h, draw, lo=40, hi=110)
    bbh  = block_h(blines, bf, draw, bsp)
    by   = body_top + (body_h - bbh)//2

    # Gold accent line above/below
    gold_divider(draw, by - 50)
    draw_centered(draw, blines, bf, by, OFF_WHITE, bsp)
    gold_divider(draw, by + bbh + 50)

    gold_divider(draw, H-210)
    cta(draw)

    path = out_dir / f"{slot['filename']}.png"
    img.save(path, "PNG")
    print(f"  ✓ {path.name}")
    return path

# ── SLOT 3 — Tomorrow's Energy ───────────────────────────────
def render_slot3(slot, out_dir):
    img  = make_bg()
    img  = add_nebula(img)
    draw = ImageDraw.Draw(img)
    add_stars(draw, n=260, seed=33)

    text = slot["card_text"]
    date = slot["date"]

    # Top branding
    branding(draw, y=70)
    gold_divider(draw, 168)

    # Label
    lf  = arial(28)
    lbl = "T O M O R R O W ' S   E N E R G Y"
    lb  = draw.textbbox((0,0),lbl,font=lf)
    lw  = lb[2]-lb[0]
    draw.text(((W-lw)//2, 195), lbl, font=lf, fill=GOLD)

    # 4-star accent
    draw_4star(draw, W//2, 275, 20, STEEL_BLUE)

    gold_divider(draw, 310)

    # ── Preview text — fills body
    body_top    = 340
    body_bottom = H - 280
    body_h      = body_bottom - body_top
    body_margin = 120

    bf, blines, bsp = fill_font(text, geo, W-body_margin*2, body_h, draw, lo=36, hi=100)
    bbh  = block_h(blines, bf, draw, bsp)
    by   = body_top + (body_h - bbh)//2
    draw_centered(draw, blines, bf, by, OFF_WHITE, bsp)

    # Date
    df  = arial(28)
    db  = draw.textbbox((0,0),date.upper(),font=df)
    dw  = db[2]-db[0]
    draw.text(((W-dw)//2, by+bbh+45), date.upper(), font=df, fill=MUTED)

    gold_divider(draw, H-210)
    cta(draw)

    path = out_dir / f"{slot['filename']}.png"
    img.save(path, "PNG")
    print(f"  ✓ {path.name}")
    return path

# ── Video ────────────────────────────────────────────────────
def track_duration(path):
    try:
        r = subprocess.run(
            ["ffprobe","-v","error","-show_entries","format=duration",
             "-of","default=noprint_wrappers=1:nokey=1", str(path)],
            capture_output=True, text=True, timeout=10
        )
        return float(r.stdout.strip())
    except: return 120.0

def make_video(png, out_dir, filename):
    tracks = sorted(MUSIC_DIR.glob("*.mp3")) + sorted(MUSIC_DIR.glob("*.m4a"))
    print(f"  [video] Found {len(tracks)} music tracks in {MUSIC_DIR}")
    if not tracks:
        print("  ! No music tracks — skipping video")
        return None

    track     = random.choice(tracks)
    dur       = track_duration(track)
    max_start = max(0, dur - VIDEO_SECONDS - 2)
    start     = round(random.uniform(0, max_start), 1)
    out       = out_dir / f"{filename}.mp4"

    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-loop", "1", "-i", str(png),
        "-ss", str(start), "-i", str(track),
        "-c:v", "libx264", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-t", str(VIDEO_SECONDS),
        "-vf", f"scale={W}:{H}",
        str(out)
    ]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if r.returncode == 0:
        print(f"  ✓ {out.name}  [{track.name} @ {start}s]")
        return out
    else:
        print(f"  ✗ ffmpeg: {r.stderr[-300:]}")
        return None

# ── Main ─────────────────────────────────────────────────────
def main():
    today   = datetime.date.today()
    out_dir = BASE_DIR / "content" / today.isoformat()
    jp      = out_dir / "content.json"

    if not jp.exists():
        print(f"No content.json at {jp}. Run generate_content.py first.")
        sys.exit(1)

    with open(jp) as f:
        content = json.load(f)

    fns = {1: render_slot1, 2: render_slot2, 3: render_slot3}

    for slot in content["slots"]:
        n = slot["slot"]
        print(f"\n[Slot {n}] {slot['type']}")
        png = fns[n](slot, out_dir)
        make_video(png, out_dir, slot["filename"])

    print(f"\nDone — {out_dir}")

if __name__ == "__main__":
    main()
