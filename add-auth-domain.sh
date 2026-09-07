#!/usr/bin/env bash
# 把 GitHub Pages 的網域加進 Firebase Authentication 的授權清單。
# 必須先在主控台啟用 Authentication,否則會回 CONFIGURATION_NOT_FOUND。
set -euo pipefail

ACCOUNT=kurochu888@gmail.com
PROJECT=kuro-finance-09078a32e4
DOMAIN=kurochu888.github.io

TOKEN=$(gcloud auth print-access-token --account="$ACCOUNT")
BASE="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config"
AUTH_HEADERS=(-H "Authorization: Bearer $TOKEN" -H "x-goog-user-project: $PROJECT" -H "Content-Type: application/json")

CURRENT=$(curl -s "$BASE" "${AUTH_HEADERS[@]}")
if echo "$CURRENT" | grep -q CONFIGURATION_NOT_FOUND; then
  echo "Authentication 還沒啟用。先到主控台按「開始使用」並啟用 Google 登入:"
  echo "  https://console.firebase.google.com/project/$PROJECT/authentication/providers"
  exit 1
fi

BODY=$(echo "$CURRENT" | DOMAIN="$DOMAIN" python3 -c '
import json, os, sys
cfg = json.load(sys.stdin)
domains = cfg.get("authorizedDomains", [])
d = os.environ["DOMAIN"]
if d in domains:
    print("ALREADY", file=sys.stderr)
domains = domains + [d] if d not in domains else domains
print(json.dumps({"authorizedDomains": domains}))
')

curl -s -X PATCH "$BASE?updateMask=authorizedDomains" "${AUTH_HEADERS[@]}" -d "$BODY" \
  | python3 -c 'import json,sys; d=json.load(sys.stdin); print("授權網域:", d.get("authorizedDomains", d))'
