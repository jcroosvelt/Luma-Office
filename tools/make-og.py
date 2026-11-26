#!/usr/bin/env python3
"""Génère les images d'aperçu social (1200×630) dans public/og/. Usage : python3 tools/make-og.py <logo_transparent.png> <police_gras.ttf> <police_normale.ttf>"""
import sys
from PIL import Image, ImageDraw, ImageFont

logo_path, bold, regular = sys.argv[1:4]
W, H = 1200, 630

def card(title, sub, out):
    bg = Image.new('RGB', (W, H), '#001e6c')
    px = bg.load()
    for y in range(H):  # dégradé vertical bleu marine -> bleu
        for x in range(W):
            t = (x / W * 0.6 + y / H * 0.4)
            px[x, y] = (int(0 + 11 * t), int(30 + 57 * t), int(108 + 100 * t))
    d = ImageDraw.Draw(bg)
    logo = Image.open(logo_path).convert('RGBA').resize((330, 330), Image.LANCZOS)
    bg.paste(logo, (80, (H - 330) // 2), logo)
    ft, fs, fb = ImageFont.truetype(bold, 84), ImageFont.truetype(regular, 40), ImageFont.truetype(bold, 30)
    x0 = 470
    d.text((x0, 190), title, font=ft, fill='white')
    y = 300
    for line in sub:
        d.text((x0, y), line, font=fs, fill='#cfe0ff')
        y += 54
    d.rounded_rectangle((x0, 470, x0 + 360, 530), radius=16, fill='#fc9a0b')
    d.text((x0 + 26, 481), 'lumaoffice.vercel.app', font=fb, fill='#001e6c')
    bg.save(out, optimize=True)

card('Luma Office', ['Traitement de texte', 'et lecteur PDF', 'pour mobile'], 'public/og/luma-office.png')
card('Android', ['Télécharger', "l'application gratuite"], 'public/og/telecharger.png')
