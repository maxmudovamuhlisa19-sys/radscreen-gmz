# -*- coding: utf-8 -*-
"""
RadSkrin — hakamlar uchun taqdimot (PPTX)
Ishlatish:  python make_ppt.py
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from PIL import Image

# ----------------------------- dizayn -----------------------------
BG      = RGBColor(0x0B, 0x12, 0x20)   # to'q ko'k-qora
BG2     = RGBColor(0x11, 0x1C, 0x2E)
CARD    = RGBColor(0x16, 0x24, 0x3A)
CYAN    = RGBColor(0x22, 0xD3, 0xEE)
GREEN   = RGBColor(0x22, 0xC5, 0x5E)
AMBER   = RGBColor(0xEA, 0xB3, 0x08)
ORANGE  = RGBColor(0xF9, 0x73, 0x16)
RED     = RGBColor(0xEF, 0x44, 0x44)
WHITE   = RGBColor(0xF1, 0xF5, 0xF9)
MUTED   = RGBColor(0x94, 0xA3, 0xB8)
DARKTX  = RGBColor(0x05, 0x24, 0x2C)

FONT = 'Segoe UI'
W, H = Inches(13.333), Inches(7.5)
TOTAL_SLIDES = 27

prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]


# ----------------------------- yordamchi -----------------------------
def rect(slide, x, y, w, h, fill, line=None, radius=None):
    from pptx.enum.shapes import MSO_SHAPE
    shp = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE,
                                 x, y, w, h)
    shp.fill.solid()
    shp.fill.fore_color.rgb = fill
    if line:
        shp.line.color.rgb = line
        shp.line.width = Pt(1.25)
    else:
        shp.line.fill.background()
    shp.shadow.inherit = False
    if radius:
        try:
            shp.adjustments[0] = radius
        except Exception:
            pass
    return shp


def tb(slide, x, y, w, h, text, size=18, color=WHITE, bold=False,
       align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, spacing=1.15, italic=False):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    tf.margin_left = tf.margin_right = 0
    tf.margin_top = tf.margin_bottom = 0
    lines = text.split('\n')
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run()
        r.text = ln
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.italic = italic
        r.font.name = FONT
        r.font.color.rgb = color
    return box


def bullets(slide, x, y, w, h, items, size=17, color=WHITE, gap=6, marker='•', mcolor=CYAN):
    box = slide.shapes.add_textbox(x, y, w, h)
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, it in enumerate(items):
        if isinstance(it, tuple):
            txt, c = it
        else:
            txt, c = it, mcolor
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.line_spacing = 1.18
        p.space_after = Pt(gap)
        r0 = p.add_run(); r0.text = marker + '  '
        r0.font.size = Pt(size); r0.font.bold = True; r0.font.name = FONT; r0.font.color.rgb = c
        # **qalin** qism
        parts = txt.split('**')
        for j, part in enumerate(parts):
            if not part:
                continue
            r = p.add_run(); r.text = part
            r.font.size = Pt(size); r.font.name = FONT
            r.font.bold = (j % 2 == 1)
            r.font.color.rgb = c if j % 2 == 1 else color
    return box


def base(slide, num=None, title=None, kicker=None):
    """Fon + sarlavha + pastki raqam (raqam avtomatik — slayd tartibidan)"""
    num = tick()
    rect(slide, 0, 0, W, H, BG)
    # yuqori chiziq
    rect(slide, 0, 0, W, Inches(0.055), CYAN)
    if title:
        if kicker:
            tb(slide, Inches(0.75), Inches(0.42), Inches(11.5), Inches(0.3),
               kicker.upper(), 12.5, CYAN, True)
            ty = Inches(0.72)
        else:
            ty = Inches(0.5)
        tb(slide, Inches(0.75), ty, Inches(11.8), Inches(0.75), title, 33, WHITE, True)
        rect(slide, Inches(0.75), ty + Inches(0.78), Inches(1.5), Inches(0.05), CYAN)
    if num is not None:
        rect(slide, Inches(0.75), Inches(6.88), Inches(11.8), Inches(0.012),
             RGBColor(0x1B, 0x2A, 0x40))
        tb(slide, Inches(0.75), Inches(6.98), Inches(6), Inches(0.3),
           'RadSkrin — NMKG radiatsiya skrining tizimi', 10.5, MUTED)
        tb(slide, Inches(10.6), Inches(6.98), Inches(2.1), Inches(0.3),
           f'{num:02d} / {TOTAL_SLIDES}', 10.5, MUTED, False, PP_ALIGN.RIGHT)


def stat(slide, x, y, w, h, big, label, color=CYAN):
    rect(slide, x, y, w, h, CARD, radius=0.09)
    rect(slide, x, y, Inches(0.07), h, color)
    tb(slide, x + Inches(0.3), y + Inches(0.18), w - Inches(0.36), Inches(0.8),
       big, 30, color, True)
    tb(slide, x + Inches(0.3), y + Inches(1.22), w - Inches(0.5), h - Inches(1.32),
       label, 13, MUTED)


# ----------------------- slayd raqami (avtomat) -----------------------
_pos = {'n': 0}


def tick():
    _pos['n'] += 1
    return _pos['n']


# --------------------------- skrinshot ------------------------------
SHOTS = os.path.join(os.environ.get('TEMP', '.'), 'opencode', 'shots')


def pic(slide, path, x, y, w, h, caption=None, tag=None):
    """Rasmli kadr: karta + skrinshot (butun rasm, mayatlab markazlanadi)."""
    cap_h = Inches(0.32) if caption else Inches(0)
    avail_h = h - cap_h
    if not os.path.exists(path):
        rect(slide, x, y, w, h, CARD, radius=0.03)
        tb(slide, x, y + h / 2 - Inches(0.2), w, Inches(0.4),
           'skrinshot mavjud emas', 14, MUTED, False, PP_ALIGN.CENTER)
        return None
    im = Image.open(path)
    ar = im.size[0] / im.size[1]
    if w / avail_h > ar:            # maydon keng — balandlik cheklaydi
        ph, pw = avail_h, int(round(avail_h * ar))
    else:                           # rasm keng — kenglik cheklaydi
        pw, ph = w, int(round(w / ar))
    px = x + (w - pw) // 2
    py = y + (avail_h - ph) // 2
    rect(slide, px - Inches(0.07), py - Inches(0.07),
         pw + Inches(0.14), ph + Inches(0.14), CARD, radius=0.03)
    shp = slide.shapes.add_picture(path, px, py, pw, ph)
    try:
        shp.line.color.rgb = RGBColor(0x1E, 0x3A, 0x55)
        shp.line.width = Pt(1)
    except Exception:
        pass
    if caption:
        tb(slide, x, py + ph + Inches(0.12), w, cap_h, caption, 11.5, MUTED,
           False, PP_ALIGN.CENTER)
    return shp


def arrow(slide, x, y, w, h, color=CYAN):
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x, y, w, h)
    a.fill.solid()
    a.fill.fore_color.rgb = color
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def alpha(shape, pct):
    """Plek rangga shaffoflik (0–100, 100 = to'liq opaq)."""
    try:
        from pptx.oxml.ns import qn
        sf = shape.fill._xPr.find(qn('a:solidFill'))
        clr = sf.find(qn('a:srgbClr'))
        el = clr.makeelement(qn('a:alpha'), {'val': str(int(pct * 1000))})
        clr.append(el)
    except Exception:
        pass
    return shape


def cover(path, w_emu, h_emu, tag):
    """Rasmini kata maydonga (cover) qirqib moslaydi — fon uchun."""
    cache = os.path.join(os.path.dirname(path), '_ppt_cache')
    os.makedirs(cache, exist_ok=True)
    out = os.path.join(cache, tag + '.jpg')
    im = Image.open(path).convert('RGB')
    Wp, Hp = im.size
    ar_box = w_emu / h_emu
    if Wp / Hp > ar_box:
        nw = max(1, int(round(Hp * ar_box)))
        x0 = (Wp - nw) // 2
        im = im.crop((x0, 0, x0 + nw, Hp))
    else:
        nh = max(1, int(round(Wp / ar_box)))
        im = im.crop((0, 0, Wp, nh))
    im.save(out, quality=88)
    return out


def pill(slide, x, y, w, h, text, color, size=12.5, fill=None):
    """Kichik yorliq (chip)."""
    rect(slide, x, y, w, h, fill or CARD, radius=0.5)
    tb(slide, x, y + (h - Inches(size / 55)) / 2 - Inches(0.02), w, h,
       text, size, color, True, PP_ALIGN.CENTER)


def run_action(shape, cmd):
    """Shaklni bosish → tashqi dasturni ishga tushirish (ppaction://program)."""
    from pptx.oxml.ns import qn
    shape.click_action.hyperlink.address = cmd
    cNvPr = shape._element.find(qn('p:nvSpPr')).find(qn('p:cNvPr'))
    hl = cNvPr.find(qn('a:hlinkClick'))
    hl.set('action', 'ppaction://program')
    return shape


_bar_n = [0]


def hbar(slide, x, y, w, h, pct, color, track=None):
    """Yotiq progress chizig'i (ppt_anim.py BAR_ nomi bilan animatsiya qiladi)."""
    rect(slide, x, y, w, h, track or RGBColor(0x1B, 0x2A, 0x40), radius=0.5)
    if pct > 0:
        _bar_n[0] += 1
        bar = rect(slide, x, y, max(Inches(0.08), int(w * min(pct, 1.0))), h,
                   color, radius=0.5)
        bar.name = 'BAR%02d' % _bar_n[0]


def video_slot(slide, x, y, w, h, caption=None, ar=16 / 10, name='VIDEO_SLOT'):
    """Video uchun o'rin (keyin COM orqali haqiqiy MP4 joylashtiriladi)."""
    cap_h = Inches(0.32) if caption else Inches(0)
    avail_h = h - cap_h
    if w / avail_h > ar:
        ph, pw = avail_h, int(round(avail_h * ar))
    else:
        pw, ph = w, int(round(w / ar))
    px = x + (w - pw) // 2
    py = y + (avail_h - ph) // 2
    rect(slide, px - Inches(0.07), py - Inches(0.07),
         pw + Inches(0.14), ph + Inches(0.14), CARD, radius=0.03)
    slot = rect(slide, px, py, pw, ph, BG2, radius=0.02)
    slot.name = name
    tb(slide, px, py + ph / 2 - Inches(0.3), pw, Inches(0.6),
       '▶', 40, CYAN, True, PP_ALIGN.CENTER)
    if caption:
        tb(slide, x, py + ph + Inches(0.12), w, cap_h, caption, 11.5, MUTED,
           False, PP_ALIGN.CENTER)
    return slot


# ============================ 1. SARLAVHA ============================
s = prs.slides.add_slide(BLANK)
tick()
rect(s, 0, 0, W, H, BG)
# fon: real ilova ekrani + qorong'i pardaz
_bgp = os.path.join(SHOTS, 'vision.png')
if os.path.exists(_bgp):
    s.shapes.add_picture(cover(_bgp, W, H, 'cover_title'), 0, 0, W, H)
    alpha(rect(s, 0, 0, W, H, BG), 84)
    alpha(rect(s, 0, 0, W, Inches(0.09), CYAN), 90)
rect(s, 0, 0, Inches(0.14), H, CYAN)
# yuqori o'ngda rang nuqtalari
for i, c in enumerate([CYAN, GREEN, AMBER, ORANGE, RED]):
    rect(s, Inches(11.15 + i * 0.42), Inches(0.62), Inches(0.26), Inches(0.26), c, radius=0.5)

tb(s, Inches(0.95), Inches(1.42), Inches(9.5), Inches(0.4),
   "SUN'IY INTELLEKT · TIBBIY SKRINING · RADIATSIYA NAZORATI", 14, CYAN, True)
tb(s, Inches(0.9), Inches(1.85), Inches(10.5), Inches(1.5), 'RadSkrin', 80, WHITE, True)
tb(s, Inches(0.95), Inches(3.22), Inches(10.2), Inches(1.1),
    'NMKG (radiatsiya) xavfini kamera, sun\'iy intellekt va\nqoidalar yuritgichi bilan bir daqiqada aniqlash tizimi',
   24, RGBColor(0xCB, 0xD5, 0xE1), False, spacing=1.3)
rect(s, Inches(0.95), Inches(4.5), Inches(3.0), Inches(0.05), CYAN)

chips = [('🧬  Face ID', CYAN), ('🧠  AI xulosa (13)', GREEN),
         ('🗣  Ovozli suhbat', AMBER), ('🧪  Alkogol testi', RED)]
for i, (t, c) in enumerate(chips):
    pill(s, Inches(0.95) + i * Inches(2.88), Inches(4.85), Inches(2.7), Inches(0.58), t, c, 13)

tb(s, Inches(0.95), Inches(5.75), Inches(11.4), Inches(0.7),
    'Oflayn ishlaydi  ·  Hech qanday tashqi bog\'lanishsiz  ·  ICRP 103 / WHO / BEIR VII standartlari\n'
   'Kamera + mikrofon + dozimetr → dalilli klinik xulosa',
   15.5, MUTED, False, spacing=1.45)

rect(s, Inches(0.95), Inches(6.55), Inches(4.7), Inches(0.52), CARD, radius=0.15)
rect(s, Inches(0.95), Inches(6.55), Inches(0.07), Inches(0.52), CYAN)
tb(s, Inches(1.2), Inches(6.67), Inches(4.3), Inches(0.35),
   'Hakamlar uchun taqdimot  ·  2026', 13, CYAN, True)

# ============================ 2. MUNDARIJA ============================
s = prs.slides.add_slide(BLANK)
base(s, None, 'Mundarija', 'Taqdimot tuzilishi')
agenda = [
    ('01', 'Muammo va yechim', 'Radiatsiya xavfi, besh qatlamli yechim, arxitektura va jarayonlar sxemasi', CYAN),
    ('02', 'Asosiy imkoniyatlar', 'Vizual skrining, AI klinik xulosa, alkogol aniqlash, ovozli suhbat', GREEN),
    ('03', 'Ilova ekranlari', 'Monitoring, camera skriningi, AI natija, alkogol moduli — real ekrangiz', AMBER),
    ('04', 'Texnologiya va reja', 'Texnologiya, loyiha raqamlari, raqobat, xavfsizlik, byudjet, reja', RED),
]
ay = Inches(2.15)
for i, (n, t, d, c) in enumerate(agenda):
    y = ay + i * Inches(1.15)
    rect(s, Inches(0.75), y, Inches(11.8), Inches(1.0), CARD, radius=0.07)
    rect(s, Inches(0.75), y, Inches(1.15), Inches(1.0), c, radius=0.07)
    tb(s, Inches(0.75), y + Inches(0.24), Inches(1.15), Inches(0.55), n, 26, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, Inches(2.15), y + Inches(0.16), Inches(4.4), Inches(0.4), t, 17, WHITE, True)
    tb(s, Inches(2.15), y + Inches(0.55), Inches(9.9), Inches(0.4), d, 13.5, MUTED)
    tb(s, Inches(11.6), y + Inches(0.3), Inches(0.85), Inches(0.4), '›', 26, c, True, PP_ALIGN.RIGHT)

# ============================ 2. MUAMMO ============================
s = prs.slides.add_slide(BLANK)
base(s, 2, 'Muammo', 'Nima uchun kerak?')
bullets(s, Inches(0.75), Inches(2.05), Inches(6.5), Inches(4.6), [
    '**Radiatsiya xavfi ko\'rinmaydi** — u yoq, hid yo\'q, darhol sezilmaydi.',
    '**Kasbiy xavf yuqori** — radiologlar, sanoat ishchilari, favqulodda hodisalar qatnashchilari.',
    '**Tizimli skrining kam** — ko\'p joylarda tahlil qo\'lda, sekin va sub\'ektiv.',
    '**Kechikish oqibati** — radiatsion kasalliklar kech aniqlansa, davolash qiyin.',
    '**Ichimlik yoki alkogol darhol aniqlanmaydi** — xavfli mashina boshqarish, og\'ir ish oldidan tekshiruv yo\'q.',
], 17.5, gap=13)

rect(s, Inches(7.75), Inches(2.05), Inches(4.8), Inches(4.6), CARD, radius=0.06)
rect(s, Inches(7.75), Inches(2.05), Inches(4.8), Inches(0.62), RED, radius=0.06)
tb(s, Inches(8.05), Inches(2.18), Inches(4.3), Inches(0.4), 'XAVFLAR ZANJIRI', 15, WHITE, True)
bullets(s, Inches(8.05), Inches(2.9), Inches(4.25), Inches(3.5), [
    'Yuqori doza → kech aniqlanadi',
    'Simptomlar yashirin va kech seziladi',
    'Sub\'ektiv shifokor hukmi',
    'Hujjatlar qo\'lda yuritiladi',
    'Favqulodda vaziyatda vaqt yo\'qoladi',
], 15, RED, gap=12, marker='→', mcolor=RED)

# ============== NURLANGAN VA NURLANGANMAGAN ODOM (farq) ==============
s = prs.slides.add_slide(BLANK)
base(s, None, 'Nurlangan va nurlanmagan odam', 'Farq nimada?')
tb(s, Inches(0.75), Inches(1.9), Inches(11.8), Inches(0.4),
   'Bir daqiqada ko\'rinadigan belgilar, o\'lchovlar va AI xulosasi birgalikda farqni ko\'rsatadi.',
   16, MUTED)

# jadval sarlavhasi
rect(s, Inches(0.75), Inches(2.4), Inches(11.8), Inches(0.55), CARD, radius=0.1)
tb(s, Inches(1.0), Inches(2.51), Inches(3.1), Inches(0.4), 'Mezon', 14.5, MUTED, True)
tb(s, Inches(4.35), Inches(2.51), Inches(4.2), Inches(0.4), 'NURLANGAN ODAM', 14.5, RED, True)
tb(s, Inches(8.75), Inches(2.51), Inches(3.6), Inches(0.4), 'NURLANGANMAGAN ODAM', 14.5, GREEN, True)

diff_rows = [
    ('Doza tezligi', '5–20 µSv/soat — "yuqori" daraja', '≤ 0.5 µSv/soat — "fon normal"'),
    ('Kunlik / yillik doza', 'kunlik me\'yordan oshgan, yillik ≥ 100%', 'kunlik normada, yillik < 20%'),
    ('Ko\'rinadigan belgilar', 'teri qizarishi, ko\'z qovoqlari, charchoq', 'belgilar yo\'q, holat barqaror'),
    ('Puls (PPG) va reaktsiya', '90+ bpm, sekinlashgan reaktsiya', '60–80 bpm, barqaror'),
    ('AI xulosa (13 kasallik)', 'ARS / dermatit / anemiya — "bor" (≥70)', 'barcha holatlar — "yo\'q" (<38)'),
    ('Sog\'liq yo\'qotish va amal', 'SY 70%+ — 4 soatda mutaxassis', 'SY 0–24% — profilaktik kuzatuv'),
]
for i, (k, a, b) in enumerate(diff_rows):
    y = Inches(2.98) + i * Inches(0.58)
    if i % 2 == 0:
        rect(s, Inches(0.75), y, Inches(11.8), Inches(0.53), BG2)
    tb(s, Inches(1.0), y + Inches(0.11), Inches(3.2), Inches(0.4), k, 13.5, WHITE, True)
    tb(s, Inches(4.35), y + Inches(0.11), Inches(4.3), Inches(0.4), '✗  ' + a, 13.5, RED)
    tb(s, Inches(8.75), y + Inches(0.11), Inches(3.7), Inches(0.4), '✓  ' + b, 13.5, GREEN)

tb(s, Inches(0.75), Inches(6.5), Inches(11.8), Inches(0.35),
   'Farq bitta ko\'rsatkichda emas — doza, belgilar, puls va AI xulosa birgalikda baholanadi. '
   'RadSkrin ikkalasini bir daqiqada ajratadi.', 14.5, CYAN, True)

# ============================ FARQ — JONLI VIDEO ============================
s = prs.slides.add_slide(BLANK)
base(s, None, 'Farq jonli ko\'rinishda', 'Video — nurlangan va nurlanmagan')
bullets(s, Inches(0.75), Inches(2.15), Inches(3.85), Inches(4.2), [
    '**Ikki holat yonma-yon** — nurlangan va nurlanmagan odam',
    '**Doza tezligi** qarama-qarshi qiymatlarda',
    '**Belgilar** — bir tomonda bor, ikkinchisida yo\'q',
    '**Puls va AI xulosa** farqni raqamda ko\'rsatadi',
    '**Sog\'liq yo\'qotish** shkalasi: 74% va 12%',
    'Video ichida **ovozli tushuntirish** — tugma bosish shart emas',
], 15, WHITE, gap=14)
video_slot(s, Inches(4.95), Inches(2.15), Inches(7.6), Inches(4.35),
           caption='RadSkrin — nurlangan va nurlanmagan odam farqi (MP4, ovoz bilan)',
           ar=16 / 9, name='DIFF_VIDEO_SLOT')

# ====================== ODAM TANASI — REAL ANIQLASH ======================
s = prs.slides.add_slide(BLANK)
base(s, None, 'Odam tanasi — sun\'iy 3D model', 'Kamerasiz sintetik video')
bullets(s, Inches(0.75), Inches(2.15), Inches(3.85), Inches(4.2), [
    '**Kamera yo\'q** — Blender 3D modelidan sintetik kadr',
    '**Tana qutisi** — ishonch foizi bilan aniqlanadi',
    '**17 ta nuqta** — yelka, tirsak, son va tizza',
    '**Skelet** — poza real vaqtda chiziladi',
    '**Bir xil AI** — kamera va sintetik uchun bir model',
    'Keyingi qadam — **yuz va belgilar tahlili**',
], 15, WHITE, gap=14)
video_slot(s, Inches(4.95), Inches(2.15), Inches(7.6), Inches(4.35),
           caption='RadSkrin — sintetik 3D modelda odam tanasi aniqlash (MP4, ovoz bilan)',
           ar=16 / 9, name='BODY_VIDEO_SLOT')

# ============================== JONLI ISBOT ==============================
s = prs.slides.add_slide(BLANK)
base(s, None, 'Jonli isbot', 'Kamera shu zahoti ishlaydi')
bullets(s, Inches(0.75), Inches(2.15), Inches(3.85), Inches(4.2), [
    '**Yozuv emas** — kamera hozir, jonli rejimda ishlaydi',
    '**Tana qutisi** va 17 nuqta real vaqtda chiziladi',
    '**FPS hisoblagich** — tezlik jonli ko\'rinadi',
    '**Hech narsa yozilmaydi** — yopilganda oyna yopiladi',
    'Deraza: **Q** — yopish, **F** — to\'liq ekran',
], 15, WHITE, gap=14)

btn = rect(s, Inches(4.95), Inches(2.5), Inches(7.6), Inches(1.45), CYAN, radius=0.14)
btn.name = 'LIVE_BTN'
tb(s, Inches(4.95), Inches(2.9), Inches(7.6), Inches(0.7),
   '▶  JONLI KAMERANI ISHGA TUSHIRISH', 25, DARKTX, True, PP_ALIGN.CENTER)
run_action(btn, os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             'live_camera.bat'))

