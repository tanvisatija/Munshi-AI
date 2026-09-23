FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONIOENCODING=utf-8 \
    DATABASE_PATH=/data/munshi.db \
    EXPORTS_DIR=/data/exports

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app
COPY seed_data.py .

# SQLite DB + generated ITC files live on a volume. The DB self-seeds on first start (AUTO_SEED=true).
VOLUME ["/data"]
EXPOSE 8000

# $PORT is honoured for Render / Railway / Fly; defaults to 8000.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --proxy-headers --forwarded-allow-ips='*'"]
