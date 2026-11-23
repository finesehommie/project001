export type MegaPayPaymentStatus = "initiating" | "pending" | "completed" | "failed" | "review";

export type MegaPayPayment = {
  id: string;
  amount_kes: number;
  reference: string;
  status: MegaPayPaymentStatus;
  transaction_id: string | null;
  receipt: string | null;
  created_at: string;
  updated_at: string;
};

export function normalizeKenyanPhone(value: string): string | null {
  if (!/^[+\d\s()-]+$/.test(value)) return null;
  let phone = value.replace(/[\s()-]/g, "");
  if (phone.startsWith("+")) phone = phone.slice(1);
  if (/^0[17]\d{8}$/.test(phone)) phone = `254${phone.slice(1)}`;
  return /^254[17]\d{8}$/.test(phone) ? phone : null;
}

export function parseMegaPayInitiation(payload: unknown): { transactionRequestId: string } | null {
  if (!isRecord(payload) || String(payload["success"]) !== "200") return null;
  const transactionRequestId = payload["transaction_request_id"];
  return typeof transactionRequestId === "string" && transactionRequestId.length > 0
    ? { transactionRequestId }
    : null;
}

export function classifyMegaPayInitiationFailure(payload: unknown): "failed" | "review" {
  if (!isRecord(payload) || payload["success"] == null) return "review";
  return String(payload["success"]) === "200" ? "review" : "failed";
}

export function classifyMegaPayStatus(
  payload: unknown,
  expected: { reference: string; amountKes: number },
): {
  status: "pending" | "completed" | "failed" | "review";
  transactionId: string | null;
  receipt: string | null;
} {
  if (!isRecord(payload)) return { status: "review", transactionId: null, receipt: null };

  const transactionStatus =
    typeof payload["TransactionStatus"] === "string"
      ? payload["TransactionStatus"].toLowerCase()
      : "";

  if (transactionStatus === "completed") {
    const amount = Number(payload["TransactionAmount"]);
    const transactionId = payload["TransactionID"];
    const transactionReference = payload["TransactionReference"];
    if (
      typeof transactionId !== "string" ||
      !transactionId ||
      (typeof transactionReference === "string" && transactionReference !== expected.reference) ||
      !Number.isSafeInteger(amount) ||
      amount !== expected.amountKes
    ) {
      return { status: "review", transactionId: null, receipt: null };
    }

    return {
      status: "completed",
      transactionId,
      receipt:
        typeof payload["TransactionReceipt"] === "string" ? payload["TransactionReceipt"] : null,
    };
  }

  if (["failed", "cancelled", "canceled", "expired"].includes(transactionStatus)) {
    return { status: "failed", transactionId: null, receipt: null };
  }

  return { status: "pending", transactionId: null, receipt: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
