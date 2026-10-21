import { test } from 'node:test';
import assert from 'node:assert/strict';
import { displayUsername, validUsername, matchesPerson } from '../usernames.ts';
test('handles support periods, underscores and numbers', () => {
  assert.equal(displayUsername('@Jenney.He'), 'jenney.he');
  for (const value of ['jenney.he', '@jenney.he', 'jenney_he', 'jenney123']) assert.ok(validUsername(value));
  for (const value of ['', 'jenney he', 'jenney-he', 'a'.repeat(31)]) assert.equal(validUsername(value), false);
});
test('partial name and handle search is case insensitive', () => {
  for (const query of ['jen', 'Jenney H', 'jenney.h', '@JENNEY.H']) assert.ok(matchesPerson(query, 'Jenney He', '@jenney.he'));
  assert.equal(matchesPerson('other', 'Jenney He', '@jenney.he'), false);
  assert.equal(matchesPerson('', 'Jenney He', '@jenney.he'), false);
});
