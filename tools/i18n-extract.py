#!/usr/bin/env python3
"""Extrait les textes français affichés à l'écran (site : src/*.js ; application : lib/*.dart) pour les traduire.
Usage : python3 tools/i18n-extract.py <site|app> <dossier_source> <sortie.json>
Les valeurs dynamiques (${x} en JavaScript, $x et ${x} en Dart) deviennent « {} » : le traducteur d'exécution les remplace."""
import glob, json, re, sys

kind, src, out = sys.argv[1:4]
exts = '*.js' if kind == 'site' else '*.dart'
quote = re.compile(r"'((?:\\.|[^'\\\n]){2,260})'" + ('|`((?:\\.|[^`\\\n]){2,260})`' if kind == 'site' else ''))
interp = re.compile(r'\$\{[^}]*\}') if kind == 'site' else re.compile(r'\$\{[^}]*\}|\$[A-Za-z_]\w*')
SKIP_FILES = set()
ACCENT = re.compile(r'[À-ÿœŒ’«»…]')
WORD = re.compile(r'[A-Za-zÀ-ÿ]{2,}')
CODEISH = re.compile(r'^(?:[\w.\-/#:@=\[\]*>+,~()\s%]*)$')

def keep(t):
    u = t
    t = t.replace('{}', '\u00a7')  # les valeurs dynamiques ne sont pas du code
    if re.search(r'</?[a-zA-Z][^>]*>', t) or t.startswith("'"):
        return False
    if len(t) > 200 or re.search(r"\)\s*[,;\]]|\(final |===|\|\||&&|\[for |\bin \w+\)|\$\(|\bnull\b|\btrue\b|\bfalse\b|^\s*[)\]},;]|[,;]\s*$", t) and not ACCENT.search(t[:3]):
        return False
    if not WORD.search(t):
        return False
    if t.startswith(('http', '/', './', '../', '#', '.', 'data:', 'application/', 'text/', 'image/', 'package:', 'assets/', 'luma', 'M ', 'rgb', 'var(', 'url(')):
        return False
    if re.search(r'[{};]|=>|\bfunction\b|\bconst\b|\breturn\b|</?[a-z]+[ >]|\.(js|css|png|json|ttf|woff2?|dart|mjs|pdf|docx)\b', t) and not ACCENT.search(t):
        return False
    if ' ' not in t.strip('{} '):
        # un seul mot : interface si majuscule initiale (« Annuler », « Retour ») ou accentué
        if not (re.match(r'^[A-ZÀ-Ý][a-zà-ÿ]{1,}[\w’\-]*[.…:!?]?$', t) or ACCENT.search(t)):
            return False
    elif CODEISH.match(t) and not ACCENT.search(t) and not re.search(r'[A-ZÀ-Ý]', t[:1]):
        # « font-size 12px », sélecteurs… : minuscule initiale, aucun accent, aucune ponctuation de phrase
        if not re.search(r'\b(le|la|les|de|des|du|un|une|votre|vos|pour|avec|sur|dans|et|ou|ce|cette|pas|est|sont|ne|en|au|aux|qui|que)\b', t):
            return False
    return True

def literals(code, js):
    """Renvoie le contenu des chaînes de caractères du code (en ignorant les commentaires et les expressions régulières)."""
    i, n, out = 0, len(code), []
    prev = ''  # dernier caractère significatif (pour distinguer « / » de division ou d'expression régulière)
    while i < n:
        c = code[i]
        if c == '/' and i + 1 < n and code[i + 1] == '/':
            j = code.find('\n', i); i = n if j < 0 else j; continue
        if c == '/' and i + 1 < n and code[i + 1] == '*':
            j = code.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        if c in '\'"' or (js and c == '`'):
            raw = not js and i > 0 and code[i - 1] == 'r'
            q = c
            if not js and code.startswith(q * 3, i):
                q3 = q * 3; j = i + 3
                while j < n and not code.startswith(q3, j):
                    j += 2 if (code[j] == '\\' and not raw) else 1
                out.append(code[i + 3:j]); i = j + 3; prev = q; continue
            j = i + 1; depth = 0
            while j < n:
                ch = code[j]
                if ch == '\\' and not raw: j += 2; continue
                if q == '`' and ch == '$' and code.startswith('${', j): depth += 1; j += 2; continue
                if q == '`' and depth and ch == '}': depth -= 1; j += 1; continue
                if ch == q and depth == 0: break
                if ch == '\n' and q != '`' and depth == 0: break
                j += 1
            out.append(code[i + 1:j]); i = j + 1; prev = q; continue
        if js and c == '/' and (prev in '(,=:[!&|?{};' or prev == '' or code[max(0, i - 7):i].rstrip().endswith('return')):
            j = i + 1; cls = False
            while j < n and code[j] != '\n':
                if code[j] == '\\': j += 2; continue
                if code[j] == '[': cls = True
                elif code[j] == ']': cls = False
                elif code[j] == '/' and not cls: break
                j += 1
            i = j + 1; prev = ')'; continue
        if not c.isspace(): prev = c
        i += 1
    return out

seen = {}
for f in sorted(glob.glob(f'{src}/{exts}')):
    if f.rsplit('/', 1)[-1] in SKIP_FILES:
        continue
    code = open(f, encoding='utf-8').read()
    for raw in literals(code, kind == 'site'):
        t = interp.sub('{}', raw).strip()
        t = t.replace("\\'", "'").replace('\\n', '\n').replace('\\"', '"')
        t = re.sub(r'\{\}\s*\{\}', '{}', t)
        if keep(t) and t not in seen:
            seen[t] = f.rsplit('/', 1)[-1]
items = sorted(seen)
json.dump(items, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
print(len(items), 'textes')
