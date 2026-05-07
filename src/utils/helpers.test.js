import { validateEmail, formatPoints } from './helpers.js';

describe('Функції-помічники (Helpers)', () => {
  
  test('validateEmail має правильно перевіряти формат пошти', () => {
    expect(validateEmail('test@example.com')).toBe(true);

    expect(validateEmail('invalid-email')).toBe(false);
    expect(validateEmail('user@domain')).toBe(false);
  });

  test('formatPoints має запобігати появі від\'ємних балів', () => {
    expect(formatPoints(10.5)).toBe(10);

    expect(formatPoints(-5)).toBe(0);

    expect(formatPoints(0)).toBe(0);
  });

});