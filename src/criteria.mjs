/**
 * axe-core rules → RGAA 4.1.2 criteria. Titles come from the official texts (Marguerite).
 * A rule missing from this table is still reported, under its WCAG references.
 */
import { findCriterion } from '@carolinedanslesnuages/marguerite/src/rgaa.mjs';

export const AXE_TO_RGAA = {
  'image-alt': '1.1', 'input-image-alt': '1.1', 'area-alt': '1.1', 'role-img-alt': '1.1', 'svg-img-alt': '1.1', 'object-alt': '1.1',
  'image-redundant-alt': '1.2', 'presentation-role-conflict': '1.2',
  'frame-title': '2.1', 'frame-title-unique': '2.1',
  'color-contrast': '3.2', 'link-in-text-block': '10.6',
  'video-caption': '4.3',
  'th-has-data-cells': '5.6', 'td-headers-attr': '5.7', 'td-has-header': '5.7', 'scope-attr-valid': '5.7',
  'link-name': '6.2',
  'aria-allowed-attr': '7.1', 'aria-command-name': '7.1', 'aria-hidden-body': '7.1', 'aria-hidden-focus': '7.1',
  'aria-input-field-name': '7.1', 'aria-required-attr': '7.1', 'aria-required-children': '7.1', 'aria-required-parent': '7.1',
  'aria-roles': '7.1', 'aria-toggle-field-name': '7.1', 'aria-valid-attr': '7.1', 'aria-valid-attr-value': '7.1',
  'aria-progressbar-name': '7.1', 'aria-tooltip-name': '7.1', 'aria-meter-name': '7.1', 'button-name': '7.1', 'nested-interactive': '7.1',
  'scrollable-region-focusable': '7.3',
  'duplicate-id-aria': '8.2', 'duplicate-id-active': '8.2',
  'html-has-lang': '8.3', 'html-lang-valid': '8.4', 'html-xml-lang-mismatch': '8.4', 'valid-lang': '8.8',
  'document-title': '8.5',
  'heading-order': '9.1', 'page-has-heading-one': '9.1', 'empty-heading': '9.1',
  'list': '9.3', 'listitem': '9.3', 'definition-list': '9.3', 'dlitem': '9.3',
  'meta-viewport': '10.4', 'meta-viewport-large': '10.4',
  'label': '11.1', 'select-name': '11.1', 'form-field-multiple-labels': '11.1', 'label-title-only': '11.2',
  'autocomplete-valid': '11.13',
  'bypass': '12.7', 'tabindex': '12.8',
  'meta-refresh': '13.1', 'blink': '13.8', 'marquee': '13.8',
};

/** { number, title } of a criterion, or null when it is unknown. */
export function criterion(number) {
  const found = number ? findCriterion(number) : null;
  return found ? { number: found.number, title: found.title } : null;
}

export const criterionForAxeRule = (ruleId) => criterion(AXE_TO_RGAA[ruleId]);