pill(s, Inches(4.95), Inches(4.3), Inches(2.35), Inches(0.5), '1280 × 720', CYAN, 13)
pill(s, Inches(7.45), Inches(4.3), Inches(1.95), Inches(0.5), '30 FPS', GREEN, 13)
pill(s, Inches(9.55), Inches(4.3), Inches(3.0), Inches(0.5),
     'YOLOv8-pose · 17 nuqta', AMBER, 13)

tb(s, Inches(4.95), Inches(5.15), Inches(7.6), Inches(0.9),
   'Prezentatsiyada tugmani bosing — PowerPoint dasturni ishga tushirishni so\'raydi: '
   '"Ha" ni bosing va jonli kamera derazasi ochiladi.', 14.5, WHITE, spacing=1.3)
tb(s, Inches(4.95), Inches(6.15), Inches(7.6), Inches(0.35),
   'live_camera.bat  →  python live_camera.py  →  kamera + aniqlash',
   12.5, CYAN, italic=True)

# ============================ 3. YECHIM ============================
s = prs.slides.add_slide(BLANK)
base(s, 3, 'Yechim — RadSkrin', 'Bitta tizim, beshta qatlam')
tb(s, Inches(0.75), Inches(1.95), Inches(11.8), Inches(0.5),
   'Kamera, mikrofon va dozimetr ma\'lumotlarini birlashtirib, bir daqiqada obyektiv skrining beradi.',
   17, MUTED)

