// Supabase Edge Function: PayPal IPN (LIVE) handler
// - Verifies IPN with PayPal (VERIFIED)
// - Ensures payment_status is Completed
// - Ensures receiver is YOUR account (Diamondrolls@yahoo.com)
// - Idempotent using txn_id
// - Credits nft_cards balance based on quantity

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function parseForm(body: string) {
  const params = new URLSearchParams(body);
  const obj: Record<string, string> = {};
  for (const [k, v] of params.entries()) obj[k] = v;
  return { params, obj };
}

function expectedGrossForQty(qty: number): string | null {
  // Match your dropdown:
  // 1  -> 6.00
  // 5  -> 30.00
  // 10 -> 50.00
  // 30 -> 180.00
  // 60 -> 360.00
  // 100-> 600.00
  const map: Record<number, string> = {
    1: "6.00",
    5: "30.00",
    10: "50.00",
    30: "180.00",
    60: "360.00",
    100: "600.00",
  };
  return map[qty] ?? null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const rawBody = await req.text();
  const { params, obj } = parseForm(rawBody);

  // 1) Verify IPN with PayPal LIVE
  const verifyParams = new URLSearchParams(params);
  verifyParams.set("cmd", "_notify-validate");

  const verifyResp = await fetch("https://ipnpb.paypal.com/cgi-bin/webscr", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: verifyParams.toString(),
  });

  const verifyText = (await verifyResp.text()).trim();

  if (verifyText !== "VERIFIED") {
    // IMPORTANT: still return 200 so PayPal doesn't hammer you forever,
    // but record logs in Supabase later if you want.
    return new Response("INVALID", { status: 200 });
  }

  // 2) Basic payment checks
  const paymentStatus = (obj["payment_status"] ?? "").toLowerCase();
  if (paymentStatus !== "completed") {
    return new Response("IGNORED", { status: 200 });
  }

  const receiverEmail =
    (obj["receiver_email"] ?? obj["business"] ?? "").toLowerCase();
  if (receiverEmail !== "diamondrolls@yahoo.com") {
    return new Response("WRONG_RECEIVER", { status: 200 });
  }

  const currency = (obj["mc_currency"] ?? "").toUpperCase();
  if (currency !== "USD") {
    return new Response("WRONG_CURRENCY", { status: 200 });
  }

  const txnId = obj["txn_id"];
  if (!txnId) {
    return new Response("MISSING_TXN_ID", { status: 200 });
  }

  // 3) Parse custom: "<uuid>|nft_cards|<qty>|<nonce>"
  const custom = obj["custom"] ?? "";
  const [userId, purchaseType, qtyStr] = custom.split("|");
  const qty = Number(qtyStr);

  if (!userId || purchaseType !== "nft_cards" || !Number.isFinite(qty)) {
    return new Response("BAD_CUSTOM", { status: 200 });
  }

  const expectedGross = expectedGrossForQty(qty);
  const gross = obj["mc_gross"] ?? "";
  if (!expectedGross || gross !== expectedGross) {
    return new Response("BAD_AMOUNT", { status: 200 });
  }

  // 4) Supabase service role client (server-side only)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey);

  // 5) Idempotency: store txn_id (unique)
  // If already processed, do nothing.
  const { error: insertTxnErr } = await supabase.from("paypal_transactions").insert({
    txn_id: txnId,
    user_id: userId,
    purchase_type: purchaseType,
    quantity: qty,
    gross: gross,
    currency: currency,
    status: obj["payment_status"] ?? "",
    raw: obj,
  });

  if (insertTxnErr) {
    // If it's a unique violation, treat as already processed.
    // PostgREST error codes vary; simplest: just return OK so PayPal stops retrying.
    return new Response("DUPLICATE_OR_ERROR", { status: 200 });
  }

  // 6) Credit balance (upsert then increment)
  // Ensure row exists
  await supabase.from("player_balances").upsert({
    user_id: userId,
    nft_cards: 0,
    bullets: 100,
    mint_fee_paid: false,
  }, { onConflict: "user_id" });

  // Increment nft_cards
  const { error: creditErr } = await supabase.rpc("increment_nft_cards", {
    p_user_id: userId,
    p_amount: qty,
  });

  if (creditErr) {
    return new Response("CREDIT_FAILED", { status: 200 });
  }

  return new Response("OK", { status: 200 });
});
