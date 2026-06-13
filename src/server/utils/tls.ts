import fs from 'fs';
import path from 'path';
import os from 'os';
import { generate } from 'selfsigned';

const TLS_DIR   = path.resolve(process.cwd(), 'storage', 'tls');
const CERT_FILE = path.join(TLS_DIR, 'cert.pem');
const KEY_FILE  = path.join(TLS_DIR, 'key.pem');

export interface HttpsOptions {
  key: string;
  cert: string;
}

// Si HTTPS_ENABLED=true : utilise TLS_CERT_PATH/TLS_KEY_PATH si fournis, sinon
// génère et persiste un certificat auto-signé dans storage/tls/ au premier
// démarrage. Retourne null si HTTPS_ENABLED n'est pas activé (serveur en HTTP).
export async function getHttpsOptions(): Promise<HttpsOptions | null> {
  if (process.env.HTTPS_ENABLED !== 'true') return null;

  const certPath = process.env.TLS_CERT_PATH;
  const keyPath = process.env.TLS_KEY_PATH;
  if (certPath && keyPath && fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    return {
      cert: fs.readFileSync(certPath, 'utf-8'),
      key: fs.readFileSync(keyPath, 'utf-8'),
    };
  }

  if (fs.existsSync(CERT_FILE) && fs.existsSync(KEY_FILE)) {
    return {
      cert: fs.readFileSync(CERT_FILE, 'utf-8'),
      key: fs.readFileSync(KEY_FILE, 'utf-8'),
    };
  }

  const pems = await generate([{ name: 'commonName', value: os.hostname() }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
    extensions: [
      { name: 'basicConstraints', cA: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 2, value: os.hostname() },
          { type: 7, ip: '127.0.0.1' },
          { type: 7, ip: '::1' },
        ],
      },
    ],
  });

  fs.mkdirSync(TLS_DIR, { recursive: true });
  fs.writeFileSync(CERT_FILE, pems.cert, 'utf-8');
  fs.writeFileSync(KEY_FILE, pems.private, 'utf-8');
  console.log(`✓ Certificat TLS auto-signé généré et persisté dans ${TLS_DIR}`);

  return { cert: pems.cert, key: pems.private };
}