cards = [
    ('📷', 'Vizual skrining', 'Yuz, yuz rangi, puls, barqarorlik — kameradan real vaqtda', CYAN),
    ('🧠', 'AI klinik xulosa', '13 ta kasallik bo\'yicha bor/yo\'q + xavf darajasi', GREEN),
    ('🗣', 'Ovozli suhbat', 'O\'zbekcha/ruscha gapiradi, ovozni tushunadi', AMBER),
    ('🧬', 'Face ID', '128 o\'lchamli yuz deskriptori bilan shaxs tanish', ORANGE),
    ('🧪', 'Alkogol aniqlash', '5 signal: duranglik, reaktsiya, ovoz, yuz, BAC', RED),
]
cw, gap = Inches(2.3), Inches(0.16)
x0 = Inches(0.75)
for i, (ic, t, d, c) in enumerate(cards):
    x = x0 + i * (cw + gap)
    rect(s, x, Inches(2.75), cw, Inches(3.4), CARD, radius=0.07)
    rect(s, x, Inches(2.75), cw, Inches(0.09), c)
    tb(s, x + Inches(0.22), Inches(3.0), cw - Inches(0.4), Inches(0.6), ic, 30, c, True)
    tb(s, x + Inches(0.22), Inches(3.7), cw - Inches(0.4), Inches(0.75), t, 16.5, WHITE, True, spacing=1.15)
    tb(s, x + Inches(0.22), Inches(4.55), cw - Inches(0.44), Inches(1.5), d, 13, MUTED, spacing=1.3)

