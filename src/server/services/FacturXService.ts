import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const STORAGE_PDF = path.resolve(process.cwd(), 'storage', 'pdf');

function formatMontant(n: number): string {
  // Remplace l'espace insécable ( ,  ) par un espace normal
  // pour éviter que PDFKit coupe le nombre sur le séparateur de milliers
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2 })
    .format(n)
    .replace(/[  ]/g, ' ') + ' €';
}

function formatDate(d: string): string {
  if (!d) return '';
  return new Date(d).toLocaleDateString('fr-FR');
}

function mentionTVA(tvaMode: string, taux: number): string {
  if (tvaMode === 'franchise_293b') return 'TVA non applicable, art. 293 B du CGI';
  if (tvaMode === 'autoliquidation') return 'Autoliquidation — TVA due par le preneur art. 283-2 du CGI';
  return `TVA ${taux} %`;
}

// Extrait la couleur dominante d'une image (exclut les pixels proches du blanc)
async function extractDominantColor(imagePath: string, fallback = '#1A3A5C'): Promise<string> {
  try {
    const { data, info } = await sharp(imagePath)
      .resize(100, 100, { fit: 'inside' })
      .flatten({ background: { r: 255, g: 255, b: 255 } })
      .raw()
      .toBuffer({ resolveWithObject: true });
    const hist = new Map<string, number>();
    const ch = info.channels;
    for (let i = 0; i < data.length; i += ch) {
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (r > 215 && g > 215 && b > 215) continue; // exclut les blancs et gris clairs
      const qr = Math.round(r / 16) * 16;
      const qg = Math.round(g / 16) * 16;
      const qb = Math.round(b / 16) * 16;
      const k = `${qr},${qg},${qb}`;
      hist.set(k, (hist.get(k) ?? 0) + 1);
    }
    if (!hist.size) return fallback;
    let max = 0, best = fallback;
    for (const [k, n] of hist) {
      if (n > max) {
        max = n;
        const [r, g, b] = k.split(',').map(Number);
        best = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      }
    }
    return best;
  } catch { return fallback; }
}

// Mélange la couleur avec du blanc pour obtenir un fond très pâle
function lightenColor(hex: string, amount = 0.92): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `#${lr.toString(16).padStart(2, '0')}${lg.toString(16).padStart(2, '0')}${lb.toString(16).padStart(2, '0')}`;
}

