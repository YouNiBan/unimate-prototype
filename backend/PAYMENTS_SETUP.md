# UniMate payments: local sandbox groundwork

**The UniMate Stripe account has been connected for administrative inspection, but the app runtime is not configured for live payments. Payments remain disabled by default. Offline tests do not charge, refund or pay out money.**

The current integration supports sandbox Checkout for an existing, confirmed-price UniMate cleaning, moving or airport transfer booking. The signed-in booking owner can open Checkout. A verified sandbox webhook records the result in a separate payment ledger. Owners and SuperAdmins can inspect that ledger; support staff cannot.

This is groundwork for testing. Live Stripe keys and live events are deliberately rejected.

## What is ready

- Prices and GBP currency come from the confirmed booking in the database. Amounts must be whole pence from 30 to 10,000,000. The browser cannot set the charge amount or customer identity.
- A checkout reserves one durable order before contacting Stripe. Retries reuse the same saved parameters and order ID as Stripe’s idempotency key.
- The order is marked paid only after a signed, matching Checkout completion or asynchronous success event reports `payment_status=paid`. Visiting a return URL does not change payment status.
- Payment events do not automatically complete the service, pay staff or change the existing invoice records.
- Request/session ownership, CSRF, role checks and provider response validation are covered by offline tests.

## Connecting a sandbox later

A person with access to the UniMate Stripe account can configure these **server-only** settings using a separate development sandbox:

| Setting | Required value |
| --- | --- |
| `UNIMATE_STRIPE_MODE` | `test` |
| `STRIPE_SECRET_KEY` | A restricted test key beginning `rk_test_`, or a test secret key beginning `sk_test_` |
| `STRIPE_WEBHOOK_SECRET` | The sandbox webhook signing secret, beginning `whsec_` |

Keep these values out of the website bundle, repository and chat. An incomplete configuration is rejected. Leaving all three unset keeps Stripe disabled. The server constructs the SDK only from the validated test configuration; an injected SDK is a trusted internal dependency, not browser input.

