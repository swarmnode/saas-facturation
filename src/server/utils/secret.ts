import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const SECRET_FILE = path.resolve(process.cwd(), 'storage', 'jwt_secret.key');

// Garantit un JWT_SECRET non prévisible : si la variable d'environnement est absente,
// un secret aléatoire est généré au premier démarrage et persisté dans storage/
// (ainsi les tokens restent valides entre redémarrages).
export function ensureJwtSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;

  let secret: string;
  if (fs.existsSync(SECRET_FILE)) {
    secret = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
  } else {
    secret = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(SECRET_FILE), { recursive: true });
    fs.writeFileSync(SECRET_FILE, secret, 'utf-8');
    console.log(`✓ Secret JWT généré et persisté dans ${SECRET_FILE}`);
  }
  process.env.JWT_SECRET = secret;
  return secret;
}

export function jwtSecret(): string {
  return process.env.JWT_SECRET ?? ensureJwtSecret();
}
