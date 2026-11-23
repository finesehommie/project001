import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  classifyMegaPayInitiationFailure,
  classifyMegaPayStatus,
  normalizeKenyanPhone,
  parseMegaPayInitiation,
  type MegaPayPayment,
  type MegaPayPaymentStatus,
} from "./megapay.shared";

const MEGAPAY_INITIATE_URL = "https://megapay.co.ke/backend/v1/initiatestk";
const MEGAPAY_STATUS_URL = "https://megapay.co.ke/backend/v1/transactionstatus";

const paymentInput = z.object({
  amountKes: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  phone: z.string().min(1).max(32),
});

const paymentIdInput = z.object({ paymentId: z.string().uuid() });

type PaymentContext = { userId: string };
type ProviderCredentials = { apiKey: string; email: string };

function getProviderCredentials(): ProviderCredentials {
  const apiKey = process.env["MEGAPAY_API_KEY"];
  const email = process.env["MEGAPAY_EMAIL"];
  if (!apiKey || !email) {
    throw new Error(
      "MegaPay is not configured. Add MEGAPAY_API_KEY and MEGAPAY_EMAIL to the server environment.",
    );
  }
  return { apiKey, email };
}

function asPayment(row: {
  id: string;
  amount_kes: number;
  reference: string;
  status: MegaPayPaymentStatus;
  transaction_id: string | null;
  receipt: string | null;
  created_at: string;
  updated_at: string;
}): MegaPayPayment {
  return row;
}

async function getActivePayment(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("megapay_payments")
    .select("id, amount_kes, reference, status, transaction_id, receipt, created_at, updated_at")
    .eq("user_id", userId)
    .in("status", ["initiating", "pending", "review"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`Could not load your payment request: ${error.message}`);
  return data ? asPayment(data) : null;
}

export const listMegaPayPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as PaymentContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("megapay_payments")
      .select("id, amount_kes, reference, status, transaction_id, receipt, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) throw new Error(`Could not load your payment history: ${error.message}`);
    return (data ?? []).map(asPayment);
  });

export const startMegaPayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => paymentInput.parse(value))
  .handler(async ({ data, context }) => {
    const { userId } = context as PaymentContext;
    const phone = normalizeKenyanPhone(data.phone);
    if (!phone) {
      throw new Error("Enter a valid Kenyan M-Pesa number, such as 0712345678 or +254712345678.");
    }

    const activePayment = await getActivePayment(userId);
    if (activePayment) return activePayment;

    const credentials = getProviderCredentials();
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const reference = `OMT${crypto.randomUUID().replace(/-/g, "").slice(0, 12).toUpperCase()}`;
    const { data: payment, error: insertError } = await supabaseAdmin
      .from("megapay_payments")
      .insert({
        user_id: userId,
        amount_kes: data.amountKes,
        msisdn: phone,
        reference,
        status: "initiating",
      })
      .select("id, amount_kes, reference, status, transaction_id, receipt, created_at, updated_at")
      .single();

    if (insertError) {
      if (insertError.code === "23505") {
        const existing = await getActivePayment(userId);
        if (existing) return existing;
      }
      throw new Error(`Could not create your payment request: ${insertError.message}`);
    }

    let response: Response;
    try {
      response = await fetch(MEGAPAY_INITIATE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          api_key: credentials.apiKey,
          email: credentials.email,
          amount: String(data.amountKes),
          msisdn: phone,
          reference,
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      const { error: updateError } = await supabaseAdmin
        .from("megapay_payments")
        .update({
          status: "review",
          failure_reason: "MegaPay request outcome could not be confirmed.",
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id)
        .eq("user_id", userId);

      if (updateError) {
        throw new Error(
          `MegaPay outcome is unknown and the payment record could not be updated: ${updateError.message}`,
        );
      }
      console.error("MegaPay initiation outcome is unknown:", error);
      throw new Error(
        `MegaPay could not confirm the request. Do not retry yet; contact support with reference ${reference}.`,
      );
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    const started = response.ok ? parseMegaPayInitiation(payload) : null;
    const status: MegaPayPaymentStatus = started
      ? "pending"
      : classifyMegaPayInitiationFailure(payload);
    const reason = started
      ? null
      : status === "failed"
        ? "MegaPay rejected the payment request."
        : "MegaPay request outcome could not be confirmed.";
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("megapay_payments")
      .update({
        status,
        transaction_request_id: started?.transactionRequestId ?? null,
        failure_reason: reason,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("user_id", userId)
      .select("id, amount_kes, reference, status, transaction_id, receipt, created_at, updated_at")
      .single();

    if (updateError) {
      throw new Error(
        `MegaPay response was received, but the payment record could not be updated: ${updateError.message}`,
      );
    }
    if (!started) {
      throw new Error(
        status === "failed"
          ? `MegaPay rejected the payment request. Reference: ${reference}.`
          : `MegaPay response could not be confirmed. Do not retry yet; contact support with reference ${reference}.`,
      );
    }

    return asPayment(updated);
  });

export const checkMegaPayPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((value: unknown) => paymentIdInput.parse(value))
  .handler(async ({ data, context }) => {
    const { userId } = context as PaymentContext;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: payment, error } = await supabaseAdmin
      .from("megapay_payments")
      .select(
        "id, user_id, amount_kes, reference, status, transaction_request_id, transaction_id, receipt, created_at, updated_at",
      )
      .eq("id", data.paymentId)
      .eq("user_id", userId)
      .single();

    if (error || !payment) throw new Error("Payment request was not found.");
    if (payment.status !== "pending" || !payment.transaction_request_id) {
      return asPayment(payment);
    }

    const credentials = getProviderCredentials();
    let response: Response;
    try {
      response = await fetch(MEGAPAY_STATUS_URL, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          api_key: credentials.apiKey,
          email: credentials.email,
          transaction_request_id: payment.transaction_request_id,
        }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (cause) {
      console.error("MegaPay status request failed:", cause);
      throw new Error("Could not check the payment with MegaPay. Try again shortly.");
    }

    if (!response.ok) {
      throw new Error(`MegaPay status check failed (HTTP ${response.status}). Try again shortly.`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new Error("MegaPay returned an invalid status response. Try again shortly.");
    }

    const result = classifyMegaPayStatus(payload, {
      reference: payment.reference,
      amountKes: payment.amount_kes,
    });
    const { data: updated, error: updateError } = await supabaseAdmin
      .from("megapay_payments")
      .update({
        status: result.status,
        transaction_id: result.transactionId,
        receipt: result.receipt,
        failure_reason:
          result.status === "review"
            ? "MegaPay status did not match the stored payment request."
            : result.status === "failed"
              ? "MegaPay reports that the payment did not complete."
              : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", payment.id)
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id, amount_kes, reference, status, transaction_id, receipt, created_at, updated_at")
      .single();

    if (updateError) {
      throw new Error(`Could not update the payment status: ${updateError.message}`);
    }
    return asPayment(updated);
  });
