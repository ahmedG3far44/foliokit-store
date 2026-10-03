import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { IUser, PaginatedResponse } from "../../lib/types";
import { Check, Mail, Search, Send, TestTube2, Users, X } from "lucide-react";
import { PageHeader } from "../../components/admin/page-header";
import { ErrorMessage } from "../../components/ui/error-message";
import { Spinner } from "../../components/ui/spinner";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";
import { useAppAuth } from "../../context/auth-store";

type CustomerPage = PaginatedResponse<IUser>;
type EmailType = "welcome" | "invoice" | "refund" | "promotion";

const initialCampaign = {
  offerTitle: "",
  offerDescription: "",
  discountDetails: "",
  actionUrl: `${window.location.origin}/themes`,
  ctaLabel: "View the offer",
  expiresAt: "",
};

export default function PromotionsPage() {
  const { user } = useAppAuth();
  const { data: customerData, error: customerError, isLoading: customersLoading, run: runCustomers, clearError: clearCustomerError } = useAsync<CustomerPage>();
  const campaignAction = useAsync<{ campaignId: string; sent: number; failed: number }>();
  const testAction = useAsync<{ id: string; type: EmailType }>();
  const [search, setSearch] = useState("");
  const [searchDraft, setSearchDraft] = useState("");
  const [selected, setSelected] = useState<Record<string, IUser>>({});
  const [campaign, setCampaign] = useState(initialCampaign);
  const [notice, setNotice] = useState("");
  const [test, setTest] = useState<{ type: EmailType; email: string }>({ type: "welcome", email: user?.email ?? "" });

  const loadCustomers = useCallback(() => {
    const query = new URLSearchParams({ page: "1", pageSize: "100", role: "customer", status: "active", marketingEligible: "true" });
    if (search) query.set("search", search);
    return runCustomers(api.get<CustomerPage>(`/admin/users?${query}`)).catch(() => undefined);
  }, [runCustomers, search]);

  useEffect(() => { void loadCustomers(); }, [loadCustomers]);

  const selectedCustomers = useMemo(() => Object.values(selected), [selected]);
  const visibleIds = customerData?.items.map((customer) => customer.id) ?? [];
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected[id]);

  const toggleCustomer = (customer: IUser) => {
    if (!selected[customer.id] && selectedCustomers.length >= 100) {
      setNotice("A promotion can be sent to at most 100 customers at a time.");
      return;
    }
    setSelected((current) => {
      const next = { ...current };
      if (next[customer.id]) delete next[customer.id];
      else next[customer.id] = customer;
      return next;
    });
  };

  const toggleVisible = () => {
    setSelected((current) => {
      const next = { ...current };
      if (allVisibleSelected) visibleIds.forEach((id) => delete next[id]);
      else customerData?.items.forEach((customer) => { if (Object.keys(next).length < 100) next[customer.id] = customer; });
      return next;
    });
  };

  const submitCampaign = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedCustomers.length) return;
    try {
      const result = await campaignAction.run(api.post("/admin/emails/promotions", {
        userIds: selectedCustomers.map((customer) => customer.id),
        ...campaign,
        expiresAt: campaign.expiresAt || undefined,
      }));
      setNotice(result.failed ? `Sent to ${result.sent} customers; ${result.failed} deliveries failed.` : `Promotion sent to ${result.sent} customers.`);
      setSelected({});
    } catch { return; }
  };

  const sendTest = async (event: FormEvent) => {
    event.preventDefault();
    try {
      await testAction.run(api.post("/admin/emails/test", test));
      setNotice(`${test.type[0]?.toUpperCase()}${test.type.slice(1)} test email sent to ${test.email}.`);
    } catch { return; }
  };

  return <main className="admin-page">
    <PageHeader eyebrow="Customer communication" title="Email promotions" description="Choose active customers, write the offer, and send a branded campaign. Create redeemable codes in Payments & discounts before announcing them." />
    {(customerError || campaignAction.error || testAction.error) && <ErrorMessage message={(customerError || campaignAction.error || testAction.error)!} onDismiss={() => { clearCustomerError(); campaignAction.clearError(); testAction.clearError(); }} />}
    {notice && <div className="success-message" role="status"><Check size={17} /><span>{notice}</span><button onClick={() => setNotice("")} aria-label="Dismiss"><X size={15} /></button></div>}

    <div className="promotion-layout">
      <form className="panel promotion-composer" onSubmit={submitCampaign}>
        <div className="panel-heading"><div><h2>Compose campaign</h2><p>The details below appear exactly as marketing copy; they do not create or change a Stripe promotion.</p></div><Mail size={20} aria-hidden="true" /></div>
        <div className="form-stack">
          <label>Offer title<input required maxLength={100} value={campaign.offerTitle} onChange={(event) => setCampaign((current) => ({ ...current, offerTitle: event.target.value }))} placeholder="Save on your next portfolio launch" /></label>
          <label>Offer description<textarea required rows={5} maxLength={1200} value={campaign.offerDescription} onChange={(event) => setCampaign((current) => ({ ...current, offerDescription: event.target.value }))} placeholder="Tell customers why this offer is useful and what is included." /></label>
          <label>Offer or discount details<input required maxLength={300} value={campaign.discountDetails} onChange={(event) => setCampaign((current) => ({ ...current, discountDetails: event.target.value }))} placeholder="Use LAUNCH20 for 20% off before Sunday" /><small>Create and activate the code in Payments & discounts before sending this campaign.</small></label>
          <div className="form-grid">
            <label>Button label<input required maxLength={40} value={campaign.ctaLabel} onChange={(event) => setCampaign((current) => ({ ...current, ctaLabel: event.target.value }))} /></label>
            <label>Expiry text (optional)<input maxLength={80} value={campaign.expiresAt} onChange={(event) => setCampaign((current) => ({ ...current, expiresAt: event.target.value }))} placeholder="Sunday at 11:59 PM" /></label>
          </div>
          <label>Offer link<input required type="url" maxLength={500} value={campaign.actionUrl} onChange={(event) => setCampaign((current) => ({ ...current, actionUrl: event.target.value }))} /></label>
        </div>
        <div className="promotion-submit"><span>{selectedCustomers.length} customer{selectedCustomers.length === 1 ? "" : "s"} selected</span><button className="primary-button" disabled={!selectedCustomers.length || campaignAction.isLoading}>{campaignAction.isLoading ? <Spinner size="sm" /> : <Send size={16} />}Send promotion</button></div>
      </form>

      <section className="panel recipient-picker" aria-labelledby="recipient-heading">
        <div className="panel-heading"><div><h2 id="recipient-heading">Recipients</h2><p>Select up to 100 active customers who have not opted out of marketing.</p></div><Users size={20} aria-hidden="true" /></div>
        <form className="recipient-search" onSubmit={(event) => { event.preventDefault(); setSearch(searchDraft.trim()); }}><Search size={17} /><input value={searchDraft} onChange={(event) => setSearchDraft(event.target.value)} placeholder="Search name or email" aria-label="Search customers" /><button type="submit">Search</button></form>
        <button className="select-visible" type="button" onClick={toggleVisible} disabled={!visibleIds.length}>{allVisibleSelected ? "Clear visible" : "Select visible"}</button>
        <div className="recipient-list">
          {customersLoading && !customerData ? <div className="recipient-loading"><Spinner size="md" /></div> : !customerData?.items.length ? <div className="empty-state">No active customers found.</div> : customerData.items.map((customer) => <label className={`recipient-row ${selected[customer.id] ? "selected" : ""}`} key={customer.id}>
            <input type="checkbox" checked={Boolean(selected[customer.id])} onChange={() => toggleCustomer(customer)} />
            <span className="avatar-fallback">{customer.name.slice(0, 1)}</span>
            <span><strong>{customer.name}</strong><small>{customer.email}</small></span>
          </label>)}
        </div>
        <div className="recipient-count">{customerData?.total ?? 0} matching active customers</div>
      </section>
    </div>

    <section className="panel email-test-panel">
      <div className="panel-heading"><div><h2>Test an email template</h2><p>Send any event format to one address using safe dummy data. Invoice tests include a demo PDF.</p></div><TestTube2 size={20} aria-hidden="true" /></div>
      <form onSubmit={sendTest}>
        <label>Template<select value={test.type} onChange={(event) => setTest((current) => ({ ...current, type: event.target.value as EmailType }))}><option value="welcome">Welcome</option><option value="invoice">Invoice</option><option value="refund">Refund</option><option value="promotion">Promotion</option></select></label>
        <label>Send to<input required type="email" value={test.email} onChange={(event) => setTest((current) => ({ ...current, email: event.target.value }))} placeholder="you@example.com" /></label>
        <button className="secondary-button" disabled={testAction.isLoading}>{testAction.isLoading ? <Spinner size="sm" /> : <TestTube2 size={16} />}Send test</button>
      </form>
    </section>
  </main>;
}
