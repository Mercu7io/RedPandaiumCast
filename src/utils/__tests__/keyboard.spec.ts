import { describe, it, expect } from 'vitest';
import { extractDigitFromKeyEvent } from '../keyboard';

describe('extractDigitFromKeyEvent utility tests', () => {
  it('extracts direct digits 0-9 from e.key', () => {
    expect(extractDigitFromKeyEvent({ key: '1' })).toBe('1');
    expect(extractDigitFromKeyEvent({ key: '5' })).toBe('5');
    expect(extractDigitFromKeyEvent({ key: '0' })).toBe('0');
  });

  it('extracts digits from physical Numpad e.code', () => {
    expect(extractDigitFromKeyEvent({ code: 'Numpad1', key: '1' })).toBe('1');
    expect(extractDigitFromKeyEvent({ code: 'Numpad9', key: 'PageUp' })).toBe('9'); // NumLock off case
    expect(extractDigitFromKeyEvent({ code: 'Numpad0', key: 'Insert' })).toBe('0');
  });

  it('extracts digits from physical top-row Digit e.code', () => {
    expect(extractDigitFromKeyEvent({ code: 'Digit1', key: '1' })).toBe('1');
    expect(extractDigitFromKeyEvent({ code: 'Digit7', key: 'è' })).toBe('7');
  });

  it('extracts French AZERTY unshifted top-row characters accurately', () => {
    expect(extractDigitFromKeyEvent({ key: '&' })).toBe('1');
    expect(extractDigitFromKeyEvent({ key: 'é' })).toBe('2');
    expect(extractDigitFromKeyEvent({ key: '"' })).toBe('3');
    expect(extractDigitFromKeyEvent({ key: "'" })).toBe('4');
    expect(extractDigitFromKeyEvent({ key: '(' })).toBe('5');
    expect(extractDigitFromKeyEvent({ key: '-' })).toBe('6');
    expect(extractDigitFromKeyEvent({ key: 'è' })).toBe('7');
    expect(extractDigitFromKeyEvent({ key: '_' })).toBe('8');
    expect(extractDigitFromKeyEvent({ key: 'ç' })).toBe('9');
    expect(extractDigitFromKeyEvent({ key: 'à' })).toBe('0');
  });

  it('returns null and ignores repeated keydown events to avoid duplicate digits', () => {
    expect(extractDigitFromKeyEvent({ key: '1', repeat: true })).toBe(null);
    expect(extractDigitFromKeyEvent({ key: '&', repeat: true })).toBe(null);
  });

  it('returns null for non-digit keys', () => {
    expect(extractDigitFromKeyEvent({ key: 'a' })).toBe(null);
    expect(extractDigitFromKeyEvent({ key: 'Enter' })).toBe(null);
    expect(extractDigitFromKeyEvent({ key: 'Backspace' })).toBe(null);
    expect(extractDigitFromKeyEvent({ key: 'Shift' })).toBe(null);
  });
});
