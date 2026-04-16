# ── Stage 1: Build Frontend ───────────────────────────────────────────────
FROM node:20-slim AS frontend-builder
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build

# ── Stage 2: Final image with Node.js + Python ────────────────────────────
FROM node:20-slim

# Install Python 3 and pip
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-venv \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Create and activate a virtual environment for Python deps
RUN python3 -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Install python-pptx inside the venv
RUN pip install --no-cache-dir python-pptx==0.6.23

# Set working directory
WORKDIR /app

# Copy and install Node dependencies
COPY backend/package*.json ./
RUN npm install --omit=dev

# Copy backend source
COPY backend/ .

# Copy built frontend from Stage 1
COPY --from=frontend-builder /build/frontend/dist /frontend/dist

# Create required directories
RUN mkdir -p outputs templates

# Expose port
EXPOSE 5000

# Start the server
CMD ["node", "server.js"]