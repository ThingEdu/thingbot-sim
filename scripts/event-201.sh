#!/usr/bin/env bash
# Phục vụ bản web sự kiện ThingBot FanRoc Game từ máy Ubuntu 201 (bản tĩnh, không backend).
#
#   scripts/event-201.sh build              build bản game -> dist-game/ (cục bộ)
#   scripts/event-201.sh push  --yes        rsync dist-game/ -> máy 201 (CẦN xác nhận)
#   scripts/event-201.sh start --yes        bật máy chủ tĩnh trên máy 201 (CẦN xác nhận)
#   scripts/event-201.sh stop               tắt đúng máy chủ do kịch bản này bật
#   scripts/event-201.sh status             xem máy chủ đang chạy không (chỉ đọc)
#
# Biến môi trường: HOST (192.168.1.201), SSH_USER (rỗng = dùng cấu hình ssh sẵn có),
#   DIR (fanroc-game, tương đối so với thư mục nhà), PORT (8090), BIND (0.0.0.0),
#   CONFIRM=yes (thay cho --yes), DRY_RUN=1 (chỉ in lệnh, không chạy gì).
# Không lưu / không hỏi mật khẩu (chỉ dùng khoá SSH sẵn có, BatchMode), không sudo.
set -euo pipefail

HOST="${HOST-192.168.1.201}"
SSH_USER="${SSH_USER-}"
DIR="${DIR-fanroc-game}"
PORT="${PORT-8090}"
BIND="${BIND-0.0.0.0}"
DRY_RUN="${DRY_RUN-}"
CONFIRM="${CONFIRM-}"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  sed -n '2,15p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//' >&2
  exit 2
}

die() { echo "event-201: $*" >&2; exit 2; }

# ---- đọc tham số ----
cmd=""
for a in "$@"; do
  case "$a" in
    --yes) CONFIRM=yes ;;
    -h|--help) usage ;;
    build|push|start|stop|status) [ -z "$cmd" ] || die "chỉ một lệnh con"; cmd="$a" ;;
    *) die "tham số lạ: $a" ;;
  esac
done
[ -n "$cmd" ] || usage

# ---- kiểm tra giá trị (chặn rsync --delete trúng thư mục nhà / gốc) ----
[ -n "$HOST" ] || die "HOST rỗng"
[[ "$HOST" =~ ^[A-Za-z0-9._-]+$ ]] || die "HOST không hợp lệ: $HOST"
if [ -n "$SSH_USER" ]; then
  [[ "$SSH_USER" =~ ^[A-Za-z0-9._-]+$ ]] || die "SSH_USER không hợp lệ"
  TARGET="$SSH_USER@$HOST"
else
  TARGET="$HOST"
