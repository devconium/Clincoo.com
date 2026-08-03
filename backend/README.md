# Clincoo Backend — Cloudflare Worker

Backend API untuk Clincoo, ditenagai oleh Cloudflare Workers + D1 Database.

## Keamanan

- API Key disimpan sebagai Cloudflare Secret (`BACKEND_API_KEY`) — tidak ada di kode, tidak bisa diubah dari frontend
- Bot Protection: deteksi User-Agent mencurigakan, blok IP kosong
- Rate Limiting: 60 request/menit per IP (auto-block 5 menit jika exceed)
- IP Blocking: block/unblock manual via API
- Security Headers: X-Content-Type-Options, X-Frame-Options, X-XSS-Protection, HSTS, Referrer-Policy
- SQL Injection Protection: block DROP DATABASE, DETACH, ATTACH
- API Key Auth: semua endpoint (kecuali /api/health) butuh X-API-Key header

## Database (Cloudflare D1)

7 Tables:
- `projects` — daftar proyek
- `files` — file proyek (html, css, js, dll)
- `deployments` — record deployment (building -> ready)
- `env_vars` — environment variables per proyek
- `settings` — settings per proyek (JSON)
- `rate_limits` — tracking rate limit per IP
- `blocked_ips` — daftar IP yang di-block

## API Endpoints

### Projects
- `GET /api/projects` — list semua proyek
- `POST /api/projects` — buat proyek baru
- `GET /api/projects/:id` — detail proyek
- `PUT /api/projects/:id` — update proyek
- `DELETE /api/projects/:id` — hapus proyek (+ semua data terkait)

### Files
- `GET /api/projects/:id/files` — list file proyek
- `POST /api/projects/:id/files` — tambah file
- `PUT /api/projects/:id/files/:fid` — update file
- `DELETE /api/projects/:id/files/:fid` — hapus file

### Deployments
- `GET /api/projects/:id/deployments` — list deployment
- `POST /api/projects/:id/deployments` — trigger deploy (auto building -> ready)
- `GET /api/deployments/:id` — detail deployment

### Env Vars
- `GET /api/projects/:id/env` — list env vars
- `POST /api/projects/:id/env` — tambah env var
- `DELETE /api/env/:id` — hapus env var

### Settings
- `GET /api/projects/:id/settings` — get settings
- `PUT /api/projects/:id/settings` — update settings

### SQL
- `POST /api/sql` — eksekusi SQL query (read-only safe)

### Security
- `GET /api/security/blocked-ips` — list IP di-block
- `POST /api/security/block-ip` — block IP
- `POST /api/security/unblock-ip` — unblock IP
- `GET /api/security/stats` — statistik keamanan

### Database
- `GET /api/database/tables` — list tables
- `GET /api/database/schema` — schema semua tables

### Health
- `GET /api/health` — status backend (no auth needed)

## Deployment

Worker sudah terdeploy di:
`https://clincoo-backend.clincoo.workers.dev`

Untuk update:
```bash
wrangler deploy
```

API Key sudah diset sebagai Cloudflare Secret, tidak perlu di-set lagi.
