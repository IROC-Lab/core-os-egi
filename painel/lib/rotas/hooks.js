// EGI Brand · webhooks de entrada (sem login: cada um tem o próprio segredo).
import { Router } from 'express';

const uuid = /^[0-9a-f-]{36}$/;

export function rotasHooks({ cobranca, whatsapp, telegram, ponte }) {
  const r = Router();

  // Asaas: configure em Asaas > Integrações > Webhooks com a URL <EGI_PUBLIC_URL>/hooks/asaas e o token ASAAS_WEBHOOK_TOKEN
  r.post('/hooks/asaas', async (req, res) => {
    const out = await cobranca.receberWebhook(req.body, req.get('asaas-access-token'));
    if (!out.ok) return res.status(out.status || 400).json({ erro: 'recusado' });
    res.json({ ok: true, ...(out.duplicado ? { duplicado: true } : {}) });
  });

  // Evolution (WhatsApp) -> instância da empresa
  r.post('/hooks/whatsapp/:empresa/:segredo', async (req, res) => {
    if (!uuid.test(req.params.empresa)) return res.status(404).end();
    const out = await whatsapp.receberWebhook(req.params.empresa, req.params.segredo, req.body);
    res.status(out.status).json(out.status < 300 ? { ok: true } : { erro: 'recusado' });
  });

  // Telegram -> bot da empresa (o segredo vem no cabeçalho que o próprio Telegram manda)
  r.post('/hooks/telegram/:empresa', async (req, res) => {
    if (!uuid.test(req.params.empresa)) return res.status(404).end();
    const out = await telegram.receberWebhook(req.params.empresa, req.get('x-telegram-bot-api-secret-token'), req.body);
    res.status(out.status).json(out.status < 300 ? { ok: true } : { erro: 'recusado' });
  });

  // n8n (Google Chat, Slack...) -> empresa
  r.post('/hooks/ponte/:empresa', async (req, res) => {
    if (!uuid.test(req.params.empresa)) return res.status(404).end();
    const out = await ponte.receber(req.params.empresa, req.get('x-core-os-token'), req.body);
    res.status(out.status).json(out.erro ? { erro: out.erro } : { ok: true });
  });

  return r;
}