export class FacturXService {
  static async genererFacture(facture: any, entreprise: any, client: any): Promise<string> {
    if (!fs.existsSync(STORAGE_PDF)) fs.mkdirSync(STORAGE_PDF, { recursive: true });

    const fileName = `${facture.numero.replace(/[^a-zA-Z0-9-]/g, '_')}.pdf`;
    const filePath = path.join(STORAGE_PDF, fileName);

    // Pré-calcul logo (await interdit dans le callback PDFKit synchrone)
    let logoInfo: { abs: string; drawW: number; drawH: number; x: number; y: number } | null = null;
    if (entreprise.logo_path) {
      const logoPdf = path.resolve(process.cwd(), 'storage', 'logo', 'logo_pdf.png');
      const logoAbs = fs.existsSync(logoPdf)
        ? logoPdf
        : path.resolve(process.cwd(), (entreprise.logo_path as string).replace(/^\//, ''));
      if (fs.existsSync(logoAbs)) {
        try {
          const meta = await sharp(logoAbs).metadata();
          const imgW = meta.width  ?? 200;
          const imgH = meta.height ?? 80;
          const maxW = 240, maxH = 90;
          const scale = Math.min(maxW / imgW, maxH / imgH);
          const drawW = imgW * scale;
          const drawH = imgH * scale;
          logoInfo = { abs: logoAbs, drawW, drawH, x: 545 - drawW, y: 35 + (maxH - drawH) / 2 };
        } catch {}
      }
    }
    const brandColor      = logoInfo ? await extractDominantColor(logoInfo.abs) : '#1A3A5C';
    const brandColorLight = lightenColor(brandColor);

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);

      const W = 495;

      // ── Logo ─────────────────────────────────────────────────────────
      if (logoInfo) {
        try { doc.image(logoInfo.abs, logoInfo.x, logoInfo.y, { width: logoInfo.drawW, height: logoInfo.drawH }); } catch {}
      }

      // ── En-tête prestataire ──────────────────────────────────────────
      doc.fontSize(18).font('Helvetica-Bold')
         .text(entreprise.raison_sociale + (entreprise.is_EI ? ' EI' : ''), 50, 50);
      const _a2off = entreprise.adresse2 ? 12 : 0;
      doc.fontSize(9).font('Helvetica')
         .text(`${entreprise.adresse}`, 50, 75);
      if (entreprise.adresse2) doc.text(entreprise.adresse2, 50, 87);
      doc.text(`${entreprise.code_postal} ${entreprise.ville}`, 50, 87 + _a2off)
         .text(`SIRET : ${entreprise.siret}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom)
        doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(`${entreprise.email}`, 50, 123 + _a2off);

      // ── Client ───────────────────────────────────────────────────────
      const clientNom = client.type_client === 'professionnel'
        ? client.raison_sociale
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

      const clientY = logoInfo ? 130 : 75;
      doc.fontSize(11).font('Helvetica-Bold')
         .text(clientNom, 350, clientY, { width: 195 });
      doc.fontSize(10).font('Helvetica')
         .text(client.adresse, 350, clientY + 16, { width: 195 })
         .text(`${client.code_postal} ${client.ville}`, 350, clientY + 28, { width: 195 });
      if (client.tva_intracom)
        doc.text(`TVA Intracom : ${client.tva_intracom}`, 350, clientY + 40, { width: 195 });

      // ── Titre facture ────────────────────────────────────────────────
      const sepY = logoInfo ? 185 : 150;
      doc.moveTo(50, sepY).lineTo(545, sepY).strokeColor('#CCCCCC').stroke();

      const titleY = sepY + 10;
      doc.fontSize(16).font('Helvetica-Bold')
         .fillColor(brandColor)
         .text('FACTURE', 50, titleY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`N° ${facture.numero}`, 50, titleY + 22)
         .text(`Date d'émission : ${formatDate(facture.date_emission)}`, 50, titleY + 34);
      if (facture.date_echeance)
        doc.text(`Échéance : ${formatDate(facture.date_echeance)}`, 50, titleY + 46);
      if (facture.objet)
        doc.text(`Objet : ${facture.objet}`, 50, titleY + 58);

      // ── Tableau des lignes ───────────────────────────────────────────
      let y = sepY + 100;
      const colX = [50, 240, 300, 355, 410, 470];
      const headers = ['Désignation', 'Qté', 'P.U. HT', 'Remise', 'TVA', 'Total HT'];

      doc.rect(50, y, W, 18).fill(brandColor);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => doc.text(h, colX[i], y + 5, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70 }));
      y += 22;

      doc.fillColor('#000000').font('Helvetica').fontSize(8);
      (facture.lignes ?? []).forEach((l: any, idx: number) => {
        if (idx % 2 === 0) doc.rect(50, y - 2, W, 18).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation, colX[0], y, { width: 186 });
        doc.text(String(l.quantite) + (l.unite ? ` ${l.unite}` : ''), colX[1], y, { width: 54 });
        doc.text(formatMontant(l.prix_unitaire_ht), colX[2], y, { width: 50 });
        doc.text(l.remise_pct ? `${l.remise_pct}%` : '—', colX[3], y, { width: 50 });
        doc.text(mentionTVA(facture.tva_mode, l.taux_tva_valeur), colX[4], y, { width: 56 });
        doc.text(formatMontant(l.montant_ht), colX[5], y, { width: 70, align: 'right' });
        y += 20;
      });

      // ── Totaux ───────────────────────────────────────────────────────
      doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#CCCCCC').stroke();
      y += 14;

      const totY = (label: string, val: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(label, 340, y, { width: 126, align: 'left' })
           .text(val,   470, y, { width:  70, align: 'right' });
        y += 16;
      };
      totY('Total HT', formatMontant(facture.montant_ht));
      totY('Total TVA', formatMontant(facture.montant_tva));
      totY('Total TTC', formatMontant(facture.montant_ttc), true);

      // ── Mention TVA spéciale ─────────────────────────────────────────
      if (facture.tva_mode !== 'normal') {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666')
           .text(mentionTVA(facture.tva_mode, 0), 50, y + 10, { width: W });
      }

      // ── Mention acquittée ────────────────────────────────────────────
      if (facture.statut === 'payee' && facture.date_paiement) {
        const modesLabel: Record<string, string> = {
          virement: 'Virement bancaire', cheque: 'Chèque', especes: 'Espèces',
          carte: 'Carte bancaire', prelevement: 'Prélèvement', paypal: 'PayPal', autre: 'Autre',
        };
        const modeLabel = facture.mode_paiement ? (modesLabel[facture.mode_paiement] ?? facture.mode_paiement) : null;
        const acquitteY = Math.max(y + 30, 680);
        doc.rect(50, acquitteY, W, 26).fillColor('#E8F5E9').stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#2E7D32')
           .text('ACQUITTÉE', 62, acquitteY + 8);
        doc.fontSize(9).font('Helvetica').fillColor('#2E7D32')
           .text(`Payée le ${formatDate(facture.date_paiement)}${modeLabel ? ` — ${modeLabel}` : ''}`,
             160, acquitteY + 9, { width: 330 });
        doc.fillColor('#000000');
      }

