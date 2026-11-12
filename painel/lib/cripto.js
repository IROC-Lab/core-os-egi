// EGI Brand · criptografia: variáveis de ambiente das empresas (AES-256-GCM), senhas (scrypt) e tokens.
import crypto from 'node:crypto';

export function chaveDe(mestra) {
  const s = String(mestra || '').trim();
  if (!s) throw new Error('Defina EGI_MASTER_KEY (openssl rand -hex 32). Sem ela as variáveis das empresas não podem ser cifradas.');
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, 'hex');
  const b = Buffer.from(s, 'base64');
  if (b.length === 32 && /^[A-Za-z0-9+/=_-]+$/.test(s)) return b;
  if (s.length < 24) throw new Error('EGI_MASTER_KEY curta demais: use openssl rand -hex 32.');
  return crypto.createHash('sha256').update(s).digest();
}

export function criarCofre(mestra) {
  const chave = chaveDe(mestra);
  return {
    cifrar(texto) {
      const iv = crypto.randomBytes(12);
      const c = crypto.createCipheriv('aes-256-gcm', chave, iv);
      const corpo = Buffer.concat([c.update(String(texto), 'utf8'), c.final()]);
      return `v1:${Buffer.concat([iv, c.getAuthTag(), corpo]).toString('base64')}`;
    },
    decifrar(guardado) {
      const s = String(guardado || '');
      if (!s.startsWith('v1:')) throw new Error('valor cifrado em formato desconhecido');
      const b = Buffer.from(s.slice(3), 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', chave, b.subarray(0, 12));
      d.setAuthTag(b.subarray(12, 28));
      return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString('utf8');
    },
  };
}

const SCRYPT = { N: 16384, r: 8, p: 1, tamanho: 64 };
export function hashSenha(senha) {
  const sal = crypto.randomBytes(16);
  const h = crypto.scryptSync(String(senha), sal, SCRYPT.tamanho, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${sal.toString('base64')}$${h.toString('base64')}`;
}
export function conferirSenha(senha, guardado) {
  const [alg, N, r, p, sal, h] = String(guardado || '').split('$');
  if (alg !== 'scrypt' || !h) return false;
  const esperado = Buffer.from(h, 'base64');
  const calc = crypto.scryptSync(String(senha), Buffer.from(sal, 'base64'), esperado.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(calc, esperado);
}

export const token = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');
export const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// comparação em tempo constante de dois textos quaisquer (compara os hashes, então tamanhos diferentes não vazam)
export function iguais(a, b) {
  if (!a || !b) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(String(a)).digest(), crypto.createHash('sha256').update(String(b)).digest());
}
// código curto pra digitar (pareamento do Telegram): sem 0/O/1/I pra não confundir
export function codigoCurto(tamanho = 8) {
  const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(tamanho), (b) => alfabeto[b % alfabeto.length]).join('');
}
