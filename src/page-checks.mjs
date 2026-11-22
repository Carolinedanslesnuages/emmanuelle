/**
 * RGAA checks that axe-core does not make, run in a real browser page (Playwright).
 * Each check returns findings { criterionNumber, rule, level, message, selector? }.
 * Rule ids are public (used in the reference file): they stay in French.
 */

/** A short CSS path to an element, to locate it in the report (runs in the page). */
const CSS_PATH_SOURCE = `(element) => {
  const parts = [];
  for (let current = element; current && current.nodeType === 1 && parts.length < 4; current = current.parentElement) {
    if (current.id) { parts.unshift('#' + CSS.escape(current.id)); break; }
    const classes = [...current.classList].slice(0, 2).map((name) => '.' + CSS.escape(name)).join('');
    parts.unshift(current.tagName.toLowerCase() + classes);
  }
  return parts.join(' > ');
}`;

/** 12.7: the first element reached with Tab is a link to the main content. */
export async function checkSkipLink(page) {
  await page.keyboard.press('Tab');
  const skipLink = await page.evaluate(() => {
    const element = document.activeElement;
    if (!element || element.tagName !== 'A') return { found: false, text: element && element !== document.body ? element.textContent.trim().slice(0, 40) : '' };
    const target = (element.getAttribute('href') || '').startsWith('#') ? document.getElementById(decodeURIComponent(element.getAttribute('href').slice(1))) : null;
    return { found: true, text: element.textContent.trim().slice(0, 40), targetExists: !!target };
  });
  if (!skipLink.found) {
    return [{ criterionNumber: '12.7', rule: 'lien-evitement', level: 'error', message: `le premier élément atteint au clavier n'est pas un lien d'évitement${skipLink.text ? ` (c'est « ${skipLink.text} »)` : ''}.` }];
  }
  if (!skipLink.targetExists) {
    return [{ criterionNumber: '12.7', rule: 'lien-evitement', level: 'error', message: `le premier lien (« ${skipLink.text} ») ne mène à aucune zone de la page.` }];
  }
  return [];
}

/** 10.7: every element reached with Tab looks different when it has the focus. */
export async function checkFocusVisible(page, maxElements = 40) {
  const styleOf = `(element) => { const style = getComputedStyle(element); return [style.outlineStyle, style.outlineWidth, style.outlineColor, style.boxShadow, style.borderColor, style.backgroundColor, style.textDecorationLine, style.color].join('|'); }`;
  await page.evaluate(() => document.activeElement && document.activeElement.blur());
  const findings = [];
  const seen = new Set();
  for (let step = 0; step < maxElements; step++) {
    await page.keyboard.press('Tab');
    const result = await page.evaluate(({ styleSource, pathSource }) => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const styleOfElement = eval(styleSource);
      const focused = styleOfElement(element);
      element.blur();
      const unfocused = styleOfElement(element);
      element.focus();
      return { path: eval(pathSource)(element), visible: focused !== unfocused };
    }, { styleSource: styleOf, pathSource: CSS_PATH_SOURCE });
    if (!result || seen.has(result.path)) break;
    seen.add(result.path);
    if (!result.visible) {
      findings.push({ criterionNumber: '10.7', rule: 'focus-visible', level: 'error', message: 'la prise de focus ne change rien à l\'apparence de cet élément.', selector: result.path });
    }
  }
  return findings;
}

/** 10.11 and 10.4: no horizontal scrolling at 320 px wide, nor at 640 px (200 % zoom of 1280 px). */
export async function checkReflow(page, pageUrl) {
  const findings = [];
  for (const [criterionNumber, width] of [['10.11', 320], ['10.4', 640]]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(pageUrl, { waitUntil: 'networkidle' });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (overflow > 0) {
      findings.push({ criterionNumber, rule: 'defilement-horizontal', level: 'error', message: `à ${width} px de large, la page défile horizontalement (${overflow} px de trop).` });
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  return findings;
}

/** 10.12: with the WCAG text spacing applied, no text is cut off. */
export async function checkTextSpacing(page, pageUrl) {
  await page.goto(pageUrl, { waitUntil: 'networkidle' });
  await page.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: .12em !important; word-spacing: .16em !important; } p { margin-bottom: 2em !important; }' });
  const clipped = await page.evaluate((pathSource) => {
    const cssPath = eval(pathSource);
    return [...document.querySelectorAll('body *')]
      .filter((element) => {
        // Visually hidden text (for screen readers only) is cut on purpose: tiny box, or masked
        // by clip / clip-path, like a skip link waiting for the focus.
        const bounds = element.getBoundingClientRect();
        if (bounds.width <= 1 || bounds.height <= 1) return false;
        const style = getComputedStyle(element);
        const masked = /^rect\(/.test(style.clip) || /^inset\((50|100)%/.test(style.clipPath);
        if (masked) return false;
        const hidesOverflow = /hidden|clip/.test(style.overflowX + style.overflowY) || style.textOverflow === 'ellipsis';
        const hasText = [...element.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim());
        return hidesOverflow && hasText && (element.scrollWidth > element.clientWidth + 1 || element.scrollHeight > element.clientHeight + 1);
      })
      .slice(0, 10)
      .map(cssPath);
  }, CSS_PATH_SOURCE);
  return clipped.map((selector) => ({ criterionNumber: '10.12', rule: 'espacement-texte', level: 'error', message: 'avec l\'espacement du texte augmenté, ce texte est coupé.', selector }));
}

/** 13.8: endless animations must be stoppable (warning: a pause button or reduced motion may exist). */
export async function checkEndlessAnimations(page) {
  const animated = await page.evaluate((pathSource) => {
    const cssPath = eval(pathSource);
    return document.getAnimations()
      .filter((animation) => animation.playState === 'running' && animation.effect && animation.effect.getTiming().iterations === Infinity && animation.effect.target)
      .slice(0, 10)
      .map((animation) => cssPath(animation.effect.target));
  }, CSS_PATH_SOURCE);
  return [...new Set(animated)].map((selector) => ({
    criterionNumber: '13.8',
    rule: 'animation-sans-fin',
    level: 'warning',
    message: 'animation sans fin : vérifiez qu\'on peut la mettre en pause, et qu\'elle s\'arrête quand le système demande moins d\'animations.',
    selector,
  }));
}
