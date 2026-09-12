pipeline {
  agent any

  options {
    skipDefaultCheckout(true)
    disableConcurrentBuilds()
    timestamps()
    buildDiscarder(logRotator(numToKeepStr: '10'))
  }

  parameters {
    booleanParam(
      name: 'RUN_BROWSER_E2E',
      defaultValue: false,
      description: 'Run the authenticated browser smoke gate. Leave disabled until the production E2E fixture is configured.',
    )
  }

  environment {
    APP_NETWORK = 'user1-liemresearch'
    PROXY_NETWORK = 'nginx-network'
    BACKEND_IMAGE = 'user1-liemresearch-backend'
    WEB_IMAGE = 'user1-liemresearch-web'
    E2E_IMAGE = 'user1-liemresearch-e2e'
    PAPER_VECTOR_INDEX_NAME = 'paper_vector_index_v2'
    BACKEND_CONTAINER = 'user1-liemresearch-backend'
    WEB_CONTAINER = 'user1-liemresearch-web'
    REDIS_IMAGE = 'redis:7-alpine'
    REDIS_CONTAINER = 'user1-liemresearch-redis'
    REDIS_VOLUME = 'user1-liemresearch-redis-data'
    LIBRETRANSLATE_IMAGE = 'libretranslate/libretranslate:v1.9.6'
    LIBRETRANSLATE_CONTAINER = 'user1-liemresearch-libretranslate'
    LIBRETRANSLATE_SHARE_VOLUME = 'user1-liemresearch-libretranslate-share'
    LIBRETRANSLATE_CACHE_VOLUME = 'user1-liemresearch-libretranslate-cache'
  }

  stages {
    stage('Checkout') {
      steps {
        checkout scm
        script {
          env.IMAGE_TAG = sh(script: 'git rev-parse --short=12 HEAD', returnStdout: true).trim()
        }
      }
    }

    stage('Build immutable images') {
      steps {
        sh '''
          set -eu
          docker build --pull -t "$BACKEND_IMAGE:$IMAGE_TAG" -f Dockerfile.backend .
          docker build --pull \
            --build-arg VITE_API_BASE=https://api.paperlens.uk/api/v1 \
            -t "$WEB_IMAGE:$IMAGE_TAG" \
            -f Dockerfile.web .
          if [ "${RUN_BROWSER_E2E:-false}" = 'true' ]; then
            docker build --pull -t "$E2E_IMAGE:$IMAGE_TAG" -f Dockerfile.e2e .
          fi
          docker pull "$REDIS_IMAGE"
          docker pull "$LIBRETRANSLATE_IMAGE"
        '''
      }
    }

    stage('Validate production environment') {
      steps {
        withCredentials([string(credentialsId: 'liemresearch-backend-env-b64', variable: 'BACKEND_ENV_B64')]) {
          sh '''
            set -eu
            umask 077
            printf '%s' "$BACKEND_ENV_B64" | base64 -d > .env.runtime
            docker run --rm \
              --env-file .env.runtime \
              "$BACKEND_IMAGE:$IMAGE_TAG" \
              pnpm --filter backend env:validate:production -- --process-env
          '''
        }
      }
    }

    stage('Deploy dependencies') {
      steps {
        sh '''
          set -eu
          docker network inspect "$APP_NETWORK" >/dev/null 2>&1 || docker network create "$APP_NETWORK"
          if ! docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1; then
            echo "Required reverse-proxy network '$PROXY_NETWORK' does not exist."
            exit 1
          fi

          docker volume inspect "$REDIS_VOLUME" >/dev/null 2>&1 || docker volume create "$REDIS_VOLUME"
          docker volume inspect "$LIBRETRANSLATE_SHARE_VOLUME" >/dev/null 2>&1 || docker volume create "$LIBRETRANSLATE_SHARE_VOLUME"
          docker volume inspect "$LIBRETRANSLATE_CACHE_VOLUME" >/dev/null 2>&1 || docker volume create "$LIBRETRANSLATE_CACHE_VOLUME"

          # Named Docker volumes are created as root. LibreTranslate runs as the
          # non-root libretranslate user (UID/GID 1032), so initialize their
          # ownership before it tries to download or read Argos language models.
          docker run --rm \
            --user 0:0 \
            -v "$LIBRETRANSLATE_SHARE_VOLUME:/home/libretranslate/.local/share" \
            -v "$LIBRETRANSLATE_CACHE_VOLUME:/home/libretranslate/.local/cache" \
            --entrypoint /bin/sh \
            "$LIBRETRANSLATE_IMAGE" \
            -c 'mkdir -p /home/libretranslate/.local/share /home/libretranslate/.local/cache && chown -R 1032:1032 /home/libretranslate/.local'

          docker rm -f "$REDIS_CONTAINER" >/dev/null 2>&1 || true
          docker run -d \
            --name "$REDIS_CONTAINER" \
            --restart unless-stopped \
            --network "$APP_NETWORK" \
            --network-alias redis \
            --env-file .env.runtime \
            -v "$REDIS_VOLUME:/data" \
            "$REDIS_IMAGE" \
            sh -c 'exec redis-server --appendonly yes --appendfsync everysec --requirepass "$REDIS_PASSWORD"'

          redis_ready=0
          for attempt in $(seq 1 30); do
            if docker exec "$REDIS_CONTAINER" \
              sh -c 'redis-cli --no-auth-warning -a "$REDIS_PASSWORD" ping' | grep -qx PONG; then
              redis_ready=1
              break
            fi
            sleep 2
          done
          if [ "$redis_ready" -ne 1 ]; then
            docker logs --tail 200 "$REDIS_CONTAINER"
            exit 1
          fi

          docker rm -f "$LIBRETRANSLATE_CONTAINER" >/dev/null 2>&1 || true
          docker run -d \
            --name "$LIBRETRANSLATE_CONTAINER" \
            --restart unless-stopped \
            --network "$APP_NETWORK" \
            --network-alias libretranslate \
            -v "$LIBRETRANSLATE_SHARE_VOLUME:/home/libretranslate/.local/share" \
            -v "$LIBRETRANSLATE_CACHE_VOLUME:/home/libretranslate/.local/cache" \
            -e LT_LOAD_ONLY=en,vi,es,fr,de,pt,zh,ja,ko,ru,id \
            "$LIBRETRANSLATE_IMAGE"

          translation_ready=0
          # A first start downloads language models. Persistent volumes make later
          # deployments fast, while this bound keeps a cold server deterministic.
          for attempt in $(seq 1 300); do
            if docker exec "$LIBRETRANSLATE_CONTAINER" \
              python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/languages', timeout=3)"; then
              translation_ready=1
              break
            fi
            sleep 2
          done

          if [ "$translation_ready" -ne 1 ]; then
            docker logs --tail 200 "$LIBRETRANSLATE_CONTAINER"
            exit 1
          fi
        '''
      }
    }

    stage('Ensure filtered vector index') {
      steps {
        withCredentials([string(credentialsId: 'liemresearch-backend-env-b64', variable: 'BACKEND_ENV_B64')]) {
          sh '''
            set -eu
            umask 077
            printf '%s' "$BACKEND_ENV_B64" | base64 -d > .env.runtime

            docker run --rm \
              --network "$APP_NETWORK" \
              --env-file .env.runtime \
              -e NODE_ENV=production \
              -e MONGODB_VECTOR_INDEX_NAME="$PAPER_VECTOR_INDEX_NAME" \
              "$BACKEND_IMAGE:$IMAGE_TAG" \
              pnpm --filter backend mongo:ensure-paper-vector-index-v2

            docker run --rm \
              --network "$APP_NETWORK" \
              --env-file .env.runtime \
              -e NODE_ENV=production \
              -e MONGODB_VECTOR_INDEX_NAME="$PAPER_VECTOR_INDEX_NAME" \
              "$BACKEND_IMAGE:$IMAGE_TAG" \
              pnpm --filter backend mongo:vector-smoke
          '''
        }
      }
    }

    stage('Deploy backend, web and workers') {
      steps {
        withCredentials([string(credentialsId: 'liemresearch-backend-env-b64', variable: 'BACKEND_ENV_B64')]) {
          sh '''
            set -eu
            umask 077
            printf '%s' "$BACKEND_ENV_B64" | base64 -d > .env.runtime

            candidate="${BACKEND_CONTAINER}-candidate"
            docker rm -f "$candidate" >/dev/null 2>&1 || true
            docker run -d \
              --name "$candidate" \
              --network "$APP_NETWORK" \
              --env-file .env.runtime \
              -e NODE_ENV=production \
              -e PORT=4000 \
              -e CORS_ORIGIN=https://paperlens.uk \
              -e MONGODB_VECTOR_INDEX_NAME="$PAPER_VECTOR_INDEX_NAME" \
              -e GOOGLE_CALLBACK_URL=https://api.paperlens.uk/api/v1/auth/google/callback \
              -e TRANSLATION_PROVIDER=libretranslate \
              -e LIBRETRANSLATE_URL=http://libretranslate:5000 \
              "$BACKEND_IMAGE:$IMAGE_TAG"

            candidate_ready=0
            for attempt in $(seq 1 45); do
              if docker exec "$candidate" node -e \
                "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
                candidate_ready=1
                break
              fi
              sleep 2
            done
            if [ "$candidate_ready" -ne 1 ]; then
              docker logs --tail 200 "$candidate"
              docker rm -f "$candidate" >/dev/null 2>&1 || true
              exit 1
            fi
            docker rm -f "$candidate"

            docker rm -f "$BACKEND_CONTAINER" >/dev/null 2>&1 || true
            docker run -d \
              --name "$BACKEND_CONTAINER" \
              --restart unless-stopped \
              --network "$APP_NETWORK" \
              --network-alias backend \
              -p 127.0.0.1:9000:4000 \
              --env-file .env.runtime \
              -e NODE_ENV=production \
              -e PORT=4000 \
              -e CORS_ORIGIN=https://paperlens.uk \
              -e MONGODB_VECTOR_INDEX_NAME="$PAPER_VECTOR_INDEX_NAME" \
              -e GOOGLE_CALLBACK_URL=https://api.paperlens.uk/api/v1/auth/google/callback \
              -e TRANSLATION_PROVIDER=libretranslate \
              -e LIBRETRANSLATE_URL=http://libretranslate:5000 \
              -v user1-liemresearch-uploads:/app/apps/backend/uploads \
              "$BACKEND_IMAGE:$IMAGE_TAG"
            docker network connect \
              --alias paperlens-backend \
              "$PROXY_NETWORK" \
              "$BACKEND_CONTAINER"

            backend_ready=0
            for attempt in $(seq 1 45); do
              if docker exec "$BACKEND_CONTAINER" node -e \
                "fetch('http://127.0.0.1:4000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
                backend_ready=1
                break
              fi
              sleep 2
            done
            if [ "$backend_ready" -ne 1 ]; then
              docker logs --tail 200 "$BACKEND_CONTAINER"
              exit 1
            fi

            docker rm -f "$WEB_CONTAINER" >/dev/null 2>&1 || true
            docker run -d \
              --name "$WEB_CONTAINER" \
              --restart unless-stopped \
              --network "$APP_NETWORK" \
              -p 127.0.0.1:9001:80 \
              "$WEB_IMAGE:$IMAGE_TAG"
            docker network connect \
              --alias paperlens-web \
              "$PROXY_NETWORK" \
              "$WEB_CONTAINER"
            docker exec "$WEB_CONTAINER" wget -qO- http://127.0.0.1/ >/dev/null

            worker_specs='
              report|worker:report
              gaps|worker:gaps
              notifications|worker:notifications
              embedding|worker:embedding
              paper-analysis|worker:paper-analysis
              corpus-validation|worker:corpus-validation
            '
            printf '%s\n' "$worker_specs" | while IFS='|' read -r suffix command; do
              suffix=$(printf '%s' "$suffix" | xargs)
              command=$(printf '%s' "$command" | xargs)
              [ -n "$suffix" ] || continue
              container="user1-liemresearch-worker-$suffix"
              docker rm -f "$container" >/dev/null 2>&1 || true
              docker run -d \
                --name "$container" \
                --restart unless-stopped \
                --network "$APP_NETWORK" \
                --env-file .env.runtime \
                -e NODE_ENV=production \
                -e MONGODB_VECTOR_INDEX_NAME="$PAPER_VECTOR_INDEX_NAME" \
                "$BACKEND_IMAGE:$IMAGE_TAG" \
                pnpm --filter backend "$command"
            done

            sleep 5
            printf '%s\n' "$worker_specs" | while IFS='|' read -r suffix command; do
              suffix=$(printf '%s' "$suffix" | xargs)
              [ -n "$suffix" ] || continue
              container="user1-liemresearch-worker-$suffix"
              if [ "$(docker inspect -f '{{.State.Running}}' "$container" 2>/dev/null || true)" != "true" ]; then
                docker logs --tail 200 "$container" || true
                exit 1
              fi
            done

            docker run --rm \
              --network "$APP_NETWORK" \
              --env-file .env.runtime \
              -e NODE_ENV=production \
              "$BACKEND_IMAGE:$IMAGE_TAG" \
              pnpm --filter backend workers:verify:heartbeats

          '''
        }
      }
    }

    stage('Verify public deployment') {
      steps {
        sh '''
          set -eu

          public_ready=0
          for attempt in $(seq 1 30); do
            web_status=$(curl -sS -o /dev/null -w '%{http_code}' \
              --connect-timeout 5 --max-time 15 https://paperlens.uk/ || true)
            health_status=$(curl -sS -o /dev/null -w '%{http_code}' \
              --connect-timeout 5 --max-time 15 https://api.paperlens.uk/health || true)
            ready_status=$(curl -sS -o /dev/null -w '%{http_code}' \
              --connect-timeout 5 --max-time 15 https://api.paperlens.uk/ready || true)

            if [ "$web_status" = "200" ] &&
               [ "$health_status" = "200" ] &&
               [ "$ready_status" = "200" ]; then
              public_ready=1
              break
            fi

            echo "Public smoke attempt $attempt/30: web=$web_status health=$health_status ready=$ready_status"
            sleep 2
          done

          if [ "$public_ready" -ne 1 ]; then
            echo "PaperLens public smoke test failed."
            echo "Ensure Nginx Proxy Manager forwards:"
            echo "  paperlens.uk -> paperlens-web:80"
            echo "  api.paperlens.uk -> paperlens-backend:4000"
            exit 1
          fi

          echo "PaperLens public endpoints returned HTTP 200."
        '''
      }
    }

    stage('Browser E2E smoke') {
      when {
        expression { params.RUN_BROWSER_E2E }
      }
      steps {
        withCredentials([string(credentialsId: 'liemresearch-backend-env-b64', variable: 'BACKEND_ENV_B64')]) {
          sh '''
            set -eu
            umask 077
            printf '%s' "$BACKEND_ENV_B64" | base64 -d > .env.runtime

            for key in E2E_USER_EMAIL E2E_USER_PASSWORD E2E_PAPER_ID E2E_SEARCH_QUERY; do
              value="$(grep -m1 "^${key}=" .env.runtime | cut -d= -f2- || true)"
              if [ -z "$value" ]; then
                echo "Missing required browser E2E variable: $key"
                exit 1
              fi
              case "$value" in
                '<'*'>')
                  echo "Browser E2E variable still contains a placeholder: $key"
                  exit 1
                  ;;
              esac
            done

            mkdir -p test-results/e2e playwright-report
            e2e_status=0
            docker run --rm \
              --env-file .env.runtime \
              -e CI=true \
              -e E2E_BASE_URL=https://paperlens.uk \
              -v "$WORKSPACE/test-results/e2e:/app/test-results/e2e" \
              -v "$WORKSPACE/playwright-report:/app/playwright-report" \
              "$E2E_IMAGE:$IMAGE_TAG" || e2e_status=$?

            docker run --rm \
              -v "$WORKSPACE/test-results:/artifacts" \
              "$REDIS_IMAGE" chmod -R a+rX /artifacts
            docker run --rm \
              -v "$WORKSPACE/playwright-report:/artifacts" \
              "$REDIS_IMAGE" chmod -R a+rX /artifacts

            exit "$e2e_status"
          '''
        }
      }
    }

    stage('Promote verified images') {
      steps {
        sh '''
          set -eu
          docker tag "$BACKEND_IMAGE:$IMAGE_TAG" "$BACKEND_IMAGE:latest"
          docker tag "$WEB_IMAGE:$IMAGE_TAG" "$WEB_IMAGE:latest"
        '''
      }
    }
  }

  post {
    always {
      archiveArtifacts artifacts: 'test-results/e2e/**,playwright-report/**', allowEmptyArchive: true
      sh 'rm -f .env.runtime'
    }
    success {
      echo "Deployed PaperLens image tag ${env.IMAGE_TAG}"
    }
  }
}
