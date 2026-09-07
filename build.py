#!/usr/bin/env python3
"""從 app.template.html 產生三個版本:

  finance_app.html           獨立單檔,雙擊就能用,資料存瀏覽器 localStorage
  finance_app_artifact.html  Claude Artifact 版,資料存雲端、跨裝置同步
  docs/                      GitHub Pages 用的 PWA(可安裝、離線可用)

程式碼只有一份,改 app.template.html 之後跑 python3 build.py 重新產生。
圖示由 make_icons.py 產生。
"""
import base64, hashlib, json, pathlib, re, shutil

ROOT = pathlib.Path(__file__).parent
tpl = (ROOT / 'app.template.html').read_text(encoding='utf-8')

NOTE_LOCAL = '資料存在這台裝置的瀏覽器裡,不會上傳到任何地方,也不需要登入。'
NOTE_CLOUD = '資料存在這個 Artifact 的雲端資料庫,只有你的 Claude 帳號看得到。'

# --- Artifact 版:沒有 <!doctype>/<head>/<body>,由平台包起來 ---
artifact = tpl.replace('/*STORAGE_NOTE*/', NOTE_CLOUD)
(ROOT / 'finance_app_artifact.html').write_text(artifact, encoding='utf-8')

# --- 獨立版:補回完整文件外殼與離線用的 icon ---
icon_b64 = base64.b64encode((ROOT / 'icon-180.png').read_bytes()).decode()
fav_b64 = base64.b64encode((ROOT / 'favicon-32.png').read_bytes()).decode()
body = tpl.replace('/*STORAGE_NOTE*/', NOTE_LOCAL)
title = re.search(r'<title>(.*?)</title>', body).group(1)
# 模板開頭是 <title> + <style>,把這段放進 <head>,其餘放進 <body>
cut = body.index('</style>') + len('</style>')
head_part, body_part = body[:cut], body[cut:]

standalone = f'''<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f2f4f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{title}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="description" content="離線可用的個人財務 app:記帳、預算、資產負債與房貸槓桿試算。">
<link rel="apple-touch-icon" href="data:image/png;base64,{icon_b64}">
<link rel="icon" type="image/png" href="data:image/png;base64,{fav_b64}">
<style>img{{max-width:100%;}} [hidden]{{display:none !important;}}</style>
{head_part}
</head>
<body>
{body_part}
</body>
</html>
'''
(ROOT / 'finance_app.html').write_text(standalone, encoding='utf-8')

print('finance_app.html          ', len(standalone), 'bytes  (獨立單檔)')
print('finance_app_artifact.html ', len(artifact), 'bytes  (Artifact 版)')


# --- GitHub Pages 版:PWA,可安裝、離線可用 ---
SITE = ROOT / 'docs'   # GitHub Pages 只能從 root 或 /docs 發佈
SITE.mkdir(exist_ok=True)

APP_NAME = '財務管理'
sw_reg = """
<script>
if ('serviceWorker' in navigator && location.protocol === 'https:'){
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
</script>
"""

site_html = f"""<!DOCTYPE html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#f2f4f7" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="{APP_NAME}">
<meta name="apple-mobile-web-app-status-bar-style" content="default">
<meta name="description" content="離線可用的個人財務 app:記帳、預算、資產負債與房貸槓桿試算。資料只存在你自己的瀏覽器。">
<meta name="robots" content="noindex">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="icon-180.png">
<link rel="icon" type="image/png" sizes="192x192" href="icon-192.png">
<link rel="icon" type="image/png" sizes="32x32" href="favicon-32.png">
<style>img{{max-width:100%;}} [hidden]{{display:none !important;}}</style>
{head_part}
</head>
<body>
{body_part}
{sw_reg}
</body>
</html>
"""
(SITE / 'index.html').write_text(site_html, encoding='utf-8')

manifest = {
    "name": APP_NAME + " · 槓桿投資儀表板",
    "short_name": APP_NAME,
    "description": "記帳、預算、資產負債與房貸槓桿試算,資料只存在你自己的瀏覽器。",
    "start_url": ".",
    "scope": ".",
    "display": "standalone",
    "orientation": "portrait",
    "lang": "zh-Hant",
    "background_color": "#f2f4f7",
    "theme_color": "#2563eb",
    "icons": [
        {"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
        {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
        {"src": "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
    ],
}
(SITE / 'manifest.webmanifest').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

ASSETS = ['icon-180.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'favicon-32.png']
for name in ASSETS:
    shutil.copy2(ROOT / name, SITE / name)

# 每次 build 內容有變就換 cache 名稱,使用者第二次開啟時自動拿到新版
version = hashlib.sha256(site_html.encode()).hexdigest()[:10]
sw = f"""/* 離線快取:換版時 CACHE 名稱會變,舊快取自動清掉。 */
const CACHE = 'finance-{version}';
const ASSETS = ['./', './index.html', './manifest.webmanifest', {', '.join(repr('./' + a) for a in ASSETS)}];

self.addEventListener('install', e => {{
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
}});

self.addEventListener('activate', e => {{
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
}});

self.addEventListener('fetch', e => {{
  const req = e.request;
  if (req.method !== 'GET') return;
  // 網頁本身:先連網拿最新版,沒網路才用快取
  if (req.mode === 'navigate'){{
    e.respondWith(
      fetch(req).then(res => {{
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put('./index.html', copy));
        return res;
      }}).catch(() => caches.match('./index.html'))
    );
    return;
  }}
  // 圖示等靜態檔:先用快取
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
}});
"""
(SITE / 'sw.js').write_text(sw, encoding='utf-8')
(SITE / '.nojekyll').write_text('', encoding='utf-8')

print('docs/                     ', len(site_html), 'bytes  (PWA,cache', version + ')')
