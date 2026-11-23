import { createFileRoute } from "@tanstack/react-router";
import { AccountDashboard } from "@/components/account-dashboard";
import { SiteHeader } from "@/components/site-header";
import { pageHead } from "@/lib/page-head";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () =>
    pageHead(
      "Account Dashboard | Option Market Traders",
      "Manage your practice trading balance and view MegaPay M-Pesa merchant payment history.",
    ),
  component: () => (
    <>
      <SiteHeader />
      <AccountDashboard />
    </>
  ),
});
