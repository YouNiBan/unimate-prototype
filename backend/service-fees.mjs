import { feePolicies, quoteFee } from './fee-policy.mjs';
export const SERVICE_COMMISSION_BPS = Object.freeze(Object.fromEntries(
  feePolicies.filter(policy => ['cleaning', 'moving', 'airport_transfer'].includes(policy.kind))
    .map(policy => [policy.kind, policy.rateBps]),
));

// Included in the agreed booking price, never added as a customer surcharge.
// Stripe processing is borne by UniMate. This split does not release a payout.
export function serviceFeeSplit(service, amountPence) {
  if (!Object.hasOwn(SERVICE_COMMISSION_BPS, service)) throw new RangeError('Unsupported service.');
  if (!Number.isSafeInteger(amountPence) || amountPence < 0 || amountPence > 10000000) {
    throw new RangeError('Booking price must be whole pence between 0 and 10000000.');
  }
  const split = quoteFee({ kind: service, amountPence });
  return { rateBps: split.rateBps, commissionPence: split.commissionPence, providerPence: split.partnerSharePence };
}
