# -*- coding: utf-8 -*-
"""
RadSkrin taqdimoti ovozlari — GitHub (Saidakmal02/Uzbek_TTS, CFM+DiT+Vocos).
Chiqish: %TEMP%\\opencode\\media\\voice\\slideNN.mp3
Ishlatish: python gen_voice_uz.py  &&  python make_ppt.py  &&  python ppt_anim.py
"""
import os, sys, subprocess, time, shutil

REPO = os.path.join(os.environ['TEMP'], 'opencode', 'Uzbek_TTS')
sys.path.insert(0, REPO)
os.chdir(REPO)

# torchaudio >= 2.9 uchun torchcodec talab qilinadi — soundfile bilan almashtiramiz
import torchaudio, numpy as np, torch
import soundfile as sf


def _ta_load(path, *a, **k):
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    return torch.from_numpy(data.T), int(sr)


def _ta_save(path, tensor, sample_rate, *a, **k):
    arr = tensor.detach().cpu().numpy()
    if arr.ndim == 2:
        arr = arr.T
    sf.write(path, arr, int(sample_rate))


torchaudio.load = _ta_load
torchaudio.save = _ta_save

from omegaconf import OmegaConf
from hydra.utils import get_class
from tts import TTS

sys.path.insert(0, r'C:\Users\sardor\Desktop\gmz')
from gen_voice import TEXTS
OUT = os.environ.get('VOICE_OUT',
                     os.path.join(os.environ.get('TEMP', '.'), 'opencode', 'media', 'voice'))

REF_AUDIO = os.path.join(REPO, 'test_data', 'test_erkak.wav')
REF_TEXT = "Jizzax kollejlarida infraqizil aniqlagichli turniketlar o'rnatilmoqda."
FF = r'C:\Users\sardor\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe'

os.makedirs(OUT, exist_ok=True)


def build_tts():
    cfg = OmegaConf.load(os.path.join(REPO, 'config', 'UZTTS_conf.yaml'))
    return TTS(
        ref_audio_path=REF_AUDIO,
        ref_text=REF_TEXT,
        model_cfg=cfg,
        model_cls=get_class('uz_tts.model.%s' % cfg.model.backbone),
        vocab=os.path.join(REPO, 'config', 'uz_vocab.txt'),
        ckpt_path=os.path.join(REPO, 'ckpts', 'UZ.safetensors'),
        device='auto',
        speed=1.0,
    )


def to_mp3(wav, mp3):
    subprocess.run([FF, '-y', '-loglevel', 'error', '-i', wav,
                    '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                    '-ar', '44100', '-b:a', '192k', mp3], check=True)


def main():
    only = [int(a) for a in sys.argv[1:] if a.isdigit()]
    t0 = time.time()
    tts = build_tts()
    print('init %.1fs' % (time.time() - t0))
    for n in sorted(TEXTS):
        text = TEXTS[n]
        if not text.strip():
            print('slide %2d -> SKIP (bo\u2018sh)' % n)
            continue
        if only and n not in only:
            continue
        w = os.path.join(OUT, '_slide%02d.wav' % n)
        m = os.path.join(OUT, 'slide%02d.mp3' % n)
        ta = time.time()
        audio, sr = tts.generate_speech(text)
        tts.save_audio(audio, w, sr)
        to_mp3(w, m)
        os.remove(w)
        print('slide %2d -> %.1fs audio (%.1fs hisob) %d KB' % (
            n, len(audio) / sr, time.time() - ta, os.path.getsize(m) // 1024))
    print('JAMI %.1fs' % (time.time() - t0))


if __name__ == '__main__':
    main()
