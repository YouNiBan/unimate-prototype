export const FEE_POLICY_VERSION = '2026-10-20-v1';
export const feePolicies = Object.freeze([
  { kind: 'marketplace', label: 'Student marketplace', rateBps: 1200, basis: 'Item price, excluding delivery', billing: 'Included in the sale price' },
  { kind: 'cleaning', label: 'Cleaning', rateBps: 2000, basis: 'Confirmed booking price', billing: 'Included in the booking price' },
  { kind: 'moving', label: 'Moving', rateBps: 2000, basis: 'Confirmed booking price', billing: 'Included in the booking price' },
  { kind: 'airport_transfer', label: 'Airport transfers', rateBps: 2000, basis: 'Confirmed booking price', billing: 'Included in the booking price' },
  { kind: 'event_ticket', label: 'Event tickets', rateBps: 1000, basis: 'Ticket price', billing: 'Deducted from organiser proceeds' },
  { kind: 'restaurant_reservation', label: 'Restaurant reservations', perGuestPence: 100, basis: 'Guests who attended only', billing: 'Billed to the restaurant monthly' },
  { kind: 'prepaid_meal', label: 'Prepaid meals & experiences', rateBps: 1000, basis: 'Prepaid meal or experience price', billing: 'Replaces the reservation fee' },
].map(policy => Object.freeze({ ...policy, processingFeeBearer: 'unimate' })));

const integer = (value, name, maximum = 10000000) => {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new RangeError(`Invalid ${name}.`);
  return value;
};

// A quote is not a charge, transfer, invoice or confirmation of attendance.
// Production orders must use trusted prices and verified attendance records.
export function quoteFee({ kind, amountPence = 0, deliveryPence = 0, attendedGuests = 0 }) {
  const policy = feePolicies.find(row => row.kind === kind);
  if (!policy) throw new RangeError('Choose a supported fee category.');
  integer(amountPence, 'price');
  integer(deliveryPence, 'delivery');
  integer(attendedGuests, 'attended guest count', 100000);
  if (kind !== 'marketplace' && deliveryPence) throw new RangeError('Separate delivery applies only to marketplace sales.');
  if (kind !== 'restaurant_reservation' && attendedGuests) throw new RangeError('Guest fees apply only to restaurant reservations.');
  if (kind === 'restaurant_reservation' && amountPence) throw new RangeError('Restaurant reservations use attended guests, not meal value.');
  const commissionPence = policy.perGuestPence !== undefined
    ? attendedGuests * policy.perGuestPence
    : Math.round(amountPence * policy.rateBps / 10000);
  return {
    policyVersion: FEE_POLICY_VERSION, kind, currency: 'gbp',
    basisPence: amountPence, deliveryPence, attendedGuests,
    rateBps: policy.rateBps ?? null, commissionPence,
    partnerSharePence: policy.perGuestPence === undefined ? amountPence - commissionPence : null,
    customerTotalPence: policy.perGuestPence === undefined ? amountPence + deliveryPence : 0,
    restaurantDuePence: policy.perGuestPence !== undefined ? commissionPence : null,
    processingFeeBearer: 'unimate', stripeFeePence: null, netEarningsPence: null,
  };
}