tb(s, Inches(0.75), Inches(6.35), Inches(11.8), Inches(0.4),
   'Natija: obyektiv, takrorlanadigan va tez skrining — shifokor hukmini qo\'llab-quvvatlaydi, o\'rnini egallamaydi.',
   15, CYAN, True)

# ============================ 4. ARXITEKTURA ============================
s = prs.slides.add_slide(BLANK)
base(s, 4, 'Arxitektura', 'Qanday ishlaydi')
tb(s, Inches(0.75), Inches(1.95), Inches(11.8), Inches(0.4),
    'Hech qanday tashqi bog\'lanishli Node.js server + vanilla JS SPA. Tashqi SaaS yo\'q — ma\'lumot sizda qoladi.',
   16, MUTED)

layers = [
    ('KIRISH', CYAN, [
         'Kamera (getUserMedia, 120 FPS)',
        'Mikrofon (Web Speech API)',
        'Dozimetr (USB Geiger / Web Serial)',
        'Qo\'lda kiritish / rasm yuklash',
    ]),
    ('QAYTA ISHLASH', GREEN, [
        'VisionEngine — yuz aniqlash, PPG puls',
        'RadModel — doza → sog\'liq yo\'qotish',
        'AIDiag — 13 ta qoida + dalillar',
        'AlcoholTest — 5 signalli birlashtirish',
    ]),
    ('SAQLASH / CHIQISH', AMBER, [
        'JSON bazalar (bemor, yo\'llanma, foydalanuvchi)',
         'Face ID ro\'yxati (128-o\'lchamli deskriptor)',
        'PDF/CSV eksport, chop etish',
        'TTS — Edge neural ovoz (keshlangan)',
    ]),
]
bw = Inches(3.9)
for i, (name, c, items) in enumerate(layers):
    x = Inches(0.75) + i * (bw + Inches(0.28))
    rect(s, x, Inches(2.7), bw, Inches(3.5), CARD, radius=0.06)
    rect(s, x, Inches(2.7), bw, Inches(0.55), c, radius=0.06)
    tb(s, x + Inches(0.25), Inches(2.82), bw - Inches(0.5), Inches(0.4), name, 14.5, DARKTX, True)
    bullets(s, x + Inches(0.25), Inches(3.5), bw - Inches(0.5), Inches(2.5), items, 14.5, WHITE, gap=11, mcolor=c)
    if i < 2:
        tb(s, x + bw + Inches(0.02), Inches(4.2), Inches(0.26), Inches(0.5), '›', 30, MUTED, True, PP_ALIGN.CENTER)

tb(s, Inches(0.75), Inches(6.4), Inches(11.8), Inches(0.4),
   'Brauzerda ishlaydi · HTTP + JSON API · 1 ta faylda server · o\'rnatish: npm start',
   15, CYAN, True)

# ==================== 5. JARAYONLAR SXEMASI ====================
s = prs.slides.add_slide(BLANK)
base(s, None, 'Jarayonlar sxemasi', 'Ma\'lumot qanday yuradi')
tb(s, Inches(0.75), Inches(1.9), Inches(11.8), Inches(0.4),
   'To\'rt bosqich: signal yig\'iladi → tahlil qilinadi → dalilli xulosa → amaliy harakat.',
   16, MUTED)

flow = [
    ('KIRISH', 'Kamera · mikrofon\nDozimetr · qo\'lda kiritish', CYAN),
    ('TAHLIL', 'VisionEngine · RadModel\nAIDiag · AlcoholTest', GREEN),
    ('XULOSA', 'Ball · ICD-10 kod\nTavsiyalar · yo\'llanma', AMBER),
    ('HARAKAT', 'Shifokor navbati\nKuzatuv · PDF / CSV', RED),
]
bw2, aw, gap2 = Inches(2.62), Inches(0.42), Inches(0.09)
x = Inches(0.75)
ytop = Inches(2.5)
for i, (name, desc, c) in enumerate(flow):
    rect(s, x, ytop, bw2, Inches(1.7), CARD, radius=0.07)
    rect(s, x, ytop, bw2, Inches(0.07), c)
    tb(s, x + Inches(0.2), ytop + Inches(0.22), bw2 - Inches(0.4), Inches(0.4), name, 15.5, c, True)
    tb(s, x + Inches(0.2), ytop + Inches(0.72), bw2 - Inches(0.4), Inches(0.85), desc, 13, WHITE, spacing=1.25)
    if i < 3:
        arrow(s, x + bw2 + gap2, ytop + Inches(0.68), aw, Inches(0.34), MUTED if False else CYAN)
    x += bw2 + aw + gap2

