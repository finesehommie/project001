import { describe, expect, it } from "vitest";
import { triggerMet, tradeStats } from "@/lib/bot-presets";
import {
  classifyMegaPayInitiationFailure,
  classifyMegaPayStatus,
  normalizeKenyanPhone,
  parseMegaPayInitiation,
} from "@/lib/megapay.shared";

describe("streak trigger", () => {
  it("fires only after 3 consecutive evens", () => {
    expect(triggerMet([1, 2, 4, 6], { kind: "even", count: 3 })).toBe(true);
    expect(triggerMet([2, 4, 5], { kind: "even", count: 3 })).toBe(false);
  });
  it("low streak means digits 0-4", () => {
    expect(triggerMet([0, 4, 3, 1], { kind: "low", count: 4 })).toBe(true);
    expect(triggerMet([0, 5, 3, 1], { kind: "low", count: 4 })).toBe(false);
  });
});

describe("trade stats", () => {
  it("computes win rate, net and best streak", () => {
    const s = tradeStats([
      { won: true, profit: 9, stake: 10 },
      { won: true, profit: 9, stake: 10 },
      { won: false, profit: -10, stake: 10 },
      { won: true, profit: 9, stake: 10 },
    ]);
    expect(s.winRate).toBe(75);
    expect(s.net).toBe(17);
    expect(s.bestStreak).toBe(2);
    expect(s.profitFactor).toBe(2.7);
  });
});

describe("MegaPay payment validation", () => {
  it("normalizes valid Kenyan M-Pesa numbers", () => {
    expect(normalizeKenyanPhone("0712 345 678")).toBe("254712345678");
    expect(normalizeKenyanPhone("+254 112 345 678")).toBe("254112345678");
    expect(normalizeKenyanPhone("123456")).toBeNull();
  });

  it("accepts only a successful STK request with a transaction id", () => {
    expect(parseMegaPayInitiation({ success: "200", transaction_request_id: "REQ-1" })).toEqual({
      transactionRequestId: "REQ-1",
    });
    expect(parseMegaPayInitiation({ success: "200" })).toBeNull();
    expect(parseMegaPayInitiation({ success: "400", transaction_request_id: "REQ-1" })).toBeNull();
    expect(classifyMegaPayInitiationFailure({ success: "400" })).toBe("failed");
    expect(classifyMegaPayInitiationFailure({ success: "200" })).toBe("review");
    expect(classifyMegaPayInitiationFailure({ message: "Unexpected response" })).toBe("review");
  });

  it("marks a payment complete only when provider id and KES amount match", () => {
    const expected = { reference: "OMT-1", amountKes: 250 };
    const response = {
      TransactionStatus: "Completed",
      TransactionID: "MPESA-1",
      TransactionAmount: "250",
      TransactionReceipt: "ABC123",
      TransactionReference: "OMT-1",
    };
    expect(classifyMegaPayStatus(response, expected)).toEqual({
      status: "completed",
      transactionId: "MPESA-1",
      receipt: "ABC123",
    });
    expect(classifyMegaPayStatus({ ...response, TransactionAmount: "25" }, expected).status).toBe(
      "review",
    );
    expect(
      classifyMegaPayStatus({ ...response, TransactionReference: "OTHER" }, expected).status,
    ).toBe("review");
    expect(
      classifyMegaPayStatus({ ...response, TransactionStatus: "Cancelled" }, expected).status,
    ).toBe("failed");
  });
});

describe("repeat trigger", () => {
  it("fires only when the last digits repeat", () => {
    expect(triggerMet([1, 4, 4], { kind: "repeat", count: 2 })).toBe(true);
    expect(triggerMet([4, 5], { kind: "repeat", count: 2 })).toBe(false);
  });
});
