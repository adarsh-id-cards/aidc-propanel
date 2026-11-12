# Pro Panel — Enterprise Deployment Manual & Single Source of Truth (SSOT)
### Decoupled Architecture: Main Domain (Frontend SPA) + API Subdomain (Backend Engine)

---

## 1. Architectural Architecture & Domain Topology

Pro Panel operates on a **decoupled production topology**:

```
                              ┌──────────────────────────────────────────────┐
                              │            Clients / Web Browsers            │
                              └──────────────────────┬───────────────────────┘
                                                     │
                          ┌──────────────────────────┴──────────────────────────┐
                          │                                                     │
       HTTPS Requests for UI Assets                           HTTPS API Calls & WebSockets
       (e.g., https://panel.yourdomain.com)                   (e.g., https://api.yourdomain.com)
                          │                                                     │
                          ▼                                                     ▼
        ┌──────────────────────────────────┐                  ┌──────────────────────────────────┐
        │       FRONTEND WEB SERVER        │                  │      BACKEND REVERSE PROXY       │
        │   (Nginx / Vercel / Cloudflare)  │                  │     (Nginx + SSL Termination)    │
        └─────────────────┬────────────────┘                  └─────────────────┬────────────────┘
                          │                                                     │
                 Serves built assets                                  Reverse-proxies to:
             (frontend/dist/index.html)                                         │
                                                                                ▼
                                                              ┌──────────────────────────────────┐
                                                              │       DJANGO ASGI ENGINE         │
                                                              │   (Gunicorn + UvicornWorker)     │
                                                              │          Port: 8000              │
                                                              └──────┬────────────────────┬──────┘
                                                                     │                    │
                                            ┌────────────────────────┴────────┐  ┌────────┴────────┐
                                            │                                 │  │                 │
                                            ▼                                 ▼  ▼                 ▼
                                   ┌────────────────┐                ┌────────────────┐    ┌──────────────┐
                                   │ PostgreSQL 16+ │                │ Redis 7 Server │    │ Persistent   │
                                   │  (Relational)  │                │(Cache/Channels)│    │ Storage Disk │
                                   └────────────────┘                └────────────────┘    │(mediafiles)  │
                                                                                           └──────────────┘
```

| Component | Host / Domain Layer | Technology Stack | Purpose |
| :--- | :--- | :--- | :--- |
| **Frontend** | **Main Domain** (`https://panel.yourdomain.com` or `https://yourdomain.com`) | React 19, Vite 8, TanStack Virtual | Client-side Single Page Application (SPA), data grids, image cropper, portals. |
| **Backend API** | **API Subdomain** (`https://api.yourdomain.com`) | Python 3.11, Django 5.2, Channels 4.2 | Headless REST API, background exports, batch processing, WebSockets. |
| **Database** | Private Network | PostgreSQL 16+ | Relational data, dynamic schemas, transactions, audit logs. |
| **Cache & Realtime**| Private Network | Redis 7+ | Session cache, OTP throttle, WebSocket channel layers. |
| **Media Storage** | Persistent Volume attached to Backend | Local Disk (`FileSystemStorage`) | ID card photos, profile avatars, generated PDF/ZIP exports. |

---

## 2. Complete File & Directory Map

