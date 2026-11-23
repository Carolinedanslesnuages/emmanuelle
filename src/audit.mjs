/** Audits pages in Chromium: axe-core (mapped to RGAA) plus Emmanuelle's own RGAA checks. */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import { criterion, criterionForAxeRule } from './criteria.mjs';
import { checkSkipLink, checkFocusVisible, checkReflow, checkTextSpacing, checkEndlessAnimations } from './page-checks.mjs';

const resolveFromHere = createRequire(import.meta.url).resolve;
const AXE_SOURCE = readFileSync(resolveFromHere('axe-core/axe.min.js'), 'utf8');
/** axe-core's own French translation, so that messages read like the RGAA criteria above them. */
const AXE_FRENCH_LOCALE = JSON.parse(readFileSync(resolveFromHere('axe-core/locales/fr.json'), 'utf8'));
/** WCAG A and AA, plus the heading rules RGAA 9.1 needs (tagged "best-practice" by axe). */
const AXE_OPTIONS = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  rules: { 'heading-order': { enabled: true }, 'page-has-heading-one': { enabled: true }, 'empty-heading': { enabled: true } },
};

async function axeFindings(page) {
  await page.addScriptTag({ content: AXE_SOURCE });
  const violations = await page.evaluate(async ({ options, locale }) => {
    window.axe.configure({ locale });
    return (await window.axe.run(document, options)).violations;
  }, { options: AXE_OPTIONS, locale: AXE_FRENCH_LOCALE });
  return violations.flatMap((violation) => violation.nodes.slice(0, 10).map((node) => {
    const mapped = criterionForAxeRule(violation.id);
    return {
      criterionNumber: mapped ? mapped.number : null,
      rule: violation.id,
      level: 'error',
      message: violation.help + (mapped ? '' : ` (${violation.tags.filter((wcagTag) => /^wcag\d/.test(wcagTag)).join(', ')})`),
      selector: node.target.join(' '),
    };
  }));
}

async function auditPage(browser, pageUrl) {
  const moving = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
  await moving.goto(pageUrl, { waitUntil: 'networkidle' });
  const animations = await checkEndlessAnimations(moving);
  await moving.close();

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const response = await page.goto(pageUrl, { waitUntil: 'networkidle' });
  if (!response || response.status() >= 400) {
    await page.close();
    throw new Error(`${pageUrl} : la page ne s'ouvre pas (${response ? response.status() : 'aucune réponse'}).`);
  }
  const findings = [
    ...(await axeFindings(page)),
    ...(await checkSkipLink(page)),
    ...(await checkFocusVisible(page)),
    ...(await checkReflow(page, pageUrl)),
    ...(await checkTextSpacing(page, pageUrl)),
    ...animations,
  ];
  await page.close();
  if (pageErrors.length) findings.push({ criterionNumber: null, rule: 'erreur-javascript', level: 'warning', message: `erreur JavaScript : ${pageErrors[0].slice(0, 160)}` });
  return findings.map((finding) => ({ ...finding, criterion: criterion(finding.criterionNumber) }));
}

/** Audits every page path against a base URL. Returns [{ pagePath, findings }]. */
export async function auditPages(baseUrl, pagePaths) {
  const browser = await chromium.launch();
  try {
    const reports = [];
    for (const pagePath of pagePaths) reports.push({ pagePath, findings: await auditPage(browser, new URL(pagePath, baseUrl).href) });
    return reports;
  } finally {
    await browser.close();
  }
}
