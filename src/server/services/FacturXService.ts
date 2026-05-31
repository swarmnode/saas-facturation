import PDFDocument from 'pdfkit';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { PDFDocument as PdfLib, AFRelationship, PDFName } from 'pdf-lib';

const STORAGE_PDF = path.resolve(process.cwd(), 'storage', 'pdf');

// Formate un SIRET en xxx xxx xxx xxxxx
function formatSiret(s: string | null | undefined): string {
  if (!s) return s ?? '';
  const d = String(s).replace(/s/g, '');
  return d.length === 14 ? `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6,9)} ${d.slice(9)}` : s;
}

// ── Helper : bloc client (nom + adresse + adresse2 + ville + TVA) ──────────
function drawClientBlock(doc: any, client: any, clientNom: string, clientY: number): void {
  let y = clientY;
  doc.fontSize(11).font('Helvetica-Bold').text(clientNom, 350, y, { width: 195, lineBreak: false });
  doc.fontSize(10).font('Helvetica');
  y += 16; doc.text(client.adresse, 350, y, { width: 195, lineBreak: false });
  if (client.adresse2) { y += 12; doc.text(client.adresse2, 350, y, { width: 195, lineBreak: false }); }
  y += 12; doc.text(`${client.code_postal} ${client.ville}`, 350, y, { width: 195, lineBreak: false });
  if (client.tva_intracom) { y += 12; doc.text(`TVA Intracom : ${client.tva_intracom}`, 350, y, { width: 195, lineBreak: false }); }
}

// ── Embedding Factur-X XML dans le PDF (post-processing pdf-lib) ───────────
async function embedFacturXML(pdfPath: string, xmlContent: string): Promise<void> {
  const pdfBytes = fs.readFileSync(pdfPath);
  const pdfDoc   = await PdfLib.load(pdfBytes);

  // 1. Attacher le XML avec AFRelationship = Alternative (profil MINIMUM/EN16931)
  await pdfDoc.attach(
    Buffer.from(xmlContent, 'utf-8'),
    'factur-x.xml',
    {
      mimeType:         'application/xml',
      description:      'Factur-X XML invoice',
      creationDate:     new Date(),
      modificationDate: new Date(),
      afRelationship:   AFRelationship.Alternative,
    }
  );

  // 2. Ajouter l'entrée /AF au catalogue (Associated Files — requis Factur-X)
  //    pdf-lib 1.17 ne le fait pas automatiquement, on l'injecte manuellement
  const catalog = pdfDoc.catalog;
  const names   = catalog.get(PDFName.of('Names'));
  if (names) {
    // Trouver la référence du fichier embarqué dans EmbeddedFiles
    const embeddedFiles = (names as any).get?.(PDFName.of('EmbeddedFiles'));
    if (embeddedFiles) {
      const namesArray = (embeddedFiles as any).get?.(PDFName.of('Names'));
      if (namesArray && (namesArray as any).array?.length >= 2) {
        const fileRef = (namesArray as any).array[1];
        const { PDFArray: PdfArray } = await import('pdf-lib');
        const afArray = pdfDoc.context.obj([fileRef]);
        catalog.set(PDFName.of('AF'), afArray);
      }
    }
  }

  // 3. Injecter les métadonnées XMP déclarant PDF/A-3b + profil Factur-X MINIMUM
  const xmp = buildFacturXXMP();
  const xmpBytes = Buffer.from(xmp, 'utf-8');
  const metaStream = pdfDoc.context.stream(xmpBytes, {
    Type:    'Metadata',
    Subtype: 'XML',
    Length:  xmpBytes.length,
  });
  pdfDoc.catalog.set(PDFName.of('Metadata'), pdfDoc.context.register(metaStream));

  fs.writeFileSync(pdfPath, await pdfDoc.save());
}

