/* useAsync.run is stable */
 /* oxlint-disable react-hooks/exhaustive-deps */
import type { SiteContentType } from "../../lib/types";
import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { ErrorMessage } from "../../components/ui/error-message";
import { RichTextEditor } from "../../components/ui/rich-text-editor";
import { Spinner } from "../../components/ui/spinner";
import { useToast } from "../../context/toast-store";
import { useAsync } from "../../hooks/use-async";
import { api } from "../../lib/api";

const empty: SiteContentType = {
  privacyHtml: "",
  termsHtml: "",
  refundHtml: "",
  socials: { instagram: "", tiktok: "", youtube: "", linkedin: "https://linkedin.com/in/ahmedg3far44" },
};

export default function AdminContentPage() {
  const { notify } = useToast();
  const load = useAsync<SiteContentType>();
  const save = useAsync<SiteContentType>();
  const [form, setForm] = useState<SiteContentType>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    void load.run(api.get<SiteContentType>("/admin/content")).then((data) => {
      setForm({
        privacyHtml: data.privacyHtml ?? "",
        termsHtml: data.termsHtml ?? "",
        refundHtml: data.refundHtml ?? "",
        socials: {
          instagram: data.socials?.instagram ?? "",
          tiktok: data.socials?.tiktok ?? "",
          youtube: data.socials?.youtube ?? "",
          linkedin: data.socials?.linkedin ?? "",
        },
      });
    }).catch(() => undefined);
  }, [load.run]);

  const setHtml = (key: "privacyHtml" | "termsHtml" | "refundHtml", value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const setSocial = (key: keyof SiteContentType["socials"], value: string) =>
    setForm((prev) => ({ ...prev, socials: { ...prev.socials, [key]: value } }));

  const validate = () => {
    const next: Record<string, string> = {};
    const isUrl = (v: string) => {
      if (!v.trim()) return true;
      try {
        const u = new URL(v);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch { return false; }
    };
    if (!isUrl(form.socials.instagram)) next.instagram = "Enter a valid http(s) URL";
    if (!isUrl(form.socials.tiktok)) next.tiktok = "Enter a valid http(s) URL";
    if (!isUrl(form.socials.youtube)) next.youtube = "Enter a valid http(s) URL";
    if (!isUrl(form.socials.linkedin)) next.linkedin = "Enter a valid http(s) URL";
    if (form.privacyHtml.length > 50000) next.privacyHtml = "Too long (max 50k)";
    if (form.termsHtml.length > 50000) next.termsHtml = "Too long (max 50k)";
    if (form.refundHtml.length > 50000) next.refundHtml = "Too long (max 50k)";
    return next;
  };

  const onSave = async () => {
    const v = validate();
    setErrors(v);
    if (Object.keys(v).length) return;
    try {
      const data = await save.run(api.put<SiteContentType>("/admin/content", {
        privacyHtml: form.privacyHtml,
        termsHtml: form.termsHtml,
        refundHtml: form.refundHtml,
        socials: form.socials,
      }));
      setForm({
        privacyHtml: data.privacyHtml ?? "",
        termsHtml: data.termsHtml ?? "",
        refundHtml: data.refundHtml ?? "",
        socials: data.socials ?? empty.socials,
      });
      notify("Content updated", "success");
    } catch {
      // error handled via save.error
    }
  };

  if (load.isLoading && !load.data) {
    return <main className="admin-page"><div className="page-loader"><Spinner size="md" /></div></main>;
  }

  return (
    <main className="admin-page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">Site content</span>
          <h1>Privacy, terms & social links</h1>
          <p>Update the legal pages and footer social URLs. Uses the same rich-text editor as theme setup/deployment instructions.</p>
        </div>
        <button type="button" className="primary-button" onClick={() => void onSave()} disabled={save.isLoading}>
          {save.isLoading ? <Spinner size="sm" /> : <Save size={16} />} Save changes
        </button>
      </div>

      {(load.error || save.error) && <ErrorMessage message={(load.error || save.error)!} onDismiss={() => { load.clearError(); save.clearError(); }} />}

      <div className="theme-editor" style={{ gridTemplateColumns: "1fr" }}>
        <section className="editor-main" style={{ gap: 16 }}>
          <div className="editor-section">
            <h2>Legal pages</h2>
            <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: ".78rem" }}>
              Each field is HTML from the rich-text editor. Leave empty to show the default hard-coded copy.
            </p>
            <div className="form-stack">
              <RichTextEditor id="privacyHtml" label="Privacy Policy" value={form.privacyHtml} onChange={(v) => setHtml("privacyHtml", v)} error={errors.privacyHtml} disabled={save.isLoading} />
              <RichTextEditor id="termsHtml" label="Terms & Conditions" value={form.termsHtml} onChange={(v) => setHtml("termsHtml", v)} error={errors.termsHtml} disabled={save.isLoading} />
              <RichTextEditor id="refundHtml" label="Refund Policy" value={form.refundHtml} onChange={(v) => setHtml("refundHtml", v)} error={errors.refundHtml} disabled={save.isLoading} />
            </div>
          </div>

          <div className="editor-section">
            <h2>Social links</h2>
            <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: ".78rem" }}>Used in the footer. Leave blank to hide the icon. Must be a valid http(s) URL.</p>
            <div className="form-grid">
              <label>
                Instagram <small>e.g. https://instagram.com/yourbrand</small>
                <input value={form.socials.instagram} onChange={(e) => setSocial("instagram", e.target.value)} placeholder="https://instagram.com/..." aria-invalid={Boolean(errors.instagram)} />
                {errors.instagram && <small className="field-error">{errors.instagram}</small>}
              </label>
              <label>
                TikTok <small>e.g. https://tiktok.com/@yourbrand</small>
                <input value={form.socials.tiktok} onChange={(e) => setSocial("tiktok", e.target.value)} placeholder="https://tiktok.com/@..." aria-invalid={Boolean(errors.tiktok)} />
                {errors.tiktok && <small className="field-error">{errors.tiktok}</small>}
              </label>
              <label>
                YouTube / Shorts <small>e.g. https://youtube.com/@yourbrand</small>
                <input value={form.socials.youtube} onChange={(e) => setSocial("youtube", e.target.value)} placeholder="https://youtube.com/..." aria-invalid={Boolean(errors.youtube)} />
                {errors.youtube && <small className="field-error">{errors.youtube}</small>}
              </label>
              <label>
                LinkedIn <small>e.g. https://linkedin.com/in/ahmedg3far44</small>
                <input value={form.socials.linkedin} onChange={(e) => setSocial("linkedin", e.target.value)} placeholder="https://linkedin.com/in/..." aria-invalid={Boolean(errors.linkedin)} />
                {errors.linkedin && <small className="field-error">{errors.linkedin}</small>}
              </label>
            </div>
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button type="button" className="primary-button" onClick={() => void onSave()} disabled={save.isLoading}>
              {save.isLoading ? <Spinner size="sm" /> : <Save size={16} />} Save changes
            </button>
          </div>

          {load.data?.updatedAt && <small style={{ color: "var(--muted)" }}>Last updated: {new Date(load.data.updatedAt).toLocaleString()}</small>}
          {save.isLoading && <div className="skeleton" style={{ height: 18, width: 120 }} aria-hidden="true" />}
        </section>
      </div>
    </main>
  );
}
