# =============================================================================
# Pro Panel — Enterprise Production Multi-Stage Dockerfile
# =============================================================================

# ── STAGE 1: Frontend Build ──────────────────────────────────────────────────
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

# Install dependencies using locked manifest
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build static bundle
COPY frontend/ ./
RUN npm run build

# ── STAGE 2: Backend Runtime ─────────────────────────────────────────────────
FROM python:3.11-slim AS backend

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive \
    PORT=8000

WORKDIR /app

# Install system dependencies required for PostgreSQL, WeasyPrint, PyCairo, OpenCV, Pillow
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    libglib2.0-0 \
    libgl1 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r /app/backend/requirements.txt

# Copy built frontend assets to the expected static discovery path
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy backend source code
COPY backend/ /app/backend/
COPY manage.py /app/manage.py
COPY package.json /app/package.json

# Create media, cache, and staticfiles directories
RUN mkdir -p /app/backend/media /app/backend/staticfiles /app/backend/cache

WORKDIR /app/backend

# Pre-collect static assets for WhiteNoise / Nginx
# Using dummy values for SECRET_KEY to allow collectstatic during docker build
RUN SECRET_KEY="build-time-secret-key-for-collectstatic-only-32bytes" \
    DEBUG="False" \
    ALLOWED_HOSTS="*" \
    python manage.py collectstatic --noinput

# Persistent media volume
VOLUME ["/app/backend/media"]

EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health/ || exit 1

# Launch ASGI server with Uvicorn worker for Django Channels WebSockets
CMD ["gunicorn", "-c", "config/gunicorn.conf.py", "config.asgi:application"]

