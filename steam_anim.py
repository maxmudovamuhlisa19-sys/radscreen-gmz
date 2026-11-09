# -*- coding: utf-8 -*-
"""
steam.pptx ga professional animatsiya:
  • slayd o'tishlari (fade / wipe / push)
  • kirish animatsiyalari (fade / zoom / wipe, kaskad)
  • BAR chiziqlari chapdan o'ngga o'sadi
Ishlatish:  python make_steam_ppt.py && python steam_anim.py
"""
import os
import win32com.client as win32
from win32com.client import gencache

PPTX = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'steam.pptx')

FB = dict(
    msoAnimEffectFade=10, msoAnimEffectZoom=23, msoAnimEffectWipe=22,
    msoAnimEffectFly=2, msoAnimEffectWheel=21,
    msoAnimTriggerWithPrevious=2,
    ppEffectFadeSmoothly=3849, ppEffectFade=1793,
    ppEffectPushUp=3849, ppEffectWipeUp=3850, ppEffectCoverLeft=769,
)
PT = 72.0


def consts():
    try:
        app = gencache.EnsureDispatch('PowerPoint.Application')
        from win32com.client import constants as C
        return app, C
    except Exception as e:
        print('gencache fail:', e)

        class C:
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


def eligible(shape, sw):
    try:
        l, t, w, h = shape.Left, shape.Top, shape.Width, shape.Height
    except Exception:
        return False
    if w >= sw * 0.97:
        return False
    if h < 0.07 * PT:
        return False
    if t > 6.85 * PT:
        return False
    if w / PT > 6.5 and h / PT > 6.5:
        return False
    return True


def normalize(seq, C, desired):
    first, all_idx = {}, []
    for i in range(1, seq.Count + 1):
        nm = seq.Item(i).Shape.Name
        all_idx.append((i, nm))
        first.setdefault(nm, i)
    for i, nm in reversed(all_idx):
        if first[nm] != i:
            seq.Item(i).Delete()
    for i in range(1, seq.Count + 1):
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
                    e.EffectParameters.Direction = direction
                except Exception:
                    pass


def animate(slide, C, max_shapes=45):
    seq = slide.TimeLine.MainSequence
    for i in range(seq.Count, 0, -1):
        seq.Item(i).Delete()
    sw = slide.Master.Parent.PageSetup.SlideWidth
    shapes = [sh for sh in slide.Shapes if eligible(sh, sw)][:max_shapes]
    desired = {}
    for i, sh in enumerate(shapes):
        try:
            fill_rgb = sh.Fill.ForeColor.RGB
        except Exception:
            fill_rgb = None
        name = sh.Name
        if name.startswith('BAR'):
            eff, dur, direction = C.msoAnimEffectWipe, 0.8, C.msoAnimDirectionLeft
            delay = 0.15
        else:
            is_oval = False
            try:
                is_oval = sh.AutoShapeType == 9
            except Exception:
                pass
            if is_oval:
                eff = C.msoAnimEffectZoom
                dur = 1.2
            else:
                eff = C.msoAnimEffectFade
                dur = 0.45
            direction = None
            delay = 0.12 if i == 0 else (0.07 if i < 20 else 0.04)
        desired[name] = (eff, C.msoAnimTriggerWithPrevious, delay, dur, direction)
        try:
            seq.AddEffect(sh, eff, C.msoAnimTriggerWithPrevious)
        except Exception:
            try:
                sh.AnimationSettings.Animate = True
                sh.AnimationSettings.EntryEffect = C.ppEffectFade
            except Exception:
                pass
    normalize(seq, C, desired)
    return len(desired)


def set_transition(slide, C, name, dur=0.7):
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


def main():
    app, C = consts()
    app.Visible = True
    pres = app.Presentations.Open(PPTX, ReadOnly=False, Untitled=False, WithWindow=False)
    print('slides:', pres.Slides.Count)

    for i in range(1, pres.Slides.Count + 1):
        s = pres.Slides(i)
        txt = slide_text(s)

        # o'tishlar — bo'lim boshlari boshqacha
        if i == 1:
            set_transition(s, C, 'ppEffectFadeSmoothly', 1.2)
        elif 'ЗАКЛЮЧЕНИЕ' in txt or 'Источники' in txt:
            set_transition(s, C, 'ppEffectPushUp', 0.9)
        elif i in (2, 5, 7):
            set_transition(s, C, 'ppEffectCoverLeft', 0.8)
        else:
            set_transition(s, C, 'ppEffectFadeSmoothly', 0.65)

        n = animate(s, C)
        first = txt.splitlines()[0][:36] if txt else ''
        print(f'  slide {i:2d}: anim={n:2d}  {first}')

    pres.Save()
    pres.Close()
    app.Quit()
    print('OK ->', PPTX)


if __name__ == '__main__':
    main()
