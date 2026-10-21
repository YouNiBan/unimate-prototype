import test from 'node:test';
import assert from 'node:assert/strict';
import { feePolicies, quoteFee } from '../fee-policy.mjs';
import { marketplaceSplit as mobileSplit } from '../../marketplace-fees.mjs';
import { marketplaceSplit as webSplit } from '../../../unimate-web-v2/marketplace-fees.mjs';

test('marketplace delivery is excluded and all apps agree to the penny', () => {
  for (const amountPence of [0, 1, 5, 99, 1999, 2000, 10000000]) {
    const quote = quoteFee({ kind: 'marketplace', amountPence, deliveryPence: 650 });
    assert.equal(quote.customerTotalPence, amountPence + 650);
    for (const split of [mobileSplit, webSplit]) {
      assert.deepEqual(split(amountPence), { commissionPence: quote.commissionPence, sellerPence: quote.partnerSharePence });
    }
    assert.equal(quote.commissionPence + quote.partnerSharePence, amountPence);
  }
});
test('event and prepaid meal fees include processing and do not add a surcharge', () => {
  for (const kind of ['event_ticket', 'prepaid_meal']) {
    const quote = quoteFee({ kind, amountPence: 5000 });
    assert.equal(quote.commissionPence, 500);
    assert.equal(quote.partnerSharePence, 4500);
    assert.equal(quote.customerTotalPence, 5000);
    assert.equal(quote.stripeFeePence, null);
    assert.equal(quote.netEarningsPence, null);
    assert.equal(quote.processingFeeBearer, 'unimate');
  }
  assert.throws(() => quoteFee({kind:'prepaid_meal',amountPence:5000,attendedGuests:2}), RangeError);
});
test('restaurant referral total bills the restaurant for attended guests only', () => {
  const quote = quoteFee({ kind:'restaurant_reservation',attendedGuests:100 });
  assert.equal(quote.restaurantDuePence, 10000);
  assert.equal(quote.customerTotalPence, 0);
  assert.equal(quote.partnerSharePence, null);
  assert.equal(quoteFee({kind:'restaurant_reservation',attendedGuests:0}).restaurantDuePence, 0);
  assert.throws(() => quoteFee({kind:'restaurant_reservation',amountPence:1000,attendedGuests:2}), RangeError);
});
test('invalid money, categories and duplicate fee bases are rejected', () => {
  for (const amountPence of [-1, Infinity, NaN, 1.2, '2000', 10000001]) {
    assert.throws(() => quoteFee({kind:'event_ticket',amountPence}), RangeError);
  }
  assert.throws(() => quoteFee({kind:'own_product',amountPence:2000}), RangeError);
  assert.throws(() => quoteFee({kind:'event_ticket',amountPence:2000,deliveryPence:50}), RangeError);
  assert.throws(() => quoteFee({kind:'restaurant_reservation',attendedGuests:1.5}), RangeError);
  assert.ok(Object.isFrozen(feePolicies) && feePolicies.every(Object.isFrozen));
});
