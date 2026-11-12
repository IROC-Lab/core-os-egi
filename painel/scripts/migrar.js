// Aplica as migrações do EGI Brand no banco de DATABASE_URL (schema egi_brand) e sai.
// Uso: DATABASE_URL=postgres://... node scripts/migrar.js
import { conectar, migrar } from '../lib/db.js';

const db = await conectar(process.env.DATABASE_URL);
const feitas = await migrar(db);
console.log(feitas.length ? `${feitas.length} migração(ões) aplicada(s).` : 'Banco já está em dia.');
await db.fechar();
