# -*- coding: utf-8 -*-
"""
STEAM-образование и креативность — taqdimot (PPTX)
Ishlatish:  python make_steam_ppt.py
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

# ----------------------------- dizayn -----------------------------
BG      = RGBColor(0x0F, 0x0C, 0x29)   # chuqur ko'k-binafsha
BG2     = RGBColor(0x18, 0x14, 0x3A)
CARD    = RGBColor(0x1F, 0x1A, 0x4A)
CARD2   = RGBColor(0x27, 0x21, 0x5C)
WHITE   = RGBColor(0xF8, 0xFA, 0xFC)
MUTED   = RGBColor(0xA5, 0xB4, 0xFC)
DARKTX  = RGBColor(0x0F, 0x0C, 0x29)

# STEAM komponent ranglari
S_COL   = RGBColor(0x22, 0xD3, 0xEE)   # Science — cyan
T_COL   = RGBColor(0x4A, 0xDE, 0x80)   # Technology — yashil
E_COL   = RGBColor(0xFB, 0x92, 0x3C)   # Engineering — to'q-sariq
A_COL   = RGBColor(0xE8, 0x79, 0xF9)   # Arts — binafsha-pushti
M_COL   = RGBColor(0xFA, 0xE1, 0x4B)   # Mathematics — sariq
PINK    = RGBColor(0xF4, 0x72, 0xB6)
RED     = RGBColor(0xEF, 0x44, 0x44)
GREEN   = RGBColor(0x22, 0xC5, 0x5E)
AMBER   = RGBColor(0xEA, 0xB3, 0x08)

FONT = 'Segoe UI'
W, H = Inches(13.333), Inches(7.5)
TOTAL_SLIDES = 16

prs = Presentation()
prs.slide_width, prs.slide_height = W, H
BLANK = prs.slide_layouts[6]

_pos = {'n': 0}


def tick():
    _pos['n'] += 1
    return _pos['n']


# ----------------------------- yordamchi -----------------------------
def rect(slide, x, y, w, h, fill, line=None, radius=None):
    shp = slide.shapes.add_shape(
        MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE, x, y, w, h)
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
    for i, ln in enumerate(text.split('\n')):
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


def bullets(slide, x, y, w, h, items, size=17, color=WHITE, gap=6,
            marker='•', mcolor=MUTED):
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
        r0.font.size = Pt(size); r0.font.bold = True
        r0.font.name = FONT; r0.font.color.rgb = c
        parts = txt.split('**')
        for j, part in enumerate(parts):
            if not part:
                continue
            r = p.add_run(); r.text = part
            r.font.size = Pt(size); r.font.name = FONT
            r.font.bold = (j % 2 == 1)
            r.font.color.rgb = c if j % 2 == 1 else color
    return box


def base(slide, title=None, kicker=None, accent=S_COL, num=True):
    """Fon + sarlavha + aksent chiziq + futer"""
    n = tick() if num else None
    rect(slide, 0, 0, W, H, BG)
    rect(slide, 0, 0, W, Inches(0.055), accent)
    # burchakdagi dekorativ nuqtalar
    for i, c in enumerate([S_COL, T_COL, E_COL, A_COL, M_COL]):
        rect(slide, Inches(12.0 + i * 0.24), Inches(0.32),
             Inches(0.14), Inches(0.14), c, radius=0.5)
    if title:
        ty = Inches(0.5)
        if kicker:
            tb(slide, Inches(0.75), Inches(0.38), Inches(11.0), Inches(0.3),
               kicker.upper(), 12.5, accent, True)
            ty = Inches(0.7)
        tb(slide, Inches(0.75), ty, Inches(11.8), Inches(0.85), title, 32, WHITE, True)
        rect(slide, Inches(0.75), ty + Inches(0.8), Inches(1.5), Inches(0.05), accent)
    if n is not None:
        rect(slide, Inches(0.75), Inches(6.88), Inches(11.8), Inches(0.012),
             RGBColor(0x2C, 0x25, 0x63))
        tb(slide, Inches(0.75), Inches(6.98), Inches(7), Inches(0.3),
           'STEAM-образование и креативность · Учебная презентация', 10.5, MUTED)
        tb(slide, Inches(10.6), Inches(6.98), Inches(2.1), Inches(0.3),
           f'{n:02d} / {TOTAL_SLIDES}', 10.5, MUTED, False, PP_ALIGN.RIGHT)


def pill(slide, x, y, w, h, text, color, size=12.5, fill=None):
    rect(slide, x, y, w, h, fill or CARD, radius=0.5)
    tb(slide, x, y + (h - Inches(size / 55)) / 2 - Inches(0.02), w, h,
       text, size, color, True, PP_ALIGN.CENTER)


def arrow(slide, x, y, w, h, color=S_COL):
    a = slide.shapes.add_shape(MSO_SHAPE.RIGHT_ARROW, x, y, w, h)
    a.fill.solid()
    a.fill.fore_color.rgb = color
    a.line.fill.background()
    a.shadow.inherit = False
    return a


def hbar(slide, x, y, w, h, pct, color, track=None):
    rect(slide, x, y, w, h, track or RGBColor(0x2C, 0x25, 0x63), radius=0.5)
    if pct > 0:
        b = rect(slide, x, y, max(Inches(0.08), int(w * min(pct, 1.0))), h,
                 color, radius=0.5)
        b.name = 'BAR%02d' % (hbar._n[0] + 1)
        hbar._n[0] += 1
    return b


hbar._n = [0]


# ============================ 1. SARLAVHA ============================
s = prs.slides.add_slide(BLANK)
tick()
rect(s, 0, 0, W, H, BG)
# gradient effekt — 3 ta katta yumaloq shaffof blok
o1 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-2), Inches(-2.5), Inches(7), Inches(7))
o1.fill.solid(); o1.fill.fore_color.rgb = RGBColor(0x1E, 0x1B, 0x4E)
o1.line.fill.background(); o1.shadow.inherit = False
o2 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(9), Inches(3.5), Inches(7), Inches(7))
o2.fill.solid(); o2.fill.fore_color.rgb = RGBColor(0x24, 0x1B, 0x55)
o2.line.fill.background(); o2.shadow.inherit = False
rect(s, 0, 0, Inches(0.14), H, S_COL)
rect(s, 0, 0, W, Inches(0.09), S_COL)

# STEAM harflari — 5 rangli blok
letters = [('S', S_COL), ('T', T_COL), ('E', E_COL), ('A', A_COL), ('M', M_COL)]
for i, (ch, c) in enumerate(letters):
    bx = Inches(0.95 + i * 0.92)
    rect(s, bx, Inches(0.95), Inches(0.78), Inches(0.9), c, radius=0.18)
    tb(s, bx, Inches(1.06), Inches(0.78), Inches(0.7), ch, 40, DARKTX, True, PP_ALIGN.CENTER)

tb(s, Inches(0.95), Inches(2.25), Inches(11.5), Inches(0.4),
   'МЕЖДИСЦИПЛИНАРНЫЙ ПОДХОД · ТВОРЧЕСКОЕ МЫШЛЕНИЕ · ИННОВАЦИИ', 14, S_COL, True)
tb(s, Inches(0.9), Inches(2.7), Inches(11.6), Inches(1.7),
   'Система STEAM\nв образовании и креативность', 52, WHITE, True, spacing=1.05)
rect(s, Inches(0.95), Inches(4.6), Inches(3.0), Inches(0.05), PINK)

tb(s, Inches(0.95), Inches(4.95), Inches(11.2), Inches(0.9),
   'Междисциплинарный подход, творческое мышление и\nинновационные методы обучения.',
   20, MUTED, False, spacing=1.35)

rect(s, Inches(0.95), Inches(6.15), Inches(5.4), Inches(0.6), CARD, radius=0.14)
rect(s, Inches(0.95), Inches(6.15), Inches(0.07), Inches(0.6), M_COL)
tb(s, Inches(1.25), Inches(6.29), Inches(5.0), Inches(0.35),
   'Учебная презентация для студентов · 2026', 14, M_COL, True)

# ============================ 2. STEAM NIMA ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Что такое STEAM-образование?', 'Понятие STEAM', S_COL)
tb(s, Inches(0.75), Inches(1.95), Inches(7.3), Inches(1.5),
   'STEAM-образование — это междисциплинарный подход к обучению, объединяющий '
   'естественные науки, технологии, инженерное проектирование, искусство и математику.',
   17.5, WHITE, spacing=1.35)
tb(s, Inches(0.75), Inches(3.35), Inches(7.3), Inches(1.4),
   'Основная идея — интеграция знаний из различных областей для исследования реальных '
   'проблем, разработки оригинальных решений и создания практических проектов.',
   16, MUTED, spacing=1.35)

# 5 ta harf kartochkasi
abbr = [('S', 'Science', 'естественные науки', S_COL),
        ('T', 'Technology', 'технологии', T_COL),
        ('E', 'Engineering', 'инженерия', E_COL),
        ('A', 'Arts', 'искусство и дизайн', A_COL),
        ('M', 'Mathematics', 'математика', M_COL)]
for i, (L, name, desc, c) in enumerate(abbr):
    y = Inches(1.95) + i * Inches(0.85)
    rect(s, Inches(8.35), y, Inches(4.2), Inches(0.72), CARD, radius=0.12)
    rect(s, Inches(8.35), y, Inches(0.68), Inches(0.72), c, radius=0.12)
    tb(s, Inches(8.35), y + Inches(0.13), Inches(0.68), Inches(0.5), L, 26, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, Inches(9.2), y + Inches(0.08), Inches(3.2), Inches(0.3), name, 14.5, c, True)
    tb(s, Inches(9.2), y + Inches(0.37), Inches(3.2), Inches(0.3), desc, 12.5, MUTED)

rect(s, Inches(0.75), Inches(5.05), Inches(7.3), Inches(1.55), CARD, radius=0.07)
rect(s, Inches(0.75), Inches(5.05), Inches(0.07), Inches(1.55), PINK)
tb(s, Inches(1.05), Inches(5.2), Inches(6.8), Inches(0.35),
   'РЕЗУЛЬТАТ', 13, PINK, True)
bullets(s, Inches(1.05), Inches(5.6), Inches(6.8), Inches(0.9), [
    '**Критическое и творческое мышление**, исследовательские навыки',
    'и способность решать **практические задачи**',
], 14.5, WHITE, gap=6, mcolor=PINK)

# ============================ 3. VAZIFALAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Цели и задачи STEAM-образования', 'Основная цель', T_COL)
rect(s, Inches(0.75), Inches(1.95), Inches(11.8), Inches(1.15), CARD, radius=0.07)
rect(s, Inches(0.75), Inches(1.95), Inches(0.08), Inches(1.15), T_COL)
tb(s, Inches(1.1), Inches(2.15), Inches(11.2), Inches(0.8),
   'Главная цель — формирование способности применять знания из разных дисциплин '
   'для решения практических задач и создания инновационных продуктов.',
   17, WHITE, spacing=1.3)

tasks = [
    'Формирование научного мировоззрения',
    'Развитие творческого и критического мышления',
    'Формирование исследовательских навыков',
    'Способность находить нестандартные решения',
    'Навыки командной работы',
    'Цифровая и технологическая грамотность',
    'Связь теории с практической деятельностью',
    'Самостоятельность и ответственность',
]
for i, t in enumerate(tasks):
    col = i % 2
    row = i // 2
    x = Inches(0.75) + col * Inches(6.05)
    y = Inches(3.45) + row * Inches(0.82)
    rect(s, x, y, Inches(5.75), Inches(0.68), CARD, radius=0.1)
    rect(s, x, y, Inches(0.6), Inches(0.68), T_COL, radius=0.1)
    tb(s, x, y + Inches(0.14), Inches(0.6), Inches(0.45), str(i + 1), 20, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, x + Inches(0.78), y + Inches(0.19), Inches(4.85), Inches(0.4), t, 13.5, WHITE)

# ============================ 4. 5 KOMPONENT ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Пять компонентов STEAM-образования', 'Взаимосвязанные части', E_COL)
tb(s, Inches(0.75), Inches(1.9), Inches(11.8), Inches(0.35),
   'STEAM-образование включает пять взаимосвязанных компонентов.', 15.5, MUTED)

comps = [
    ('S', 'Science', 'естественные науки', S_COL,
     'Изучение природных явлений, наблюдения и эксперименты.',
     'Исследование свойств воды и условий роста растений'),
    ('T', 'Technology', 'технологии', T_COL,
     'Цифровые инструменты и программное обеспечение.',
     'Создание цифровой презентации или моделирование'),
    ('E', 'Engineering', 'инженерия', E_COL,
     'Проектирование, конструирование и испытание объектов.',
     'Модель моста или система автополива'),
    ('A', 'Arts', 'искусство', A_COL,
     'Эстетическое восприятие, воображение и дизайн.',
     'Оригинальный дизайн экологической упаковки'),
    ('M', 'Mathematics', 'математика', M_COL,
     'Измерение, вычисление и анализ данных.',
     'Расчёт размеров, материалов и стоимости'),
]
cw = Inches(2.3)
for i, (L, name, ru, c, d1, ex) in enumerate(comps):
    x = Inches(0.75) + i * (cw + Inches(0.16))
    rect(s, x, Inches(2.45), cw, Inches(4.1), CARD, radius=0.07)
    rect(s, x, Inches(2.45), cw, Inches(0.75), c, radius=0.07)
    tb(s, x, Inches(2.53), cw, Inches(0.6), L, 30, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, x + Inches(0.18), Inches(3.35), cw - Inches(0.36), Inches(0.3), name, 14.5, c, True)
    tb(s, x + Inches(0.18), Inches(3.65), cw - Inches(0.36), Inches(0.3), ru, 12, MUTED)
    tb(s, x + Inches(0.18), Inches(4.05), cw - Inches(0.36), Inches(1.3), d1, 12.5, WHITE, spacing=1.25)
    rect(s, x + Inches(0.18), Inches(5.35), cw - Inches(0.36), Inches(0.02), RGBColor(0x2C, 0x25, 0x63))
    tb(s, x + Inches(0.18), Inches(5.5), cw - Inches(0.36), Inches(0.95),
       'Пример: ' + ex, 11.5, MUTED, italic=True, spacing=1.25)

tb(s, Inches(0.75), Inches(6.62), Inches(11.8), Inches(0.3),
   'Все пять компонентов интегрируются в рамках одного учебного проекта.', 13.5, E_COL, True)

# ============================ 5. KREATIVLIK ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Что такое креативность?', 'Понятие креативности', A_COL)
rect(s, Inches(0.75), Inches(1.95), Inches(7.2), Inches(1.3), CARD, radius=0.07)
rect(s, Inches(0.75), Inches(1.95), Inches(0.07), Inches(1.3), A_COL)
tb(s, Inches(1.05), Inches(2.12), Inches(6.75), Inches(1.05),
   'Креативность — способность генерировать, оценивать и совершенствовать идеи, '
   'создавая оригинальные и эффективные решения.', 16, WHITE, spacing=1.3)

tb(s, Inches(0.75), Inches(3.5), Inches(7.2), Inches(0.35),
   'В образовательном процессе обучающийся:', 14.5, A_COL, True)
bullets(s, Inches(0.75), Inches(3.95), Inches(7.2), Inches(2.6), [
    'предлагает **новые идеи**;',
    'находит **нестандартные способы** решения задач;',
    'устанавливает связи между различными явлениями;',
    'преобразовывает и совершенствует существующие идеи;',
    'создаёт **новые проекты и продукты**;',
    'анализирует результаты и аргументирует решения.',
], 15, WHITE, gap=9, mcolor=A_COL)

# OECD karta
rect(s, Inches(8.35), Inches(1.95), Inches(4.2), Inches(4.55), CARD2, radius=0.07)
rect(s, Inches(8.35), Inches(1.95), Inches(4.2), Inches(0.6), A_COL, radius=0.07)
tb(s, Inches(8.65), Inches(2.08), Inches(3.7), Inches(0.4), 'OECD · PISA 2022', 15, DARKTX, True)
tb(s, Inches(8.65), Inches(2.75), Inches(3.6), Inches(1.6),
   'Творческое мышление предполагает не только создание идей, но и их оценку '
   'и совершенствование.', 14, WHITE, spacing=1.3)
rect(s, Inches(8.65), Inches(4.35), Inches(3.6), Inches(0.02), RGBColor(0x2C, 0x25, 0x63))
tb(s, Inches(8.65), Inches(4.55), Inches(3.6), Inches(1.7),
   'Креативность развивается посредством обучения, практики, решения проблемных '
   'задач и участия в исследовательских проектах.', 13, MUTED, spacing=1.3)

# ============================ 6. BOG'LIQLIK ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Как STEAM способствует развитию креативности?', 'Взаимосвязь STEAM и креативности', PINK)
tb(s, Inches(0.75), Inches(1.95), Inches(11.8), Inches(0.85),
   'STEAM создаёт образовательную среду, где обучающиеся не ограничиваются запоминанием '
   'готовой информации, а самостоятельно исследуют проблемы, выдвигают гипотезы и '
   'разрабатывают решения.', 15.5, MUTED, spacing=1.3)

steps = [
    ('01', 'Генерация идей', 'Различные варианты решения одной проблемы', S_COL),
    ('02', 'Экспериментирование', 'Проверка идей на практике: опыты и наблюдения', T_COL),
    ('03', 'Междисциплинарность', 'Знания из разных областей для комплексных задач', E_COL),
    ('04', 'Проектирование', 'Собственные модели, макеты и прототипы', A_COL),
    ('05', 'Анализ и улучшение', 'Выявление ошибок и совершенствование решений', M_COL),
]
sw = Inches(2.3)
for i, (n, t, d, c) in enumerate(steps):
    x = Inches(0.75) + i * (sw + Inches(0.16))
    rect(s, x, Inches(3.15), sw, Inches(2.6), CARD, radius=0.08)
    rect(s, x, Inches(3.15), sw, Inches(0.08), c)
    tb(s, x + Inches(0.2), Inches(3.35), sw - Inches(0.4), Inches(0.5), n, 26, c, True)
    tb(s, x + Inches(0.2), Inches(3.9), sw - Inches(0.4), Inches(0.7), t, 14.5, WHITE, True, spacing=1.15)
    tb(s, x + Inches(0.2), Inches(4.6), sw - Inches(0.44), Inches(1.05), d, 12.5, MUTED, spacing=1.25)
    if i < 4:
        arrow(s, x + sw + Inches(0.01), Inches(4.3), Inches(0.14), Inches(0.22), c)

tb(s, Inches(0.75), Inches(6.15), Inches(11.8), Inches(0.5),
   'STEAM предоставляет возможности для развития креативного мышления посредством '
   'исследовательской, практической и проектной деятельности.', 15, PINK, True, spacing=1.3)

# ============================ 7. PRINSIPLAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Основные принципы STEAM-образования', 'Принципы', T_COL)
principles = [
    ('Междисциплинарность', 'Объединение знаний и методов из нескольких предметных областей', S_COL),
    ('Практическая направленность', 'Применение теории для решения реальных проблем', T_COL),
    ('Исследовательский подход', 'Вопросы, гипотезы, наблюдения и эксперименты', E_COL),
    ('Проектная деятельность', 'Создание конкретного продукта, модели или прототипа', A_COL),
    ('Активное участие', 'Самостоятельный поиск и принятие решений', M_COL),
    ('Сотрудничество', 'Обмен идеями и совместная работа над проектом', PINK),
    ('Рефлексия', 'Анализ результатов и способы совершенствования', S_COL),
]
for i, (t, d, c) in enumerate(principles):
    col = i % 2
    row = i // 2
    x = Inches(0.75) + col * Inches(6.05)
    y = Inches(2.05) + row * Inches(1.15)
    w = Inches(5.75) if not (i == 6) else Inches(11.8)
    if i == 6:
        x = Inches(0.75)
    rect(s, x, y, w, Inches(1.0), CARD, radius=0.08)
    rect(s, x, y, Inches(0.07), Inches(1.0), c)
    tb(s, x + Inches(0.3), y + Inches(0.14), w - Inches(0.5), Inches(0.35),
       f'{i + 1}. {t}', 15.5, c, True)
    tb(s, x + Inches(0.3), y + Inches(0.5), w - Inches(0.5), Inches(0.4), d, 13, MUTED)

# ============================ 8. METODLAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Методы и технологии STEAM-обучения', 'Методика', E_COL)
methods = [
    ('Проектное обучение', 'Разработка проекта и представление результатов', S_COL),
    ('Проблемное обучение', 'Проблемная ситуация: анализ и обоснование решения', T_COL),
    ('Исследовательское обучение', 'Наблюдения, эксперименты, сбор и анализ данных', E_COL),
    ('Обучение через конструирование', 'Модели, макеты и прототипы с проверкой', A_COL),
    ('Командное обучение', 'Распределение ролей и обмен знаниями', M_COL),
    ('Цифровое обучение', 'Платформы, моделирование, цифровой дизайн и ИИ', PINK),
]
for i, (t, d, c) in enumerate(methods):
    col = i % 2
    row = i // 2
    x = Inches(0.75) + col * Inches(6.05)
    y = Inches(2.1) + row * Inches(1.35)
    rect(s, x, y, Inches(5.75), Inches(1.15), CARD, radius=0.08)
    rect(s, x, y, Inches(0.75), Inches(1.15), c, radius=0.08)
    tb(s, x, y + Inches(0.34), Inches(0.75), Inches(0.5), str(i + 1), 26, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, x + Inches(0.95), y + Inches(0.18), Inches(4.6), Inches(0.35), t, 15, c, True)
    tb(s, x + Inches(0.95), y + Inches(0.56), Inches(4.65), Inches(0.5), d, 13, MUTED, spacing=1.2)

tb(s, Inches(0.75), Inches(6.3), Inches(11.8), Inches(0.4),
   'Выбор метода зависит от целей занятия, содержания материала и уровня подготовки обучающихся.',
   14, E_COL, True)

# ============================ 9. AFZALLIKLAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Преимущества STEAM-образования', 'Педагогические преимущества', GREEN)
adv = [
    ('Развитие творческого мышления', 'Оригинальные идеи и различные пути решения', S_COL, 0.95),
    ('Развитие критического мышления', 'Анализ информации и оценка результатов', T_COL, 0.90),
    ('Практическое применение знаний', 'Теория для решения конкретных задач', E_COL, 0.88),
    ('Исследовательские компетенции', 'Наблюдение, эксперимент и анализ данных', A_COL, 0.85),
    ('Коммуникативные навыки', 'Обмен информацией и аргументация мнений', M_COL, 0.82),
    ('Междисциплинарная интеграция', 'Комплексное применение знаний', PINK, 0.90),
    ('Развитие самостоятельности', 'Решения, оценка и ответственность', GREEN, 0.87),
]
for i, (t, d, c, pct) in enumerate(adv):
    y = Inches(2.0) + i * Inches(0.66)
    tb(s, Inches(0.75), y + Inches(0.06), Inches(4.2), Inches(0.3),
       f'{i + 1}. {t}', 13.5, WHITE, True)
    tb(s, Inches(0.75), y + Inches(0.34), Inches(4.2), Inches(0.25), d, 11.5, MUTED)
    hbar(s, Inches(5.3), y + Inches(0.18), Inches(5.6), Inches(0.2), pct, c)
    tb(s, Inches(11.1), y + Inches(0.1), Inches(1.4), Inches(0.35),
       f'{int(pct * 100)}%', 15, c, True, PP_ALIGN.RIGHT)

tb(s, Inches(0.75), Inches(6.55), Inches(11.8), Inches(0.35),
   'Эффективность зависит от качества организации процесса, подготовки преподавателя и доступности ресурсов.',
   13, MUTED, italic=True)

# ============================ 10. PREPODAVATEL ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Роль преподавателя в STEAM-образовании', 'Организатор деятельности', A_COL)
tb(s, Inches(0.75), Inches(1.95), Inches(11.8), Inches(0.6),
   'Преподаватель — не только источник знаний, но и организатор исследовательской '
   'и проектной деятельности.', 16, MUTED, spacing=1.3)

funcs = [
    'Формулирование проблемных вопросов и учебных целей',
    'Создание условий для самостоятельного поиска решений',
    'Организация междисциплинарной деятельности',
    'Направление исследовательской работы обучающихся',
    'Организация командного взаимодействия',
    'Предоставление обратной связи',
    'Помощь в анализе ошибок и совершенствовании проектов',
    'Оценивание процесса работы и конечного результата',
]
for i, f in enumerate(funcs):
    col = i % 2
    row = i // 2
    x = Inches(0.75) + col * Inches(6.05)
    y = Inches(2.75) + row * Inches(0.78)
    rect(s, x, y, Inches(5.75), Inches(0.65), CARD, radius=0.1)
    c = [S_COL, T_COL, E_COL, A_COL][i % 4]
    tb(s, x + Inches(0.2), y + Inches(0.15), Inches(0.5), Inches(0.4), str(i + 1), 17, c, True)
    tb(s, x + Inches(0.75), y + Inches(0.18), Inches(4.9), Inches(0.4), f, 13, WHITE)

rect(s, Inches(0.75), Inches(6.05), Inches(11.8), Inches(0.6), CARD2, radius=0.1)
rect(s, Inches(0.75), Inches(6.05), Inches(0.07), Inches(0.6), PINK)
tb(s, Inches(1.1), Inches(6.18), Inches(11.2), Inches(0.4),
   'Ошибки — возможность для анализа, обучения и улучшения результата.', 14.5, PINK, True)

# ============================ 11. LOYIHA NAMUNASI ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Пример STEAM-проекта', '«Экологичный школьный сад»', GREEN)
rect(s, Inches(0.75), Inches(1.9), Inches(11.8), Inches(0.85), CARD, radius=0.07)
rect(s, Inches(0.75), Inches(1.9), Inches(0.07), Inches(0.85), GREEN)
tb(s, Inches(1.1), Inches(2.02), Inches(11.2), Inches(0.3), 'ПРОБЛЕМА', 12.5, GREEN, True)
tb(s, Inches(1.1), Inches(2.32), Inches(11.2), Inches(0.35),
   'Как создать школьный сад, экономно использующий воду и обеспечивающий условия для роста растений?',
   14.5, WHITE)

stages = [
    ('Science', 'Потребности растений: вода, свет, питание', S_COL),
    ('Technology', 'Современные способы полива и ухода', T_COL),
    ('Engineering', 'Макет сада и система полива', E_COL),
    ('Arts', 'Дизайн сада, цвета и растения', A_COL),
    ('Mathematics', 'Площадь, количество растений, расход воды', M_COL),
]
for i, (t, d, c) in enumerate(stages):
    y = Inches(3.0) + i * Inches(0.66)
    rect(s, Inches(0.75), y, Inches(7.3), Inches(0.56), CARD, radius=0.1)
    rect(s, Inches(0.75), y, Inches(1.7), Inches(0.56), c, radius=0.1)
    tb(s, Inches(0.75), y + Inches(0.13), Inches(1.7), Inches(0.35), t, 13, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, Inches(2.65), y + Inches(0.15), Inches(5.2), Inches(0.35), d, 13, WHITE)

rect(s, Inches(8.35), Inches(3.0), Inches(4.2), Inches(3.24), CARD2, radius=0.07)
rect(s, Inches(8.35), Inches(3.0), Inches(4.2), Inches(0.55), GREEN, radius=0.07)
tb(s, Inches(8.65), Inches(3.12), Inches(3.7), Inches(0.35), 'ОЖИДАЕМЫЕ РЕЗУЛЬТАТЫ', 12.5, DARKTX, True)
bullets(s, Inches(8.65), Inches(3.7), Inches(3.7), Inches(1.5), [
    'макет экологичного сада;',
    'схема системы полива;',
    'математические расчёты;',
    'презентация проекта.',
], 13, WHITE, gap=6, mcolor=GREEN)
rect(s, Inches(8.65), Inches(5.25), Inches(3.7), Inches(0.02), RGBColor(0x2C, 0x25, 0x63))
tb(s, Inches(8.65), Inches(5.4), Inches(3.7), Inches(0.8),
   'Компетенции: исследование, креативность, командная работа, экологическое мышление.',
   12, MUTED, spacing=1.25)

# ============================ 12. BOSHLANG'ICH MAKTAB ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Применение STEAM в начальном образовании', 'Практическое задание: «Создаём бумажный мост»', M_COL)
tb(s, Inches(0.75), Inches(1.95), Inches(11.8), Inches(0.6),
   'Проблемная ситуация: построить мост из бумаги, выдерживающий определённое '
   'количество небольших предметов.', 15.5, MUTED, spacing=1.3)

steps2 = [
    'Изучить свойства бумаги и устойчивость конструкций',
    'Измерить длину и ширину предполагаемого моста',
    'Разработать конструкцию и создать бумажную модель',
    'Проверить прочность с помощью небольших предметов',
    'Оформить внешний вид модели',
    'Сравнить результаты и улучшить конструкцию',
]
for i, t in enumerate(steps2):
    y = Inches(2.75) + i * Inches(0.6)
    rect(s, Inches(0.75), y, Inches(7.0), Inches(0.5), CARD, radius=0.1)
    rect(s, Inches(0.75), y, Inches(0.5), Inches(0.5), M_COL, radius=0.1)
    tb(s, Inches(0.75), y + Inches(0.1), Inches(0.5), Inches(0.35), str(i + 1), 15, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, Inches(1.45), y + Inches(0.12), Inches(6.1), Inches(0.35), t, 13, WHITE)

rect(s, Inches(8.15), Inches(2.75), Inches(4.4), Inches(3.6), CARD2, radius=0.07)
rect(s, Inches(8.15), Inches(2.75), Inches(4.4), Inches(0.55), M_COL, radius=0.07)
tb(s, Inches(8.45), Inches(2.87), Inches(3.9), Inches(0.35), 'ИНТЕГРАЦИЯ STEAM', 13, DARKTX, True)
steam_map = [
    ('S', 'свойства бумаги', S_COL),
    ('T', 'цифровые инструменты', T_COL),
    ('E', 'проектирование моста', E_COL),
    ('A', 'внешний вид модели', A_COL),
    ('M', 'измерение результатов', M_COL),
]
for i, (L, d, c) in enumerate(steam_map):
    y = Inches(3.5) + i * Inches(0.53)
    rect(s, Inches(8.45), y, Inches(0.45), Inches(0.42), c, radius=0.2)
    tb(s, Inches(8.45), y + Inches(0.06), Inches(0.45), Inches(0.3), L, 15, DARKTX, True, PP_ALIGN.CENTER)
    tb(s, Inches(9.05), y + Inches(0.09), Inches(3.3), Inches(0.3), d, 12.5, WHITE)

tb(s, Inches(0.75), Inches(6.5), Inches(11.8), Inches(0.35),
   'Развивает логическое и творческое мышление, навыки измерения и сотрудничество.',
   13.5, M_COL, True)

# ============================ 13. KRITERIYLAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Критерии оценки креативности', 'Оценивание STEAM-проектов', A_COL)
tb(s, Inches(0.75), Inches(1.9), Inches(11.8), Inches(0.4),
   'Оценивание учитывает как конечный результат, так и процесс его создания.', 15, MUTED)

crits = [
    ('Оригинальность', 'Самостоятельные и необычные идеи', S_COL, 0.92),
    ('Разнообразие идей', 'Несколько вариантов решения задачи', T_COL, 0.85),
    ('Практическая эффективность', 'Соответствие проблеме и применимость', E_COL, 0.88),
    ('Аргументация', 'Объяснение и обоснование решений', A_COL, 0.80),
    ('Совершенствование', 'Анализ ошибок и учёт обратной связи', M_COL, 0.83),
    ('Сотрудничество', 'Участие в команде и обмен идеями', PINK, 0.78),
]
for i, (t, d, c, pct) in enumerate(crits):
    y = Inches(2.5) + i * Inches(0.7)
    rect(s, Inches(0.75), y, Inches(7.6), Inches(0.6), CARD, radius=0.1)
    rect(s, Inches(0.75), y, Inches(0.06), Inches(0.6), c)
    tb(s, Inches(1.05), y + Inches(0.05), Inches(3.4), Inches(0.3), f'{i + 1}. {t}', 14, c, True)
    tb(s, Inches(1.05), y + Inches(0.32), Inches(4.5), Inches(0.25), d, 11.5, MUTED)
    hbar(s, Inches(5.7), y + Inches(0.2), Inches(2.4), Inches(0.18), pct, c)

rect(s, Inches(8.7), Inches(2.5), Inches(3.85), Inches(3.7), CARD2, radius=0.07)
rect(s, Inches(8.7), Inches(2.5), Inches(3.85), Inches(0.55), A_COL, radius=0.07)
tb(s, Inches(9.0), Inches(2.62), Inches(3.4), Inches(0.35), 'ВАЖНО ПОМНИТЬ', 13, DARKTX, True)
bullets(s, Inches(9.0), Inches(3.2), Inches(3.35), Inches(2.7), [
    'Критерии должны быть **заранее понятны** обучающимся.',
    'Соответствие **целям конкретного проекта**.',
    'Оценивается и **процесс**, и **результат**.',
    'Учитывается **индивидуальный вклад** каждого.',
], 13.5, WHITE, gap=11, mcolor=A_COL)

# ============================ 14. MUAMMOLAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Проблемы внедрения STEAM и пути решения', 'Трудности и решения', RED)
tb(s, Inches(0.75), Inches(1.9), Inches(5.7), Inches(0.35), 'ОСНОВНЫЕ ПРОБЛЕМЫ', 13.5, RED, True)
problems = [
    'Недостаточная материально-техническая база',
    'Ограниченный доступ к цифровым инструментам',
    'Недостаточная подготовка педагогов',
    'Сложности интеграции учебных дисциплин',
    'Нехватка времени для проектов',
    'Трудности оценки индивидуального вклада',
]
for i, p in enumerate(problems):
    y = Inches(2.35) + i * Inches(0.68)
    rect(s, Inches(0.75), y, Inches(5.7), Inches(0.56), CARD, radius=0.1)
    tb(s, Inches(1.0), y + Inches(0.13), Inches(0.4), Inches(0.35), '✗', 15, RED, True)
    tb(s, Inches(1.5), y + Inches(0.15), Inches(4.8), Inches(0.35), p, 13, WHITE)

tb(s, Inches(6.85), Inches(1.9), Inches(5.7), Inches(0.35), 'ПУТИ РЕШЕНИЯ', 13.5, GREEN, True)
solutions = [
    'Доступные и недорогие материалы',
    'Повышение квалификации преподавателей',
    'Междисциплинарные учебные задания',
    'Небольшие проекты в обычные занятия',
    'Прозрачные критерии оценивания',
    'Сотрудничество между учреждениями',
]
for i, p in enumerate(solutions):
    y = Inches(2.35) + i * Inches(0.68)
    rect(s, Inches(6.85), y, Inches(5.7), Inches(0.56), CARD, radius=0.1)
    tb(s, Inches(7.1), y + Inches(0.13), Inches(0.4), Inches(0.35), '✓', 15, GREEN, True)
    tb(s, Inches(7.6), y + Inches(0.15), Inches(4.8), Inches(0.35), p, 13, WHITE)

tb(s, Inches(0.75), Inches(6.5), Inches(11.8), Inches(0.35),
   'Внедрение STEAM не всегда требует дорогостоящего оборудования — бумага, картон и природные материалы достаточны.',
   13, M_COL, True)

# ============================ 15. XULOSA ============================
s = prs.slides.add_slide(BLANK)
tick()
rect(s, 0, 0, W, H, BG)
o1 = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(-2.5), Inches(3), Inches(7), Inches(7))
o1.fill.solid(); o1.fill.fore_color.rgb = RGBColor(0x1E, 0x1B, 0x4E)
o1.line.fill.background(); o1.shadow.inherit = False
rect(s, 0, 0, Inches(0.14), H, PINK)
rect(s, 0, 0, W, Inches(0.055), PINK)

tb(s, Inches(0.95), Inches(0.7), Inches(8), Inches(0.4), 'ЗАКЛЮЧЕНИЕ', 15, PINK, True)
tb(s, Inches(0.9), Inches(1.1), Inches(11.5), Inches(1.0),
   'Не только знать — но и создавать', 42, WHITE, True)

bullets(s, Inches(0.95), Inches(2.5), Inches(7.1), Inches(2.7), [
    '**STEAM-образование** — междисциплинарный подход: науки, технологии, инженерия, искусство и математика.',
    '**Практическое применение** знаний, исследовательская деятельность и поиск нестандартных решений.',
    '**Креативность** — важный компонент: генерация, оценка и совершенствие идей.',
    'Продуманная **организация процесса** и объективные критерии оценки.',
], 15.5, WHITE, gap=13, mcolor=PINK)

rect(s, Inches(8.5), Inches(2.5), Inches(3.95), Inches(2.7), CARD, radius=0.07)
rect(s, Inches(8.5), Inches(2.5), Inches(3.95), Inches(0.55), M_COL, radius=0.07)
tb(s, Inches(8.8), Inches(2.62), Inches(3.5), Inches(0.35), 'ГЛАВНАЯ ИДЕЯ', 13, DARKTX, True)
tb(s, Inches(8.8), Inches(3.25), Inches(3.4), Inches(1.8),
   'Исследовать,\nсоздавать,\nпроверять\nи совершенствовать.',
   21, WHITE, True, spacing=1.35)

# 5 ta rangli nuqta — STEAM
for i, c in enumerate([S_COL, T_COL, E_COL, A_COL, M_COL]):
    rect(s, Inches(0.95 + i * 0.5), Inches(5.7), Inches(0.34), Inches(0.34), c, radius=0.5)

rect(s, Inches(0.95), Inches(6.3), Inches(6.0), Inches(0.55), CARD, radius=0.14)
tb(s, Inches(1.25), Inches(6.42), Inches(5.6), Inches(0.35),
   'STEAM · Креативность · 2026', 14, PINK, True)

# ============================ 16. MANBALAR ============================
s = prs.slides.add_slide(BLANK)
base(s, 'Источники и литература', 'Ссылки', S_COL)
refs = [
    ('UNESCO-UNEVOC. TVETipedia Glossary: STEAM',
     'connect.unevoc.unesco.org/home/TVETipedia+Glossary', S_COL),
    ('OECD. PISA 2022 Assessment and Analytical Framework',
     'oecd.org/en/publications/pisa-2022-assessment-and-analytical-framework', T_COL),
    ('OECD. PISA 2022 Creative Thinking',
     'oecd.org/en/topics/sub-issues/creative-thinking/pisa-2022-creative-thinking', E_COL),
    ('OECD. PISA 2022 Results, Volume III',
     'oecd.org/en/publications/pisa-2022-results-volume-iii', A_COL),
    ('UNESCO. Science, Technology, Engineering and Mathematics',
     'unesco.org/en/stem', M_COL),
]
for i, (t, url, c) in enumerate(refs):
    y = Inches(2.0) + i * Inches(0.92)
    rect(s, Inches(0.75), y, Inches(11.8), Inches(0.78), CARD, radius=0.08)
    rect(s, Inches(0.75), y, Inches(0.07), Inches(0.78), c)
    tb(s, Inches(1.1), y + Inches(0.1), Inches(1.0), Inches(0.35), f'{i + 1}.', 16, c, True)
    tb(s, Inches(1.7), y + Inches(0.1), Inches(10.5), Inches(0.3), t, 14, WHITE, True)
    tb(s, Inches(1.7), y + Inches(0.42), Inches(10.5), Inches(0.3), url, 12, MUTED)

rect(s, Inches(0.75), Inches(6.6), Inches(11.8), Inches(0.02), RGBColor(0x2C, 0x25, 0x63))
tb(s, Inches(0.75), Inches(6.7), Inches(11.8), Inches(0.3),
   'Примечание: реализация STEAM зависит от целей, программы, возраста обучающихся и доступных ресурсов.',
   12, MUTED, italic=True)

# ----------------------------- saqlash -----------------------------
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'steam.pptx')
prs.save(out)
print('OK ->', out)
print('slides:', len(prs.slides._sldIdLst))