function buildFacturXXMP(): string {
  return `<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
    <rdf:Description rdf:about=""
        xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/">
      <pdfaid:part>3</pdfaid:part>
      <pdfaid:conformance>B</pdfaid:conformance>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:fx="urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#">
      <fx:DocumentType>INVOICE</fx:DocumentType>
      <fx:DocumentFileName>factur-x.xml</fx:DocumentFileName>
      <fx:Version>1.0</fx:Version>
      <fx:ConformanceLevel>MINIMUM</fx:ConformanceLevel>
    </rdf:Description>
    <rdf:Description rdf:about=""
        xmlns:pdfaSchema="http://www.aiim.org/pdfa/ns/schema#"
        xmlns:pdfaProperty="http://www.aiim.org/pdfa/ns/property#">
      <pdfaSchema:schemas>
        <rdf:Bag>
          <rdf:li rdf:parseType="Resource">
            <pdfaSchema:schema>Factur-X PDFA Extension Schema</pdfaSchema:schema>
            <pdfaSchema:namespaceURI>urn:factur-x:pdfa:CrossIndustryDocument:invoice:1p0#</pdfaSchema:namespaceURI>
            <pdfaSchema:prefix>fx</pdfaSchema:prefix>
            <pdfaSchema:property>
              <rdf:Seq>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentFileName</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Nom du fichier XML embarqué</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>DocumentType</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>INVOICE</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>Version</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Version du schéma XML Factur-X</pdfaProperty:description>
                </rdf:li>
                <rdf:li rdf:parseType="Resource">
                  <pdfaProperty:name>ConformanceLevel</pdfaProperty:name>
                  <pdfaProperty:valueType>Text</pdfaProperty:valueType>
                  <pdfaProperty:category>external</pdfaProperty:category>
                  <pdfaProperty:description>Niveau de conformité Factur-X</pdfaProperty:description>
                </rdf:li>
              </rdf:Seq>
            </pdfaSchema:property>
          </rdf:li>
        </rdf:Bag>
      </pdfaSchema:schemas>
    </rdf:Description>
  </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`
;
}

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
         .text(`SIRET : ${formatSiret(entreprise.siret)}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom)
        doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(`${entreprise.email}`, 50, 123 + _a2off);

      // ── Client ───────────────────────────────────────────────────────
      const clientNom = client.type_client === 'professionnel'
        ? (client.raison_sociale || `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim())
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();

      const clientY = logoInfo ? 130 : 75;
      doc.fontSize(11).font('Helvetica-Bold')
         drawClientBlock(doc, client, clientNom, clientY);

      // ── Titre facture ────────────────────────────────────────────────
      const sepY = logoInfo ? 185 : 150;
      doc.moveTo(50, sepY).lineTo(545, sepY).strokeColor('#CCCCCC').stroke();

      const titleY = sepY + 10;
      const isAvoir = facture.type_facture === 'avoir';
      doc.fontSize(16).font('Helvetica-Bold')
         .fillColor(brandColor)
         .text(isAvoir ? 'AVOIR' : 'FACTURE', 50, titleY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`N° ${facture.numero}`, 50, titleY + 22)
         .text(`Date d'émission : ${formatDate(facture.date_emission)}`, 50, titleY + 34);
      if (isAvoir && facture.facture_origine_numero)
        doc.text(`Avoir sur facture : ${facture.facture_origine_numero}`, 50, titleY + 46);
      if (facture.date_echeance)
        doc.text(`Échéance : ${formatDate(facture.date_echeance)}`, 50, isAvoir ? titleY + 58 : titleY + 46);
      if (facture.objet)
        doc.text(`Objet : ${facture.objet}`, 50, titleY + (isAvoir ? 70 : 58));

      // ── Tableau des lignes ───────────────────────────────────────────
      let y = sepY + 100;
      const colX = [50, 240, 300, 355, 410, 470];
      const headers = ['Désignation', 'Qté', 'P.U. HT', 'Remise', 'TVA', 'Total HT'];
      const PAGE_SAFE_BOT_F = 642;
      const CONT_TOP_F      = 60;
      const ROW_H_F         = 20;
      const DESC_H_F        = 12;

      const drawFacHeader = () => {
        doc.rect(50, y, W, 18).fill(brandColor);
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        headers.forEach((h, i) => doc.text(h, colX[i], y + 5, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70 }));
        y += 22;
        doc.fillColor('#000000').font('Helvetica').fontSize(8);
      };
      drawFacHeader();

      (facture.lignes ?? []).forEach((l: any, idx: number) => {
        const rowH = l.description ? ROW_H_F + DESC_H_F : ROW_H_F;
        if (y + rowH > PAGE_SAFE_BOT_F) { doc.addPage(); y = CONT_TOP_F; drawFacHeader(); }
        if (idx % 2 === 0) doc.rect(50, y - 2, W, rowH).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation, colX[0], y, { width: 186, lineBreak: false });
        doc.text(String(l.quantite) + (l.unite ? ` ${l.unite}` : ''), colX[1], y, { width: 54,  lineBreak: false });
        doc.text(formatMontant(l.prix_unitaire_ht), colX[2], y, { width: 50,  lineBreak: false });
        doc.text(l.remise_pct ? `${l.remise_pct}%` : '—', colX[3], y, { width: 50,  lineBreak: false });
        doc.text(mentionTVA(facture.tva_mode, l.taux_tva_valeur), colX[4], y, { width: 56,  lineBreak: false });
        doc.text(formatMontant(l.montant_ht), colX[5], y, { width: 70,  lineBreak: false, align: 'right' });
        if (l.description) {
          doc.fontSize(7).fillColor('#666666')
             .text(l.description, colX[0] + 2, y + ROW_H_F - 2, { width: 184, lineBreak: false });
          doc.fontSize(8).fillColor('#000000');
        }
        y += rowH;
      });
      if (y > PAGE_SAFE_BOT_F) doc.addPage();

      // ── Totaux ancrés en bas à droite — même position que le devis ──────
      const BOTTOM = 744; // = sigBotY du devis (660 + 14 + 70)
      const drawTot = (label: string, val: string, bold: boolean, yOff: number) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000')
           .text(label, 340, BOTTOM - yOff, { width: 126, align: 'left',  lineBreak: false })
           .text(val,   470, BOTTOM - yOff, { width:  70, align: 'right', lineBreak: false });
      };
      drawTot('Total HT',  formatMontant(facture.montant_ht),  false, 36);
      drawTot('Total TVA', formatMontant(facture.montant_tva), false, 18);
      drawTot('Total TTC', formatMontant(facture.montant_ttc), true,   0);
      doc.moveTo(340, BOTTOM - 44).lineTo(545, BOTTOM - 44).strokeColor('#CCCCCC').stroke();

      // ── Mention TVA spéciale ─────────────────────────────────────────
      if (facture.tva_mode !== 'normal') {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666')
           .text(mentionTVA(facture.tva_mode, 0), 50, BOTTOM - 44, { width: 260, lineBreak: false });
      }

      // ── Mention acquittée ────────────────────────────────────────────
      if (facture.statut === 'payee' && facture.date_paiement) {
        const modesLabel: Record<string, string> = {
          virement: 'Virement bancaire', cheque: 'Chèque', especes: 'Espèces',
          carte: 'Carte bancaire', prelevement: 'Prélèvement', paypal: 'PayPal', autre: 'Autre',
        };
        const modeLabel = facture.mode_paiement ? (modesLabel[facture.mode_paiement] ?? facture.mode_paiement) : null;
        doc.rect(50, BOTTOM - 60, 260, 22).fillColor('#E8F5E9').stroke();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#2E7D32')
           .text('ACQUITTÉE', 58, BOTTOM - 55, { lineBreak: false });
        doc.fontSize(8).font('Helvetica').fillColor('#2E7D32')
           .text(`Payée le ${formatDate(facture.date_paiement)}${modeLabel ? ` — ${modeLabel}` : ''}`,
                 120, BOTTOM - 55, { width: 180, lineBreak: false });
        doc.fillColor('#000000');
      }

      doc.end();
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // ── Factur-X : embedding XML dans le PDF (pdf-lib post-processing) ──
    const xmlContent = FacturXService.genererXML(facture, entreprise, client);
    await embedFacturXML(filePath, xmlContent);

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
         .text(`SIRET : ${formatSiret(entreprise.siret)}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom) doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(entreprise.email, 50, 123 + _a2off);

      // Client
      const clientNom = client.type_client === 'professionnel'
        ? (client.raison_sociale || `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim())
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      drawClientBlock(doc, client, clientNom, clientY);

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

      const PAGE_SAFE_BOT = 642;   // 792 - 150 : espace réservé pour sig + totaux
      const CONT_TOP      = 60;    // Y de reprise du tableau sur les pages suivantes
      const ROW_H         = 20;
      const DESC_H        = 12;    // hauteur supplémentaire si description présente

      function drawTableHeader() {
        doc.rect(50, y, W, 18).fill(brandColor);
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        headers.forEach((h, i) => doc.text(h, colX[i], y + 5, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70 }));
        y += 22;
        doc.fillColor('#000000').font('Helvetica').fontSize(8);
      }

      drawTableHeader();

      (devis.lignes ?? []).forEach((l: any, idx: number) => {
        const rowH = l.description ? ROW_H + DESC_H : ROW_H;
        // Saut de page si plus assez de place
        if (y + rowH > PAGE_SAFE_BOT) {
          doc.addPage();
          y = CONT_TOP;
          drawTableHeader();
        }
        if (idx % 2 === 0) doc.rect(50, y - 2, W, rowH).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation, colX[0], y, { width: 186, lineBreak: false });
        doc.text(String(l.quantite) + (l.unite ? ` ${l.unite}` : ''), colX[1], y, { width: 54,  lineBreak: false });
        doc.text(formatMontant(l.prix_unitaire_ht), colX[2], y, { width: 50,  lineBreak: false });
        doc.text(l.remise_pct ? `${l.remise_pct}%` : '—', colX[3], y, { width: 50,  lineBreak: false });
        doc.text(mentionTVA('normal', l.taux_tva_valeur), colX[4], y, { width: 56,  lineBreak: false });
        doc.text(formatMontant(l.montant_ht), colX[5], y, { width: 70,  lineBreak: false, align: 'right' });
        if (l.description) {
          doc.fontSize(7).fillColor('#666666')
             .text(l.description, colX[0] + 2, y + ROW_H - 2, { width: 184, lineBreak: false });
          doc.fontSize(8).fillColor('#000000');
        }
        y += rowH;
      });

      // Si le curseur dépasse la zone footer, on ajoute une page pour sig+totaux
      if (y > PAGE_SAFE_BOT) {
        doc.addPage();
      }

      // ── Totaux (droite) + Signature avec date (gauche) ──────────────────
      const bottomY  = 660;
      const sigBoxX  = 50, sigBoxW = 230, sigBoxH = 70;
      const sigTop   = bottomY + 14;            // haut du cadre
      const sigBotY  = sigTop + sigBoxH;        // bas du cadre = 744

      // Signature — gauche
      doc.fontSize(7).font('Helvetica-Bold').fillColor('#555555')
         .text('BON POUR ACCORD — SIGNATURE DU CLIENT', sigBoxX, bottomY, { width: sigBoxW, lineBreak: false });
      doc.rect(sigBoxX, sigTop, sigBoxW, sigBoxH).strokeColor('#BBBBBB').stroke();
      doc.fontSize(8).font('Helvetica').fillColor('#555555')
         .text('Date :', sigBoxX + 8, sigTop + 8, { lineBreak: false });
      doc.moveTo(sigBoxX + 40, sigTop + 20).lineTo(sigBoxX + sigBoxW - 10, sigTop + 20)
         .strokeColor('#CCCCCC').stroke();
      doc.fontSize(7).font('Helvetica-Oblique').fillColor('#aaaaaa')
         .text('Précédé de la mention « Bon pour accord »', sigBoxX, sigBotY + 4,
               { width: sigBoxW, lineBreak: false });

      // Totaux — droite, Total TTC aligné sur le bas du cadre
      const totD = (label: string, val: string, bold: boolean, yOff: number) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000')
           .text(label, 340, sigBotY - yOff, { width: 126, align: 'left',  lineBreak: false })
           .text(val,   470, sigBotY - yOff, { width:  70, align: 'right', lineBreak: false });
      };
      totD('Total HT',  formatMontant(devis.montant_ht),  false, 36);
      totD('Total TVA', formatMontant(devis.montant_tva), false, 18);
      totD('Total TTC', formatMontant(devis.montant_ttc), true,   0);
      doc.moveTo(340, sigBotY - 44).lineTo(545, sigBotY - 44).strokeColor('#CCCCCC').stroke();

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
         .text(`SIRET : ${formatSiret(entreprise.siret)}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom) doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(entreprise.email, 50, 123 + _a2off);

      // Client
      const clientNom = client.type_client === 'professionnel'
        ? (client.raison_sociale || `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim())
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      drawClientBlock(doc, client, clientNom, clientY);

      // Titre
      const sepY = logoInfo ? 185 : 150;
      doc.moveTo(50, sepY).lineTo(545, sepY).strokeColor('#CCCCCC').stroke();
      const titleY = sepY + 10;
      doc.fontSize(16).font('Helvetica-Bold').fillColor(brandColor).text('BON DE LIVRAISON', 50, titleY);
      doc.fontSize(10).font('Helvetica').fillColor('#000000')
         .text(`N° ${bl.numero}`, 50, titleY + 22)
         .text(`Date : ${formatDate(bl.date_emission)}`, 50, titleY + 34);
      if (bl.lieu_livraison)
        doc.text(`Lieu de livraison : ${bl.lieu_livraison}`, 50, titleY + 46);
      if (bl.devis_id)
        doc.text(`Réf. devis : ${bl.devis_ref ?? bl.devis_id}`, 350, titleY + 22, { width: 195 });
      if (bl.facture_id)
        doc.text(`Réf. facture : ${bl.facture_ref ?? bl.facture_id}`, 350, titleY + 34, { width: 195 });

      // Tableau
      let y = sepY + 100;
      const colX = [50, 310, 390, 460];
      const headers = ['Désignation', 'Quantité', 'Unité', 'Réf. article'];
      const PAGE_SAFE_BOT_BL = 690; // sigY=695 — on laisse 5pt de marge
      const CONT_TOP_BL      = 60;
      const ROW_H_BL         = 20;

      const drawBLHeader = () => {
        doc.rect(50, y, W, 18).fill(brandColor);
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        headers.forEach((h, i) => {
          const w = i < headers.length - 1 ? colX[i + 1] - colX[i] - 4 : 85;
          doc.text(h, colX[i], y + 5, { width: w });
        });
        y += 22;
        doc.fillColor('#000000').font('Helvetica').fontSize(8);
      };
      drawBLHeader();

      (bl.lignes ?? []).forEach((l: any, idx: number) => {
        if (y + ROW_H_BL > PAGE_SAFE_BOT_BL) { doc.addPage(); y = CONT_TOP_BL; drawBLHeader(); }
        if (idx % 2 === 0) doc.rect(50, y - 2, W, ROW_H_BL).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation + (l.description ? `\n${l.description}` : ''), colX[0], y, { width: 255, lineBreak: false });
        doc.text(String(l.quantite), colX[1], y, { width: 75, lineBreak: false });
        doc.text(l.unite ?? '—', colX[2], y, { width: 65, lineBreak: false });
        doc.text(l.article_id ? String(l.article_id) : '—', colX[3], y, { width: 85, lineBreak: false });
        y += ROW_H_BL;
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

      // Zone signature destinataire — ancrée en bas de page
      const sigY = 695; // position fixe
      doc.moveTo(50, sigY).lineTo(545, sigY).strokeColor('#CCCCCC').stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#555555')
         .text('SIGNATURE DU DESTINATAIRE', 50, sigY + 10, { width: W });
      // Ligne de date
      doc.fontSize(8).font('Helvetica').fillColor('#555555').text('Date :', 50, sigY + 26);
      doc.moveTo(90, sigY + 38).lineTo(340, sigY + 38).strokeColor('#CCCCCC').stroke();
      // Cadre signature
      doc.rect(50, sigY + 26, W, 70).strokeColor('#BBBBBB').stroke();

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
         .text(`SIRET : ${formatSiret(entreprise.siret)}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom)
        doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(`${entreprise.email}`, 50, 123 + _a2off);

      const clientNom = client.type_client === 'professionnel'
        ? (client.raison_sociale || `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim())
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      drawClientBlock(doc, client, clientNom, clientY);

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
      const PAGE_SAFE_BOT_FS = 642;
      const CONT_TOP_FS      = 60;
      const ROW_H_FS         = 20;
      const DESC_H_FS        = 12;

      const drawFSHeader = () => {
        doc.rect(50, y, W, 18).fill(brandColor);
        doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold');
        headers.forEach((h, i) => doc.text(h, colX[i], y + 5, { width: colX[i + 1] ? colX[i + 1] - colX[i] - 4 : 70 }));
        y += 22;
        doc.fillColor('#000000').font('Helvetica').fontSize(8);
      };
      drawFSHeader();

      (facture.lignes ?? []).forEach((l: any, idx: number) => {
        const rowH = l.description ? ROW_H_FS + DESC_H_FS : ROW_H_FS;
        if (y + rowH > PAGE_SAFE_BOT_FS) { doc.addPage(); y = CONT_TOP_FS; drawFSHeader(); }
        if (idx % 2 === 0) doc.rect(50, y - 2, W, rowH).fill(brandColorLight);
        doc.fillColor('#000000');
        doc.text(l.designation, colX[0], y, { width: 186, lineBreak: false });
        doc.text(String(l.quantite) + (l.unite ? ` ${l.unite}` : ''), colX[1], y, { width: 54,  lineBreak: false });
        doc.text(formatMontant(l.prix_unitaire_ht), colX[2], y, { width: 50,  lineBreak: false });
        doc.text(l.remise_pct ? `${l.remise_pct}%` : '—', colX[3], y, { width: 50,  lineBreak: false });
        doc.text(mentionTVA(facture.tva_mode, l.taux_tva_valeur), colX[4], y, { width: 56,  lineBreak: false });
        doc.text(formatMontant(l.montant_ht), colX[5], y, { width: 70,  lineBreak: false, align: 'right' });
        if (l.description) {
          doc.fontSize(7).fillColor('#666666')
             .text(l.description, colX[0] + 2, y + ROW_H_FS - 2, { width: 184, lineBreak: false });
          doc.fontSize(8).fillColor('#000000');
        }
        y += rowH;
      });
      if (y > PAGE_SAFE_BOT_FS) doc.addPage();

      // Totaux ancrés — même position que devis/facture
      const BOTTOM_FS = 744;
      const drawTotFS = (label: string, val: string, bold: boolean, yOff: number) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000')
           .text(label, 340, BOTTOM_FS - yOff, { width: 126, align: 'left',  lineBreak: false })
           .text(val,   470, BOTTOM_FS - yOff, { width:  70, align: 'right', lineBreak: false });
      };
      drawTotFS('Total HT',  formatMontant(facture.montant_ht),  false, 36);
      drawTotFS('Total TVA', formatMontant(facture.montant_tva), false, 18);
      drawTotFS('Total TTC', formatMontant(facture.montant_ttc), true,   0);
      doc.moveTo(340, BOTTOM_FS - 44).lineTo(545, BOTTOM_FS - 44).strokeColor('#CCCCCC').stroke();

      if (facture.tva_mode !== 'normal') {
        doc.fontSize(8).font('Helvetica-Oblique').fillColor('#666666')
           .text(mentionTVA(facture.tva_mode, 0), 50, BOTTOM_FS - 44, { width: 260, lineBreak: false });
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
         .text(`SIRET : ${formatSiret(entreprise.siret)}`, 50, 99 + _a2off);
      if (entreprise.tva_intracom) doc.text(`TVA Intracom : ${entreprise.tva_intracom}`, 50, 111 + _a2off);
      doc.text(entreprise.email, 50, 123 + _a2off);

      const clientNom = client.type_client === 'professionnel'
        ? (client.raison_sociale || `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim())
        : `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim();
      const clientY = logoInfo ? 130 : 75;
      drawClientBlock(doc, client, clientNom, clientY);

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

      // Totaux ancrés — même position que devis/facture
      const BOTTOM_AC = 744;
      const drawTotAC = (label: string, val: string, bold: boolean, yOff: number) => {
        doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor('#000000')
           .text(label, 340, BOTTOM_AC - yOff, { width: 126, align: 'left',  lineBreak: false })
           .text(val,   470, BOTTOM_AC - yOff, { width:  70, align: 'right', lineBreak: false });
      };
      drawTotAC('Montant HT',  formatMontant(acompte.montant_ht),  false, 36);
      drawTotAC('TVA',         formatMontant(acompte.montant_tva), false, 18);
      drawTotAC('Montant TTC', formatMontant(acompte.montant_ttc), true,   0);
      doc.moveTo(340, BOTTOM_AC - 44).lineTo(545, BOTTOM_AC - 44).strokeColor('#CCCCCC').stroke();

      if (acompte.statut === 'encaisse' && acompte.date_encaissement) {
        const modesLabel: Record<string, string> = {
          virement: 'Virement bancaire', cheque: 'Chèque', especes: 'Espèces',
          carte: 'Carte bancaire', prelevement: 'Prélèvement', paypal: 'PayPal', autre: 'Autre',
        };
        const modeLabel = acompte.mode_paiement ? (modesLabel[acompte.mode_paiement] ?? acompte.mode_paiement) : null;
        doc.rect(50, BOTTOM_AC - 60, 260, 22).fillColor('#E8F5E9').stroke();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#2E7D32')
           .text('ENCAISSÉ', 58, BOTTOM_AC - 55, { lineBreak: false });
        doc.fontSize(8).font('Helvetica').fillColor('#2E7D32')
           .text(`Encaissé le ${formatDate(acompte.date_encaissement)}${modeLabel ? ` — ${modeLabel}` : ''}`,
                 120, BOTTOM_AC - 55, { width: 180, lineBreak: false });
        doc.fillColor('#000000');
      }

      doc.end();
      outputStream.on('finish', resolve);
      outputStream.on('error', reject);
    });
  }

  static genererXML(facture: any, entreprise: any, client: any): string {
    const clientNom = client.type_client === 'professionnel'
      ? (client.raison_sociale || `${client.civilite ?? ''} ${client.prenom ?? ''} ${client.nom ?? ''}`.trim())
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
