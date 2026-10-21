// Marketplace item price only; delivery is excluded. Stripe costs come from UniMate's share.
export const MARKETPLACE_COMMISSION_BPS = 1200;
export function marketplaceSplit(itemPricePence) {
  if (!Number.isSafeInteger(itemPricePence) || itemPricePence < 0 || itemPricePence > 10000000) {
    throw new RangeError('Item price must be whole pence between 0 and 10000000.');
  }
  const commissionPence = Math.round(itemPricePence * MARKETPLACE_COMMISSION_BPS / 10000);
  return { commissionPence, sellerPence: itemPricePence - commissionPence };
}