      // ── Pied de page légal ───────────────────────────────────────────
      const footerY = 760;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#CCCCCC').stroke();
      doc.fontSize(7).font('Helvetica').fillColor('#888888')
         .text(
           `${entreprise.raison_sociale}${entreprise.is_EI ? ' EI' : ''} — SIRET ${entreprise.siret}` +
           (entreprise.rcs_ville ? ` — RCS ${entreprise.rcs_ville}` : '') +
           (entreprise.capital_social ? ` — Capital ${formatMontant(entreprise.capital_social)}` : ''),
           50, footerY + 8, { width: W, align: 'center' }
         );

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // ── Factur-X XML (profil MINIMUM EN 16931) ───────────────────────
    const xmlPath = filePath.replace('.pdf', '_facturx.xml');
    fs.writeFileSync(xmlPath, FacturXService.genererXML(facture, entreprise, client), 'utf-8');

    return fileName;
  }

  static async genererDevisStream(devis: any, entreprise: any, client: any, outputStream: NodeJS.WritableStream): Promise<void> {
    // Pré-calcul logo
    let logoInfo: { abs: string; drawW: number; drawH: number; x: number; y: number } | null = null;
    if (entreprise.logo_path) {
      const logoPdf = path.resolve(process.cwd(), 'storage', 'logo', 'logo_pdf.png');
      const logoAbs = fs.existsSync(logoPdf)
        ? logoPdf
        : path.resolve(process.cwd(), (entreprise.logo_path as string).replace(/^\//, ''));
      if (fs.existsSync(logoAbs)) {
        try {
          const meta  = await sharp(logoAbs).metadata();
          const imgW  = meta.width ?? 200; const imgH = meta.height ?? 80;
          const scale = Math.min(240 / imgW, 90 / imgH);
          const drawW = imgW * scale; const drawH = imgH * scale;
          logoInfo = { abs: logoAbs, drawW, drawH, x: 545 - drawW, y: 35 + (90 - drawH) / 2 };
        } catch {}
      }
    }

    const brandColor      = logoInfo ? await extractDominantColor(logoInfo.abs) : '#1A3A5C';
    const brandColorLight = lightenColor(brandColor);

    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(outputStream);
      const W = 495;

      if (logoInfo) {
        try { doc.image(logoInfo.abs, logoInfo.x, logoInfo.y, { width: logoInfo.drawW, height: logoInfo.drawH }); } catch {}
      }

      // En-tête prestataire
      doc.fontSize(18).font('Helvetica-Bold').text(entreprise.raison_sociale + (entreprise.is_EI ? ' EI' : ''), 50, 50);
      const _a2off = entreprise.adresse2 ? 12 : 0;
      doc.fontSize(9).font('Helvetica')
         .text(entreprise.adresse, 50, 75);
      if (entreprise.adresse2) doc.text(entreprise.adresse2, 50, 87);
      doc.text(`${entreprise.code_postal} ${entreprise.ville}`, 50, 87 + _a2off)
         .text(`SIRET : ${entreprise.siret}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom) doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(entreprise.email, 50, 123 + _a2off);

      // Client
      const clientNom = client.type_client === 'professionnel'
        ? client.raison_sociale
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      doc.fontSize(11).font('Helvetica-Bold').text(clientNom, 350, clientY, { width: 195 });
      doc.fontSize(10).font('Helvetica')
         .text(client.adresse, 350, clientY + 16, { width: 195 })
         .text(`${client.code_postal} ${client.ville}`, 350, clientY + 28, { width: 195 });
      if (client.tva_intracom) doc.text(`TVA Intracom : ${client.tva_intracom}`, 350, clientY + 40, { width: 195 });

      // Titre
      const sepY = logoInfo ? 185 : 150;
      doc.moveTo(50, sepY).lineTo(545, sepY).strokeColor('#CCCCCC').stroke();
      const titleY = sepY + 10;
      doc.fontSize(16).font('Helvetica-Bold').fillColor(brandColor).text('DEVIS', 50, titleY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`N° ${devis.numero}`, 50, titleY + 22)
         .text(`Date : ${formatDate(devis.created_at)}`, 50, titleY + 34);
      if (devis.date_validite)
        doc.text(`Valable jusqu'au : ${formatDate(devis.date_validite)}`, 50, titleY + 46);
      if (devis.objet) doc.text(`Objet : ${devis.objet}`, 50, titleY + 58);

      // Tableau
      let y = sepY + 100;
      const colX = [50, 240, 300, 355, 410, 470];
      const headers = ['Désignation', 'Qté', 'P.U. HT', 'Remise', 'TVA', 'Total HT'];
      doc.rect(50, y, W, 18).fill(brandColor);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => doc.text(h, colX[i], y + 5, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70 }));
      y += 22;
      doc.fillColor('#000000').font('Helvetica').fontSize(8);
      (devis.lignes ?? []).forEach((l: any, idx: number) => {
        if (idx % 2 === 0) doc.rect(50, y - 2, W, 18).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation, colX[0], y, { width: 186 });
        doc.text(String(l.quantite) + (l.unite ? ` ${l.unite}` : ''), colX[1], y, { width: 54 });
        doc.text(formatMontant(l.prix_unitaire_ht), colX[2], y, { width: 50 });
        doc.text(l.remise_pct ? `${l.remise_pct}%` : '—', colX[3], y, { width: 50 });
        doc.text(mentionTVA('normal', l.taux_tva_valeur), colX[4], y, { width: 56 });
        doc.text(formatMontant(l.montant_ht), colX[5], y, { width: 70, align: 'right' });
        y += 20;
      });

      // Totaux
      doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#CCCCCC').stroke();
      y += 14;
      const totY = (label: string, val: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(label, 340, y, { width: 126, align: 'left' })
           .text(val,   470, y, { width:  70, align: 'right' });
        y += 16;
      };
      totY('Total HT', formatMontant(devis.montant_ht));
      totY('Total TVA', formatMontant(devis.montant_tva));
      totY('Total TTC', formatMontant(devis.montant_ttc), true);

      // Pied de page
      const footerY = 760;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#CCCCCC').stroke();
      doc.fontSize(7).font('Helvetica').fillColor('#888888')
         .text(
           `${entreprise.raison_sociale}${entreprise.is_EI ? ' EI' : ''} — SIRET ${entreprise.siret}` +
           (entreprise.rcs_ville ? ` — RCS ${entreprise.rcs_ville}` : '') +
           (entreprise.capital_social ? ` — Capital ${formatMontant(entreprise.capital_social)}` : ''),
           50, footerY + 8, { width: W, align: 'center' }
         );

      doc.end();
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
    });
  }

  static async genererBLStream(bl: any, entreprise: any, client: any, outputStream: NodeJS.WritableStream): Promise<void> {
    // Pré-calcul logo
    let logoInfo: { abs: string; drawW: number; drawH: number; x: number; y: number } | null = null;
    if (entreprise.logo_path) {
      const logoPdf = path.resolve(process.cwd(), 'storage', 'logo', 'logo_pdf.png');
      const logoAbs = fs.existsSync(logoPdf)
        ? logoPdf
        : path.resolve(process.cwd(), (entreprise.logo_path as string).replace(/^\//, ''));
      if (fs.existsSync(logoAbs)) {
        try {
          const meta  = await sharp(logoAbs).metadata();
          const imgW  = meta.width ?? 200; const imgH = meta.height ?? 80;
          const scale = Math.min(240 / imgW, 90 / imgH);
          const drawW = imgW * scale; const drawH = imgH * scale;
          logoInfo = { abs: logoAbs, drawW, drawH, x: 545 - drawW, y: 35 + (90 - drawH) / 2 };
        } catch {}
      }
    }

    const brandColor      = logoInfo ? await extractDominantColor(logoInfo.abs) : '#1A3A5C';
    const brandColorLight = lightenColor(brandColor);

    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(outputStream);
      const W = 495;

      if (logoInfo) {
        try { doc.image(logoInfo.abs, logoInfo.x, logoInfo.y, { width: logoInfo.drawW, height: logoInfo.drawH }); } catch {}
      }

      // En-tête prestataire
      doc.fontSize(18).font('Helvetica-Bold').text(entreprise.raison_sociale + (entreprise.is_EI ? ' EI' : ''), 50, 50);
      const _a2off = entreprise.adresse2 ? 12 : 0;
      doc.fontSize(9).font('Helvetica')
         .text(entreprise.adresse, 50, 75);
      if (entreprise.adresse2) doc.text(entreprise.adresse2, 50, 87);
      doc.text(`${entreprise.code_postal} ${entreprise.ville}`, 50, 87 + _a2off)
         .text(`SIRET : ${entreprise.siret}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom) doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(entreprise.email, 50, 123 + _a2off);

      // Client
      const clientNom = client.type_client === 'professionnel'
        ? client.raison_sociale
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      doc.fontSize(11).font('Helvetica-Bold').text(clientNom, 350, clientY, { width: 195 });
      doc.fontSize(10).font('Helvetica')
         .text(client.adresse, 350, clientY + 16, { width: 195 })
         .text(`${client.code_postal} ${client.ville}`, 350, clientY + 28, { width: 195 });

      // Titre
      const sepY = logoInfo ? 185 : 150;
      doc.moveTo(50, sepY).lineTo(545, sepY).strokeColor('#CCCCCC').stroke();
      const titleY = sepY + 10;
      doc.fontSize(16).font('Helvetica-Bold').fillColor(brandColor).text('BON DE LIVRAISON', 50, titleY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`N° ${bl.numero}`, 50, titleY + 22)
         .text(`Date : ${formatDate(bl.date_emission)}`, 50, titleY + 34);
      if (bl.date_livraison)
        doc.text(`Date de livraison : ${formatDate(bl.date_livraison)}`, 50, titleY + 46);
      if (bl.lieu_livraison)
        doc.text(`Lieu de livraison : ${bl.lieu_livraison}`, 50, titleY + (bl.date_livraison ? 58 : 46));
      if (bl.devis_id)
        doc.text(`Réf. devis : ${bl.devis_ref ?? bl.devis_id}`, 350, titleY + 22, { width: 195 });
      if (bl.facture_id)
        doc.text(`Réf. facture : ${bl.facture_ref ?? bl.facture_id}`, 350, titleY + 34, { width: 195 });

      // Tableau
      let y = sepY + 100;
      const colX = [50, 310, 390, 460];
      const headers = ['Désignation', 'Quantité', 'Unité', 'Réf. article'];
      doc.rect(50, y, W, 18).fill(brandColor);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        const w = i < headers.length - 1 ? colX[i + 1] - colX[i] - 4 : 85;
        doc.text(h, colX[i], y + 5, { width: w });
      });
      y += 22;
      doc.fillColor('#000000').font('Helvetica').fontSize(8);
      (bl.lignes ?? []).forEach((l: any, idx: number) => {
        if (idx % 2 === 0) doc.rect(50, y - 2, W, 18).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation + (l.description ? `\n${l.description}` : ''), colX[0], y, { width: 255 });
        doc.text(String(l.quantite), colX[1], y, { width: 75 });
        doc.text(l.unite ?? '—', colX[2], y, { width: 65 });
        doc.text(l.article_id ? String(l.article_id) : '—', colX[3], y, { width: 85 });
        y += 20;
      });

      // Notes
      if (bl.notes) {
        y += 10;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#CCCCCC').stroke();
        y += 10;
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#000000').text('Notes :', 50, y);
        y += 14;
        doc.fontSize(9).font('Helvetica').text(bl.notes, 50, y, { width: W });
        y += doc.heightOfString(bl.notes, { width: W }) + 10;
      }

      // Zone signature
      const sigY = Math.max(y + 30, 660);
      doc.moveTo(50, sigY).lineTo(545, sigY).strokeColor('#CCCCCC').stroke();
      doc.fontSize(9).font('Helvetica').fillColor('#555555')
         .text('Signature du destinataire :', 350, sigY + 8)
         .text('(Bon pour accord de réception)', 350, sigY + 20, { width: 195, align: 'right' });
      doc.rect(350, sigY + 35, 195, 50).strokeColor('#CCCCCC').stroke();

      // Pied de page
      const footerY = 760;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#CCCCCC').stroke();
      doc.fontSize(7).font('Helvetica').fillColor('#888888')
         .text(
           `${entreprise.raison_sociale}${entreprise.is_EI ? ' EI' : ''} — SIRET ${entreprise.siret}` +
           (entreprise.rcs_ville ? ` — RCS ${entreprise.rcs_ville}` : ''),
           50, footerY + 8, { width: W, align: 'center' }
         );

      doc.end();
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
    });
  }

  static async genererFactureStream(facture: any, entreprise: any, client: any, outputStream: NodeJS.WritableStream): Promise<void> {
    let logoInfo: { abs: string; drawW: number; drawH: number; x: number; y: number } | null = null;
    if (entreprise.logo_path) {
      const logoPdf = path.resolve(process.cwd(), 'storage', 'logo', 'logo_pdf.png');
      const logoAbs = fs.existsSync(logoPdf)
        ? logoPdf
        : path.resolve(process.cwd(), (entreprise.logo_path as string).replace(/^\//, ''));
      if (fs.existsSync(logoAbs)) {
        try {
          const meta = await sharp(logoAbs).metadata();
          const imgW = meta.width ?? 200; const imgH = meta.height ?? 80;
          const scale = Math.min(240 / imgW, 90 / imgH);
          const drawW = imgW * scale; const drawH = imgH * scale;
          logoInfo = { abs: logoAbs, drawW, drawH, x: 545 - drawW, y: 35 + (90 - drawH) / 2 };
        } catch {}
      }
    }
    const brandColor      = logoInfo ? await extractDominantColor(logoInfo.abs) : '#1A3A5C';
    const brandColorLight = lightenColor(brandColor);

    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(outputStream);
      const W = 495;

      if (logoInfo) {
        try { doc.image(logoInfo.abs, logoInfo.x, logoInfo.y, { width: logoInfo.drawW, height: logoInfo.drawH }); } catch {}
      }

      doc.fontSize(18).font('Helvetica-Bold')
         .text(entreprise.raison_sociale + (entreprise.is_EI ? ' EI' : ''), 50, 50);
      const _a2off = entreprise.adresse2 ? 12 : 0;
      doc.fontSize(9).font('Helvetica')
         .text(`${entreprise.adresse}`, 50, 75);
      if (entreprise.adresse2) doc.text(entreprise.adresse2, 50, 87);
      doc.text(`${entreprise.code_postal} ${entreprise.ville}`, 50, 87 + _a2off)
         .text(`SIRET : ${entreprise.siret}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom)
        doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(`${entreprise.email}`, 50, 123 + _a2off);

      const clientNom = client.type_client === 'professionnel'
        ? client.raison_sociale
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      doc.fontSize(11).font('Helvetica-Bold').text(clientNom, 350, clientY, { width: 195 });
      doc.fontSize(10).font('Helvetica')
         .text(client.adresse, 350, clientY + 16, { width: 195 })
         .text(`${client.code_postal} ${client.ville}`, 350, clientY + 28, { width: 195 });
      if (client.tva_intracom)
        doc.text(`TVA Intracom : ${client.tva_intracom}`, 350, clientY + 40, { width: 195 });

      const sepY = logoInfo ? 185 : 150;
      doc.moveTo(50, sepY).lineTo(545, sepY).strokeColor('#CCCCCC').stroke();
      const titleY = sepY + 10;
      doc.fontSize(16).font('Helvetica-Bold').fillColor(brandColor).text('FACTURE', 50, titleY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`N° ${facture.numero}`, 50, titleY + 22)
         .text(`Date d'émission : ${formatDate(facture.date_emission)}`, 50, titleY + 34);
      if (facture.date_echeance)
        doc.text(`Échéance : ${formatDate(facture.date_echeance)}`, 50, titleY + 46);
      if (facture.objet)
        doc.text(`Objet : ${facture.objet}`, 50, titleY + 58);

      let y = sepY + 100;
      const colX = [50, 240, 300, 355, 410, 470];
      const headers = ['Désignation', 'Qté', 'P.U. HT', 'Remise', 'TVA', 'Total HT'];
      doc.rect(50, y, W, 18).fill(brandColor);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => doc.text(h, colX[i], y + 5, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70 }));
      y += 22;

      doc.fillColor('#000000').font('Helvetica').fontSize(8);
      (facture.lignes ?? []).forEach((l: any, idx: number) => {
        if (idx % 2 === 0) doc.rect(50, y - 2, W, 18).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation, colX[0], y, { width: 186 });
        doc.text(String(l.quantite) + (l.unite ? ` ${l.unite}` : ''), colX[1], y, { width: 54 });
        doc.text(formatMontant(l.prix_unitaire_ht), colX[2], y, { width: 50 });
        doc.text(l.remise_pct ? `${l.remise_pct}%` : '—', colX[3], y, { width: 50 });
        doc.text(mentionTVA(facture.tva_mode, l.taux_tva_valeur), colX[4], y, { width: 56 });
        doc.text(formatMontant(l.montant_ht), colX[5], y, { width: 70, align: 'right' });
        y += 20;
      });

      doc.moveTo(50, y + 4).lineTo(545, y + 4).strokeColor('#CCCCCC').stroke();
      y += 14;
      const totY = (label: string, val: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(label, 340, y, { width: 126, align: 'left' })
           .text(val,   470, y, { width:  70, align: 'right' });
        y += 16;
      };
      totY('Total HT', formatMontant(facture.montant_ht));
      totY('Total TVA', formatMontant(facture.montant_tva));
      totY('Total TTC', formatMontant(facture.montant_ttc), true);

      if (facture.tva_mode !== 'normal') {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666')
           .text(mentionTVA(facture.tva_mode, 0), 50, y + 10, { width: W });
      }

      if (facture.statut === 'payee' && facture.date_paiement) {
        const modesLabel: Record<string, string> = {
          virement: 'Virement bancaire', cheque: 'Chèque', especes: 'Espèces',
          carte: 'Carte bancaire', prelevement: 'Prélèvement', paypal: 'PayPal', autre: 'Autre',
        };
        const modeLabel = facture.mode_paiement ? (modesLabel[facture.mode_paiement] ?? facture.mode_paiement) : null;
        const acquitteY = Math.max(y + 30, 680);
        doc.rect(50, acquitteY, W, 26).fillColor('#E8F5E9').stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#2E7D32')
           .text('ACQUITTÉE', 62, acquitteY + 8);
        doc.fontSize(9).font('Helvetica').fillColor('#2E7D32')
           .text(`Payée le ${formatDate(facture.date_paiement)}${modeLabel ? ` — ${modeLabel}` : ''}`,
             160, acquitteY + 9, { width: 330 });
        doc.fillColor('#000000');
      }

      const footerY = 760;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#CCCCCC').stroke();
      doc.fontSize(7).font('Helvetica').fillColor('#888888')
         .text(
           `${entreprise.raison_sociale}${entreprise.is_EI ? ' EI' : ''} — SIRET ${entreprise.siret}` +
           (entreprise.rcs_ville ? ` — RCS ${entreprise.rcs_ville}` : '') +
           (entreprise.capital_social ? ` — Capital ${formatMontant(entreprise.capital_social)}` : ''),
           50, footerY + 8, { width: W, align: 'center' }
         );

      doc.end();
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
    });
  }

  static async genererAcompteStream(acompte: any, entreprise: any, client: any, outputStream: NodeJS.WritableStream): Promise<void> {
    let logoInfo: { abs: string; drawW: number; drawH: number; x: number; y: number } | null = null;
    if (entreprise.logo_path) {
      const logoPdf = path.resolve(process.cwd(), 'storage', 'logo', 'logo_pdf.png');
      const logoAbs = fs.existsSync(logoPdf)
        ? logoPdf
        : path.resolve(process.cwd(), (entreprise.logo_path as string).replace(/^\//, ''));
      if (fs.existsSync(logoAbs)) {
        try {
          const meta = await sharp(logoAbs).metadata();
          const imgW = meta.width ?? 200; const imgH = meta.height ?? 80;
          const scale = Math.min(240 / imgW, 90 / imgH);
          const drawW = imgW * scale; const drawH = imgH * scale;
          logoInfo = { abs: logoAbs, drawW, drawH, x: 545 - drawW, y: 35 + (90 - drawH) / 2 };
        } catch {}
      }
    }
    const brandColor      = logoInfo ? await extractDominantColor(logoInfo.abs) : '#1A3A5C';
    const brandColorLight = lightenColor(brandColor);

    return new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ size: 'A4', margin: 50 });
      doc.pipe(outputStream);
      const W = 495;

      if (logoInfo) {
        try { doc.image(logoInfo.abs, logoInfo.x, logoInfo.y, { width: logoInfo.drawW, height: logoInfo.drawH }); } catch {}
      }

      doc.fontSize(18).font('Helvetica-Bold')
         .text(entreprise.raison_sociale + (entreprise.is_EI ? ' EI' : ''), 50, 50);
      const _a2off = entreprise.adresse2 ? 12 : 0;
      doc.fontSize(9).font('Helvetica')
         .text(entreprise.adresse, 50, 75);
      if (entreprise.adresse2) doc.text(entreprise.adresse2, 50, 87);
      doc.text(`${entreprise.code_postal} ${entreprise.ville}`, 50, 87 + _a2off)
         .text(`SIRET : ${entreprise.siret}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom) doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(entreprise.email, 50, 123 + _a2off);

      const clientNom = client.type_client === 'professionnel'
        ? client.raison_sociale
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      doc.fontSize(11).font('Helvetica-Bold').text(clientNom, 350, clientY, { width: 195 });
      doc.fontSize(10).font('Helvetica')
         .text(client.adresse, 350, clientY + 16, { width: 195 })
         .text(`${client.code_postal} ${client.ville}`, 350, clientY + 28, { width: 195 });

      const sepY = logoInfo ? 185 : 150;
      doc.moveTo(50, sepY).lineTo(545, sepY).strokeColor('#CCCCCC').stroke();
      const titleY = sepY + 10;
      doc.fontSize(16).font('Helvetica-Bold').fillColor(brandColor)
         .text('FACTURE D\'ACOMPTE', 50, titleY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`N° ${acompte.numero}`, 50, titleY + 22)
         .text(`Date : ${formatDate(acompte.created_at)}`, 50, titleY + 34);
      if (acompte.pourcentage)
        doc.text(`Acompte de ${acompte.pourcentage} %`, 50, titleY + 46);

      // Tableau
      let y = sepY + 100;
      const colX = [50, 310, 390, 470];
      const headers = ['Désignation', 'Taux TVA', 'Montant HT', 'Montant TTC'];
      doc.rect(50, y, W, 18).fill(brandColor);
      doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
      headers.forEach((h, i) => {
        const w = i < headers.length - 1 ? colX[i + 1] - colX[i] - 4 : 75;
        doc.text(h, colX[i], y + 5, { width: w });
      });
      y += 22;
      doc.rect(50, y - 2, W, 18).fill(brandColorLight);
      doc.fillColor('#000000').font('Helvetica').fontSize(9)
         .text(`Acompte${acompte.pourcentage ? ` (${acompte.pourcentage} %)` : ''}`, colX[0], y, { width: 256 })
         .text(`${acompte.taux_tva_valeur} %`, colX[1], y, { width: 76 })
         .text(formatMontant(acompte.montant_ht),  colX[2], y, { width: 76, align: 'left' })
         .text(formatMontant(acompte.montant_ttc), colX[3], y, { width: 75, align: 'left' });
      y += 28;

      doc.moveTo(50, y).lineTo(545, y).strokeColor('#CCCCCC').stroke();
      y += 14;
      const totY = (label: string, val: string, bold = false) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9)
           .text(label, 340, y, { width: 126, align: 'left' })
           .text(val,   470, y, { width:  70, align: 'right' });
        y += 16;
      };
      totY('Montant HT',  formatMontant(acompte.montant_ht));
      totY('TVA',         formatMontant(acompte.montant_tva));
      totY('Montant TTC', formatMontant(acompte.montant_ttc), true);

      if (acompte.statut === 'encaisse' && acompte.date_encaissement) {
        const modesLabel: Record<string, string> = {
          virement: 'Virement bancaire', cheque: 'Chèque', especes: 'Espèces',
          carte: 'Carte bancaire', prelevement: 'Prélèvement', paypal: 'PayPal', autre: 'Autre',
        };
        const modeLabel = acompte.mode_paiement ? (modesLabel[acompte.mode_paiement] ?? acompte.mode_paiement) : null;
        const acquitteY = Math.max(y + 30, 680);
        doc.rect(50, acquitteY, W, 26).fillColor('#E8F5E9').stroke();
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#2E7D32')
           .text('ENCAISSÉ', 62, acquitteY + 8);
        doc.fontSize(9).font('Helvetica').fillColor('#2E7D32')
           .text(`Encaissé le ${formatDate(acompte.date_encaissement)}${modeLabel ? ` — ${modeLabel}` : ''}`,
             160, acquitteY + 9, { width: 330 });
        doc.fillColor('#000000');
      }

      const footerY = 760;
      doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#CCCCCC').stroke();
      doc.fontSize(7).font('Helvetica').fillColor('#888888')
         .text(
           `${entreprise.raison_sociale}${entreprise.is_EI ? ' EI' : ''} — SIRET ${entreprise.siret}` +
           (entreprise.rcs_ville ? ` — RCS ${entreprise.rcs_ville}` : '') +
           (entreprise.capital_social ? ` — Capital ${formatMontant(entreprise.capital_social)}` : ''),
           50, footerY + 8, { width: W, align: 'center' }
         );

      doc.end();
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
    });
  }

  static genererXML(facture: any, entreprise: any, client: any): string {
    const clientNom = client.type_client === 'professionnel'
      ? client.raison_sociale
      : `${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

    const lignesXML = (facture.lignes ?? []).map((l: any, i: number) => `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument>
        <ram:LineID>${i + 1}</ram:LineID>
      </ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct>
        <ram:Name>${l.designation}</ram:Name>
      </ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice>
          <ram:ChargeAmount>${l.prix_unitaire_ht.toFixed(2)}</ram:ChargeAmount>
        </ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery>
        <ram:BilledQuantity unitCode="${l.unite ?? 'C62'}">${l.quantite}</ram:BilledQuantity>
      </ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:RateApplicablePercent>${l.taux_tva_valeur}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation>
          <ram:LineTotalAmount>${l.montant_ht.toFixed(2)}</ram:LineTotalAmount>
        </ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice
  xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100"
  xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100"
  xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter>
      <ram:ID>urn:factur-x.eu:1p0:en16931</ram:ID>
    </ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${facture.numero}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime>
      <udt:DateTimeString format="102">${facture.date_emission.replace(/[-T:Z.]/g, '').slice(0, 8)}</udt:DateTimeString>
    </ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>
    ${lignesXML}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${entreprise.raison_sociale}${entreprise.is_EI ? ' EI' : ''}</ram:Name>
        <ram:SpecifiedTaxRegistration>
          <ram:ID schemeID="VA">${entreprise.tva_intracom ?? ''}</ram:ID>
        </ram:SpecifiedTaxRegistration>
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${clientNom}</ram:Name>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${facture.montant_ht.toFixed(2)}</ram:LineTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${facture.montant_tva.toFixed(2)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${facture.montant_ttc.toFixed(2)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${facture.montant_ttc.toFixed(2)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
  }
}
