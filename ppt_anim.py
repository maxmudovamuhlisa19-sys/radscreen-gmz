# -*- coding: utf-8 -*-
"""
RadSkrin PPTX'ga professional jonlantirish qo'shadi:
  • slayd o'tishlari (fade / push / wipe)
  • kirish animatsiyalari (fade / zoom, kaskad)
  • jonli demo video (MP4, avtomatik ijro)
  • ovozli effektlar (swoosh / ding / alert / whoosh)

Ishlatish:  python make_ppt.py  &&  python ppt_anim.py
"""
import os
import win32com.client as win32
from win32com.client import gencache

PPTX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'nmkg.pptx')
MEDIA = os.path.join(os.environ.get('TEMP', '.'), 'opencode', 'media')
DEMO = os.path.join(MEDIA, 'demo.mp4')
DIFF = os.path.join(MEDIA, 'diff.mp4')
BODY = os.path.join(MEDIA, 'body.mp4')

# qo'llanadigan effekt id'lari (fallback qiymatlar)
FB = dict(
    msoAnimEffectFade=10, msoAnimEffectZoom=23, msoAnimEffectWipe=22, msoAnimEffectFly=2,
    msoAnimTriggerOnPageClick=1, msoAnimTriggerWithPrevious=2, msoAnimTriggerAfterPrevious=3,
    ppEffectFadeSmoothly=3849, ppEffectFade=1793, ppEffectPushUp=3849, ppEffectWipeUp=3850,
)

IN = 914400   # 1 duym (EMU)
PT = 72.0     # 1 duym (PowerPoint nuqtalari — shakl koordinatalari)


def consts():
    try:
        app = gencache.EnsureDispatch('PowerPoint.Application')
        from win32com.client import constants as C
        return app, C
    except Exception as e:
        print('gencache fail:', e)

        class C:  # noqa
            pass
        for k, v in FB.items():
            setattr(C, k, v)

        app = win32.Dispatch('PowerPoint.Application')
        return app, C


def slide_text(slide):
    out = []
    for sh in slide.Shapes:
        try:
            if sh.HasTextFrame and sh.TextFrame.HasText:
                out.append(sh.TextFrame.TextRange.Text)
        except Exception:
            pass
    return '\n'.join(out)


def eligible(shape, sw, sh_h):
    """Fon va mayda detallarni animatsiyadan chetlab o'tish."""
    try:
        l, t, w, h = shape.Left, shape.Top, shape.Width, shape.Height
    except Exception:
        return False
    if w >= sw * 0.97:            # to'liq fon
        return False
    if h < 0.07 * PT:             # nozik chiziqlar (aksent, ajratgich)
        return False
    if t > 6.85 * PT:             # futer
        return False
    if shape.Name.startswith('sfx_'):
        return False
    return True


def is_picture(shape):
    try:
        return shape.Type == 13 or shape.MediaType == 1  # msoPicture / msoMedia
    except Exception:
        return False


def is_media(shape):
    return (shape.Name.startswith('sfx_') or shape.Name.startswith('DemoVideo')
            or shape.Name.startswith('DiffVideo')
            or shape.Name.startswith('BodyVideo')
            or shape.Name.startswith('voice_'))


def normalize(seq, C, desired):
    """Har bir shakl uchun BIRTA tugun, to'g'ri trigger bilan qoldiradi.

    AddEffect ba'zan rasm va ko'p qatorli matn uchun ishlamaydi; legacy yo'l
    esa shakl uchun bir nechta tugun (xabar darajasi bo'yicha) yaratadi.
    """
    first, all_idx = {}, []
    for i in range(1, seq.Count + 1):
        nm = seq.Item(i).Shape.Name
        all_idx.append((i, nm))
        first.setdefault(nm, i)
    for i, nm in reversed(all_idx):          # ortdan: qo'shimcha tugunlarni o'chirish
        if first[nm] != i:
            seq.Item(i).Delete()
    for i in range(1, seq.Count + 1):        # qolganlarni sozlash
        e = seq.Item(i)
        nm = e.Shape.Name
        if nm in desired:
            eff, trig, delay, dur, direction = desired[nm]
            try:
                e.EffectType = eff
            except Exception:
                pass
            e.Timing.TriggerType = trig
            e.Timing.TriggerDelayTime = delay
            e.Timing.Duration = dur
            if direction is not None:
                try:
                    e.EffectParameters.Direction = direction  # wipe chapdan o'sadi
                except Exception:
                    pass
        else:                                # media (audio/video) — slayd boshida avtomatik
            try:
                e.Timing.TriggerType = C.msoAnimTriggerWithPrevious
                e.Timing.TriggerDelayTime = 0
            except Exception:
                pass


