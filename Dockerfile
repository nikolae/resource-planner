FROM python:3.12-slim

ARG VERSION=0.6.1
ARG BUILD_DATE

LABEL version="${VERSION}" \
      build_date="${BUILD_DATE}" \
      description="Resource Planner"

ENV APP_VERSION=${VERSION}

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt gunicorn

COPY . .

RUN mkdir -p instance

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "2", "--preload", "app:app"]
