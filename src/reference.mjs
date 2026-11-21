/**
 * The reference: defects already known when Emmanuelle was set up, so that only NEW defects block a
 * pull request. A defect is identified by its page, criterion, rule and element.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const fingerprint = (pagePath, finding) => [pagePath, finding.criterionNumber || '-', finding.rule, finding.selector || ''].join(' | ');

export function readReference(path) {
  if (!existsSync(path)) return null;
  try {
    return new Set(JSON.parse(readFileSync(path, 'utf8')).connus || []);
  } catch (error) {
    throw new Error(`${path} illisible : ${error.message}`);
  }
}

export function writeReference(path, reports) {
  const known = reports.flatMap((report) => report.findings.filter((finding) => finding.level === 'error').map((finding) => fingerprint(report.pagePath, finding)));
  writeFileSync(path, JSON.stringify({ connus: [...new Set(known)].sort() }, null, 2) + '\n');
  return known.length;
}

/** Splits findings into new and known ones, and lists the known defects that disappeared. */
export function compareWithReference(reports, reference) {
  const current = new Set();
  const split = reports.map((report) => {
    const tagged = report.findings.map((finding) => {
      const fingerprintKey = fingerprint(report.pagePath, finding);
      current.add(fingerprintKey);
      return { ...finding, known: !!reference && reference.has(fingerprintKey) };
    });
    return { ...report, findings: tagged };
  });
  const fixed = reference ? [...reference].filter((fingerprintKey) => !current.has(fingerprintKey)) : [];
  return { reports: split, fixed };
}
