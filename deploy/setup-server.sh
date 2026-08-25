#!/usr/bin/env bash
# pet_project 배포 서버 1회 셋업 — EC2에서 딱 한 번 실행한다.
#
#   sudo bash setup-server.sh <도메인> [인증서용_이메일]
#   예) sudo bash setup-server.sh pet-project.duckdns.org me@example.com
#
# 이 스크립트는 **자체 완결형**이다(systemd 유닛·nginx 설정을 안에서 직접 쓴다).
# EC2에 저장소를 클론하지 않아도 되게 하려는 것 — 비공개 저장소면 EC2에 인증을 심어야 하고,
# 그러면 배포 서버가 소스 접근 권한까지 갖게 된다(배포는 산출물만 받으면 된다).
#
# 하는 일: 패키지 설치(Java 21·nginx·certbot) → 디렉터리·비밀값 파일 → systemd 유닛 →
#          nginx 설정 → HTTPS 인증서. **여러 번 실행해도 안전하다**(기존 비밀값 파일은 덮어쓰지 않는다).
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [ -z "$DOMAIN" ]; then
  echo "사용법: sudo bash setup-server.sh <도메인> [이메일]" >&2
  exit 1
fi
if [ "$(id -u)" -ne 0 ]; then
  echo "root 권한이 필요하다: sudo bash setup-server.sh $DOMAIN" >&2
  exit 1
fi

# 서비스를 돌릴 계정 — Ubuntu는 ubuntu, Amazon Linux는 ec2-user.
# sudo로 실행되므로 원래 로그인 사용자를 SUDO_USER에서 가져온다
SERVICE_USER="${SUDO_USER:-$(logname 2>/dev/null || echo ubuntu)}"

echo "==> 대상 도메인: $DOMAIN / 서비스 계정: $SERVICE_USER"

# ---------------------------------------------------------------- 패키지
if command -v apt-get >/dev/null 2>&1; then
  PKG=apt
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  # 필수 패키지 먼저 — 이것들이 없으면 진행 자체가 불가능하다
  apt-get install -y nginx curl ca-certificates
  # certbot은 배포판이 아주 최신이면 apt에 없을 수 있다(예: Ubuntu 26.04).
  # 실패해도 스크립트를 죽이지 않고 snap으로 대체한다 — HTTPS는 나중에 붙여도 되지만
  # 나머지 셋업은 지금 끝나는 편이 낫다
  if ! apt-get install -y certbot python3-certbot-nginx; then
    echo "==> apt에 certbot이 없어 snap으로 설치를 시도한다"
    if apt-get install -y snapd && snap install core && snap refresh core \
       && snap install --classic certbot; then
      ln -sf /snap/bin/certbot /usr/bin/certbot
    else
      echo "!!  certbot 설치 실패 — 나머지 셋업은 계속하고 HTTPS만 나중에 붙인다"
    fi
  fi
  # Java 21 — 배포판 패키지를 먼저 시도하고, 없으면 Amazon Corretto 저장소를 붙인다
  if ! apt-get install -y openjdk-21-jre-headless; then
    echo "==> openjdk-21이 없어 Corretto 21을 설치한다"
    apt-get install -y wget gnupg
    wget -qO- https://apt.corretto.aws/corretto.key | gpg --dearmor -o /usr/share/keyrings/corretto.gpg
    echo "deb [signed-by=/usr/share/keyrings/corretto.gpg] https://apt.corretto.aws stable main" \
      > /etc/apt/sources.list.d/corretto.list
    apt-get update -y
    apt-get install -y java-21-amazon-corretto-jdk
  fi
  # Ubuntu 기본 사이트가 80을 default_server로 잡고 있어 우리 설정과 충돌한다
  rm -f /etc/nginx/sites-enabled/default
elif command -v dnf >/dev/null 2>&1; then
  PKG=dnf
  dnf update -y
  dnf install -y java-21-amazon-corretto-headless nginx certbot python3-certbot-nginx curl
else
  echo "지원하지 않는 배포판이다(apt·dnf 없음)." >&2
  exit 1
fi

echo "==> Java: $(java -version 2>&1 | head -1)"

# ---------------------------------------------------------------- 디렉터리
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" /opt/pet-backend
install -d -o root -g root -m 750 /etc/pet-backend
install -d /var/www/pet-frontend /var/www/html

# ---------------------------------------------------------------- 비밀값 파일
# 이미 있으면 절대 건드리지 않는다 — 재실행으로 운영 중인 값을 날리지 않게
if [ ! -f /etc/pet-backend/app.env ]; then
  cat > /etc/pet-backend/app.env <<ENVTEMPLATE
# pet_project 배포 환경변수 — 로컬 pet_backend/.env를 참고해 값을 채운다.
# 주의: 값에 따옴표를 붙이지 않는다(systemd가 따옴표까지 값의 일부로 읽는다).

# Supabase PostgreSQL (트랜잭션 풀러 6543 + ?prepareThreshold=0 유지)
DB_URL=
DB_USERNAME=
DB_PASSWORD=

# JWT — 배포용으로 새로 만드는 것을 권장: openssl rand -base64 48
JWT_SECRET=
JWT_EXPIRATION_MS=900000

