import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowUpRight,
  CircleDollarSign,
  FlaskConical,
  RefreshCw,
  RotateCcw,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSession } from "@/components/session-context";
import { supabase } from "@/integrations/supabase/client";
import {
  checkMegaPayPayment,
  listMegaPayPayments,
  startMegaPayPayment,
} from "@/lib/megapay.functions";
import type { MegaPayPayment } from "@/lib/megapay.shared";

const money = (n: number) =>
  n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const kes = (n: number) => `KES ${n.toLocaleString("en-KE")}`;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function paymentStatusLabel(status: MegaPayPayment["status"]) {
  return {
    initiating: "Starting",
    pending: "Awaiting M-Pesa",
    completed: "Paid",
    failed: "Not completed",
    review: "Needs support",
  }[status];
}

export function AccountDashboard() {
  const { user } = useSession();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<"practice" | "payments">("practice");
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState(false);
  const [amount, setAmount] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingPayment, setCheckingPayment] = useState<string | null>(null);

  const account = useQuery({
    queryKey: ["practice-balance", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_practice_account");
      if (error) throw error;
      return Number(data);
    },
  });
  const history = useQuery({
    queryKey: ["practice-trades", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("practice_trades")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });
  const payments = useQuery({
    queryKey: ["megapay-payments", user?.id],
    enabled: !!user && selected === "payments",
    queryFn: () => listMegaPayPayments(),
  });

  const rows = history.data ?? [];
  const profit = rows.reduce((sum, row) => sum + Number(row.profit), 0);
  const activePayment = payments.data?.find((payment) =>
    ["initiating", "pending", "review"].includes(payment.status),
  );

  async function reset() {
    setResetting(true);
    try {
      const { data, error } = await supabase.rpc("reset_practice_account");
      if (error) throw error;
      qc.setQueryData(["practice-balance", user?.id], Number(data));
      setConfirmReset(false);
      toast.success("Practice balance reset to 10,000.00 USD");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to reset your balance. Please try again."));
    } finally {
      setResetting(false);
    }
  }

  async function submitPayment(event: React.FormEvent) {
    event.preventDefault();
    const amountKes = Number(amount);
    if (!Number.isSafeInteger(amountKes) || amountKes < 1) {
      toast.error("Enter a whole KES amount greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      const payment = await startMegaPayPayment({ data: { amountKes, phone } });
      qc.setQueryData<MegaPayPayment[]>(["megapay-payments", user?.id], (previous) => [
        payment,
        ...(previous ?? []).filter((row) => row.id !== payment.id),
      ]);
      setPaymentDialog(false);
      setAmount("");
      setPhone("");
      toast.success(
        payment.status === "pending"
          ? "M-Pesa prompt sent. Approve it on your phone, then check the status here."
          : "An existing payment request is still open. Check its status before starting another.",
      );
    } catch (error) {
      void qc.invalidateQueries({ queryKey: ["megapay-payments", user?.id] });
      toast.error(errorMessage(error, "Could not start the MegaPay request."));
    } finally {
      setSubmitting(false);
    }
  }

  async function checkPayment(paymentId: string) {
    setCheckingPayment(paymentId);
    try {
      const updated = await checkMegaPayPayment({ data: { paymentId } });
      qc.setQueryData<MegaPayPayment[]>(["megapay-payments", user?.id], (previous) =>
        previous?.map((payment) => (payment.id === updated.id ? updated : payment)),
      );
      if (updated.status === "completed")
        toast.success("MegaPay confirms this payment is complete.");
      else if (updated.status === "review")
        toast.error("The payment needs support review. It has not been credited to trading.");
      else if (updated.status === "failed")
        toast.error("MegaPay reports that this payment did not complete.");
      else toast.info("Payment is still awaiting M-Pesa confirmation.");
    } catch (error) {
      toast.error(errorMessage(error, "Could not check the payment status."));
    } finally {
      setCheckingPayment(null);
    }
  }

  return (
    <main className="account-page container-wide">
      <div className="account-heading">
        <div>
          <p className="section-kicker">PRACTICE & MERCHANT PAYMENTS</p>
          <h1>Account dashboard</h1>
        </div>
        <span className="account-currency">
          Practice in <strong>USD</strong> · Payments in <strong>KES</strong>
        </span>
      </div>
      <div className="account-switch" role="tablist" aria-label="Account options">
        <Button
          variant="ghost"
          role="tab"
          aria-selected={selected === "practice"}
          aria-controls="account-panel"
          id="practice-tab"
          className={selected === "practice" ? "selected" : ""}
          onClick={() => {
            setSelected("practice");
            setConfirmReset(false);
          }}
        >
          <FlaskConical /> Practice trading <span className="account-tag">Virtual</span>
        </Button>
        <Button
          variant="ghost"
          role="tab"
          aria-selected={selected === "payments"}
          aria-controls="account-panel"
          id="payments-tab"
          className={selected === "payments" ? "selected" : ""}
          onClick={() => {
            setSelected("payments");
            setConfirmReset(false);
          }}
        >
          <CircleDollarSign /> M-Pesa payments <span className="account-tag">KES</span>
        </Button>
      </div>

      <section
        id="account-panel"
        role="tabpanel"
        aria-labelledby={selected === "practice" ? "practice-tab" : "payments-tab"}
      >
        {selected === "practice" ? (
          <>
            <div className="account-balance-band">
              <div>
                <div className="account-balance-label">
                  <Wallet size={18} /> Available practice balance
                </div>
                <div className="account-balance-number">
                  {account.isError
                    ? "Unavailable"
                    : account.data != null
                      ? money(account.data)
                      : "…"}{" "}
                  <span>USD</span>
                </div>
                <p>Virtual funds only · No live broker or real-money trading is connected</p>
              </div>
              <div className="account-balance-actions">
                <Button asChild size="lg">
                  <Link to="/trade">
                    Practice trade <ArrowUpRight />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmReset(true)}
                  disabled={account.isPending || account.isError || resetting}
                >
                  <RotateCcw /> Reset balance
                </Button>
              </div>
            </div>
            {account.isError && (
              <div className="account-notice" role="alert">
                Your practice balance could not be loaded.
                <Button variant="outline" onClick={() => void account.refetch()}>
                  Try again
                </Button>
              </div>
            )}
            {confirmReset && (
              <div className="account-notice">
                <div>
                  <strong>Reset practice funds?</strong>
                  <p>Your balance will return to 10,000.00 USD. Trade history is kept.</p>
                </div>
                <div className="account-inline-actions">
                  <Button
                    variant="outline"
                    onClick={() => setConfirmReset(false)}
                    disabled={resetting}
                  >
                    Cancel
                  </Button>
                  <Button onClick={reset} disabled={resetting}>
                    {resetting ? "Resetting…" : "Confirm reset"}
                  </Button>
                </div>
              </div>
            )}
            <div className="account-stats">
              <div>
                <span>Recent profit / loss</span>
                <strong className={profit >= 0 ? "up" : "down"}>
                  {history.isError || history.isPending
                    ? "—"
                    : `${profit >= 0 ? "+" : ""}${money(profit)}`}{" "}
                  <small>USD</small>
                </strong>
              </div>
              <div>
                <span>Trades in view</span>
                <strong>{history.isError || history.isPending ? "—" : rows.length}</strong>
              </div>
              <div>
                <span>Win rate</span>
                <strong>
                  {history.isError || history.isPending || !rows.length
                    ? "—"
                    : `${Math.round((rows.filter((row) => row.won).length / rows.length) * 100)}%`}
                </strong>
              </div>
            </div>
            <section className="account-activity">
              <div className="account-section-heading">
                <h2>Recent activity</h2>
                <span>Latest 20 practice trades</span>
              </div>
              {history.isError ? (
                <div className="account-notice" role="alert">
                  Activity could not be loaded.
                  <Button variant="outline" onClick={() => void history.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : history.isPending ? (
                <p className="account-empty">Loading activity…</p>
              ) : rows.length ? (
                <div className="account-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Contract</th>
                        <th>Market</th>
                        <th>Date</th>
                        <th>Stake</th>
                        <th>Profit / loss</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.id}>
                          <td>
                            {row.contract_type}
                            {row.barrier != null ? ` ${row.barrier}` : ""}
                          </td>
                          <td>Volatility {row.market.replace("R_", "")}</td>
                          <td>
                            {new Date(row.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td>{money(Number(row.stake))}</td>
                          <td className={row.won ? "up" : "down"}>
                            {Number(row.profit) >= 0 ? "+" : ""}
                            {money(Number(row.profit))} USD
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="account-empty">
                  <Wallet size={28} />
                  <h3>No trades yet</h3>
                  <p>Your practice trading activity will appear here.</p>
                </div>
              )}
            </section>
            <p className="account-footnote">
              Practice funds have no cash value and cannot be withdrawn.
            </p>
          </>
        ) : (
          <>
            <div className="account-balance-band">
              <div>
                <div className="account-balance-label">
                  <CircleDollarSign size={18} /> Merchant payments
                </div>
                <div className="account-balance-number">
                  M-Pesa <span>KES</span>
                </div>
                <p>
                  Payments are collected by the merchant through MegaPay, not deposited to a trading
                  balance.
                </p>
              </div>
              <div className="account-balance-actions">
                <Button size="lg" onClick={() => setPaymentDialog(true)} disabled={!!activePayment}>
                  <CircleDollarSign /> {activePayment ? "Existing payment open" : "Pay with M-Pesa"}
                </Button>
              </div>
            </div>
            {activePayment?.status === "review" && (
              <div className="account-notice" role="alert">
                This payment needs support review. It has not been credited to trading. Share
                reference {activePayment.reference} with support.
              </div>
            )}
            {activePayment?.status === "initiating" && (
              <div className="account-notice" role="status">
                A payment request is still being confirmed. Do not retry; refresh payment history
                shortly.
              </div>
            )}
            <div className="account-notice">
              Trading on this site remains practice-only. A MegaPay payment does not fund trading,
              create a brokerage balance, or enable live orders.
            </div>
            <section className="account-activity">
              <div className="account-section-heading">
                <h2>Payment history</h2>
                <span>M-Pesa payments via MegaPay</span>
              </div>
              {payments.isError ? (
                <div className="account-notice" role="alert">
                  Payment history could not be loaded. Check that the payment database migration has
                  been applied.
                  <Button variant="outline" onClick={() => void payments.refetch()}>
                    Try again
                  </Button>
                </div>
              ) : payments.isPending ? (
                <p className="account-empty">Loading payment history…</p>
              ) : payments.data?.length ? (
                <div className="account-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Reference</th>
                        <th>Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                        <th>Receipt</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {payments.data.map((payment) => (
                        <tr key={payment.id}>
                          <td>{payment.reference}</td>
                          <td>
                            {new Date(payment.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td>{kes(payment.amount_kes)}</td>
                          <td>{paymentStatusLabel(payment.status)}</td>
                          <td>{payment.receipt ?? "—"}</td>
                          <td>
                            {payment.status === "pending" && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void checkPayment(payment.id)}
                                disabled={checkingPayment === payment.id}
                              >
                                <RefreshCw
                                  className={checkingPayment === payment.id ? "animate-spin" : ""}
                                />
                                Check
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="account-empty">
                  <Wallet size={28} />
                  <h3>No payments yet</h3>
                  <p>Your MegaPay payment history will appear here.</p>
                </div>
              )}
            </section>
          </>
        )}
      </section>

      <Dialog
        open={paymentDialog}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentDialog(false);
            setAmount("");
            setPhone("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pay with M-Pesa</DialogTitle>
            <DialogDescription>
              MegaPay will send an STK Push to your Kenyan phone. Approve the request in M-Pesa to
              complete payment. Payment is made to the merchant and will not fund practice trading.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submitPayment} className="grid gap-3">
            <Input
              aria-label="Amount in Kenyan shillings"
              type="number"
              min="1"
              step="1"
              placeholder="Amount (KES)"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
            <Input
              aria-label="Kenyan M-Pesa phone number"
              type="tel"
              autoComplete="tel"
              placeholder="M-Pesa phone (e.g. 0712345678)"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
            <Button type="submit" disabled={submitting}>
              {submitting ? "Requesting M-Pesa prompt…" : "Send payment prompt"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </main>
  );
}
