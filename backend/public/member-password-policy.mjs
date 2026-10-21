// Shared by the connected sign-up form and its server validation.
export function memberPasswordRules(password) {
  const value = typeof password === 'string' ? password : '';
  return [
    {label: 'At least 10 characters', passed: value.length >= 10},
    {label: 'Uppercase and lowercase letters', passed: /[A-Z]/.test(value) && /[a-z]/.test(value)},
    {label: 'A number', passed: /\d/.test(value)},
    {label: 'A special character', passed: /[^\p{L}\p{N}\s]/u.test(value)},
  ];
}
export const memberPasswordValid = value => typeof value === 'string' && value.length <= 128 && memberPasswordRules(value).every(rule => rule.passed);
