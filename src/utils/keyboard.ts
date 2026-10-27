/**
 * Keyboard input utility for PIN / authentication keypads.
 * Accurately extracts digits 0-9 across diverse international layouts (AZERTY, QWERTY, QWERTZ)
 * as well as physical numeric keypads.
 */

const AZERTY_TOP_ROW_MAP: Record<string, string> = {
  '&': '1',
  'é': '2',
  '"': '3',
  "'": '4',
  '(': '5',
  '-': '6',
  'è': '7',
  '_': '8',
  'ç': '9',
  'à': '0',
};

export interface KeyEventLike {
  key?: string;
  code?: string;
  repeat?: boolean;
}

export function extractDigitFromKeyEvent(e: KeyEventLike): string | null {
  if (e.repeat) return null;

  // 1. Direct digit 0-9 in e.key (standard QWERTY, or AZERTY with Shift)
  if (e.key && /^[0-9]$/.test(e.key)) {
    return e.key;
  }

  // 2. Physical numeric keypad (e.code: Numpad0 through Numpad9)
  if (e.code && /^Numpad[0-9]$/.test(e.code)) {
    return e.code.slice(6);
  }

  // 3. Physical top-row digit key (e.code: Digit0 through Digit9)
  if (e.code && /^Digit[0-9]$/.test(e.code)) {
    return e.code.slice(5);
  }

  // 4. French AZERTY unshifted top-row characters
  if (e.key && AZERTY_TOP_ROW_MAP[e.key]) {
    return AZERTY_TOP_ROW_MAP[e.key];
  }

  return null;
}