# qayta aylanish (loop)
ret = s.shapes.add_shape(MSO_SHAPE.LEFT_ARROW, Inches(0.75), Inches(4.42), Inches(11.75), Inches(0.52))
ret.fill.solid(); ret.fill.fore_color.rgb = BG2
ret.line.color.rgb = RGBColor(0x24, 0x3B, 0x55); ret.line.width = Pt(1)
ret.shadow.inherit = False
tb(s, Inches(2.3), Inches(4.54), Inches(8.6), Inches(0.35),
   'Takroriy skrining (3–6 oy) — natija bemor kartasiga yoziladi', 13, CYAN, True, PP_ALIGN.CENTER)

# pastki qator: aloqa + chegaralar
bottom = [
    ('AI BILAN SUHBAT', [
        'AI xulosani ovozda o\'qiydi (Edge neural TTS)',
        'Operator mikrofon bilan savol beradi',
        'Gemini LLM yoki oflayn qoidalardan javob',
    ], AMBER),
    ('XAVFSIZLIK CHEGARASI', [
        'Tizim skrining beradi — tashxis emas',
        'Yakuniy hukm shifokordan',
        'Xavfli holatda 103 / IIB tavsiyasi',
    ], RED),
    ('TEXNIK YADRO', [
        'Node.js server · JSON bazalar',
        'Brauzerda: kamera, mikrofon, Web Serial',
        'Tashqi SaaS yo\'q — ma\'lumot joyida',
    ], GREEN),
]
cwid = Inches(3.78)
for i, (t, items, c) in enumerate(bottom):
    bx = Inches(0.75) + i * (cwid + Inches(0.2))
    rect(s, bx, Inches(5.25), cwid, Inches(1.45), CARD, radius=0.07)
    rect(s, bx, Inches(5.25), Inches(0.06), Inches(1.45), c)
    tb(s, bx + Inches(0.22), Inches(5.35), cwid - Inches(0.4), Inches(0.3), t, 12.5, c, True)
    bullets(s, bx + Inches(0.22), Inches(5.7), cwid - Inches(0.42), Inches(0.95), items, 11.5, WHITE, gap=3, marker='›', mcolor=c)

# ============================ 6. VIZUAL SKRINING ============================
s = prs.slides.add_slide(BLANK)
base(s, 5, 'Vizual skrining', 'Kamera nima ko\'radi')
bullets(s, Inches(0.75), Inches(2.0), Inches(6.3), Inches(4.4), [
     '**Yuz aniqlash** — teri maskasi (YCbCr) + ko\'z/og\'iz dalillari, 160×120 kadr',
    '**PPG puls** — yuz terisidagi mikro o\'zgarishdan yurak urishi (bpm)',
    '**Yuz rangi** — qizarish / terining harorati (alkogol, intoksikatsiya belgisi)',
    '**Barqarorlik** — bosh silkinishi = duranglik ko\'rsatkichi',
    '**Sifat nazorati** — yorug\'lik, ekspozitsiya, shovqin, harakat',
    '**Face ID** — har 4-kadrda face-api.js, 128 o\'lchamli deskriptor',
], 16.5, gap=12)

rect(s, Inches(7.5), Inches(2.0), Inches(5.05), Inches(4.4), CARD, radius=0.06)
tb(s, Inches(7.8), Inches(2.2), Inches(4.5), Inches(0.4), 'REAL VAQT KO\'RSATKICHLARI', 14, CYAN, True)
metrics = [('Yuz barqarorligi', '95%', GREEN, 0.95), ('Puls (PPG)', '72 bpm', CYAN, 0.72),
           ('Yuz aniqlanishi', '98%', GREEN, 0.98), ('Kadr chastotasi', '120 FPS', AMBER, 1.0)]
for i, (k, v, c, pct) in enumerate(metrics):
    y = Inches(2.75) + i * Inches(0.82)
    tb(s, Inches(7.8), y, Inches(3.0), Inches(0.4), k, 15, WHITE)
    tb(s, Inches(10.6), y, Inches(1.7), Inches(0.4), v, 17, c, True, PP_ALIGN.RIGHT)
    hbar(s, Inches(7.8), y + Inches(0.48), Inches(4.45), Inches(0.1), pct, c)

tb(s, Inches(7.8), Inches(6.05), Inches(4.5), Inches(0.3),
   'Ma\'lumotlar faqat brauzerda', 13, MUTED, italic=True)

# ============================ 6. AI KLINIK XULOSA ============================
s = prs.slides.add_slide(BLANK)
base(s, None, 'AI klinik xulosa', '13 ta kasallik · bor / yo\'q')
tb(s, Inches(0.75), Inches(1.95), Inches(6.5), Inches(0.5),
   'Har bir qoida mustaqil ball to\'playdi (0–100) va o\'z dalillarini ko\'rsatadi — qora quti emas.',
   16, MUTED)
# namunaviy natija: bor / shubha / yo'q taqsimoti
for i, (t, c) in enumerate([('1 BOR', RED), ('3 SHUBHA', AMBER), ('9 YO\'Q', GREEN)]):
    pill(s, Inches(7.55) + i * Inches(1.68), Inches(1.98), Inches(1.55), Inches(0.44), t, c, 12.5)

groups = [
    ('Radiatsiya kasalliklari', CYAN, [
        "O'tkir radiatsiya kasalligi (ARS)",
        'Radiatsion anemiya / leykopeniya',
        'Immunitet pasayishi (neytropeniya)',
        'Radiatsion dermatit',
        'Radiatsion katarakta',
        'Radiatsion gastroenterit',
        'Qalqonsimon bez disfunksiyasi',
    ]),
    ('Umumiy holatlar', GREEN, [
        'Yurak-tomir ritm buzilishi',
        'Bosh aylanishi / VVD',
        "O'tkir nafas yo'llari yallig'lanishi",
        'Intoksikatsiya va charchoq sindromi',
        'Saraton xavfi (LNT)',
        'Professional ta\'sir xavfi',
        'Belgilar (8 ta simptom) integratsiyasi',
    ]),
]
for i, (name, c, items) in enumerate(groups):
    x = Inches(0.75) + i * Inches(6.15)
    rect(s, x, Inches(2.65), Inches(5.7), Inches(3.55), CARD, radius=0.06)
    rect(s, x, Inches(2.65), Inches(5.7), Inches(0.06), c)
    tb(s, x + Inches(0.28), Inches(2.85), Inches(5.1), Inches(0.4), name, 15.5, c, True)
    bullets(s, x + Inches(0.28), Inches(3.35), Inches(5.2), Inches(2.7), items, 14, WHITE, gap=6)

tb(s, Inches(0.75), Inches(6.4), Inches(11.8), Inches(0.4),
   'Har bir holat:  ≥70 "bor"  ·  38–69 "shubha"  ·  <38 "yo\'q"  →  ruscha/o\'zbekcha xulosa + ovozda o\'qish',
   15, CYAN, True)

# ============================ 7. ALKOHOL ============================
s = prs.slides.add_slide(BLANK)
base(s, 7, 'Alkogol aniqlash', 'Ko\'p signalli tahlil')
tb(s, Inches(0.75), Inches(1.95), Inches(11.8), Inches(0.4),
    'Bitta signal yetarli emas — beshtasi birga, ishonch foizi bilan vaznlangan holda birlashtiriladi.',
   16, MUTED)