```text
Adarsh Pro Panel/
├── DEPLOYMENT.md                     # Single Source of Truth for production rollout (this file)
├── README.md                         # Platform overview & development quick start
├── manage.py                         # Root proxy forwarding management commands to backend
├── package.json                      # Monorepo root scripts & node engine requirements
├── requirements.txt                  # Monorepo root python dependencies
├── .gitignore                        # Global ignore preventing secret & artifact leaks
│
├── deployment/                       # PRODUCTION DEPLOYMENT ASSETS
│   ├── Dockerfile                    # Multi-stage container build (Node builder + Python runtime)
│   ├── docker-compose.yml            # Multi-container orchestration (DB + Redis + Backend + Nginx)
│   └── nginx_example.conf            # Dual-server block Nginx configuration for Main + API Subdomain
│
├── frontend/                         # CLIENT-SIDE REACT SPA (MAIN DOMAIN)
│   ├── .env.example                  # Template for frontend environment variables
│   ├── package.json                  # Locked dependencies (@tanstack/react-virtual, axios, lucide)
│   ├── vite.config.js                # Vite build config with proxy fallbacks & chunk optimization
│   ├── index.html                    # Root HTML entry point
│   ├── public/                       # Static public assets (favicons, banners, fonts)
│   └── src/
│       ├── main.jsx                  # React DOM mount point
│       ├── App.jsx                   # Application router, shell state, view switcher
│       ├── services/
│       │   └── api.js                # Axios client configuring VITE_API_BASE_URL & CSRF headers
│       ├── components/               # UI components (auth, dashboard, table, reprint, portal)
│       └── styles/                   # Pure CSS design system & vendor styles
│
└── backend/                          # HEADLESS DJANGO REST & ASGI ENGINE (API SUBDOMAIN)
    ├── .env.example                  # Comprehensive production environment template
    ├── manage.py                     # Primary Django management script
    ├── requirements.txt              # Strict pinned production dependencies
    ├── config/                       # Application Core Configuration
    │   ├── settings.py               # Enterprise Django configuration (CORS, CSRF, Cache, Security)
    │   ├── urls.py                   # Canonical REST API routes & protected media view
    │   ├── asgi.py                   # ASGI entrypoint for Django Channels (WebSockets)
    │   ├── wsgi.py                   # WSGI fallback entrypoint
    │   └── gunicorn.conf.py          # Low-resource production worker tuning (UvicornWorker)
    │
    ├── core/                         # Auth models, permissions, middleware, task cleanup
    ├── accounts/                     # Session security, OTP, PIN, impersonation
    ├── organisation/                 # Tenant organisations, billing quotas, settings
    ├── tables/                       # Dynamic table schemas, candidate keys, data collection
    ├── mediafiles/                   # Image storage engine, thumbnail generation, access guards
    ├── operations/                   # Batch actions, approvals, history audits
    ├── exports/                      # Word, Excel, PDF, ZIP generation engine
    ├── imports/                      # Spreadsheet reader & folder photo matchers
    ├── reprint/                      # In-place reprint revision & badge tracking
    ├── stats/                        # Server load metrics, dashboard snapshots
    ├── mobile_api/                   # REST endpoints for field photographer Android app
    ├── desktop_app/                  # REST endpoints for on-premise print utilities
    ├── saas/                         # Tenant billing, feature licensing, subscriptions
    ├── static/                       # Backend default static assets & system banners
    └── templates/                    # Minimal HTML templates (only used for /app/ download page)
```

---

## 3. Decoupled Cross-Origin Security Configuration

Because the Frontend resides on the **Main Domain** (`https://panel.yourdomain.com`) and the Backend on the **API Subdomain** (`https://api.yourdomain.com`), the browser enforces Cross-Origin Resource Sharing (CORS) and SameSite cookie rules.

### A. CORS Configuration (`backend/config/settings.py`)
All mutating API calls (`POST`, `PUT`, `DELETE`, `PATCH`) require credentials (cookies):
- `CORS_ALLOW_CREDENTIALS = True`
- `CORS_ALLOWED_ORIGINS` must include the exact frontend origin:
  ```ini
  CORS_ALLOWED_ORIGINS=https://panel.yourdomain.com,https://yourdomain.com
  ```

### B. CSRF Trusted Origins
Django's CSRF protection validates the HTTP `Origin` header against `CSRF_TRUSTED_ORIGINS`:
```ini
CSRF_TRUSTED_ORIGINS=https://panel.yourdomain.com,https://api.yourdomain.com
```

### C. Cookie SameSite & Domain Handling
- **When Frontend & Backend share the same root domain** (e.g., `panel.yourdomain.com` and `api.yourdomain.com` share `yourdomain.com`):
  - They are considered **Same-Site** by modern browsers (same eTLD+1).
  - Default settings in backend work out of the box:
    ```ini
    SESSION_COOKIE_SAMESITE=Lax
    CSRF_COOKIE_SAMESITE=Lax
    ```
- **When Frontend & Backend use completely different domains** (e.g., `app.vercel.app` calling `api.onrender.com`):
  - They are **Cross-Site**.
  - You **MUST** configure `.env`:
    ```ini
    SESSION_COOKIE_SAMESITE=None
    CSRF_COOKIE_SAMESITE=None
    ```
  - Both session and CSRF cookies will include the `Secure; SameSite=None` attributes, allowing cross-site credentialed requests.

### D. Reverse Proxy SSL Header
When Django runs behind Nginx or Cloudflare that terminates SSL, Django needs to know the original request was HTTPS to prevent redirect loops and allow secure cookies:
```ini
SECURE_PROXY_SSL_HEADER_NAME=HTTP_X_FORWARDED_PROTO
SECURE_PROXY_SSL_HEADER_VALUE=https
```

