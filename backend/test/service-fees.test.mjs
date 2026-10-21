import test from 'node:test';
import assert from 'node:assert/strict';
import { serviceFeeSplit } from '../service-fees.mjs';

for (const service of ['cleaning', 'moving', 'airport_transfer']) {
  test(`${service}: 20% is included in the price and leaves 80% for the provider`, () => {
    assert.deepEqual(serviceFeeSplit(service, 10000), {
      rateBps: 2000, commissionPence: 2000, providerPence: 8000,
    });
    assert.deepEqual(serviceFeeSplit(service, 1999), {
      rateBps: 2000, commissionPence: 400, providerPence: 1599,
    });
  });
}
test('service commission excludes other business categories and rejects invalid amounts', () => {
  for (const service of ['marketplace', 'events', 'restaurant', 'toString']) {
    assert.throws(() => serviceFeeSplit(service, 10000), RangeError);
  }
  for (const amount of [-1, 0.5, NaN, Infinity, '10000', 10000001]) {
    assert.throws(() => serviceFeeSplit('cleaning', amount), RangeError);
  }
});
