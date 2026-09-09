#!/usr/bin/env bash
# 跑完整測試。改完 app.template.html 之後先 python3 build.py 再跑這個。
set -u
cd "$(dirname "$0")"
fail=0

echo "=== 功能測試(三個版本) ==="
for f in ../finance_app.html ../finance_app_artifact.html ../docs/index.html; do
  sed -i "s#const src = fs.readFileSync('[^']*'#const src = fs.readFileSync('$(cd .. && pwd)/${f#../}'#" smoke.js
  printf '%-28s ' "${f#../}"
  if node smoke.js >/dev/null 2>&1; then echo OK; else echo FAIL; fail=1; node smoke.js 2>&1 | grep -E '^Error' | head -1; fi
done

echo
echo "=== 均線趨勢訊號(computeTrend) ==="
node trend.js || fail=1
echo
echo "=== 邊界情況 ==="
node hunt.js || fail=1
echo
echo "=== 圖表(各種資料形狀與點擊) ==="
node charts.js | tail -3
echo
echo "=== 雲端同步(假後端) ==="
node cloud.js | tail -3
echo
echo "=== 說明頁與程式是否一致 ==="
node help.js | tail -2 || fail=1
echo
echo "=== id 與樣板完整性 ==="
node ids.js | tail -2
node stress-live.js | tail -1
echo
echo "=== 15 年長期使用 ==="
node longrun.js | tail -10

exit $fail
