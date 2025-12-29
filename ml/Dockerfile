# Python ML Service Dockerfile

FROM python:3.11-slim

# Set working directory
WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY forecasting.py .

# Create models directory
RUN mkdir -p /app/models

# Create non-root user
RUN useradd -m -u 1001 mluser && \
    chown -R mluser:mluser /app

# Switch to non-root user
USER mluser

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health').read()"

# Start application
CMD ["uvicorn", "forecasting:app", "--host", "0.0.0.0", "--port", "8000"]
