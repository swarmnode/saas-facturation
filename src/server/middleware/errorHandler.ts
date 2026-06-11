import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error(err);
  const message = String(err?.message ?? 'Erreur interne');

  // Violations d'inaltérabilité / scellement (triggers DB) : interdites mais explicites
  if (message.includes('INALTÉR') || message.includes('ISCA')) {
    return res.status(403).json({ error: message });
  }

  // Les erreurs PostgreSQL et système portent un `code` ('23505', 'ENOENT'…) :
  // ne pas exposer les détails internes (tables, requêtes, chemins) au client
  if (typeof err?.code === 'string') {
    return res.status(500).json({ error: 'Erreur interne du serveur' });
  }

  // Erreurs métier levées par les services (messages destinés à l'utilisateur)
  return res.status(400).json({ error: message });
}
