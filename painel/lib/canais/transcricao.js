// EGI Brand · transcrição de áudio (WhatsApp e Telegram) pelo Whisper da Groq.
// A chave da empresa (variável GROQ_API_KEY dela) tem preferência; sem ela, usa a da plataforma.
export async function transcrever({ dados, mime = 'audio/ogg', nome = 'audio.ogg', chave, fetch: f = fetch }) {
  if (!chave) throw new Error('sem GROQ_API_KEY');
  const form = new FormData();
  form.append('file', new Blob([dados], { type: mime }), nome);
  form.append('model', 'whisper-large-v3-turbo');
  form.append('language', 'pt');
  form.append('response_format', 'json');
  const r = await f('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST', headers: { Authorization: `Bearer ${chave}` }, body: form, signal: AbortSignal.timeout(120_000),
  });
  if (!r.ok) throw new Error(`Groq respondeu ${r.status}`);
  const j = await r.json();
  return String(j.text || '').trim();
}