fi
[ -n "$DIR" ] || die "DIR rỗng"
case "$DIR" in
  /|'~'|.|..|./|../|/*|'~'*|*..*) die "DIR không an toàn: '$DIR' (phải là thư mục con tương đối của thư mục nhà, ví dụ fanroc-game)" ;;
esac
[[ "$DIR" =~ ^[A-Za-z0-9._/-]+$ ]] || die "DIR chứa ký tự lạ: $DIR"
DIR="${DIR%/}"
[[ "$PORT" =~ ^[0-9]+$ ]] && [ "$PORT" -gt 1024 ] && [ "$PORT" -le 65535 ] || die "PORT phải trong 1025..65535 (không dùng sudo)"
[[ "$BIND" =~ ^[0-9A-Fa-f.:]+$ ]] || die "BIND không hợp lệ: $BIND"

SSH_OPTS=(-o BatchMode=yes -o ConnectTimeout=8)

checklist() {
  cat >&2 <<'TXT'
=== CHECKLIST TRƯỚC KHI CÔNG KHAI (docs/fanroc/phat-hanh.md) ===
 [ ] Lưới núi CAD (src/fanroc/assets/mountain-mesh.json) là của anh Tuấn: CẦN anh OK trước mọi sự kiện công khai.
 [ ] Tên / logo FANROC: đã có đồng ý của ban tổ chức.
 [ ] Link mã nguồn AGPL hiện rõ và bấm được.
 [ ] Link ThingBlock: hiện chưa có (THINGBLOCK_URL rỗng) - xác nhận đúng ý.
 [ ] Câu chữ luật thi đã được anh Tuấn duyệt.
 [ ] Nhiệm vụ 9 đã chơi thử.
TXT
}

need_confirm() {
  checklist
  if [ "$CONFIRM" != yes ]; then
    echo "event-201: '$cmd' chỉ chạy khi xác nhận rõ: thêm --yes (hoặc CONFIRM=yes) sau khi đã qua checklist trên." >&2
    exit 3
  fi
}

run() {
  if [ -n "$DRY_RUN" ]; then
    printf '[DRY_RUN]'; printf ' %q' "$@"; printf '\n'
  else
    "$@"
  fi
}

# Chạy một đoạn bash trên máy 201 qua stdin (không nội suy giá trị chưa kiểm tra).
remote() {
  local script="$1"
  if [ -n "$DRY_RUN" ]; then
    printf '[DRY_RUN] ssh %s %s bash -s <<SCRIPT\n%s\nSCRIPT\n' "${SSH_OPTS[*]}" "$TARGET" "$script"
  else
    ssh "${SSH_OPTS[@]}" "$TARGET" bash -s <<<"$script"
  fi
}

# Phần chung: vào thư mục DIR, nạp biến pid.
remote_prelude() {
  cat <<EOS
set -eu
DIR='$DIR'
PORT='$PORT'
BIND='$BIND'
cd "\$HOME/\$DIR"
ABS="\$PWD"
PIDFILE="\$ABS/server.pid"
EOS
}

case "$cmd" in
  build)
    cd "$ROOT"
    run npm run build:game
    ;;

  push)
    need_confirm
    if [ ! -f "$ROOT/dist-game/index.html" ] && [ -z "$DRY_RUN" ]; then
      die "chưa có dist-game/index.html - chạy '$0 build' trước"
    fi
    remote "set -eu; mkdir -p \"\$HOME/$DIR/site\""
    # --delete chỉ trong thư mục site/ con của DIR, không bao giờ thư mục nhà.
    run rsync -az --delete -e "ssh ${SSH_OPTS[*]}" "$ROOT/dist-game/" "$TARGET:$DIR/site/"
    echo "event-201: đã đẩy dist-game/ -> $TARGET:~/$DIR/site/ (chưa bật máy chủ; dùng 'start --yes')" >&2
    ;;

  start)
    need_confirm
    remote "$(remote_prelude)
[ -f \"\$ABS/site/index.html\" ] || { echo 'chưa có site/index.html - chạy push trước' >&2; exit 1; }
if [ -f \"\$PIDFILE\" ] && kill -0 \"\$(cat \"\$PIDFILE\")\" 2>/dev/null; then
  echo \"đang chạy sẵn (pid \$(cat \"\$PIDFILE\"))\"; exit 0
fi
if command -v caddy >/dev/null 2>&1; then
  printf '{\\n\\tadmin off\\n}\\n:%s {\\n\\tbind %s\\n\\troot * %s/site\\n\\tfile_server\\n}\\n' \"\$PORT\" \"\$BIND\" \"\$ABS\" > \"\$ABS/Caddyfile\"
  nohup caddy run --config \"\$ABS/Caddyfile\" --adapter caddyfile > \"\$ABS/server.log\" 2>&1 < /dev/null &
else
  nohup python3 -m http.server \"\$PORT\" --bind \"\$BIND\" --directory \"\$ABS/site\" > \"\$ABS/server.log\" 2>&1 < /dev/null &
fi
echo \$! > \"\$PIDFILE\"
sleep 1
kill -0 \"\$(cat \"\$PIDFILE\")\" 2>/dev/null || { echo 'máy chủ không lên được, xem server.log' >&2; exit 1; }
echo \"đã bật (pid \$(cat \"\$PIDFILE\"))\""
    echo "event-201: địa chỉ trong mạng LAN: http://$HOST:$PORT/" >&2
    ;;

  stop)
    remote "$(remote_prelude)
[ -f \"\$PIDFILE\" ] || { echo 'không có server.pid - không có gì để tắt'; exit 0; }
PID=\"\$(cat \"\$PIDFILE\")\"
case \"\$PID\" in ''|*[!0-9]*) echo 'server.pid hỏng, không tắt gì'; exit 1;; esac
if kill -0 \"\$PID\" 2>/dev/null; then
  # Chỉ tắt nếu tiến trình đúng là máy chủ của thư mục này.
  if ps -o args= -p \"\$PID\" | grep -qF \"\$ABS/\"; then
    kill \"\$PID\"; echo \"đã tắt pid \$PID\"
  else
    echo \"pid \$PID không phải máy chủ của \$ABS - không động tới\" >&2; exit 1
  fi
else
  echo 'tiến trình đã tắt từ trước'
fi
rm -f \"\$PIDFILE\""
    ;;

  status)
    remote "$(remote_prelude)
if [ -f \"\$PIDFILE\" ] && kill -0 \"\$(cat \"\$PIDFILE\")\" 2>/dev/null; then
  echo \"đang chạy (pid \$(cat \"\$PIDFILE\")) - http://\$BIND:\$PORT/\"
else
  echo 'không chạy'
fi"
    ;;
esac
