# -*- coding: utf-8 -*-
"""Demo video uchun ovoz — GitHub (Uzbek_TTS). Chiqish: %TEMP%\\opencode\\media\\narr6.mp3"""
import os, sys, subprocess

sys.argv = [sys.argv[0]]
import gen_voice_uz as g

TEXT = ("Tizim monitoringda jonli kuzatuv bilan ishlaydi. Foydalanuvchi "
        "alomatlarini belgilaydi va tahlil boshlanadi. Ovozli savolga javob "
        "vozda qaytariladi. Alkogol moduli esa ball hisoblab, xavf darajasini "
        "ko'rsatadi.")

out_dir = os.path.dirname(g.OUT)
wav = os.path.join(out_dir, '_narr6.wav')
mp3 = os.path.join(out_dir, 'narr6.mp3')

tts = g.build_tts()
audio, sr = tts.generate_speech(TEXT)
tts.save_audio(audio, wav, sr)
print('narr %.2f s' % (len(audio) / sr))
subprocess.run([g.FF, '-y', '-loglevel', 'error', '-i', wav,
                '-af', 'loudnorm=I=-16:TP=-1.5:LRA=11',
                '-ar', '44100', '-b:a', '192k', mp3], check=True)
os.remove(wav)
print('->', mp3)
