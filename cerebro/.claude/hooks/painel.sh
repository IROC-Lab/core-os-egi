#!/bin/bash
# Painel do cérebro: entra em toda sessão (SessionStart).
V="${CLAUDE_PROJECT_DIR:-$(pwd)}"
echo "📍 CÉREBRO · $(date +%Y-%m-%d)"
echo ""
echo "## Tarefas abertas (topo de tasks/todo.md)"
grep -m 10 '^- \[ \]' "$V/tasks/todo.md" 2>/dev/null
echo ""
echo "## Lembrete de captura"
echo "Todo fato novo dito pelo dono vai pro lugar certo NA HORA, com anúncio de 1 linha. Roteamento: CLAUDE.md §4."
