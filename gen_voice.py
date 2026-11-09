# -*- coding: utf-8 -*-
"""
RadSkrin taqdimoti uchun ovozli matnlar (nutq) — edge-tts, o'zbekcha.
Chiqish: %TEMP%\\opencode\\media\\voice\\slideNN.mp3
Ishlatish:  python gen_voice.py  &&  python make_ppt.py  &&  python ppt_anim.py
"""
import os, subprocess, sys

OUT = os.path.join(os.environ.get('TEMP', '.'), 'opencode', 'media', 'voice')
VOICE = 'uz-UZ-MadinaNeural'
RATE = '-5%'   # sekinroq, qulayroq talaffuz

TEXTS = {
    1: "RadSkrin — NMKG radiatsiya skriningi. Kamera, sun'iy intellekt va qoidalar dvijoki bilan bir daqiqada aniqlash tizim.",
    2: "Taqdimot to'rt qismdan iborat: muammo va yechim, Asosiy imkoniyatlar, Ilova ekranlari, Texnologiya va reja.",
    3: "Muammo shundaki, radiatsiya xavfi ko'rinmaydi. Belgilar yashirin va kech seziladi, kasb xavfi yuqori. Ichimlik yoki alkogol esa darhol aniqlanmaydi: xavfli mashina boshqarish yoki og'ir ish oldidan tekshiruv yo'q.",
    4: "Nurlangan va nurlanmagan odam farqini tizim bir daqiqada ko'rsatadi. Nurlanganda doza tezligi yuqori, teri qizarishi, charchoq va tez pulslanish kuzatiladi, klinik xulosa kasallikni bor deydi. Nurlanmagan odamda fon normal, belgilar yo'q va xulosa xavfsiz.",
    5: "",
    6: "",
    7: "Bu jonli isbot. Kamera shu zahoti ishlaydi: tana qutisi va o'n yetti nuqta real vaqtda chiziladi, kadr chastotasi jonli ko'rsatiladi. Hech qanday yozuv yo'q — deraza yopilganda hamma narsa to'xtaydi.",
    8: "Javob — bit tizim, besh qatlamli yechim: kamera orqali yuz va belgilarni olish, o'n uchta kasallik bo'yicha sun'iy intellekt xulosasi, alkogol moduli, ovozli suhbat va nazorat paneli.",
    9: "Ishlash tartibi oddiy. Foydalanuvchi kamera oldiga o'tiradi, tizim yuz, teri va nafas belgilarini tahlil qiladi va bir daqiqada xulosa tayyorlaydi.",
    10: "Ma'lumot aniq ketma-ketlikda yuradi: kirish — bemor va kamera, keyin tahlil, so'ngra xulosa va amalga o'tish: ogohlantirish, davolash yoki qo'shimcha ko'rik.",
    11: "Kamera o'ttiz kadrda ishlaydi. Yuz rangi, ko'z qovoqlari, nafas olish chastotasi va teri holati real vaqtda o'lchanadi.",
    12: "Sun'iy intellekt o'n uchta kasallik bo'yicha javob beradi: bor, shubha yoki yo'q. Har bir natija foiz va ishonch darajasi bilan ko'rsatiladi.",
    13: "Alkogol moduli ichimlik turi, miqdori va o'tgan vaqtni oladi. Ball, qon alkogoli va xavf darajasi hisoblanadi. Og'ir holatda shifokor yoki militsiya yordami tavsiya etiladi.",
    14: "Foydalanuvchi ovozli savol beradi, tizim matnda va ovozda javob beradi. Suhbat tabiiy, to'liq o'zbek tilida.",
    15: "Nazorat panelida barcha bemorlar, doza ko'rsatkichlari va xavf darajalari bitta ekranda to'planadi.",
    16: "Bir ekranda yuz, belgilar va tahlil — har bir qadam ko'rinib turadi, natija shu yerda shakllanadi.",
    17: "Klinik xulosa qaysi kasallik necha foiz ekanligini, tavsiyalarni va keyingi qadamlarni aniq yozib beradi.",
    18: "Alkogol moduli beshta signal bo'yicha ball hisoblaydi: og'irlik, reaksiya, ovoz, fiziologiya va o'zini boshqarish. Natija shkalada ko'rsatiladi.",
    19: "",
    20: "Tizim Node.js asosida, brauzerli interfeys va server orqali ishlaydi. Sun'iy intellekt moduli alohida xizmat sifatida qo'shiladi.",
    21: "Raqamlar real tizimdan: o'n uchta kasallik, beshta signal, yuz yigirma kadr va bir daqiqalik to'liq tahlil.",
    22: "Oddiy ko'rik bir necha daqiqa va ko'z bilan baholanadi. RadSkrin esa bir daqiqada, ob'ektiv foiz bilan javob beradi.",
    23: "Ma'lumotlar lokal saqlanadi, ruxsatsiz kirish yo'q. Tizim faqat tibbiy yordam uchun mo'ljallangan.",
    24: "Byudjet va uskunalar aniq ko'rsatilgan. Bir NMKG punkti uchun umumiy investitsiya sakson besh million so'm, ya'ni olti ming yetti yuz ellik dollar. Bunga GPU server, to'rtta IR kamera, monitor, mikrofon, dasturiy litsenziya, o'rnatish va yillik texnik xizmat kiradi. Bir skrining narxi o'ttiz besh sentdan ham kam.",
    25: "Reja aniq: birinchi olti oyda pilot loyiha, so'ngra rasmiylashtirish va boshqa tibbiy tashkilotlarga kengaytirish.",
    26: "Xulosa: RadSkrin — radiatsiya xavfini bir daqiqada aniqlaydigan, o'zbek tilida to'liq ishlaydigan tayyor tizim.",
    27: "E'tiboringiz uchun rahmat. Savollaringiz bo'lsa, tayyor javob beramiz.",
}


def main():
    os.makedirs(OUT, exist_ok=True)
    ok = 0
    for n, text in sorted(TEXTS.items()):
        if not text:
            continue
        path = os.path.join(OUT, 'slide%02d.mp3' % n)
        r = subprocess.run(
            ['edge-tts', '--voice', VOICE, '--rate=' + RATE, '--text', text,
             '--write-media', path],
            capture_output=True, text=True, encoding='utf-8')
        if r.returncode != 0 or not os.path.exists(path):
            print('FAIL slide', n, (r.stderr or '')[-200:])
        else:
            ok += 1
            print('slide %2d -> %5d B' % (n, os.path.getsize(path)))
    print('OK:', ok, '/', len([t for t in TEXTS.values() if t]), '->', OUT)


if __name__ == '__main__':
    main()
