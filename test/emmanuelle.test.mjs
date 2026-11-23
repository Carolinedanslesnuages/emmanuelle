import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AXE_TO_RGAA, criterion, criterionForAxeRule } from '../src/criteria.mjs';
import { fingerprint, compareWithReference } from '../src/reference.mjs';

const BINARY = fileURLToPath(new URL('../bin/emmanuelle.mjs', import.meta.url));
const FIXTURE_SITE = fileURLToPath(new URL('./fixtures/site', import.meta.url));

const runCli = (args, env = {}) => new Promise((resolve) => {
  const child = spawn(process.execPath, [BINARY, ...args], { env: { ...process.env, GITHUB_ACTIONS: '', ...env } });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => (stdout += chunk));
  child.stderr.on('data', (chunk) => (stderr += chunk));
  child.on('close', (status) => resolve({ status, stdout, stderr }));
});

test('chaque règle axe renvoie à un vrai critère du RGAA 4.1.2, avec son texte officiel', () => {
  for (const [ruleId, number] of Object.entries(AXE_TO_RGAA)) assert.ok(criterion(number), `${ruleId} → ${number}`);
  assert.match(criterionForAxeRule('image-alt').title, /^Chaque image porteuse d’information a-t-elle une alternative textuelle/);
  assert.equal(criterionForAxeRule('regle-inconnue'), null);
});

test('référence : défauts connus, nouveaux, corrigés', () => {
  const finding = { criterionNumber: '1.1', rule: 'image-alt', level: 'error', selector: 'img' };
  const other = { criterionNumber: '11.1', rule: 'label', level: 'error', selector: 'input' };
  const reference = new Set([fingerprint('/', finding), fingerprint('/', { criterionNumber: '3.2', rule: 'color-contrast', selector: 'p' })]);
  const { reports, fixed } = compareWithReference([{ pagePath: '/', findings: [finding, other] }], reference);
  assert.deepEqual(reports[0].findings.map((entry) => entry.known), [true, false]);
  assert.deepEqual(fixed, ['/ | 3.2 | color-contrast | p']);
});

test('une page accessible ne donne rien', async () => {
  const result = await runCli(['--dossier', FIXTURE_SITE, '--pages', '/']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.match(result.stdout, /✓ \/\n/);
  assert.match(result.stdout, /0 erreur\(s\) · 0 avertissement\(s\)/);
});

test('10.12 : un lien d’évitement masqué jusqu’au focus n’est pas du texte coupé', async () => {
  const result = await runCli(['--dossier', FIXTURE_SITE, '--pages', '/evitement-masque.html']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  assert.doesNotMatch(result.stdout, /10\.12/);
});

test('application monopage : une adresse sans fichier reçoit index.html', async () => {
  const route = ['--dossier', FIXTURE_SITE, '--pages', '/reservations/42'];
  assert.match((await runCli(route)).stderr, /ne s'ouvre pas \(404\)/, 'sans --monopage : introuvable');
  const singlePage = await runCli([...route, '--monopage']);
  assert.equal(singlePage.status, 0, singlePage.stdout + singlePage.stderr);
  assert.match(singlePage.stdout, /✓ \/reservations\/42/);
  assert.match((await runCli(['--dossier', FIXTURE_SITE, '--pages', '/absente.html', '--monopage'])).stderr, /ne s'ouvre pas \(404\)/, 'un fichier absent reste introuvable');
});

test('une page avec des défauts : chacun rangé sous son critère RGAA', async () => {
  const result = await runCli(['--dossier', FIXTURE_SITE, '--pages', '/defauts.html', '--json']);
  assert.equal(result.status, 1, result.stderr);
  const report = JSON.parse(result.stdout);
  const criteria = new Set(report.pages[0].constats.map((finding) => finding.critere));
  for (const expected of ['1.1', '3.2', '8.3', '11.1', '12.7', '10.7', '10.11', '10.4', '10.12', '13.8']) assert.ok(criteria.has(expected), `critère ${expected} attendu, trouvés : ${[...criteria].join(', ')}`);
  const missingAlternative = report.pages[0].constats.find((finding) => finding.critere === '1.1');
  assert.match(missingAlternative.message, /^Les images doivent avoir une alternative textuelle/, 'les messages d’axe-core sont en français');
  const animation = report.pages[0].constats.find((finding) => finding.critere === '13.8');
  assert.equal(animation.niveau, 'avertissement');
  assert.deepEqual(Object.keys(report), ['pages', 'total', 'corriges', 'echec']);
});

test('référence : les défauts connus ne bloquent plus, un nouveau défaut si', async () => {
  const referencePath = join(mkdtempSync(join(tmpdir(), 'emmanuelle-')), 'reference.json');
  const common = ['--dossier', FIXTURE_SITE, '--pages', '/defauts.html', '--reference', referencePath];
  const saved = await runCli(['reference', ...common]);
  assert.match(saved.stdout, /défaut\(s\) enregistré\(s\) comme connus/);
  const known = await runCli(common);
  assert.equal(known.status, 0, known.stdout);
  assert.match(known.stdout, /\(connu\)/);
  const reference = JSON.parse(readFileSync(referencePath, 'utf8'));
  const removed = reference.connus.find((fingerprintKey) => fingerprintKey.includes('| 1.1 |'));
  writeFileSync(referencePath, JSON.stringify({ connus: reference.connus.filter((fingerprintKey) => fingerprintKey !== removed) }));
  const fresh = await runCli([...common, '--json']);
  assert.equal(fresh.status, 1);
  assert.equal(JSON.parse(fresh.stdout).total.erreurs, 1);
});

test('annotations GitHub et résumé de la PR', async () => {
  const summaryPath = join(mkdtempSync(join(tmpdir(), 'emmanuelle-')), 'summary.md');
  const result = await runCli(['--dossier', FIXTURE_SITE, '--pages', '/defauts.html'], { GITHUB_ACTIONS: 'true', GITHUB_STEP_SUMMARY: summaryPath });
  assert.match(result.stdout, /::error title=Emmanuelle · RGAA 1\.1::\/defauts\.html : /);
  assert.match(readFileSync(summaryPath, 'utf8'), /### Accessibilité \(RGAA 4\.1\.2\)[\s\S]*\| \/defauts\.html \| 1\.1 \|/);
});

test('erreurs claires : dossier absent, page introuvable, option inconnue', async () => {
  assert.match((await runCli(['--dossier', '/nulle/part'])).stderr, /Dossier introuvable/);
  assert.match((await runCli(['--dossier', FIXTURE_SITE, '--pages', '/absente.html'])).stderr, /ne s'ouvre pas \(404\)/);
  assert.match((await runCli(['--nimporte'])).stderr, /Option inconnue/);
});