# Supabase Storage (프로필·채팅 이미지)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# 카카오 (소셜 로그인 / 지도·장소 REST)
KAKAO_OAUTH_CLIENT_ID=
KAKAO_OAUTH_CLIENT_SECRET=
KAKAO_REST_API_KEY=

# 선택 — 없으면 해당 기능만 폴백/비활성
KMA_SERVICE_KEY=
ANTHROPIC_API_KEY=
AI_SERVER_URL=

# 배포 고정값 (https 전제 — 이 두 줄은 그대로 두면 된다)
COOKIE_SECURE=true
CORS_ALLOWED_ORIGINS=https://$DOMAIN
ENVTEMPLATE
  chmod 600 /etc/pet-backend/app.env
  echo "==> /etc/pet-backend/app.env 템플릿을 만들었다 — **값을 채워야 백엔드가 뜬다**"
else
  echo "==> /etc/pet-backend/app.env 가 이미 있어 건드리지 않았다"
fi

# ---------------------------------------------------------------- systemd
cat > /etc/systemd/system/pet-backend.service <<UNIT
[Unit]
Description=pet_project backend (Spring Boot)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$SERVICE_USER
WorkingDirectory=/opt/pet-backend
EnvironmentFile=/etc/pet-backend/app.env
# 서버 시간대 고정 (리뷰 백로그 61번)
Environment=TZ=Asia/Seoul
# 힙 상한 512m — 프리티어 1GB에서 nginx와 함께 떠야 한다(상한이 없으면 OOM Killer에 죽는다)
ExecStart=/usr/bin/java -Xms256m -Xmx512m -jar /opt/pet-backend/app.jar --spring.profiles.active=prod
SuccessExitStatus=143
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable pet-backend >/dev/null
echo "==> systemd 유닛 등록 완료 (jar가 아직 없으므로 start는 첫 배포 후)"

# ---------------------------------------------------------------- nginx
cat > /etc/nginx/conf.d/pet.conf <<NGINX
server {
    listen 80;
    server_name $DOMAIN;

    # 인증서 발급·갱신용 challenge 경로
    location /.well-known/acme-challenge/ { root /var/www/html; }

    # certbot이 아래를 443 리다이렉트로 바꾼다
    location / { try_files \$uri \$uri/ /index.html; }
    root /var/www/pet-frontend;
    index index.html;

    # 업로드 한도 — 기본 1MB면 사진·영상 업로드가 413으로 죽고 서버 로그엔 아무것도 안 남는다
    client_max_body_size 60M;

    location /api/ {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    # WebSocket (STOMP 채팅) — Upgrade 헤더가 없으면 REST는 되는데 실시간만 조용히 죽는다
    location /ws {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade    \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host       \$host;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # STOMP 하트비트를 쓰지 않으므로 기본 60초 타임아웃이면 조용한 방의 연결이 1분마다 끊긴다
        proxy_read_timeout  3600s;
        proxy_send_timeout  3600s;
    }
}
NGINX

nginx -t
systemctl enable nginx >/dev/null
systemctl restart nginx
echo "==> nginx 설정 적용 완료"

# ---------------------------------------------------------------- HTTPS
# DNS가 이 서버를 가리켜야 발급된다 — 아직이면 건너뛰고 안내만 한다
RESOLVED="$(getent hosts "$DOMAIN" | awk '{print $1}' | head -1 || true)"
MYIP="$(curl -s -m 5 https://checkip.amazonaws.com || true)"
if ! command -v certbot >/dev/null 2>&1; then
  echo "!!  certbot이 설치되지 않아 HTTPS 발급을 건너뛴다 (셋업의 나머지는 완료됐다)"
  echo "    나중에: sudo snap install --classic certbot && sudo certbot --nginx -d $DOMAIN --redirect"
elif [ -n "$RESOLVED" ] && [ "$RESOLVED" = "$MYIP" ]; then
  if [ -n "$EMAIL" ]; then
    certbot --nginx -d "$DOMAIN" --agree-tos -m "$EMAIL" --redirect -n
  else
    certbot --nginx -d "$DOMAIN" --agree-tos --register-unsafely-without-email --redirect -n
  fi
  echo "==> HTTPS 인증서 발급 완료 (갱신은 certbot 타이머가 자동 처리)"
else
  echo "!!  DNS가 아직 이 서버를 가리키지 않아 인증서 발급을 건너뛴다"
  echo "    도메인 조회 결과: ${RESOLVED:-없음} / 이 서버 공인 IP: ${MYIP:-확인 실패}"
  echo "    DuckDNS에 공인 IP를 등록한 뒤 다시 실행하거나 아래를 직접 실행할 것:"
  echo "      sudo certbot --nginx -d $DOMAIN --agree-tos -m <메일> --redirect"
fi

echo
echo "================ 다음 할 일 ================"
echo "1) sudo nano /etc/pet-backend/app.env   ← 값 채우기 (이걸 안 하면 백엔드가 못 뜬다)"
echo "2) GitHub Secrets 등록 후 main 브랜치 push → Actions가 배포"
echo "3) 배포 후 확인:  sudo journalctl -u pet-backend -f"
echo "============================================"
