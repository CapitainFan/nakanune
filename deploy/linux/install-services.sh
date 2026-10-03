#!/usr/bin/env bash
# Делает из ноутбука с Ubuntu постоянный сервер Nakanune:
#   - служба nakanune-api — сервер (pnpm start:server), перезапускается, если упал;
#   - служба nakanune-ngrok — туннель на постоянный домен ngrok;
#   - закрытая крышка и бездействие не усыпляют ноутбук.
# Всё стартует само при включении. Запуск из папки репозитория:
#   ./deploy/linux/install-services.sh <домен>.ngrok-free.app
set -euo pipefail

DOMAIN="${1:?Укажи домен ngrok: ./deploy/linux/install-services.sh <домен>.ngrok-free.app}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
RUN_AS="$(id -un)"
NODE_BIN="$(command -v node || true)"
PNPM_BIN="$(command -v pnpm || true)"
NGROK_BIN="$(command -v ngrok || true)"

if [[ "$RUN_AS" == "root" ]]; then
  echo "Запускай от своего пользователя, не от root: скрипт сам попросит sudo" >&2
  exit 1
fi
for tool in NODE_BIN PNPM_BIN NGROK_BIN; do
  if [[ -z "${!tool}" ]]; then
    echo "Не найден ${tool%_BIN}: сначала установи его (см. README, раздел про ноутбук)" >&2
    exit 1
  fi
done
if [[ ! -f "$REPO/.env" ]]; then
  echo "Нет $REPO/.env — скопируй .env.example в .env и заполни" >&2
  exit 1
fi
if ! grep -qE '^API_TOKEN=.{32,}' "$REPO/.env"; then
  echo "В .env не задан API_TOKEN (32+ символа): без него сервер не пустит запросы через ngrok" >&2
  exit 1
fi

# systemd не видит PATH из ~/.bashrc — передаём папки node и pnpm явно
SERVICE_PATH="$(dirname "$NODE_BIN"):$(dirname "$PNPM_BIN"):/usr/local/bin:/usr/bin:/bin"

echo "→ Служба сервера"
sudo tee /etc/systemd/system/nakanune-api.service >/dev/null <<UNIT
[Unit]
Description=Nakanune API
# База — контейнер Docker (restart: unless-stopped), она поднимается вместе с Docker
After=network-online.target docker.service
Wants=network-online.target docker.service

[Service]
User=$RUN_AS
WorkingDirectory=$REPO
Environment=PATH=$SERVICE_PATH
ExecStart=$PNPM_BIN start:server
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

echo "→ Служба ngrok"
sudo tee /etc/systemd/system/nakanune-ngrok.service >/dev/null <<UNIT
[Unit]
Description=ngrok tunnel for Nakanune API
After=network-online.target nakanune-api.service
Wants=network-online.target

[Service]
# authtoken ngrok лежит в конфиге этого пользователя (ngrok config add-authtoken)
User=$RUN_AS
ExecStart=$NGROK_BIN http --url=$DOMAIN 4000 --log=stdout
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
UNIT

echo "→ Крышка и сон"
sudo mkdir -p /etc/systemd/logind.conf.d
sudo tee /etc/systemd/logind.conf.d/nakanune-lid.conf >/dev/null <<'CONF'
# Закрытая крышка не усыпляет ноутбук: он работает сервером
[Login]
HandleLidSwitch=ignore
HandleLidSwitchExternalPower=ignore
HandleLidSwitchDocked=ignore
IdleAction=ignore
CONF
sudo systemctl mask sleep.target suspend.target hibernate.target hybrid-sleep.target >/dev/null

echo "→ Запуск"
sudo systemctl daemon-reload
sudo systemctl enable --now docker >/dev/null 2>&1 || true
sudo systemctl enable --now nakanune-api.service nakanune-ngrok.service

cat <<DONE

Готово. Сервер: https://$DOMAIN (проверка: https://$DOMAIN/api/health)
Настройка крышки применится после перезагрузки: sudo reboot
Логи:      journalctl -u nakanune-api -f   |   journalctl -u nakanune-ngrok -f
Обновить:  git pull && pnpm install && pnpm db:deploy && sudo systemctl restart nakanune-api
DONE