def animate(slide, C, max_shapes=40):
    seq = slide.TimeLine.MainSequence
    for i in range(seq.Count, 0, -1):        # media tugunlarini saqlab qolamiz
        if not is_media(seq.Item(i).Shape):
            seq.Item(i).Delete()
    sw = slide.Master.Parent.PageSetup.SlideWidth
    shapes = [sh for sh in slide.Shapes
              if eligible(sh, sw, 0) and not is_media(sh)][:max_shapes]
    desired = {}
    for i, sh in enumerate(shapes):
        if sh.Name.startswith('BAR'):
            # jonli diagramma: chiziqlar chapdan o'ngga o'sib chiqadi
            eff, dur, direction = C.msoAnimEffectWipe, 0.8, C.msoAnimDirectionLeft
            delay = 0.15
        else:
            eff = C.msoAnimEffectZoom if is_picture(sh) else C.msoAnimEffectFade
            dur, direction = 0.45, None
            # hammasi WithPrevious: media (audio/video) tugunidan bog'liq holda
            # slayd boshidan zanjir uslida kaskad yuradi
            delay = 0.12 if i == 0 else (0.06 if i < 20 else 0.03)
        desired[sh.Name] = (eff, C.msoAnimTriggerWithPrevious, delay, dur, direction)
        try:
            seq.AddEffect(sh, eff, C.msoAnimTriggerWithPrevious)
        except Exception:
            sh.AnimationSettings.Animate = True       # zaxira: legacy tugun yaratadi
            sh.AnimationSettings.EntryEffect = C.ppEffectFade
    normalize(seq, C, desired)
    return len(desired)


def set_transition(slide, C, name='ppEffectFadeSmoothly', dur=0.7):
    tr = slide.SlideShowTransition
    eff = getattr(C, name, None) or getattr(C, 'ppEffectFadeSmoothly', 3849)
    try:
        tr.EntryEffect = eff
    except Exception:
        pass
    try:
        tr.Duration = dur
    except Exception:
        pass
    try:
        tr.AdvanceOnClick = True
        tr.AdvanceOnTime = False
    except Exception:
        pass


def add_media(slide, path, box, C, play=True, hide=True, name='sfx', send_back=False):
    l, t, w, h = box
    try:
        sh = slide.Shapes.AddMediaObject2(path, False, True, l, t, w, h)
    except Exception as e:
        print('  media fail:', os.path.basename(path), e)
        return None
    sh.Name = name
    if send_back:
        try:
            sh.ZOrder(1)          # msoSendToBack — ikonka fon ostida yashiriladi
        except Exception:
            pass
    try:
        ps = sh.AnimationSettings.PlaySettings
        ps.PlayOnEntry = play
        ps.HideWhileNotPlaying = hide
        ps.LoopUntilStopped = False
    except Exception as e:
        print('  playsettings fail:', e)
    return sh


def main():
    app, C = consts()
    app.Visible = True
    pres = app.Presentations.Open(PPTX, ReadOnly=False, Untitled=False, WithWindow=False)
    print('slides:', pres.Slides.Count)

    # ---- slaydlar bo'yicha ishlar ----
    for i in range(1, pres.Slides.Count + 1):
        s = pres.Slides(i)
        txt = slide_text(s)

        # o'tishlar: bo'lim boshlari boshqacha
        if i == 1:
            set_transition(s, C, 'ppEffectFadeSmoothly', 1.0)
        elif 'Jonli demo' in txt or 'Farq jonli' in txt or 'Odam tanasi' in txt:
            set_transition(s, C, 'ppEffectWipeUp', 0.8)
        elif i in (2, 24, 25):
            set_transition(s, C, 'ppEffectFadeSmoothly', 0.9)
        else:
            set_transition(s, C, 'ppEffectFadeSmoothly', 0.6)

        # videolar (slot shakllarini haqiqiy MP4 bilan almashtirish) —
        # animatsiyadan OLDIN qo'shiladi, shuning uchun media tuguni
        # ketma-ketlikda birinchi bo'ladi
        for slot_name, media_path, mname in (('VIDEO_SLOT', DEMO, 'DemoVideo'),
                                             ('DIFF_VIDEO_SLOT', DIFF, 'DiffVideo'),
                                             ('BODY_VIDEO_SLOT', BODY, 'BodyVideo')):
            slot = None
            for sh in list(s.Shapes):
                if sh.Name == slot_name:
                    slot = sh
                    break
            if slot is not None and os.path.exists(media_path):
                box = (slot.Left, slot.Top, slot.Width, slot.Height)
                slot.Delete()
                add_media(s, media_path, box, C, play=True, hide=False, name=mname)
                print('    + video:', os.path.basename(media_path))

        # ovozli matn (haqiqiy nutq) — har bir slayd mazmuni boyicha
        voice = os.path.join(MEDIA, 'voice', 'slide%02d.mp3' % i)
        if os.path.exists(voice):
            sw = s.Master.Parent.PageSetup.SlideWidth
            shh = s.Master.Parent.PageSetup.SlideHeight
            add_media(s, voice, (sw - 20, shh - 20, 14, 14), C,
                      play=True, hide=True, name='voice_%02d' % i, send_back=True)
            print('    + voice: slide%02d.mp3' % i)

        # kirish animatsiyalari (oxirgi — media tugunlari saqlanadi)
        n = animate(s, C)
        print(f'  slide {i:2d}: anim={n:2d}  {txt.splitlines()[0][:34] if txt else ""}')

    pres.Save()
    pres.Close()
    app.Quit()
    print('OK ->', PPTX)


if __name__ == '__main__':
    main()
