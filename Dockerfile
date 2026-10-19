FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=10000
WORKDIR /app
COPY cloud/requirements.txt /app/cloud/requirements.txt
RUN pip install --no-cache-dir -r /app/cloud/requirements.txt && useradd --uid 10001 --create-home agaeye
COPY cloud /app/cloud
USER agaeye
EXPOSE 10000
CMD ["sh", "-c", "exec python -m uvicorn cloud.app:production_app --factory --host 0.0.0.0 --port ${PORT:-10000} --workers 1 --no-access-log"]
