import * as cron from 'node-cron';
import { ScheduledTask } from 'node-cron';
import { query } from '../db/database';

let relanceTask: ScheduledTask | null = null;

async function envoyerRelancesAuto(): Promise<void> {
  // Pour chaque entreprise avec relance_auto_active=1
  const entreprises = await query(`
    SELECT id, relance_auto_jours, relance_auto_heure
    FROM entreprise WHERE relance_auto_active = 1
  `);

  for (const ent of entreprises.rows) {
    const jours = ent.relance_auto_jours ?? 15;
    // Factures émises, échéance dépassée de plus de 0 jours,
    // et pas de relance dans les `jours` derniers jours
    const factures = await query(`
      SELECT f.id, f.numero, f.montant_ttc, f.date_echeance,
             c.email AS client_email,
             COALESCE(c.raison_sociale, c.prenom || ' ' || c.nom) AS client_nom
      FROM factures f
      JOIN clients c ON c.id = f.client_id
      WHERE f.entreprise_id = $1
        AND f.statut = 'emise'
        AND f.date_echeance IS NOT NULL
        AND f.date_echeance::date < CURRENT_DATE
        AND (f.derniere_relance IS NULL OR f.derniere_relance < NOW() - INTERVAL '1 day' * $2)
    `, [ent.id, jours]);

    for (const f of factures.rows) {
      if (!f.client_email) continue;
      try {
        const { EmailService } = await import('./EmailService');
        const jRetard = Math.floor(
          (Date.now() - new Date(f.date_echeance).getTime()) / 86400000
        );
        await EmailService.envoyerEmail({
          to: f.client_email,
          subject: `Relance — Facture ${f.numero} en attente de règlement`,
          text: [
            `Bonjour${f.client_nom ? ' ' + f.client_nom : ''},`,
            '',
            `Sauf erreur de notre part, la facture ${f.numero} d'un montant de ${Number(f.montant_ttc).toFixed(2)} €`,
            `est arrivée à échéance le ${new Date(f.date_echeance).toLocaleDateString('fr-FR')} (il y a ${jRetard} jour${jRetard > 1 ? 's' : ''}).`,
            '',
            'Nous vous prions de bien vouloir procéder au règlement dans les meilleurs délais.',
            '',
            'Cordialement'
          ].join('\n'),
          entreprise_id: ent.id,
        });

        // Mettre à jour le compteur de relances
        await query(`
          UPDATE factures
          SET derniere_relance = NOW(),
              nb_relances = COALESCE(nb_relances, 0) + 1
          WHERE id = $1
        `, [f.id]);
      } catch (err) {
        console.error(`[relance] Erreur facture ${f.id}:`, err);
      }
    }
  }
}

export async function initRelanceScheduler(): Promise<void> {
  if (relanceTask) { relanceTask.stop(); relanceTask = null; }

  // Récupère l'heure configurée (utilise la première entreprise avec relance active)
  const r = await query(`SELECT relance_auto_heure FROM entreprise WHERE relance_auto_active=1 LIMIT 1`);
  const heure = r.rows[0]?.relance_auto_heure ?? '08:00';
  const [hh, mm] = heure.split(':').map(Number);
  const h = isNaN(hh) ? 8 : hh;
  const m = isNaN(mm) ? 0 : mm;

  relanceTask = cron.schedule(`${m} ${h} * * *`, () => {
    envoyerRelancesAuto().catch(e => console.error('[relance] Erreur scheduler:', e));
  });

  console.log(`[relance] Planifié : ${m} ${h} * * *`);
}