sigs = [
    ('Duranglik', 'Bosh silkinishi\n6 soniya, px', 'Field sobriety\ntesti', CYAN),
    ('Reaktsiya', '6 ta sinov\nmedian ms', 'Alkogol\nsekinlashtiradi', GREEN),
     ('Ovoz', 'Jitter %\nautokorrelatsiya', 'Qovg\'oq\ntebranishi', AMBER),
    ('Fiziologiya', 'Yuz qizarishi\n+ puls bpm', 'Vazodilatatsiya\ntaxikardiya', ORANGE),
    ('Savolnoma', 'Widmark BAC\nhisobi', 'Qon alkogoli\nfoizi', RED),
]
cw = Inches(2.3)
weights = [26, 22, 16, 16, 20]           # alcohol.js og'irliklari (%)
for i, (t, how, why, c) in enumerate(sigs):
    x = Inches(0.75) + i * (cw + Inches(0.16))
    rect(s, x, Inches(2.6), cw, Inches(2.75), CARD, radius=0.07)
    rect(s, x, Inches(2.6), cw, Inches(0.08), c)
    tb(s, x + Inches(0.2), Inches(2.78), cw - Inches(0.4), Inches(0.4), t, 16, c, True)
    tb(s, x + Inches(0.2), Inches(3.3), cw - Inches(0.4), Inches(0.9), how, 13.5, WHITE, spacing=1.3)
    rect(s, x + Inches(0.2), Inches(4.2), cw - Inches(0.4), Inches(0.02), BG2)
    tb(s, x + Inches(0.2), Inches(4.3), cw - Inches(0.4), Inches(0.7), why, 12.5, MUTED, spacing=1.3)
    # og'irlik chizig'i (diagramma)
    tb(s, x + Inches(0.2), Inches(4.93), Inches(1.3), Inches(0.24), 'og\'irlik', 10, MUTED)
    tb(s, x + Inches(1.1), Inches(4.93), cw - Inches(1.3), Inches(0.24),
       f'{weights[i]}%', 11, c, True, PP_ALIGN.RIGHT)
    hbar(s, x + Inches(0.2), Inches(5.17), cw - Inches(0.4), Inches(0.11), weights[i] / 100, c)

# darajalar
tb(s, Inches(0.75), Inches(5.55), Inches(3), Inches(0.35), 'DARAJALAR', 13, MUTED, True)
levels = [('0–19', 'Aniqlanmadi', GREEN), ('20–44', 'Shubha', AMBER),
          ('45–69', 'Ta\'sir belgilari', ORANGE), ('70+', 'Transport taqiqlanadi', RED)]
for i, (rng, lab, c) in enumerate(levels):
    x = Inches(0.75) + i * Inches(3.1)
    rect(s, x, Inches(5.95), Inches(2.9), Inches(0.75), CARD, radius=0.12)
    rect(s, x, Inches(5.95), Inches(0.07), Inches(0.75), c)
    tb(s, x + Inches(0.22), Inches(6.03), Inches(0.95), Inches(0.3), rng, 16, c, True)
    tb(s, x + Inches(1.15), Inches(6.06), Inches(1.65), Inches(0.55), lab, 12.5, WHITE, spacing=1.15)

# ============================ 8. OVOZLI SUHBAT ============================
s = prs.slides.add_slide(BLANK)
base(s, 8, 'Ovozli suhbat', 'Suniy intellekt bilan muloqot')
bullets(s, Inches(0.75), Inches(2.0), Inches(6.3), Inches(4.3), [
    '**AI ovozda gapiradi** — tahlil tugagach xulosani o\'qiydi',
    '**Siz gapirasiz** — mikrofon bilan savol berasiz (o\'zbekcha)',
    '**AI tushunadi** — Gemini LLM, oflayn qoidalarga tushib qolmaydi',
    '**Til avtomatik** — shaxs millatiga qarab o\'zbekcha yoki ruscha',
    '**Sifatli ovoz** — Edge neural TTS (Sardor / Madina), keshlangan',
    '**Suhbat tarixi** — kontekst saqlanadi, tabiiy davom etadi',
], 16.5, gap=13)

rect(s, Inches(7.5), Inches(2.0), Inches(5.05), Inches(4.3), CARD, radius=0.06)
tb(s, Inches(7.8), Inches(2.2), Inches(4.5), Inches(0.4), 'NAMUNAVIY SUHBAT', 14, CYAN, True)
chat = [
    ('ai', 'Assalomu alaykum! Tahlil tayyor.'),
    ('me', 'Xavf darajasi qanday?'),
    ('ai', 'Xavf: O\'rta, sog\'lik yo\'qotish 42%.'),
    ('me', 'Nima qilishim kerak?'),
    ('ai', 'Fon nurlanishini kamaytiring va 3 oyda qayta tekshiruv.'),
]
y = Inches(2.7)
for who, txt in chat:
    is_ai = who == 'ai'
    col = RGBColor(0x1E, 0x3A, 0x4A) if is_ai else RGBColor(0x2A, 0x37, 0x4C)
    wdt = Inches(4.0) if is_ai else Inches(3.6)
    x = Inches(7.75) if is_ai else Inches(8.5)
    rect(s, x, y, wdt, Inches(0.62), col, radius=0.22)
    tb(s, x + Inches(0.2), y + Inches(0.14), wdt - Inches(0.4), Inches(0.4),
       txt, 12.5, WHITE if is_ai else MUTED, spacing=1.15)
    y += Inches(0.76)

# ==================== ILOVA EKRANLARI (skrinshot) ====================
shots = [
    ('Monitoring', 'Jonli nazorat', 'monitor.png',
     ['**Jonli doza tezligi** — µSv/soat, Geiger yoki simulyatsiya rejimi',
      '**Kunlik / yillik limit** foizlari avtomatik hisoblanadi',
      '**24 soatlik tarix** grafikda, chegarasi bilan',
      '**Fon holati** — xavfsiz / ogohlantirish / chora ko\'rish'], 'ek_monitor'),
    ('Camera skriningi', 'Bir ekranda — yuz, belgilar, tahlil', 'vision.png',
     ['**Kamera yuzni o\'lchaydi** — yuz ishonchi, teri rangi, puls (PPG), barqarorlik',
      '**8 ta simptom** operator yoki bemor tomonidan belgilanadi',
      '**Bemor tanlanadi** va bitta tugma bilan to\'liq tahlil o\'tkaziladi',
      '**Face ID** — shaxs kameradan avtomatik taniladi'], 'ek_vision'),
    ('AI klinik xulosa', '13 kasallik · bor / yo\'q', 'aiCard2.png',
     ['**Uch qatlam**: bor (aniqlandi), shubha (tekshiruv kerak), yo\'q',
      '**Har bir holatda** ishonch foizi, ICD-10 kodi va tavsiyalar',
      '**Pastda AI suhbat** — yozib so\'rang yoki mikrofonni bosing',
      '**Ovozli javob** — 🔊 tugmasi bilan xulosani ovozda eshiting'], 'ek_ai'),
    ('Alkogol moduli', '5 signal · ball · shkala', 'alcCard.png',
     ['**Beshta signal** — duranglik, reaktsiya, ovoz, yuz, savolnoma',
      '**Widmark BAC** — qon alkogoli foizi hisoblanadi',
      '**0–100 ball** va daraja: aniqlanmadi → transport taqiqlanadi',
      '**Shifokor/IIB uchun** aniq tavsiya shakllanadi'], 'ek_alc'),
]
for title, kicker, fn, items, tag in shots:
    s = prs.slides.add_slide(BLANK)
    base(s, None, title, kicker)
    bullets(s, Inches(0.75), Inches(2.15), Inches(3.85), Inches(4.2), items, 15, WHITE, gap=14)
    pic(s, os.path.join(SHOTS, fn), Inches(4.95), Inches(2.15), Inches(7.6), Inches(4.35),
        caption=f'RadSkrin · {title} — haqiqiy ilova ekrani', tag=tag)

# ============================ JONLI DEMO (video) ============================
s = prs.slides.add_slide(BLANK)
base(s, None, 'Jonli demo', '18 soniyada to\'liq jarayon')
bullets(s, Inches(0.75), Inches(2.15), Inches(3.85), Inches(4.2), [
    '**Monitoring** → doza va xavf ko\'rsatkichlari',
    '**4 ta simptom** birma-bir belgilanadi',
    '**AI tahlil** — 13 kasallik: bor / shubha / yo\'q',
    '**Ovozli savol** va AI javobi matnda',
    '**Alkogol testi** — ball va qon alkogoli',
    'Slaydda **avtomatik ijro** — tugma bosish shart emas',
], 15, WHITE, gap=14)
video_slot(s, Inches(4.95), Inches(2.15), Inches(7.6), Inches(4.35),
           caption='RadSkrin — haqiqiy ilova yozuvi (MP4, ovoz bilan)', ar=1.6)

