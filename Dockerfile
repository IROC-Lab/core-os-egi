# Core OS · EGI — painel do segundo cérebro + Claude Code CLI, pronto pro Coolify.
# n8n e Evolution NÃO moram aqui: o container fala com n8n.appegi.com.br e evo.appegi.com.br.
FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive TZ=America/Sao_Paulo
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      bash ca-certificates curl git jq openssl python3 ffmpeg procps gosu tini \
      build-essential \
    && rm -rf /var/lib/apt/lists/*

# Usuário sem root: o Claude Code recusa alguns modos como root e o cérebro fica em /home/coreos.
RUN usermod -l coreos -d /home/coreos -m -s /bin/bash node && groupmod -n coreos node

# Claude Code CLI (instalador nativo) no HOME do coreos.
USER coreos
ENV HOME=/home/coreos PATH=/home/coreos/.local/bin:$PATH
RUN curl -fsSL https://claude.ai/install.sh | bash && claude --version
USER root

# Painel
WORKDIR /opt/core-os/painel
COPY --chown=coreos:coreos painel/package*.json ./
RUN npm install --omit=dev --no-audit --no-fund -s
COPY --chown=coreos:coreos painel/ ./

# Cérebro modelo (copiado pro volume na primeira subida)
COPY --chown=coreos:coreos cerebro/ /opt/core-os/cerebro-modelo/
RUN find /opt/core-os/cerebro-modelo/.claude/skills -path '*/motor/*' -type f \( -name '*.sh' -o -name '*.py' \) -exec chmod +x {} + || true

COPY entrypoint.sh /opt/core-os/entrypoint.sh
RUN chmod +x /opt/core-os/entrypoint.sh && mkdir -p /data /opt/core-os/dados && chown -R coreos:coreos /opt/core-os /data

ENV CORE_OS_ENV=/opt/core-os/.env \
    CORE_OS_VAULT=/data/cerebro \
    CORE_OS_DATA=/data/dados \
    CORE_OS_HOST=0.0.0.0 \
    CORE_OS_PORT=3000 \
    CLAUDE_BIN=/home/coreos/.local/bin/claude

VOLUME ["/data", "/home/coreos/.claude"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s CMD curl -fs http://127.0.0.1:3000/api/eu || exit 1

ENTRYPOINT ["/usr/bin/tini", "--", "/opt/core-os/entrypoint.sh"]