Stripe Checkout uses a hosted session with line items, payment mode, metadata and success/cancel URLs. UniMate builds those values on the server from the stored order. [Stripe Checkout Session API](https://docs.stripe.com/api/checkout/sessions/create)

## Local webhook testing

The app and backend can remain on this computer. Once a Stripe account and CLI are available, the operator can sign in to the CLI and forward **snapshot events for their own account**:

```sh
stripe login
stripe listen --forward-to http://localhost:8090/api/payments/stripe-webhook
```

Use the signing secret displayed by this local listener as the local server’s `STRIPE_WEBHOOK_SECRET`, then restart the local backend with the test settings. The CLI secret and a Dashboard endpoint’s secret are different configurations. Stripe supports local forwarding without first publishing the app. Signature verification must use the original request bytes. [Stripe webhook setup and local testing](https://docs.stripe.com/webhooks)

Keep the listener running and perform a checkout created from a real local UniMate booking. Generic CLI test events do not contain a matching UniMate order and are intentionally ignored.

Supported event types:

- `checkout.session.completed`
- `checkout.session.async_payment_succeeded`
- `checkout.session.async_payment_failed`
- `checkout.session.expired`

The handler rejects live and connected-account events, invalid signatures and mismatched session IDs, member IDs, booking IDs, metadata, amounts or currency. Raw webhook requests are limited to 128 KB. Other valid sandbox event types are acknowledged without changing a booking payment.

## Status and recovery rules

| Status | Meaning and next step |
| --- | --- |
| No order | Checkout has not started. |
| `creating` | Creation is in progress or its result is unknown. Retry uses the original key. |
| `open` | Stripe confirmed an unpaid open Checkout Session. |
| `processing` | Checkout completed or Stripe reports a result still awaiting the paid webhook. |
| `paid` | A matching signed sandbox event confirmed payment. This cannot be downgraded by a later failure/expiration event. |
| `expired` | Stripe confirmed expiration. A fresh checkout may now be created. |
| `failed` | The payment failed. Automatic replacement is blocked pending reconciliation or a verified expiration event. |

Changing the booking quote is blocked while a non-expired order exists, including a paid order. Do not delete orders or change their status manually to unblock payment.

An unknown creation older than 23 hours requires operator reconciliation. Stripe may prune idempotency keys after 24 hours, so blindly reusing an older key could create another session. The local ledger intentionally refuses that retry. [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests)

If the webhook arrives before the lost creation response has been recovered, the handler asks Stripe to retry. Recover the original checkout with its existing idempotency key so the session ID can be matched. Conflicting outcomes require investigation in Stripe and the local ledger.

## API contract

- `GET /api/member/payments/config` → `{enabled, mode, supportedKinds:["booking"]}` for an authenticated member.
- `POST /api/member/bookings/:id/checkout` with `{}` → `{url, orderId, mode:"test"}` for the owner, with member CSRF.
- `GET /api/member/bookings/:id/payment` → `{payment:null}` or `{payment:{orderId,status,amountPence,currency:"gbp",mode:"test"}}`, owner only.
- `GET /api/payments?page=1` → `{rows,total,page,enabled,mode}`, Owner/SuperAdmin only. Pages contain 25 orders and no Stripe customer details, API keys, raw parameters or checkout URLs.
- `POST /api/payments/stripe-webhook` → signature-authenticated raw request. This exact route alone bypasses browser Origin/CSRF handling.

The factory exposes `readiness()`, `bookingPayment(bookingId)` and `assertRequoteAllowed(bookingId)`. These helpers are trusted server functions; callers must still authorize access. Run the quote guard inside the transaction that changes a quote.

## Still to build before accepting money

- Real Stripe account onboarding, live configuration, operational webhook monitoring and reconciliation.
- Refunds, disputes, cancellations, accounting/tax decisions and invoice reconciliation.
- Event ticket inventory, capacity, pricing, reservations and ticket fulfillment. Events currently have no payable server inventory.
- Marketplace order inventory and seller onboarding. Independent sellers require a designed Stripe Connect flow; no Connect charge, transfer, fee or payout implementation exists here.
- Staff payables. Paying a service booking does not calculate or release worker earnings; staff compensation requires its own approved workflow.

Do not enable event or marketplace payment buttons based on local demo prices. Each requires trusted server inventory and ownership rules first.

## Offline verification

```sh
node --test test/stripe-payments.test.mjs
```

The tests use a fake Checkout client and the Stripe SDK’s local signature helper. They make no outgoing Stripe requests. Coverage includes forged prices, cross-account access, CSRF, duplicate retries, unknown outcomes, signed webhook replay, unpaid return URLs, mismatched amounts, expiry, role restrictions and disabled/live-mode guards.

## Approved marketplace commission

Marketplace sales use 12% of the item price, excluding delivery. The seller receives the remaining 88%, subject to rounding to whole pence. Stripe processing costs are covered from UniMate's commission, not deducted a second time from the seller. This rate does not apply to UniMate-owned products, service bookings, event organisers or restaurant reservations.

Mobile and web seller estimates use this policy. Marketplace checkout and Stripe Connect are not yet implemented, so this is not an activated live Stripe application fee. Future server checkout must calculate and snapshot this split from trusted item prices, then record actual Stripe costs separately.

## Approved service commission

Cleaning, moving and airport transfers use a 20% UniMate fee included in the confirmed booking price. The provider share is 80%, with whole-pence rounding. Stripe processing is covered from UniMate's 20%; customers do not pay another UniMate surcharge.

New sandbox service checkouts snapshot this allocation in their saved Checkout and PaymentIntent metadata. Existing orders retain their original saved parameters. This is an accounting allocation, not a Stripe application fee or an automatic provider payout. Actual processing costs, refunds, tax and provider settlement still require reconciliation; employee wages remain a separate workflow.

## Approved partner fees and backend tracking

The versioned schedule in `fee-policy.mjs` is available to Owners and Superadmins under Statistics → Student payments. Its calculator is read-only and creates no financial records.

- Event tickets: 10% of the ticket price, deducted from organiser proceeds; no additional UniMate customer booking fee.
- Prepaid restaurant meals and experiences: 10%, replacing the per-guest reservation fee. Do not charge both.
- Restaurant reservations paid at the venue: £1 per guest who actually attends, billed to the restaurant in a consolidated monthly invoice. Cancelled and no-show guests do not qualify. UniMate does not process the diner's meal payment in this flow.
- Percentage fees cover Stripe processing from UniMate's share. Restaurant invoice collection costs also belong to UniMate.
- UniMate-owned catalogue products have no third-party seller commission.

Service checkout records now expose their saved fee allocation to Owners and Superadmins. Historical records without an allocation show “Not recorded”; they are never retrospectively recalculated. Stripe costs, net earnings and provider payout completion are not inferred from an unpaid or paid Checkout status. The current flow has no automatic payout or actual-cost reconciliation.

`GET /api/payments/fees/quote` accepts a supported `kind` plus whole-pence `amountPence`, marketplace-only `deliveryPence`, or restaurant-only `attendedGuests`. It requires Owner/Superadmin access. The preview must not be used as authority to charge a customer: production order creation must source amounts, quantities and attendance from validated records.

Before live partner billing: connect inventory and attendance, obtain partner agreements, configure seller/provider Stripe onboarding and settlement, reconcile refunds and actual processing costs, and configure the hosted backend with restricted credentials and signed webhooks. Restaurant monthly invoicing is an approved billing policy, not an active recurring job or automatic charge.

## Administrator access

Only the Owner can list, create, promote, demote or deactivate administrator accounts. Superadmins retain operational and financial access but cannot manage administrators. Admins have moderation access without company payment records, fee calculations, invoices, company documents, HR details, audit logs or account oversight. Existing limited Support accounts remain supported. Account changes are audited and revoke affected sessions; the Owner account cannot be demoted or deactivated through administrator management.