# ============================ 9. TEXNOLOGIYA ============================
s = prs.slides.add_slide(BLANK)
base(s, 9, 'Texnologiya', 'Nimalardan tuzilgan')
tech = [
    ('Frontend', CYAN, ['Vanilla JavaScript (SPA)', 'HTML5 + CSS3', 'Canvas / WebRTC kamera', 'Web Speech API (ovoz)', 'face-api.js (yuz)']),
    ('Backend', GREEN, ['Node.js (>=18)', 'Zero-dependency server', 'HTTP + JSON REST API', 'Fayl bazalari (JSON)', 'Web Serial (Geiger)']),
     ('AI / ML', AMBER, ['face-api.js (128-dim)', 'Qoidalar yuritgichi (13 kasallik)', 'Gemini LLM (suhbat)', 'Edge neural TTS', 'Widmark BAC modeli']),
     ('Algoritm', ORANGE, ['PPG (puls) analizi', 'Teri maskasi (YCbCr)', 'Autokorrelatsiya (ovoz)', 'Duranglik statistikasi', 'Vaznlangan ball']),
]
cw = Inches(2.95)
for i, (name, c, items) in enumerate(tech):
    x = Inches(0.75) + i * (cw + Inches(0.14))
    rect(s, x, Inches(2.15), cw, Inches(4.1), CARD, radius=0.06)
    rect(s, x, Inches(2.15), cw, Inches(0.55), c, radius=0.06)
    tb(s, x + Inches(0.22), Inches(2.27), cw - Inches(0.4), Inches(0.4), name, 15, DARKTX, True)
    bullets(s, x + Inches(0.22), Inches(2.95), cw - Inches(0.42), Inches(3.1), items, 13.5, WHITE, gap=9, mcolor=c)

tb(s, Inches(0.75), Inches(6.5), Inches(11.8), Inches(0.4),
   'O\'rnatish: git clone  →  npm install  →  npm start  →  brauzerda localhost:3000',
   15, CYAN, True)

# ============================ 10. RAQAMLAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 10, 'Loyiha raqamlari', 'Hajm va imkoniyatlar')
data = [
    ('6 500+', 'qator JavaScript kodi', CYAN),
    ('15', 'asosiy modul / fayl', GREEN),
    ('13', 'klinik kasallik qoidasi', AMBER),
    ('5', 'alkogol signal manbai', ORANGE),
    ('8', 'simptom + 5 doza darajasi', RED),
    ('0', 'tashqi bog\'lanish (oflayn)', CYAN),
    ('128', 'o\'lchamli yuz deskriptori', GREEN),
    ('4', 'tillar: uz / ru / en / qozoq', AMBER),
]
for i, (big, lab, c) in enumerate(data):
    col = i % 4
    row = i // 4
    x = Inches(0.75) + col * Inches(3.1)
    y = Inches(2.15) + row * Inches(2.05)
    stat(s, x, y, Inches(2.9), Inches(1.85), big, lab, c)

tb(s, Inches(0.75), Inches(6.45), Inches(11.8), Inches(0.4),
   'Barchasi brauzerda ishlaydi — server faqat ma\'lumot saqlash va xizmatlar uchun.',
   15, MUTED)

# ============================ 11. AFZALLIKLARI ============================
s = prs.slides.add_slide(BLANK)
base(s, 11, 'Nima uchun ajralib turadi', 'Raqobatdagi farq')
rows = [
    ('Obyektivlik', 'Shifokor ko\'zi + o\'lchov + AI ball', 'Faqat sub\'ektiv hukm'),
    ('Tezlik', '1 daqiqada yakuniy xulosa', 'Soatlab kutiladi'),
    ('Qamrov', 'Radiatsiya + alkogol + shaxs + ovoz', 'Bitta yo\'nalish'),
    ('Shaffoflik', 'Har bir holatda dalil ko\'rsatiladi', '"Qora quti"'),
    ('Mobil', 'Oddiy noutbuk + kamera', 'Maxsus jihoz talab'),
    ('Xavfsizlik', 'Ma\'lumot joyida qoladi', 'Bulutga yuborish'),
    ('Oflayn', 'Asosiy funksiyalar internetsiz', 'Internet talab'),
]
# jadval sarlavhasi
rect(s, Inches(0.75), Inches(2.0), Inches(11.8), Inches(0.55), CYAN, radius=0.1)
tb(s, Inches(1.0), Inches(2.11), Inches(3.0), Inches(0.4), 'Mezon', 14.5, DARKTX, True)
tb(s, Inches(4.4), Inches(2.11), Inches(4.4), Inches(0.4), 'RadSkrin', 14.5, DARKTX, True)
tb(s, Inches(9.0), Inches(2.11), Inches(3.4), Inches(0.4), 'An\'anaviy yondashuv', 14.5, DARKTX, True)

for i, (k, a, b) in enumerate(rows):
    y = Inches(2.62) + i * Inches(0.6)
    if i % 2 == 0:
        rect(s, Inches(0.75), y, Inches(11.8), Inches(0.55), CARD)
    tb(s, Inches(1.0), y + Inches(0.11), Inches(3.2), Inches(0.4), k, 14, WHITE, True)
    tb(s, Inches(4.4), y + Inches(0.11), Inches(4.5), Inches(0.4), '✓  ' + a, 14, GREEN)
    tb(s, Inches(9.0), y + Inches(0.11), Inches(3.5), Inches(0.4), '✗  ' + b, 14, MUTED)

# ============================ 12. XAVFSIZLIK ============================
s = prs.slides.add_slide(BLANK)
base(s, 12, 'Xavfsizlik va mas\'uliyat', 'Nima uchun ishonchli')
left = [
    ('Ma\'lumot mahalliy', 'Bemor ma\'lumotlari serverdagi JSON fayllarda, tashqi bulutga yuborilmaydi.'),
    ('Ruxsat asosida', 'Login/parol, rollar (shifokor / admin), API tokenlari.'),
    ('Face ID xavfsiz', 'Faqat 128 o\'lchamli matematik deskriptor — rasm saqlanmaydi.'),
    ('AI shaffof', 'Har bir xulosada dalillar va ball ko\'rsatilgan.'),
]
right = [
    ('Tashxis emas', 'Tizim skrining beradi. Yakuniy hukm faqat shifokor tomonidan.'),
    ('Standartlar asosida', 'ICRP 103, WHO (2017), BEIR VII, ICD-10, O\'zR SSVM normativlari.'),
    ('Chegara aniq', 'Alkogol moduli ham "skrining" deb yorlangan — 103/IIB tavsiyasi.'),
    ('Ochiq kod', 'Kodni tekshirish mumkin — hakamlar uchun ochiqlik.'),
]
for ci, col in enumerate([left, right]):
    x = Inches(0.75) + ci * Inches(6.15)
    y = Inches(2.05)
    for t, d in col:
        rect(s, x, y, Inches(5.7), Inches(1.05), CARD, radius=0.08)
        rect(s, x, y, Inches(0.06), Inches(1.05), CYAN if ci == 0 else AMBER)
        tb(s, x + Inches(0.25), y + Inches(0.12), Inches(5.3), Inches(0.35), t, 15, WHITE, True)
        tb(s, x + Inches(0.25), y + Inches(0.5), Inches(5.3), Inches(0.5), d, 12.5, MUTED, spacing=1.25)
        y += Inches(1.18)

