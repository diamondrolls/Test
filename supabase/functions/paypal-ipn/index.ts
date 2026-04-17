import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

type ParsedCustom = {
  userId: string;
  purchaseType: 'nft_cards' | 'mint_fee';
  quantity: number;
};

const NFT_CARD_PRICE_USD: Record<number, number> = {
  1: 6,
  5: 30,
  10: 50,
  30: 180,
  60: 360,
  100: 600,
};

const MINT_FEE_USD = 20;

function toCents(amount: string | number): number {
  const value = typeof amount === 'number' ? amount : Number.parseFloat(String(amount));
  if (!Number.isFinite(value) || value < 0) return Number.NaN;
  return Math.round(value * 100);
}

function parseCustom(rawCustom: string | null): ParsedCustom | null {
  if (!rawCustom) return null;

  const custom = rawCustom.trim();
  if (!custom) return null;

  if (custom.startsWith('{')) {
    try {
      const parsed = JSON.parse(custom);
      const userId = String(parsed.userId || parsed.user_id || '').trim();
      const purchaseType = String(parsed.purchaseType || parsed.purchase_type || '').trim().toLowerCase();
      const quantity = Number.parseInt(String(parsed.quantity ?? '1'), 10);
      if (!userId || (purchaseType !== 'nft_cards' && purchaseType !== 'mint_fee') || !Number.isInteger(quantity) || quantity <= 0) {
        return null;
      }
      return { userId, purchaseType: purchaseType as ParsedCustom['purchaseType'], quantity };
    } catch {
      return null;
    }
  }

  const [userId, rawPurchaseType, rawQuantity] = custom.split(':');
  const purchaseType = (rawPurchaseType || '').trim().toLowerCase();
  const quantity = Number.parseInt((rawQuantity || '1').trim(), 10);

  if (!userId || (purchaseType !== 'nft_cards' && purchaseType !== 'mint_fee') || !Number.isInteger(quantity) || quantity <= 0) {
    return null;
  }

  return {
    userId: userId.trim(),
    purchaseType: purchaseType as ParsedCustom['purchaseType'],
    quantity,
  };
}

function expectedGrossCents(purchaseType: ParsedCustom['purchaseType'], quantity: number): number {
  if (purchaseType === 'mint_fee') {
    return toCents(MINT_FEE_USD * quantity);
  }

  const amount = NFT_CARD_PRICE_USD[quantity];
  if (typeof amount !== 'number') return Number.NaN;
  return toCents(amount);
}

function getIpnQuantity(params: URLSearchParams): number | null {
  const quantityFields = [
    params.get('option_selection1'),
    params.get('os0'),
    params.get('quantity'),
  ];

  for (const value of quantityFields) {
    if (!value) continue;
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isInteger(parsed) && parsed > 0) return parsed;
  }

  return null;
}

function isCompletedStatus(status: string | null): boolean {
  return (status || '').trim().toLowerCase() === 'completed';
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const paypalVerifyUrl = Deno.env.get('PAYPAL_VERIFY_URL') || 'https://ipnpb.paypal.com/cgi-bin/webscr';
  const expectedCurrency = (Deno.env.get('PAYPAL_EXPECTED_CURRENCY') || 'USD').trim().toUpperCase();
  const expectedReceiverEmail = (Deno.env.get('PAYPAL_RECEIVER_EMAIL') || '').trim().toLowerCase();
  const expectedReceiverId = (Deno.env.get('PAYPAL_RECEIVER_ID') || '').trim();
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return new Response('Supabase env vars are missing', { status: 500 });
  }

  if (!expectedReceiverEmail && !expectedReceiverId) {
    return new Response('PayPal receiver env var is required', { status: 500 });
  }

  const rawBody = await req.text();
  if (!rawBody.trim()) {
    return new Response('Invalid IPN payload', { status: 400 });
  }

  const verifyResponse = await fetch(paypalVerifyUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `cmd=_notify-validate&${rawBody}`,
  });

  const verifyText = (await verifyResponse.text()).trim();
  if (!verifyResponse.ok || verifyText !== 'VERIFIED') {
    return new Response('IPN verification failed', { status: 400 });
  }

  const params = new URLSearchParams(rawBody);
  const txnId = (params.get('txn_id') || '').trim();
  const custom = parseCustom(params.get('custom'));
  const paymentStatus = (params.get('payment_status') || '').trim();
  const mcGrossRaw = (params.get('mc_gross') || '').trim();
  const mcCurrency = (params.get('mc_currency') || '').trim().toUpperCase();
  const receiverEmail = ((params.get('receiver_email') || params.get('business') || '')).trim().toLowerCase();
  const receiverId = (params.get('receiver_id') || '').trim();

  if (!txnId || !custom) {
    return new Response('Missing txn_id or custom', { status: 400 });
  }

  if (expectedReceiverEmail && receiverEmail !== expectedReceiverEmail) {
    return new Response('Receiver email mismatch', { status: 400 });
  }

  if (expectedReceiverId && receiverId !== expectedReceiverId) {
    return new Response('Receiver id mismatch', { status: 400 });
  }

  const ipnQty = getIpnQuantity(params);
  if (ipnQty !== null && ipnQty !== custom.quantity) {
    return new Response('Quantity mismatch', { status: 400 });
  }

  if (mcCurrency !== expectedCurrency) {
    return new Response('Currency mismatch', { status: 400 });
  }

  const grossCents = toCents(mcGrossRaw);
  const expectedCents = expectedGrossCents(custom.purchaseType, custom.quantity);
  if (!Number.isFinite(grossCents) || !Number.isFinite(expectedCents) || grossCents !== expectedCents) {
    return new Response('Amount mismatch', { status: 400 });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: existingTxn, error: existingTxnError } = await supabase
    .from('paypal_transactions')
    .select('txn_id, status')
    .eq('txn_id', txnId)
    .maybeSingle();

  if (existingTxnError) {
    return new Response(`Failed to query transaction: ${existingTxnError.message}`, { status: 500 });
  }

  if (existingTxn && String(existingTxn.status || '').toLowerCase() === 'completed') {
    return new Response('Already processed', { status: 200 });
  }

  const { data: credited, error: processError } = await supabase.rpc('process_paypal_transaction', {
    p_txn_id: txnId,
    p_user_id: custom.userId,
    p_purchase_type: custom.purchaseType,
    p_quantity: custom.quantity,
    p_gross: Number.parseFloat(mcGrossRaw),
    p_currency: mcCurrency,
    p_status: paymentStatus,
  });

  if (processError) {
    return new Response(`Failed to process transaction: ${processError.message}`, { status: 500 });
  }

  if (!isCompletedStatus(paymentStatus)) {
    return new Response('IPN stored (not completed)', { status: 200 });
  }

  return new Response(credited ? 'Payment credited' : 'Payment already recorded', { status: 200 });
});
