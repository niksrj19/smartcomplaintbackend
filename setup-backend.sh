#!/usr/bin/env bash
# AI Smart City — backend setup script
# Creates the NestJS project, installs dependencies, initialises Prisma,
# scaffolds the ports/adapters folder structure and writes docker-compose.
#
# Usage:  bash setup-backend.sh [project-name]
# Needs:  Node.js 20+, npm, Docker (for Postgres, Redis, Kafka)

set -euo pipefail

PROJECT_NAME="${1:-smart-city-backend}"

echo "==> Checking prerequisites"
command -v node >/dev/null || { echo "Node.js is not installed"; exit 1; }
NODE_MAJOR=$(node -v | sed 's/v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then echo "Node.js 20+ required (found $(node -v))"; exit 1; fi
command -v docker >/dev/null || echo "WARNING: Docker not found — you'll need it for Postgres/Redis/Kafka"

if [ -d "$PROJECT_NAME" ]; then echo "Folder '$PROJECT_NAME' already exists"; exit 1; fi

echo "==> Creating NestJS project: $PROJECT_NAME"
npx --yes @nestjs/cli@latest new "$PROJECT_NAME" --package-manager npm --skip-git --strict --skip-install
cd "$PROJECT_NAME"
npm install || npm install --legacy-peer-deps

echo "==> Installing runtime dependencies"
npm install \
  @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/throttler @nestjs/schedule \
  passport passport-jwt bcrypt \
  zod \
  @prisma/client@7 @prisma/adapter-pg@7 pg \
  @langchain/langgraph @langchain/core @langchain/groq @langchain/langgraph-checkpoint-postgres \
  @google/genai \
  ioredis bullmq \
  kafkajs \
  @aws-sdk/client-s3 @aws-sdk/s3-request-presigner \
  nodemailer \
  helmet uuid

echo "==> Installing dev dependencies"
npm install -D \
  prisma@7 \
  @types/passport-jwt @types/bcrypt @types/nodemailer @types/pg

echo "==> Initialising Prisma (PostgreSQL)"
npx prisma init --datasource-provider postgresql

echo "==> Scaffolding folder structure"
mkdir -p src/{config,common/{filters,interceptors,guards,pipes},shared/schemas,database}
mkdir -p src/ports
mkdir -p src/adapters/{groq,gemini-embedding,redis,kafka,r2}
mkdir -p src/modules/{chat,complaints,departments,staff-auth,admin-dashboard,storage,notifications}
mkdir -p src/modules/ai/{graph/nodes,prompts}
mkdir -p src/modules/guardrails
mkdir -p src/modules/messaging/{outbox-relay,producers,consumers}

# Port interfaces (filled in when we build each module)
for f in llm.provider embedding.provider cache.service event-publisher event-consumer object-storage; do
  echo "// Port interface — implemented by an adapter in src/adapters" > "src/ports/$f.ts"
done
touch src/modules/guardrails/{input.guard.ts,output.guard.ts}

echo "==> Writing docker-compose.yml (Postgres+pgvector, Redis, Kafka KRaft)"
cat > docker-compose.yml <<'YAML'
services:
  postgres:
    image: pgvector/pgvector:pg16
    container_name: smartcity-postgres
    environment:
      POSTGRES_USER: smartcity
      POSTGRES_PASSWORD: smartcity
      POSTGRES_DB: smartcity
    ports: ["5432:5432"]
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U smartcity"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: smartcity-redis
    ports: ["6379:6379"]

  kafka:
    image: apache/kafka:3.9.0
    container_name: smartcity-kafka
    ports: ["9092:9092"]
    environment:
      KAFKA_NODE_ID: 1
      KAFKA_PROCESS_ROLES: broker,controller
      KAFKA_LISTENERS: PLAINTEXT://:9092,CONTROLLER://:9093
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://localhost:9092
      KAFKA_CONTROLLER_LISTENER_NAMES: CONTROLLER
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: CONTROLLER:PLAINTEXT,PLAINTEXT:PLAINTEXT
      KAFKA_CONTROLLER_QUORUM_VOTERS: 1@localhost:9093
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_REPLICATION_FACTOR: 1
      KAFKA_TRANSACTION_STATE_LOG_MIN_ISR: 1
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "false"

volumes:
  pgdata:
YAML

echo "==> Writing .env.example"
cat > .env.example <<'ENV'
# App
PORT=3000
NODE_ENV=development
JWT_SECRET=change-me

# Database
DATABASE_URL="postgresql://smartcity:smartcity@localhost:5432/smartcity?schema=public"

# Provider selection (swap without touching services)
LLM_PROVIDER=groq
EMBEDDING_PROVIDER=gemini
CACHE_PROVIDER=redis
EVENT_BUS_PROVIDER=kafka
STORAGE_PROVIDER=r2

# LLM / embeddings
GROQ_API_KEY=
GROQ_MODEL=llama-3.3-70b-versatile
GEMINI_API_KEY=
GEMINI_EMBEDDING_MODEL=gemini-embedding-001

# Redis / Kafka
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
KAFKA_CLIENT_ID=smart-city-backend

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=smart-city-photos

# Gmail SMTP (use an App Password)
SMTP_USER=
SMTP_APP_PASSWORD=
ENV
# Keep the DATABASE_URL Prisma wrote, but make sure .env has every key
grep -v '^DATABASE_URL' .env.example >> .env
sed -i.bak 's|^DATABASE_URL=.*|DATABASE_URL="postgresql://smartcity:smartcity@localhost:5432/smartcity?schema=public"|' .env && rm -f .env.bak

echo "==> Adding npm scripts"
npm pkg set scripts.infra:up="docker compose up -d"
npm pkg set scripts.infra:down="docker compose down"
npm pkg set scripts.db:migrate="prisma migrate dev"
npm pkg set scripts.db:generate="prisma generate"
npm pkg set scripts.db:studio="prisma studio"

echo ""
echo "Done. Next steps:"
echo "  cd $PROJECT_NAME"
echo "  npm run infra:up        # start Postgres, Redis, Kafka"
echo "  fill in API keys in .env"
echo "  npm run start:dev"
