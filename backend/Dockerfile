FROM python:3.14-slim

WORKDIR /app

# Install system dependencies for WeasyPrint and other packages
RUN apt-get update && apt-get install -y \
    python3-dev \
    gcc \
    libpangocairo-1.0-0 \
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libffi-dev \
    libjpeg-dev \
    libopenjp2-7-dev \
    wait-for-it \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Ensure upload directory exists
RUN mkdir -p uploads

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