---

## 4. Environment Variables Reference Matrix

### Backend (`backend/.env`)

| Variable Name | Required | Default | Recommended Production Value | Description |
| :--- | :---: | :--- | :--- | :--- |
| `DEBUG` | **Yes** | `False` | `False` | Disables verbose tracebacks & debug toolbar. |
| `SECRET_KEY` | **Yes** | *None* | `min 50 char random string` | Used for cryptographic signing and session validation. |
| `ALLOWED_HOSTS` | **Yes** | *None* | `api.yourdomain.com` | Comma-separated allowed hostnames for the backend. |
| `DATABASE_URL` | **Yes** | *None* | `postgres://user:pass@host:5432/db` | PostgreSQL connection string. |
| `REDIS_URL` | **Yes** | *None* | `redis://127.0.0.1:6379/1` | Redis connection for cache and WebSocket channel layer. |
| `CORS_ALLOWED_ORIGINS` | **Yes** | *None* | `https://panel.yourdomain.com` | Allowed frontend origin(s) with protocol. |
| `CSRF_TRUSTED_ORIGINS` | **Yes** | *None* | `https://panel.yourdomain.com,https://api.yourdomain.com` | Origins trusted for CSRF token submission. |
| `SECURE_SSL_REDIRECT` | No | `True` | `True` | Redirects non-HTTPS traffic to HTTPS. |
| `MEDIA_USE_XACCEL` | No | `False` | `True` (when using Nginx) | Enables zero-copy, internal X-Accel-Redirect media file serving. |
| `SESSION_COOKIE_SAMESITE` | No | `Lax` | `Lax` (or `None` if cross-site) | SameSite attribute for session cookie. |
| `CSRF_COOKIE_SAMESITE` | No | `Lax` | `Lax` (or `None` if cross-site) | SameSite attribute for CSRF cookie. |
| `DATA_UPLOAD_MAX_MEMORY_SIZE` | No | `536870912` | `536870912` (512MB) | Max upload body size for high-res card batch uploads. |
| `EMAIL_HOST` | No | `smtp.gmail.com` | Your SMTP host | SMTP mail server for password resets & invites. |
| `EMAIL_PORT` | No | `587` | `587` | SMTP port (typically 587 for TLS). |
| `EMAIL_HOST_USER` | No | *Empty* | `notifications@yourdomain.com`| SMTP username. |
| `EMAIL_HOST_PASSWORD` | No | *Empty* | `app-specific-password` | SMTP password. |
| `SENTRY_DSN` | No | *Empty* | `https://...` | Sentry error monitoring DSN (optional). |

### Frontend (`frontend/.env` or Host Environment)

| Variable Name | Required | Default | Recommended Production Value | Description |
| :--- | :---: | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | **Yes** | *Empty (proxied)* | `https://api.yourdomain.com` | The public URL of the backend API subdomain (no trailing slash). |

---

## 5. Production Nginx Configuration (Dual Server Blocks)

