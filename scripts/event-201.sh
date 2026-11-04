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
[[ "$HOST" =~ ^[A-Za-z0-9]([A-Za-z0-9._-]*[A-Za-z0-9])?$ ]] || die "HOST không hợp lệ (không được bắt đầu bằng '-'): $HOST"
if [ -n "$SSH_USER" ]; then
  [[ "$SSH_USER" =~ ^[A-Za-z0-9_]([A-Za-z0-9._-]*[A-Za-z0-9_])?$ ]] || die "SSH_USER không hợp lệ (không được bắt đầu bằng '-')"
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

# Thông báo thành công: ở DRY_RUN thì gắn nhãn, không giả như đã làm.
say() {
  if [ -n "$DRY_RUN" ]; then echo "[DRY_RUN] (sẽ báo) event-201: $*" >&2; else echo "event-201: $*" >&2; fi
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
    printf '[DRY_RUN] ssh %s -- %s bash -s <<SCRIPT\n%s\nSCRIPT\n' "${SSH_OPTS[*]}" "$TARGET" "$script"
  else
    ssh "${SSH_OPTS[@]}" -- "$TARGET" bash -s <<<"$script"
  fi
}

# Phần chung: vào thư mục DIR, nạp biến pid.
# $1 = mã thoát khi chưa có thư mục (0 cho stop/status, 1 cho start).
remote_prelude() {
  cat <<EOS
set -eu
DIR='$DIR'
PORT='$PORT'
BIND='$BIND'
cd "\$HOME/\$DIR" 2>/dev/null || { echo "chưa có thư mục ~/\$DIR trên máy 201 (chưa push lần nào)"; exit ${1:-0}; }
ABS="\$PWD"
PIDFILE="\$ABS/server.pid"
# Tiến trình có đúng là máy chủ của thư mục này không (chống PID bị dùng lại).
ours() {
  local a
  a="\$(ps -o args= -p "\$1" 2>/dev/null)" || return 1
  case "\$a" in
    *http.server*"\$ABS/site"*) return 0 ;;
    *"caddy run"*"\$ABS/Caddyfile"*) return 0 ;;
  esac
  return 1
}
# Trả 0 nếu pidfile trỏ tới máy chủ đang chạy; ngược lại dọn pidfile cũ.
running() {
  [ -f "\$PIDFILE" ] || return 1
  local pid
  pid="\$(cat "\$PIDFILE")"
  case "\$pid" in ''|*[!0-9]*) rm -f "\$PIDFILE"; return 1;; esac
  if kill -0 "\$pid" 2>/dev/null && ours "\$pid"; then return 0; fi
  rm -f "\$PIDFILE"; return 1
}
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
    run rsync -az --delete -e "ssh ${SSH_OPTS[*]}" -- "$ROOT/dist-game/" "$TARGET:$DIR/site/"
    say "đã đẩy dist-game/ -> $TARGET:~/$DIR/site/ (chưa bật máy chủ; dùng 'start --yes')"
    ;;

  start)
    need_confirm
    remote "$(remote_prelude 1)
[ -f \"\$ABS/site/index.html\" ] || { echo 'chưa có site/index.html - chạy push trước' >&2; exit 1; }
if running; then
  echo \"đang chạy sẵn (pid \$(cat \"\$PIDFILE\"))\"; exit 0
fi
if command -v caddy >/dev/null 2>&1; then
  printf '{\\n\\tadmin off\\n}\\n:%s {\\n\\tbind %s\\n\\troot * %s/site\\n\\tfile_server\\n}\\n' \"\$PORT\" \"\$BIND\" \"\$ABS\" > \"\$ABS/Caddyfile\"
  nohup caddy run --config \"\$ABS/Caddyfile\" --adapter caddyfile > \"\$ABS/server.log\" 2>&1 < /dev/null &
else
  nohup python3 -m http.server \"\$PORT\" --bind \"\$BIND\" --directory \"\$ABS/site\" > \"\$ABS/server.log\" 2>&1 < /dev/null &
fi
PID=\$!
echo \"\$PID\" > \"\$PIDFILE\"
# Chờ tối đa ~5 s cho máy chủ nhận kết nối (caddy chậm hơn python).
for _ in 1 2 3 4 5 6 7 8 9 10; do
  kill -0 \"\$PID\" 2>/dev/null || break
  if (exec 3<>\"/dev/tcp/127.0.0.1/\$PORT\") 2>/dev/null; then echo \"đã bật (pid \$PID)\"; exit 0; fi
  sleep 0.5
done
kill -0 \"\$PID\" 2>/dev/null && ours \"\$PID\" && kill \"\$PID\" 2>/dev/null || true
rm -f \"\$PIDFILE\"
echo 'máy chủ không lên được, xem ~/'\"\$DIR\"'/server.log' >&2; exit 1"
    say "địa chỉ trong mạng LAN: http://$HOST:$PORT/"
    ;;

  stop)
    remote "$(remote_prelude 0)
if running; then
  PID=\"\$(cat \"\$PIDFILE\")\"
  kill \"\$PID\"; rm -f \"\$PIDFILE\"; echo \"đã tắt pid \$PID\"
else
  echo 'không có máy chủ của kịch bản này đang chạy - không tắt gì'
fi"
    ;;

  status)
    remote "$(remote_prelude 0)
if running; then
  echo \"đang chạy (pid \$(cat \"\$PIDFILE\")) - http://$HOST:\$PORT/\"
else
  echo 'không chạy'
fi"
    ;;
esac
