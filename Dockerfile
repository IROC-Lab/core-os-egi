# EGI Brand (por EGI Group) · plataforma multi-tenant do segundo cérebro, pronta pro Coolify.
# Um container atende todas as empresas. Cada empresa roda os agentes (Claude Code, Codex, Antigravity) com um
# usuário Unix próprio e o HOME dela em /data/empresas/<slug>/casa, então os logins são DO CLIENTE e uma empresa
# não lê os arquivos da outra. Por isso o servidor roda como root (precisa trocar de usuário ao abrir cada agente).
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive TZ=America/Sao_Paulo
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      bash ca-certificates curl git jq openssl python3 python3-venv pipx ffmpeg procps tini poppler-utils passwd \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

# Usuário dono dos executáveis compartilhados (claude, agy). As empresas só leem e executam.
RUN usermod -l coreos -d /home/coreos -m -s /bin/bash node && groupmod -n coreos node
USER coreos
ENV HOME=/home/coreos PATH=/home/coreos/.local/bin:$PATH
RUN curl -fsSL https://claude.ai/install.sh | bash && claude --version
RUN (curl -fsSL https://antigravity.google/cli/install.sh | bash && agy --version) \
    || echo "AVISO: Antigravity CLI não instalou no build."
USER root
RUN npm install -g @openai/codex --no-audit --no-fund -s && codex --version
# executáveis compartilhados legíveis pelos usuários das empresas (uid 20001+)
RUN chmod 755 /home/coreos && chmod -R a+rX /home/coreos/.local

# Plataforma
WORKDIR /opt/core-os/painel
COPY painel/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund -s
COPY painel/ ./

# Cérebro modelo: copiado pra pasta de cada empresa nova (depois nunca sobrescrito)
COPY cerebro/ /opt/core-os/cerebro-modelo/
RUN find /opt/core-os/cerebro-modelo/.claude/skills -path '*/motor/*' -type f \( -name '*.sh' -o -name '*.py' \) -exec chmod +x {} + || true \
    && chmod -R a+rX /opt/core-os

COPY entrypoint.sh /opt/core-os/entrypoint.sh
RUN chmod +x /opt/core-os/entrypoint.sh && mkdir -p /data

ENV EGI_DADOS=/data \
    EGI_EMPRESAS_DIR=/data/empresas \
    EGI_PLATAFORMA_DIR=/data/plataforma \
    EGI_MODELO_CEREBRO=/opt/core-os/cerebro-modelo \
    EGI_HOST=0.0.0.0 \
    EGI_PORT=3000 \
    CLAUDE_BIN=/home/coreos/.local/bin/claude \
    AGY_BIN=/home/coreos/.local/bin/agy \
    CODEX_BIN=/usr/local/bin/codex \
    EGI_PATH_AGENTES=/home/coreos/.local/bin:/usr/local/bin:/usr/bin:/bin

VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD curl -fs http://127.0.0.1:3000/saude || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/core-os/entrypoint.sh"]
