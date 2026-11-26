#!/usr/bin/env python3
"""Assemble les dictionnaires finaux : site -> src/i18n/<langue>.json ; application -> <dossier_app>/assets/i18n/<langue>.json
Usage : python3 tools/i18n-build.py <dossier_app>"""
import json, os, sys
app = sys.argv[1]
for kind, out in (('site', 'src/i18n'), ('app', os.path.join(app, 'assets/i18n'))):
    os.makedirs(out, exist_ok=True)
    for lang in ('en', 'es'):
        d = json.load(open(f'tools/i18n/{kind}-{lang}.json', encoding='utf-8'))
        d = {k: v for k, v in d.items() if v and v.strip() != k.strip()}
        if kind == 'site' or kind == 'app':
            d.update(json.load(open('tools/i18n/manual.json', encoding='utf-8'))[lang])  # pluriels et formes courantes complétés à la main
        json.dump(d, open(f'{out}/{lang}.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
        print(kind, lang, len(d))
