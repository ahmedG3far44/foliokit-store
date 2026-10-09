import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, ImagePlus, Save, UploadCloud, X } from "lucide-react";
import type { CategoryType, PublicAsset } from "../../lib/types";
import { api, ApiError } from "../../lib/api";
import { uploadAsset } from "../../lib/upload-asset";
import { useAsync } from "../../hooks/use-async";
import { PageHeader } from "../../components/admin/page-header";
import { ErrorMessage } from "../../components/ui/error-message";
import { FallbackImage } from "../../components/fallback-image";
import { Skeleton } from "../../components/ui/skeleton";
import { Spinner } from "../../components/ui/spinner";
import { useToast } from "../../context/toast-store";

const blank = { name: "", slug: "", description: "", imageUrl: "", sortOrder: 0 };
type Field = keyof typeof blank | "image";
type FieldErrors = Partial<Record<Field, string>>;
const slugFromName = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function validate(fields: typeof blank, image?: PublicAsset): FieldErrors {
  const errors: FieldErrors = {};
  if (fields.name.trim().length < 2) errors.name = "Enter a category name with at least 2 characters.";
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.slug.trim()) || fields.slug.trim().length < 2) errors.slug = "Use at least 2 lowercase letters or numbers, separated by hyphens.";
  if (fields.description.trim().length < 10) errors.description = "Describe this category in at least 10 characters.";
  if (!Number.isInteger(fields.sortOrder) || fields.sortOrder < 0 || fields.sortOrder > 10000) errors.sortOrder = "Enter a whole number between 0 and 10,000.";
  if (!image && !fields.imageUrl.trim()) errors.image = "Upload a category image or enter an image URL.";
  if (fields.imageUrl.trim()) {
    try {
      const url = new URL(fields.imageUrl.trim());
      const host = url.hostname.toLowerCase();
      if (url.protocol !== "https:" || host === "localhost" || host.startsWith("127.") || host === "0.0.0.0" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host)) errors.imageUrl = "Enter a public HTTPS image URL.";
    } catch { errors.imageUrl = "Enter a valid image URL, such as https://example.com/category.jpg."; }
  }
  return errors;
}

function serverFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ApiError)) return {};
  const errors: FieldErrors = {};
  for (const issue of error.validationErrors ?? []) {
    if (!issue || typeof issue !== "object") continue;
    const { path, message } = issue as { path?: unknown[]; message?: unknown };
    const key = Array.isArray(path) ? path[0] : undefined;
    const field = key === "imageAssetId" || !key ? "image" : key;
    if (typeof field === "string" && (field in blank || field === "image") && typeof message === "string") errors[field as Field] = message;
  }
  if (error.code === "SLUG_IN_USE") errors.slug = error.message;
  if (error.code === "INVALID_CATEGORY_IMAGE") errors.image = error.message;
  if (error.code === "DUPLICATE_RESOURCE") errors[error.message.includes("name") ? "name" : "slug"] = error.message;
  return errors;
}

function FieldError({ field, errors }: { field: Field; errors: FieldErrors }) {
  return errors[field] ? <span id={`category-${field}-error`} className="field-error" aria-live="polite">{errors[field]}</span> : null;
}

