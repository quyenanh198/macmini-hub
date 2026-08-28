# macmini-hub

Stack tích hợp chạy trên Mac Mini (Apple Silicon + OrbStack).

## Chạy

    cp .env.example .env   # điền token
    docker compose up -d                    # core: dashboard + logs + tunnel
    docker compose --profile apps up -d     # kèm apps

## Cấu trúc

- `docker-compose.yml` — toàn bộ services
- `config/homepage/` — config dashboard
- `scripts/` — startup + cài LaunchAgent
- `docs/` — runbook setup Mac Mini, design, plans
