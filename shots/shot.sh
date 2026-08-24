#!/bin/bash
# usage: shot.sh <outfile> <url> [budget]
# Headless Chrome screenshot that doesn't hang: backgrounds Chrome,
# polls for the output file (stable size), then kills Chrome.
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
OUT="$1"; URL="$2"; BUDGET="${3:-12000}"
PROF=$(mktemp -d /tmp/m4shot.XXXXXX)
rm -f "$OUT"
"$CHROME" --headless=new --use-angle=swiftshader --user-data-dir="$PROF" \
  --disable-background-networking --disable-component-update --no-first-run \
  --no-default-browser-check --disable-sync --metrics-recording-only --mute-audio \
  --screenshot="$OUT" --window-size=390,844 --hide-scrollbars \
  --virtual-time-budget="$BUDGET" "$URL" >/dev/null 2>&1 &
CPID=$!
LAST=0; STABLE=0
for i in $(seq 1 100); do
  sleep 1
  if [ -f "$OUT" ]; then
    SZ=$(stat -f%z "$OUT")
    if [ "$SZ" = "$LAST" ] && [ "$SZ" -gt 1000 ]; then
      STABLE=$((STABLE+1))
      [ $STABLE -ge 2 ] && break
    else
      STABLE=0; LAST=$SZ
    fi
  fi
done
kill $CPID 2>/dev/null; sleep 0.5; kill -9 $CPID 2>/dev/null
rm -rf "$PROF"
[ -f "$OUT" ] && echo "OK $OUT $(stat -f%z "$OUT") bytes" || echo "FAIL $OUT"
