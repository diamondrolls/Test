# PayPal IPN + Supabase setup

This repository uses a PayPal IPN flow with a Supabase Edge Function so NFT/mint credits are granted **only** after server-side confirmation.

## What was added

- Edge Function: `supabase/functions/paypal-ipn/index.ts`
- Migration: `supabase/migrations/20260417230000_paypal_ipn.sql`
- Frontend PayPal integration updates in:
  - `index.html`
  - `jame.js`

## Required Supabase / PayPal secrets

Set these in Supabase Edge Function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PAYPAL_VERIFY_URL`
  - Sandbox: `https://ipnpb.sandbox.paypal.com/cgi-bin/webscr`
  - Live: `https://ipnpb.paypal.com/cgi-bin/webscr`
- `PAYPAL_EXPECTED_CURRENCY` (default `USD`)
- `PAYPAL_RECEIVER_EMAIL` (recommended)
- `PAYPAL_RECEIVER_ID` (optional if email is set, otherwise required)

## DB schema / RLS

Migration creates:

- `public.user_balances`
  - `user_id`, `nft_cards`, `bullets` (max 500), `mint_fee_credits`
- `public.paypal_transactions`
  - `txn_id` (unique), `user_id`, `purchase_type`, `quantity`, `gross`, `currency`, `status`, timestamps

RLS policy added:

- Users can read their own `user_balances`
- No anon/authenticated write policies are added for balances or transactions
- Crediting functions are `SECURITY DEFINER` and executable only by `service_role`

## Deploy

```bash
supabase db push
supabase functions deploy paypal-ipn
```

## PayPal button configuration

Frontend now sends:

- `notify_url` -> `${SUPABASE_URL}/functions/v1/paypal-ipn`
- `custom` -> `userId:purchaseType:quantity`
- `return` / `cancel_return` -> current page URL

For hosted buttons:

- Keep `PAYPAL_BUTTON_IDS.nft_cards` in `jame.js` set to your NFT button id.
- Set `PAYPAL_BUTTON_IDS.mint_fee` in `jame.js` to a hosted button that charges **$20.00 USD**.

`mint_fee` credits are granted only when IPN is verified and amount/currency/receiver checks pass.

## Sandbox testing

1. Set `PAYPAL_VERIFY_URL` to sandbox endpoint.
2. Use sandbox merchant receiver email/id values in secrets.
3. Complete a sandbox payment.
4. Verify `paypal_transactions` row is created with `Completed` status.
5. Verify `user_balances` is incremented (`nft_cards` or `mint_fee_credits`).

The frontend status message/polling checks Supabase balances rather than trusting PayPal redirect pages.