export default function AdminCategoriesPage() {
  const list = useAsync<CategoryType[]>();
  const { run: runList } = list;
  const mutation = useAsync<unknown>();
  const { notify } = useToast();
  const [id, setId] = useState<string>();
  const [fields, setFields] = useState(blank);
  const [image, setImage] = useState<PublicAsset>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState(0);
  const [phase, setPhase] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const operationLock = useRef(false);
  const load = () => runList(api.get<CategoryType[]>("/admin/categories", { signal: AbortSignal.timeout(15_000) })).catch(() => undefined);
  useEffect(() => { void runList(api.get<CategoryType[]>("/admin/categories", { signal: AbortSignal.timeout(15_000) })).catch(() => undefined); }, [runList]);
  const busy = uploading || mutation.isLoading || list.isLoading;
  const propsFor = (field: Field) => ({ id: `category-${field}`, "aria-invalid": Boolean(errors[field]), "aria-describedby": errors[field] ? `category-${field}-error` : `category-${field}-hint` });
  const clearFieldErrors = (...keys: Field[]) => {
    setErrors((current) => { const next = { ...current }; keys.forEach((key) => delete next[key]); return next; });
    mutation.clearError();
  };
  const reset = () => { setId(undefined); setFields(blank); setImage(undefined); setErrors({}); setProgress(0); setPhase(""); mutation.clearError(); };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || operationLock.current) return;
    const validation = validate(fields, image);
    setErrors(validation);
    const firstError = Object.keys(validation)[0];
    if (firstError) { document.getElementById(`category-${firstError}`)?.focus(); return; }
    const body = { ...fields, name: fields.name.trim(), slug: fields.slug.trim(), description: fields.description.trim(), imageUrl: !image && fields.imageUrl.trim() ? fields.imageUrl.trim() : undefined, imageAssetId: image?.id };
    operationLock.current = true;
    try {
      await mutation.run(id ? api.put(`/admin/categories/${id}`, body) : api.post("/admin/categories", body));
      notify(id ? "Category updated" : "Category created"); reset(); await load();
    } catch (error) {
      const validation = serverFieldErrors(error); setErrors(validation);
      const firstError = Object.keys(validation)[0];
      if (firstError) requestAnimationFrame(() => document.getElementById(`category-${firstError}`)?.focus());
    } finally { operationLock.current = false; }
  };
  const upload = async (file?: File) => {
    if (!file || busy || operationLock.current) return;
    clearFieldErrors("image", "imageUrl");
    if (!["image/jpeg", "image/png", "image/webp", "image/avif"].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024) { setErrors((current) => ({ ...current, image: "Choose a JPG, PNG, WebP, or AVIF image up to 10 MB." })); return; }
    operationLock.current = true; setUploading(true); setProgress(0); setPhase("Preparing image");
    try {
      const asset = await uploadAsset(file, "image", (value, label) => { setProgress(value); setPhase(label); });
      if (asset.status !== "ready") throw new Error("The image is not ready. Please retry the upload.");
      setImage(asset); setFields((current) => ({ ...current, imageUrl: "" }));
    } catch (error) { setErrors((current) => ({ ...current, image: error instanceof Error ? error.message : "Image upload failed. Please try again." })); }
    finally { setUploading(false); operationLock.current = false; }
  };
  const remove = async (category: CategoryType) => {
    if (busy || operationLock.current || !window.confirm(`Delete ${category.name}? Categories with themes must be reassigned first.`)) return;
    operationLock.current = true;
    try { await mutation.run(api.delete(`/admin/categories/${category.id}`)); if (id === category.id) reset(); notify("Category deleted"); await load(); } catch { /* useAsync displays the error */ }
    finally { operationLock.current = false; }
  };
  const imageUrl = image?.url ?? fields.imageUrl;
  return <main className="admin-page">
    <PageHeader eyebrow="Catalog" title="Categories" description="Organize themes and choose how categories appear on the homepage." />
    {list.error && <div className="category-load-error"><ErrorMessage message={list.error} /><button className="secondary-button" disabled={busy} onClick={() => void load()}>Retry loading categories</button></div>}
    <form className="editor-section category-editor" onSubmit={submit} noValidate aria-busy={busy}>
      <div className="category-editor-heading"><div><h2>{id ? "Edit category" : "Add a category"}</h2><p>Give your category a clear name, a short introduction, and a cover image.</p></div><span className="category-editor-tag">{id ? "Editing" : "New category"}</span></div>
      {mutation.error && <ErrorMessage message={mutation.error} onDismiss={mutation.clearError} />}
      <div className="category-form-layout">
        <div className="category-details-grid">
          <div className="category-form-field"><label htmlFor="category-name">Category name <span>Required</span></label><input {...propsFor("name")} readOnly={busy} required minLength={2} maxLength={100} placeholder="e.g. Creatives" value={fields.name} onChange={(event) => { setFields({ ...fields, name: event.target.value, slug: id ? fields.slug : slugFromName(event.target.value) }); clearFieldErrors("name", ...(!id ? ["slug" as const] : [])); }} /><small id="category-name-hint">The name visitors will see on the category card.</small><FieldError field="name" errors={errors} /></div>
          <div className="category-form-field"><label htmlFor="category-slug">URL slug <span>Required</span></label><input {...propsFor("slug")} readOnly={busy} required minLength={2} maxLength={100} placeholder="e.g. creatives" value={fields.slug} onChange={(event) => { setFields({ ...fields, slug: event.target.value }); clearFieldErrors("slug"); }} /><small id="category-slug-hint">/themes/{fields.slug || "category-name"}</small><FieldError field="slug" errors={errors} /></div>
          <div className="category-form-field category-field-full"><label htmlFor="category-description">Description <span>Required</span></label><textarea {...propsFor("description")} readOnly={busy} required minLength={10} maxLength={2000} rows={5} placeholder="Describe who these themes are for and what makes them a good fit…" value={fields.description} onChange={(event) => { setFields({ ...fields, description: event.target.value }); clearFieldErrors("description"); }} /><div className="category-field-meta"><small id="category-description-hint">A short introduction shown on the card and category page.</small><small>{fields.description.length}/2,000</small></div><FieldError field="description" errors={errors} /></div>
          <div className="category-form-field"><label htmlFor="category-sortOrder">Display order</label><input {...propsFor("sortOrder")} readOnly={busy} type="number" required min={0} max={10000} step={1} placeholder="e.g. 0" value={fields.sortOrder} onChange={(event) => { setFields({ ...fields, sortOrder: Number(event.target.value) }); clearFieldErrors("sortOrder"); }} /><small id="category-sortOrder-hint">Lower numbers appear first on the homepage.</small><FieldError field="sortOrder" errors={errors} /></div>
        </div>
        <div className="category-media-panel">
          <div className="category-media-heading"><h3>Cover image</h3><span>Required</span></div>
          <button {...propsFor("image")} type="button" disabled={busy} className={`category-upload ${dragging ? "is-dragging" : ""} ${errors.image ? "is-invalid" : ""}`} onClick={() => fileInput.current?.click()} onDragOver={(event) => { event.preventDefault(); if (!busy) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); if (busy) return; if (event.dataTransfer.files.length > 1) { setErrors((current) => ({ ...current, image: "Choose one cover image at a time." })); return; } void upload(event.dataTransfer.files[0]); }}>
            {imageUrl ? <FallbackImage className="category-upload-preview" src={imageUrl} alt="Category cover preview" loadTimeoutMs={12_000} /> : <span className="category-upload-icon"><ImagePlus size={30} aria-hidden="true" /></span>}
            <span className="category-upload-copy"><strong>{uploading ? "Uploading your image…" : imageUrl ? "Replace cover image" : "Click to upload or drag an image"}</strong><span>{uploading ? phase : "JPG, PNG, WebP, or AVIF · up to 10 MB"}</span></span>
          </button>
          <input ref={fileInput} className="asset-file-input" type="file" disabled={busy} accept="image/jpeg,image/png,image/webp,image/avif" aria-label="Choose category cover image" onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = ""; }} />
          <small id="category-image-hint" className="category-image-hint">Landscape images work best. Your image fills the category card.</small>
          <FieldError field="image" errors={errors} />
          {uploading && <div className="category-upload-progress" role="status"><div><UploadCloud size={16} aria-hidden="true" /><span>{phase}</span><strong>{progress}%</strong></div><progress value={progress} max={100} aria-label="Category image upload progress" /></div>}
          {image && !uploading && <div className="category-image-ready"><CheckCircle2 size={16} aria-hidden="true" /><span>{image.originalName}</span><button type="button" disabled={busy} aria-label="Remove cover image" onClick={() => { setImage(undefined); clearFieldErrors("image"); }}><X size={16} /></button></div>}
          <div className="category-image-divider"><span>or use a link</span></div>
          <div className="category-form-field"><label htmlFor="category-imageUrl">Image URL</label><input {...propsFor("imageUrl")} readOnly={busy} type="url" placeholder="https://example.com/category.jpg" value={fields.imageUrl} onChange={(event) => { setImage(undefined); setFields({ ...fields, imageUrl: event.target.value }); clearFieldErrors("imageUrl", "image"); }} /><small id="category-imageUrl-hint">Paste a direct link to a publicly accessible HTTPS image.</small><FieldError field="imageUrl" errors={errors} /></div>
        </div>
      </div>
      <div className="category-form-footer"><p aria-live="polite">{uploading ? "Uploading image. Your fields are read-only until it finishes." : mutation.isLoading ? "Saving changes. Please wait…" : list.isLoading ? "Loading categories. Please wait…" : "Categories appear on the homepage after you save."}</p><div className="category-actions">{id && <button className="secondary-button" type="button" disabled={busy} onClick={reset}>Cancel editing</button>}<button className="primary-button" disabled={busy}>{mutation.isLoading ? <Spinner size="sm" /> : <Save size={16} aria-hidden="true" />}{mutation.isLoading ? "Saving…" : id ? "Save changes" : "Create category"}</button></div></div>
    </form>
    {list.isLoading && !list.data && <div className="category-grid" aria-label="Loading categories">{[1, 2, 3, 4].map((key) => <Skeleton key={key} className="category-card-skeleton" />)}</div>}
    {!list.isLoading && !list.error && list.data?.length === 0 && <p className="catalog-empty">No categories yet. Add your first category above.</p>}
    <div className="category-grid admin-category-grid">{list.data?.map((category) => <article key={category.id} className="category-card">
      <FallbackImage src={category.image?.url ?? category.imageUrl} alt="" loading="eager" loadTimeoutMs={12_000} />
      <div><h3>{category.name}</h3><p>{category.description}</p><Link to={`/themes/${category.slug}`}>View themes <ArrowUpRight size={14} aria-hidden="true" /></Link><div className="category-actions"><button className="secondary-button" disabled={busy} onClick={() => { setId(category.id); setFields({ name: category.name, slug: category.slug, description: category.description, imageUrl: category.imageUrl ?? "", sortOrder: category.sortOrder }); setImage(category.image); setErrors({}); mutation.clearError(); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button><button className="secondary-button" disabled={busy} onClick={() => void remove(category)}>Delete</button></div></div>
    </article>)}</div>
  </main>;
}