# ============================ BYUDJET VA USKUNALAR ============================
s = prs.slides.add_slide(BLANK)
base(s, None, 'Byudjet va uskunalar', 'Bir NMKG punkti uchun aniq mablag\' va jihozlar')
costs = [
    ('GPU ish stansiyasi / server', 2400, CYAN),
    ('Kameralar (4 dona, IR 4K)', 1100, GREEN),
    ('Monitor va sensor panel', 650, AMBER),
    ('Mikrofon va ovoz tizimi', 250, ORANGE),
    ('Dasturiy litsenziya (yillik)', 1350, CYAN),
    ('O\'rnatish, sozlash, trening', 650, GREEN),
    ('Yillik texnik xizmat', 350, AMBER),
]
mx_cost = max(v for _, v, _ in costs)
tb(s, Inches(0.75), Inches(1.98), Inches(6.9), Inches(0.32),
   'XARAJATLAR TAQSIMOTI — USD', 13, MUTED, True)
for i, (lab, val, c) in enumerate(costs):
    y = Inches(2.4) + i * Inches(0.5)
    tb(s, Inches(0.75), y + Inches(0.05), Inches(2.85), Inches(0.3), lab, 13, WHITE)
    hbar(s, Inches(3.7), y + Inches(0.08), Inches(3.15), Inches(0.22),
         val / mx_cost, c)
    tb(s, Inches(6.95), y + Inches(0.02), Inches(1.05), Inches(0.3),
       '$' + format(val, ','), 14, c, True, PP_ALIGN.RIGHT)
rect(s, Inches(0.75), Inches(5.95), Inches(7.25), Inches(0.55), CARD, radius=0.12)
tb(s, Inches(1.0), Inches(6.06), Inches(3.6), Inches(0.35),
   'JAMI INVESTITSIYA (1-yil)', 14, WHITE, True)
tb(s, Inches(4.6), Inches(6.0), Inches(3.2), Inches(0.45), '85 000 000 so\'m', 17.5,
   GREEN, True, PP_ALIGN.RIGHT)
tb(s, Inches(0.75), Inches(6.58), Inches(7.2), Inches(0.24),
   '≈ 85 mln so\'m ($6 750, 1 $ ≈ 12 600 so\'m) · energiya va internet alohida',
   11.5, MUTED)

rx, rw = Inches(8.35), Inches(4.2)
rect(s, rx, Inches(2.0), rw, Inches(2.85), CARD, radius=0.07)
tb(s, rx + Inches(0.25), Inches(2.12), Inches(3.7), Inches(0.32),
   'QURILMALAR RO\'YXATI', 13, CYAN, True)
bullets(s, rx + Inches(0.25), Inches(2.55), Inches(3.7), Inches(2.2), [
    'GPU server yoki ish stansiyasi',
    '4 dona IR kamera (1080p–4K)',
    '27" monitor va sensor panel',
    'USB mikrofon va karnay',
    'Dozimetr (Web Serial, ixtiyoriy)',
], 13.5, gap=8)
stat(s, rx, Inches(5.0), Inches(2.0), Inches(1.83), '~$0.35',
     '1 skrining narxi', CYAN)
stat(s, rx + Inches(2.2), Inches(5.0), Inches(2.0), Inches(1.83), '1 daqiqa',
     'to\'liq tahlil', GREEN)

# ============================ 13. REJA ============================
s = prs.slides.add_slide(BLANK)
base(s, 13, 'Rivojlantirish rejasi', 'Keyingi qadamlar')
steps = [
    ('Hozir', 'MVP tugallandi', 'Kamera, AI xulosa, Face ID, alkogol, ovozli suhbat', GREEN),
    ('1-oy', 'Sinergiya', 'Dozimetrdan real ma\'lumot oqimi (Web Serial), PDF hisobot', CYAN),
    ('2-oy', 'Klinik sinov', 'NMKG shifoxonasida 100 bemor ustida validatsiya', AMBER),
    ('3-oy', 'Integratsiya', 'Elektron tibbiy yozuv (EMR) bilan ulanish, mobil ilova', ORANGE),
    ('6-oy', 'Rasmiylashtirish', 'Ro\'yxatdan o\'tkazish, boshqa tibbiy tashkilotlarga kengaytirish', RED),
]
for i, (t, name, d, c) in enumerate(steps):
    y = Inches(2.1) + i * Inches(0.95)
    rect(s, Inches(0.75), y, Inches(11.8), Inches(0.82), CARD, radius=0.1)
    rect(s, Inches(0.75), y, Inches(1.6), Inches(0.82), c, radius=0.1)
    tb(s, Inches(0.9), y + Inches(0.24), Inches(1.3), Inches(0.4), t, 15, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, Inches(2.6), y + Inches(0.13), Inches(3.2), Inches(0.35), name, 16, c, True)
    tb(s, Inches(2.6), y + Inches(0.47), Inches(9.6), Inches(0.3), d, 13.5, MUTED)

# ============================ 14. XULOSA ============================
s = prs.slides.add_slide(BLANK)
tick()
rect(s, 0, 0, W, H, BG)
rect(s, 0, 0, Inches(0.14), H, CYAN)
tb(s, Inches(0.95), Inches(1.1), Inches(8), Inches(0.4), 'XULOSA', 15, CYAN, True)
tb(s, Inches(0.9), Inches(1.55), Inches(11.5), Inches(1.4),
   'Bitta tizim —\nto\'liq skrining', 46, WHITE, True, spacing=1.1)

bullets(s, Inches(0.95), Inches(3.35), Inches(7.0), Inches(2.6), [
    '**Kamera + mikrofon + dozimetrdan** obyektiv ma\'lumot yig\'adi',
    '**AI 13 kasallik** bo\'yicha dalilli xulosa beradi',
    '**Ovozda gapiradi**, ovozni tushunadi — qo\'l band emas',
    '**Alkogol va duranglik** darajasini 5 signal bilan baholaydi',
    '**Oflayn ishlaydi**, ma\'lumot joyida qoladi',
], 17, gap=12)

rect(s, Inches(8.5), Inches(3.35), Inches(3.9), Inches(2.6), CARD, radius=0.07)
tb(s, Inches(8.8), Inches(3.6), Inches(3.4), Inches(0.4), 'TA\'SIR', 13, CYAN, True)
bullets(s, Inches(8.8), Inches(4.1), Inches(3.4), Inches(1.7), [
    'Kasbiy xavfni erta aniqlash',
    'Favqulodda vaziyatda vaqt tejash',
    'Tibbiy qarorlarni qo\'llab-quvvatlash',
], 14, WHITE, gap=9)

rect(s, Inches(0.95), Inches(6.25), Inches(5.4), Inches(0.55), CARD, radius=0.14)
tb(s, Inches(1.2), Inches(6.37), Inches(5.0), Inches(0.35),
   'RadSkrin  ·  github.com/radscreen', 14, CYAN, True)

# ============================ 15. RAHMAT ============================
s = prs.slides.add_slide(BLANK)
tick()
rect(s, 0, 0, W, H, BG)
rect(s, 0, 0, W, Inches(0.055), CYAN)
for i, c in enumerate([CYAN, GREEN, AMBER, ORANGE, RED]):
    rect(s, Inches(4.7 + i * 0.72), Inches(2.5), Inches(0.5), Inches(0.5), c, radius=0.2)

tb(s, Inches(1), Inches(3.4), Inches(11.3), Inches(1.2), 'Rahmat!', 68, WHITE, True, PP_ALIGN.CENTER)
tb(s, Inches(1), Inches(4.7), Inches(11.3), Inches(0.9),
   'Savollaringizga tayyorman\nRadSkrin — NMKG radiatsiya skrining tizimi',
   20, MUTED, False, PP_ALIGN.CENTER, spacing=1.4)

# ----------------------------- saqlash -----------------------------
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nmkg.pptx')
prs.save(out)
print('OK ->', out)
print('slides:', len(prs.slides.__iter__.__self__._sldIdLst))
