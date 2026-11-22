#!/usr/bin/env node
/** Emmanuelle: RGAA accessibility checked on every pull request. */
import { existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveFolder } from '../src/static-server.mjs';
import { auditPages } from '../src/audit.mjs';
import { readReference, writeReference, compareWithReference } from '../src/reference.mjs';

const HELP = `Emmanuelle · l'accessibilité RGAA vérifiée à chaque pull request

Usage :
  emmanuelle [verifier] [options]   vérifie les pages dans Chromium
  emmanuelle reference [options]    enregistre les défauts actuels comme connus

  --dossier <chemin>   site construit à servir (défaut : dist)
  --monopage          application monopage : une adresse sans fichier reçoit index.html
  --url <adresse>      ou un site déjà lancé (ex. http://localhost:5173)
  --pages "<p1> <p2>"  pages à vérifier, séparées par des espaces (défaut : /)
  --reference <fich.>  défauts connus (défaut : .emmanuelle-reference.json)
  --strict             échoue aussi sur les avertissements
  --json               résultat en JSON

Chaque constat est rangé par critère du RGAA 4.1.2, avec son texte officiel. Avec une référence,
seuls les nouveaux défauts font échouer la vérification : on corrige l'existant à son rythme.

Ce qui ne se vérifie pas automatiquement (pertinence d'un texte, d'une alternative, ordre de
lecture…) reste à vérifier à la main.`;

/** Level names in the --json output (public format, in French). */
const JSON_LEVELS = { error: 'erreur', warning: 'avertissement' };

function parseOptions(args) {
  const options = { command: 'verifier', folder: 'dist', pages: ['/'], reference: '.emmanuelle-reference.json' };
  for (let index = 0; index < args.length; index++) {
    const argument = args[index];
    if (argument === 'verifier' || argument === 'reference') options.command = argument;
    else if (['aide', '--aide', '-h', '--help'].includes(argument)) options.help = true;
    else if (argument === '--dossier') options.folder = args[++index];
    else if (argument === '--url') options.url = args[++index];
    else if (argument === '--pages') options.pages = String(args[++index] || '').split(/\s+/).filter(Boolean);
    else if (argument === '--reference') options.reference = args[++index];
    else if (argument === '--monopage') options.singlePage = true;
    else if (argument === '--strict') options.strict = true;
    else if (argument === '--json') options.json = true;
    else throw new Error(`Option inconnue : ${argument}. Tapez « emmanuelle aide ».`);
  }
  if (!options.pages.length) throw new Error('--pages attend au moins une page, par exemple « / ».');
  return options;
}

const criterionLabel = (finding) => (finding.criterion ? `${finding.criterion.number} ${finding.criterion.title}` : 'Hors table RGAA (WCAG)');

function printText(reports, fixed) {
  for (const report of reports) {
    const blocking = report.findings.filter((finding) => !finding.known);
    console.log(`\n${blocking.some((finding) => finding.level === 'error') ? '✗' : blocking.length ? '⚠' : '✓'} ${report.pagePath}`);
    const byCriterion = new Map();
    for (const finding of report.findings) {
      const label = criterionLabel(finding);
      if (!byCriterion.has(label)) byCriterion.set(label, []);
      byCriterion.get(label).push(finding);
    }
    for (const [label, findings] of byCriterion) {
      console.log(`  ${label}`);
      for (const finding of findings) {
        const symbol = finding.known ? '·' : finding.level === 'error' ? '✗' : '⚠';
        console.log(`    ${symbol} ${finding.message}${finding.selector ? `  [${finding.selector}]` : ''}${finding.known ? '  (connu)' : ''}`);
        if (process.env.GITHUB_ACTIONS && !finding.known) {
          const title = `Emmanuelle · RGAA ${finding.criterion ? finding.criterion.number : finding.rule}`;
          console.log(`::${finding.level === 'error' ? 'error' : 'warning'} title=${title}::${report.pagePath} : ${finding.message}${finding.selector ? ` (${finding.selector})` : ''}`);
        }
      }
    }
  }
  if (fixed.length) console.log(`\n${fixed.length} défaut(s) connu(s) corrigé(s) : mettez la référence à jour avec « emmanuelle reference ».`);
}

function writeSummary(reports) {
  if (!process.env.GITHUB_STEP_SUMMARY) return;
  const rows = reports.flatMap((report) => report.findings.filter((finding) => !finding.known).map((finding) => {
    const criterionCell = finding.criterion ? `${finding.criterion.number}` : finding.rule;
    return `| ${report.pagePath} | ${criterionCell} | ${finding.level === 'error' ? '✗' : '⚠'} ${finding.message.replace(/\|/g, '\\|')} | ${finding.selector ? `\`${finding.selector.replace(/\|/g, '\\|')}\`` : ''} |`;
  }));
  const body = rows.length ? ['| Page | Critère | Constat | Élément |', '|---|---|---|---|', ...rows].join('\n') : 'Aucun nouveau défaut détecté automatiquement.';
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Accessibilité (RGAA 4.1.2)\n\n${body}\n`);
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) return console.log(HELP);
  let server = null;
  let baseUrl = options.url;
  if (!baseUrl) {
    if (!existsSync(options.folder)) throw new Error(`Dossier introuvable : ${options.folder}. Construisez le site, ou indiquez --dossier ou --url.`);
    server = await serveFolder(options.folder, { singlePage: Boolean(options.singlePage) });
    baseUrl = server.baseUrl;
  }
  try {
    const reports = await auditPages(baseUrl, options.pages);
    const referencePath = resolve(options.reference);
    if (options.command === 'reference') {
      const count = writeReference(referencePath, reports);
      return console.log(`${count} défaut(s) enregistré(s) comme connus dans ${options.reference}.`);
    }
    const { reports: compared, fixed } = compareWithReference(reports, readReference(referencePath));
    const fresh = compared.flatMap((report) => report.findings.filter((finding) => !finding.known));
    const errors = fresh.filter((finding) => finding.level === 'error').length;
    const warnings = fresh.length - errors;
    const failed = errors > 0 || (Boolean(options.strict) && warnings > 0);
    if (options.json) {
      const output = compared.map((report) => ({
        page: report.pagePath,
        constats: report.findings.map((finding) => ({
          critere: finding.criterion ? finding.criterion.number : null,
          regle: finding.rule,
          niveau: JSON_LEVELS[finding.level],
          message: finding.message,
          element: finding.selector || null,
          connu: finding.known,
        })),
      }));
      console.log(JSON.stringify({ pages: output, total: { erreurs: errors, avertissements: warnings }, corriges: fixed.length, echec: failed }, null, 2));
    } else {
      printText(compared, fixed);
      const known = compared.reduce((total, report) => total + report.findings.filter((finding) => finding.known).length, 0);
      console.log(`\n${options.pages.length} page(s) · ${errors} erreur(s) · ${warnings} avertissement(s)${known ? ` · ${known} défaut(s) connu(s)` : ''}`);
      console.log('Rappel : un contrôle automatique ne couvre qu\'une partie du RGAA. Le reste se vérifie à la main.');
      writeSummary(compared);
    }
    if (failed) process.exitCode = 1;
  } finally {
    if (server) server.close();
  }
}

main().catch((error) => {
  console.error(`emmanuelle : ${error.message}`);
  process.exit(1);
});