The complete Nginx configuration file is maintained at [deployment/nginx_example.conf](file:///E:/E/Adarsh%20Pro%20Panel/deployment/nginx_example.conf).

### Block 1: Frontend Main Domain (`panel.yourdomain.com`)
```nginx
server {
    listen 80;
    server_name panel.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name panel.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/panel.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/panel.yourdomain.com/privkey.pem;

    root /var/www/pro-panel/frontend/dist;
    index index.html;

    # SPA Client-Side Fallback
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-store, no-cache, must-revalidate";
    }

    # Bundled Assets Immutable Cache
    location ~* \.(?:css|js|woff2?|ttf|svg|png|jpg|jpeg|webp|ico)$ {
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }
}
```

### Block 2: Backend API Subdomain (`api.yourdomain.com`)
```nginx
upstream django_backend {
    server 127.0.0.1:8000 fail_timeout=0;
    keepalive 32;
}

server {
    listen 80;
    server_name api.yourdomain.com;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name api.yourdomain.com;

    ssl_certificate /etc/letsencrypt/live/api.yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.yourdomain.com/privkey.pem;

    client_max_body_size 512M;

    # 1. Django Collected Staticfiles
    location /static/ {
        alias /var/www/pro-panel/backend/staticfiles/;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable";
        access_log off;
    }

    # 2. Protected Media via X-Accel-Redirect (Internal Only)
    location /protected-media/ {
        internal;
        alias /var/www/pro-panel/backend/media/;
    }

    # 3. Media Auth Gate (Passes to Django then X-Accel offloads)
    location /media/ {
        proxy_pass http://django_backend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # 4. Django Channels Real-Time WebSockets (/ws/)
    location /ws/ {
        proxy_pass http://django_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # 5. Core REST API Endpoints
    location / {
        proxy_pass http://django_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

---

## 6. Step-by-Step Deployment Runbooks

### Runbook A: Production Linux VPS (Ubuntu 22.04 / 24.04 LTS)

#### 1. System Packages & Runtime Prerequisites
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y python3.11 python3.11-venv python3.11-dev postgresql postgresql-contrib \
    redis-server nginx git curl build-essential libpq-dev \
    libcairo2 libpango-1.0-0 libpangocairo-1.0-0 libgdk-pixbuf2.0-0 libffi-dev shared-mime-info libgl1

# Install Node.js 22 LTS
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

#### 2. Configure PostgreSQL Database
```bash
sudo -u postgres psql
CREATE DATABASE propanel_db;
CREATE USER propanel_user WITH ENCRYPTED PASSWORD 'YOUR_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON DATABASE propanel_db TO propanel_user;
ALTER DATABASE propanel_db OWNER TO propanel_user;
\q
```

#### 3. Clone Repository & Setup Backend
```bash
sudo mkdir -p /var/www/pro-panel
sudo chown -R $USER:$USER /var/www/pro-panel
cd /var/www/pro-panel
git clone https://github.com/adarsh-id-cards/aidc-propanel.git .

# Create Python Virtual Environment
python3.11 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r backend/requirements.txt

# Configure Environment
cp backend/.env.example backend/.env
nano backend/.env
# (Configure SECRET_KEY, DEBUG=False, ALLOWED_HOSTS, DATABASE_URL, REDIS_URL, CORS, CSRF)

# Run Database Migrations & Collect Static
cd backend
python manage.py migrate
python manage.py collectstatic --noinput
python manage.py check --deploy
```

#### 4. Build Frontend for Main Domain
```bash
cd /var/www/pro-panel/frontend
# Create .env with the API subdomain target
echo "VITE_API_BASE_URL=https://api.yourdomain.com" > .env
npm ci
npm run build
# Built files will be in /var/www/pro-panel/frontend/dist
```

#### 5. Configure Systemd Service for Gunicorn (ASGI)
Create `/etc/systemd/system/propanel-backend.service`:
```ini
[Unit]
Description=Pro Panel Django ASGI Gunicorn Daemon
After=network.target postgresql.service redis-server.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/pro-panel/backend
ExecStart=/var/www/pro-panel/venv/bin/gunicorn \
    -c config/gunicorn.conf.py \
    config.asgi:application
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```
Enable and start the service:
```bash
sudo chown -R www-data:www-data /var/www/pro-panel/backend/media /var/www/pro-panel/backend/staticfiles
sudo systemctl daemon-reload
sudo systemctl enable propanel-backend
sudo systemctl start propanel-backend
sudo systemctl status propanel-backend
```

#### 6. Configure Nginx & SSL
```bash
sudo cp /var/www/pro-panel/deployment/nginx_example.conf /etc/nginx/sites-available/propanel
sudo ln -s /etc/nginx/sites-available/propanel /etc/nginx/sites-enabled/
sudo nginx -t

# Obtain Let's Encrypt SSL Certificates for both domains
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d panel.yourdomain.com -d api.yourdomain.com
sudo systemctl reload nginx
```

---

### Runbook B: Production Docker Compose Deployment

If deploying with Docker on a server:
1. Ensure Docker Engine and Docker Compose V2 are installed.
2. In `backend/.env`, configure production credentials:
   ```ini
   DEBUG=False
   SECRET_KEY=your_generated_secret_key
   ALLOWED_HOSTS=api.yourdomain.com
   CORS_ALLOWED_ORIGINS=https://panel.yourdomain.com
   CSRF_TRUSTED_ORIGINS=https://panel.yourdomain.com,https://api.yourdomain.com
   ```
3. In `frontend/`, create `.env`:
   ```ini
   VITE_API_BASE_URL=https://api.yourdomain.com
   ```
4. Build and start containers:
   ```bash
   docker compose -f deployment/docker-compose.yml up -d --build
   ```
5. Run migrations inside the container:
   ```bash
   docker compose -f deployment/docker-compose.yml exec backend python manage.py migrate
   ```

---

### Runbook C: Decoupled Cloud PaaS Deployment
*(e.g., Vercel / Netlify for Frontend + Render / Railway for Backend)*

#### 1. Frontend (Vercel or Netlify)
- **Root Directory**: `frontend`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**:
  - `VITE_API_BASE_URL`: `https://api.yourdomain.com`
- **Single Page Application Rewrite**:
  - On Vercel, ensure `vercel.json` contains:
    ```json
    { "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }
    ```
  - On Netlify, create `frontend/public/_redirects`:
    ```text
    /*    /index.html   200
    ```

#### 2. Backend (Render, Railway, or Fly.io)
- **Root Directory**: `backend` (or project root with `manage.py`)
- **Build Command**: `pip install -r backend/requirements.txt && python manage.py collectstatic --noinput`
- **Start Command**: `gunicorn -c config/gunicorn.conf.py config.asgi:application`
- **Persistent Disk**: **MANDATORY**. Mount a persistent volume at `/app/backend/media`.
- **Environment Variables**: Add all backend variables from Section 4.
- **Important**: Set `SESSION_COOKIE_SAMESITE=None` and `CSRF_COOKIE_SAMESITE=None` if the frontend domain and backend domain do not share the same root domain.

---

## 7. Day-1 Post-Deployment Verification & Smoke Tests

Run these checks immediately after deployment:

### 1. Healthcheck Test
```bash
curl -I https://api.yourdomain.com/api/health/
# Expected: HTTP/2 200 OK (returns JSON {"status": "ok", "version": "..."})
```

### 2. CSRF Token Handshake
```bash
curl -c cookies.txt https://api.yourdomain.com/api/auth/csrf/
# Expected: Sets csrftoken cookie with SameSite & Secure flags
```

### 3. Frontend App Mount Test
Open `https://panel.yourdomain.com` in an incognito browser window:
- Verify that the React login page mounts cleanly.
- Open Developer Tools (`F12`) -> Network tab:
  - Verify that requests to `https://api.yourdomain.com/api/auth/csrf/` and `https://api.yourdomain.com/api/auth/me/` return `200` and `401` (normal when not logged in) without CORS errors.
  - Check that cookies (`csrftoken`, `sessionid`) show `SameSite: Lax` (or `None`) and `Secure: true`.

### 4. Create Initial Super Admin
```bash
# On your server terminal / container:
cd /var/www/pro-panel/backend
python manage.py create_super_admin
# Follow interactive prompts to configure the initial tenant root admin
```

---

## 8. Common Troubleshooting & FAQs

### Q1: Browser console shows `CORS error: No 'Access-Control-Allow-Origin' header is present`
- **Cause**: The frontend origin is not in `CORS_ALLOWED_ORIGINS` on the backend.
- **Fix**: Check `backend/.env`. Ensure `CORS_ALLOWED_ORIGINS` includes `https://panel.yourdomain.com` (must include `https://`, exact port if non-standard, and NO trailing slash). Restart Gunicorn.

### Q2: 403 Forbidden: `CSRF verification failed. Request aborted.`
- **Cause 1**: `CSRF_TRUSTED_ORIGINS` is missing the frontend domain.
- **Cause 2**: Browser is not sending cookies because `SESSION_COOKIE_SAMESITE` is `Lax` across different registrable domains.
- **Fix**: Add the frontend domain to `CSRF_TRUSTED_ORIGINS`. If on different root domains (e.g. `vercel.app` vs `onrender.com`), set `SESSION_COOKIE_SAMESITE=None` and `CSRF_COOKIE_SAMESITE=None`.

### Q3: Uploaded card photos or generated exports disappear after restart
- **Cause**: Backend was deployed in a stateless container without a persistent volume.
- **Fix**: Mount a persistent storage volume to `/app/backend/media` (or `backend/media` on a VPS).

### Q4: Real-time WebSockets fail to connect (`/ws/...`)
- **Cause**: Nginx is not passing WebSocket upgrade headers, or Redis is not reachable.
- **Fix**: Ensure Nginx includes `proxy_set_header Upgrade $http_upgrade;` and `proxy_set_header Connection "upgrade";`. Test Redis connection with `redis-cli ping`.
