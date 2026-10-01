/* useAsync.run is stable across renders. */
/* oxlint-disable react-hooks/exhaustive-deps */
import type { PublicAsset, ThemeType } from "@shared/types";
import { ArrowLeft, CheckCircle2, FileArchive, Film, ImagePlus, Save, UploadCloud } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ErrorMessage } from "../../components/ui/error-message";
import { Spinner } from "../../components/ui/spinner";
import { useToast } from "../../context/toast-store";
import { useAsync } from "../../hooks/use-async";
import { api, ApiError } from "../../lib/api";
import { RichTextEditor } from "../../components/ui/rich-text-editor";
import { ThemeMedia } from "../../components/theme-media";
import { instructionHtml } from "../../lib/instructions";
import { ErrorState } from "../error/error";

const blank = {
  name: "", slug: "", shortDescription: "", description: "", stack: "React, TypeScript",
  features: "Responsive layouts\nAccessible navigation\nSetup documentation", price: "49", currency: "USD",
  version: "1.0.0", previewUrl: "", changelog: "", setupInstructions: "", deployInstructions: "",
  featured: false, seoTitle: "", seoDescription: "",
};

type Fields = typeof blank;
type UploadKind = "image" | "video" | "theme_zip";
type ErrorKey = keyof Fields | "previewAssets" | "galleryAssets" | "tutorialAssets" | "sourceAsset";
type UploadRole = "preview" | "gallery" | "tutorial" | "source";
type FormErrors = Partial<Record<ErrorKey, string>>;
type UploadState = { kind: UploadKind; label: string; progress: number; phase: string };

const uploadRules: Record<UploadKind, { types: string[]; maxBytes: number; description: string }> = {
  image: { types: ["image/jpeg", "image/png", "image/webp", "image/avif"], maxBytes: 10 * 1024 * 1024, description: "JPG, PNG, WebP or AVIF up to 10 MB" },
  video: { types: ["video/mp4", "video/webm"], maxBytes: 250 * 1024 * 1024, description: "MP4 or WebM up to 250 MB" },
  theme_zip: { types: ["application/zip", "application/x-zip", "application/x-zip-compressed", "application/octet-stream"], maxBytes: 100 * 1024 * 1024, description: "ZIP package up to 100 MB" },
};

function fieldErrorProps(name: ErrorKey, errors: FormErrors) {
  return { "aria-invalid": Boolean(errors[name]), "aria-describedby": errors[name] ? `${name}-error` : undefined };
}

function FieldError({ name, errors }: { name: ErrorKey; errors: FormErrors }) {
  return errors[name] ? <small className="field-error" id={`${name}-error`}>{errors[name]}</small> : null;
}

function fileContentType(file: File, kind: UploadKind): string {
  if (file.type) return file.type;
  const extension = file.name.toLowerCase().split(".").pop();
  const byExtension: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif",
    mp4: "video/mp4", webm: "video/webm", zip: "application/zip",
  };
  return extension && byExtension[extension] ? byExtension[extension] : kind === "theme_zip" ? "application/zip" : "application/octet-stream";
}

function validateFile(file: File, kind: UploadKind, role: UploadRole): string | undefined {
  const rule = uploadRules[kind];
  const contentType = fileContentType(file, kind);
  if (role === "preview" && !["video/mp4", "video/webm", "image/gif"].includes(contentType)) return "Choose one MP4, WebM, or GIF preview";
  const isZip = kind === "theme_zip" && file.name.toLowerCase().endsWith(".zip");
  if (!rule.types.includes(contentType) && !(role === "preview" && contentType === "image/gif") && !isZip) return `Choose a supported ${kind === "theme_zip" ? "ZIP" : kind} file`;
  if (file.size <= 0) return "The selected file is empty";
  if (file.size > rule.maxBytes) return `The file exceeds the ${Math.round(rule.maxBytes / 1024 / 1024)} MB limit`;
  return undefined;
}

async function uploadAsset(file: File, kind: UploadKind, update: (progress: number, phase: string) => void): Promise<PublicAsset> {
  let assetId: string | undefined;
  try {
    update(5, "Preparing upload");
    const init = await api.post<{ asset: PublicAsset; uploadId: string; partSizeBytes: number }>("/admin/uploads/initiate", {
      kind, originalName: file.name,
      contentType: fileContentType(file, kind),
      sizeBytes: file.size,
    });
    assetId = init.asset.id;
    const parts: Array<{ ETag: string; PartNumber: number }> = [];
    const count = Math.ceil(file.size / init.partSizeBytes);

    for (let index = 0; index < count; index++) {
      const partNumber = index + 1;
      update(10 + Math.round(index / count * 80), count > 1 ? `Uploading part ${partNumber} of ${count}` : "Uploading to Cloudflare R2");
      const part = file.slice(index * init.partSizeBytes, Math.min(file.size, (index + 1) * init.partSizeBytes));
      const { ETag } = await api.uploadPart(`/admin/uploads/${assetId}/parts/${partNumber}`, part);
      parts.push({ ETag, PartNumber: partNumber });
      update(10 + Math.round(partNumber / count * 80), count > 1 ? `Uploaded part ${partNumber} of ${count}` : "Upload transferred");
    }

    update(95, kind === "image" ? "Optimizing image" : "Verifying upload");
    const asset = await api.post<PublicAsset>(`/admin/uploads/${assetId}/complete`, { parts });
    update(100, "Upload complete");
    return asset;
  } catch (error) {
    if (assetId) await api.delete(`/admin/uploads/${assetId}`).catch(() => undefined);
    if (error instanceof TypeError) throw new Error("The upload service could not be reached. Check your connection and retry");
    throw error;
  }
}

function uniqueValues(value: string, separator: "," | "\n"): string[] {
  const seen = new Set<string>();
  return value.split(separator).map((item) => item.trim()).filter((item) => {
    const key = item.toLocaleLowerCase();
    if (!item || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function validateTheme(fields: Fields, images: PublicAsset[], videos: PublicAsset[], source?: PublicAsset, preview?: PublicAsset): FormErrors {
  const errors: FormErrors = {};
  const name = fields.name.trim();
  const slug = fields.slug.trim();
  const price = Number(fields.price);
  const stack = uniqueValues(fields.stack, ",");
  const features = uniqueValues(fields.features, "\n");

  if (name.length < 2) errors.name = "Enter a name with at least 2 characters";
  else if (name.length > 100) errors.name = "Name cannot exceed 100 characters";
  if (slug.length < 2) errors.slug = "Enter a slug with at least 2 characters";
  else if (slug.length > 100) errors.slug = "Slug cannot exceed 100 characters";
  else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) errors.slug = "Use lowercase letters, numbers, and single hyphens only";
  if (fields.shortDescription.trim().length < 10) errors.shortDescription = "Enter at least 10 characters";
  else if (fields.shortDescription.trim().length > 240) errors.shortDescription = "Short description cannot exceed 240 characters";
  if (fields.description.trim().length < 20) errors.description = "Enter at least 20 characters";
  else if (fields.description.length > 20_000) errors.description = "Description cannot exceed 20,000 characters";
  if (!Number.isFinite(price) || price < 0) errors.price = "Enter a valid price of 0 or more";
  else if (price > 1_000_000) errors.price = "Price cannot exceed 1,000,000";
  if (!/^[A-Z]{3}$/.test(fields.currency.trim())) errors.currency = "Use a 3-letter currency code such as USD";
  if (!fields.version.trim()) errors.version = "Enter the theme version";
  else if (fields.version.trim().length > 30) errors.version = "Version cannot exceed 30 characters";
  if (!stack.length) errors.stack = "Add at least one technology";
  else if (stack.length > 20) errors.stack = "Add no more than 20 technologies";
  else if (stack.some((value) => value.length > 40)) errors.stack = "Each technology must be 40 characters or fewer";
  if (!features.length) errors.features = "Add at least one feature";
  else if (features.length > 30) errors.features = "Add no more than 30 features";
  else if (features.some((value) => value.length > 160)) errors.features = "Each feature must be 160 characters or fewer";

  try {
    const preview = new URL(fields.previewUrl);
    const host = preview.hostname.toLowerCase();
    const privateHost = host === "localhost" || host.startsWith("127.") || host === "0.0.0.0" || host.startsWith("10.") || host.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
    if (preview.protocol !== "https:" || privateHost) errors.previewUrl = "Enter a public HTTPS preview URL";
  } catch {
    errors.previewUrl = "Enter a valid public HTTPS preview URL";
  }

  if (fields.seoTitle.length > 70) errors.seoTitle = "SEO title cannot exceed 70 characters";
  if (fields.seoDescription.length > 170) errors.seoDescription = "SEO description cannot exceed 170 characters";
  if (fields.setupInstructions.length > 20_000) errors.setupInstructions = "Setup instructions cannot exceed 20,000 characters";
  if (fields.deployInstructions.length > 20_000) errors.deployInstructions = "Deployment instructions cannot exceed 20,000 characters";
  if (fields.changelog.length > 20_000) errors.changelog = "Changelog cannot exceed 20,000 characters";
  if (!preview || preview.status !== "ready") errors.previewAssets = "Upload one MP4, WebM, or GIF preview";
  if (images.length < 2 || images.length > 10 || images.some((asset) => asset.status !== "ready")) errors.galleryAssets = "Upload 2–10 theme images";
  if (videos.length < 1 || videos.length > 2 || videos.some((asset) => asset.status !== "ready")) errors.tutorialAssets = "Upload 1–2 tutorial videos";
  if (!source || source.status !== "ready") errors.sourceAsset = "Upload the required source ZIP file";
  return errors;
}

function mapServerErrors(error: unknown): FormErrors {
  const errors: FormErrors = {};
  if (!(error instanceof ApiError)) return errors;
  const fieldMap: Record<string, ErrorKey> = { priceMinor: "price", imageAssetIds: "galleryAssets", videoAssetIds: "tutorialAssets", previewAssetId: "previewAssets", previewAssets: "previewAssets", sourceAssetId: "sourceAsset" };
  for (const issue of error.validationErrors ?? []) {
    if (!issue || typeof issue !== "object") continue;
    const candidate = issue as { path?: unknown[]; message?: string };
    const rawName = String(candidate.path?.[0] ?? "");
    const name = fieldMap[rawName] ?? rawName as ErrorKey;
    if (name in blank || ["previewAssets", "galleryAssets", "tutorialAssets", "sourceAsset"].includes(name)) errors[name] = candidate.message ?? "Check this field";
  }
  if (error.code === "THEME_PREVIEW_REQUIRED") errors.previewAssets = error.message;
  if (error.code === "THEME_SOURCE_REQUIRED") errors.sourceAsset = error.message;
  return errors;
}

function UploadProgress({ upload }: { upload: UploadState }) {
  return <div className="upload-progress" aria-live="polite"><div><UploadCloud size={16} /><span><strong>{upload.label}</strong><small>{upload.phase}</small></span><b>{upload.progress}%</b></div><progress value={upload.progress} max="100" aria-label={`${upload.label} upload progress`} /></div>;
}

export default function AdminThemeEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notify } = useToast();
  const request = useAsync<ThemeType>();
  const save = useAsync<ThemeType>();
  const [fields, setFields] = useState<Fields>(blank);
  const [images, setImages] = useState<PublicAsset[]>([]);
  const [videos, setVideos] = useState<PublicAsset[]>([]);
  const [preview, setPreview] = useState<PublicAsset | undefined>();
  const [source, setSource] = useState<PublicAsset | undefined>();
  const [uploading, setUploading] = useState<UploadState | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const imageInputRef = useRef<HTMLInputElement>(null);
  const previewInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const sourceInputRef = useRef<HTMLInputElement>(null);
  const uploadLock = useRef(false);
  const previewReady = preview?.status === "ready";
  const galleryReady = images.length >= 2 && images.length <= 10 && images.every((asset) => asset.status === "ready");
  const tutorialsReady = videos.length >= 1 && videos.length <= 2 && videos.every((asset) => asset.status === "ready");
  const completedRequirements = Number(previewReady) + Number(galleryReady) + Number(tutorialsReady) + Number(source?.status === "ready");

  useEffect(() => {
    if (!id) return;
    void request.run(api.get<ThemeType>(`/admin/themes/${id}`)).then((theme) => {
      setFields({ name: theme.name, slug: theme.slug, shortDescription: theme.shortDescription, description: theme.description, stack: theme.stack.join(", "), features: theme.features.join("\n"), price: String(theme.priceMinor / 100), currency: theme.currency, version: theme.version, previewUrl: theme.previewUrl, changelog: theme.changelog ?? "", setupInstructions: instructionHtml(theme.setupInstructions ?? "", theme.instructionsFormat), deployInstructions: instructionHtml(theme.deployInstructions ?? "", theme.instructionsFormat), featured: theme.featured, seoTitle: theme.seoTitle ?? "", seoDescription: theme.seoDescription ?? "" });
      setImages(theme.images); setVideos(theme.videos); setSource(theme.sourceAsset); setPreview(theme.previewAsset);
    }).catch(() => undefined);
  }, [id, request.run]);

  const clearError = (name: ErrorKey) => setErrors((current) => { const next = { ...current }; delete next[name]; return next; });
  const field = (name: keyof Fields, value: string | boolean) => { setFields((current) => ({ ...current, [name]: value })); clearError(name); };

  const selectFiles = async (files: File[], role: UploadRole) => {
    if (!files.length || uploadLock.current || save.isLoading) return;
    const errorKey: ErrorKey = role === "source" ? "sourceAsset" : role === "gallery" ? "galleryAssets" : role === "tutorial" ? "tutorialAssets" : "previewAssets";
    const kindFor = (file: File): UploadKind => role === "source" ? "theme_zip" : role === "gallery" || fileContentType(file, "image") === "image/gif" ? "image" : "video";
    const max = role === "gallery" ? 10 - images.length : role === "tutorial" ? 2 - videos.length : 1;
    const fileError = files.length > max ? `Choose no more than ${Math.max(0, max)} additional ${role} file(s)` : files.map((file) => validateFile(file, kindFor(file), role)).find(Boolean);
    if (fileError) { setErrors((current) => ({ ...current, [errorKey]: fileError })); return; }
    clearError(errorKey);
    uploadLock.current = true;
    try {
      for (const file of files) {
        const kind = kindFor(file);
        setUploading({ kind, label: file.name, progress: 0, phase: "Starting" });
        const asset = await uploadAsset(file, kind, (progress, phase) => setUploading({ kind, label: file.name, progress, phase }));
        if (asset.status !== "ready") throw new Error(`${file.name} could not be processed. Please retry`);
        if (role === "preview") setPreview(asset);
        else if (role === "gallery") setImages((items) => [...items, asset]);
        else if (role === "tutorial") setVideos((items) => [...items, asset]);
        else setSource(asset);
        notify(`${file.name} uploaded`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setErrors((current) => ({ ...current, [errorKey]: message }));
      notify(message, "error");
    } finally { uploadLock.current = false; setUploading(null); }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (uploadLock.current || save.isLoading) return;
    const validationErrors = validateTheme(fields, images, videos, source, preview);
    setErrors(validationErrors);
    const firstError = Object.keys(validationErrors)[0] as ErrorKey | undefined;
    if (firstError) { requestAnimationFrame(() => document.querySelector<HTMLElement>(`[aria-describedby~="${firstError}-error"]`)?.focus()); return; }

    const body = {
      name: fields.name.trim(), slug: fields.slug.trim(), shortDescription: fields.shortDescription.trim(), description: fields.description.trim(),
      stack: uniqueValues(fields.stack, ","), features: uniqueValues(fields.features, "\n"),
      priceMinor: Math.round(Number(fields.price) * 100), currency: fields.currency.trim().toUpperCase(), version: fields.version.trim(),
      previewUrl: fields.previewUrl.trim(), previewAssetId: preview!.id, imageAssetIds: images.map((asset) => asset.id),
      videoAssetIds: videos.map((asset) => asset.id), sourceAssetId: source!.id, featured: fields.featured,
      instructionsFormat: "html", changelog: fields.changelog, setupInstructions: fields.setupInstructions, deployInstructions: fields.deployInstructions,
      seoTitle: fields.seoTitle.trim(), seoDescription: fields.seoDescription.trim(),
    };
    try {
      const theme = await save.run(id ? api.put<ThemeType>(`/admin/themes/${id}`, body) : api.post<ThemeType>("/admin/themes", body));
      notify(id ? "Theme updated" : "Draft theme created");
      navigate(`/dashboard/themes/${theme.id}/edit`, { replace: true });
    } catch (error) {
      const serverErrors = mapServerErrors(error);
      if (Object.keys(serverErrors).length) setErrors((current) => ({ ...current, ...serverErrors }));
    }
  };

  if (request.isLoading && id) return <main className="admin-page"><div className="page-loader"><Spinner size="md" /></div></main>;
  if (request.error) return <ErrorState
    title="We couldn’t load this theme"
    message={request.error}
    onRetry={id ? () => window.location.reload() : undefined}
    retryLabel="Reload theme"
    backTo="/dashboard/themes"
    backLabel="Back to theme library"
  />;
  const busy = save.isLoading || Boolean(uploading);

  return <main className="admin-page">
    <Link className="back-link" to="/dashboard/themes"><ArrowLeft size={16} />Theme library</Link>
    <div className="editor-heading"><div><span className="eyebrow">Catalog editor</span><h1>{id ? "Edit theme" : "Create a theme"}</h1><p>Add one animated preview, 2–10 theme images, 1–2 tutorial videos, and the private source ZIP.</p></div></div>
    {save.error && <ErrorMessage message={save.error} onDismiss={save.clearError} />}
    <form className="theme-editor" onSubmit={submit} noValidate>
      <section className="editor-main">
        <div className="editor-section"><h2>Identity and story</h2><div className="form-grid">
          <label>Name <span className="field-required">Required</span><input {...fieldErrorProps("name", errors)} value={fields.name} onChange={(event) => { field("name", event.target.value); if (!id) field("slug", event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /><FieldError name="name" errors={errors} /></label>
          <label>Slug <span className="field-required">Required</span><input {...fieldErrorProps("slug", errors)} value={fields.slug} onChange={(event) => field("slug", event.target.value)} /><FieldError name="slug" errors={errors} /></label>
          <label className="full">Short description <span className="field-required">Required</span><input {...fieldErrorProps("shortDescription", errors)} maxLength={240} value={fields.shortDescription} onChange={(event) => field("shortDescription", event.target.value)} /><FieldError name="shortDescription" errors={errors} /></label>
          <label className="full">Full description <span className="field-required">Required</span><textarea {...fieldErrorProps("description", errors)} rows={7} value={fields.description} onChange={(event) => field("description", event.target.value)} /><FieldError name="description" errors={errors} /></label>
        </div></div>

        <div className="editor-section"><h2>Product details</h2><div className="form-grid">
          <label>Price <span className="field-required">Required</span><input {...fieldErrorProps("price", errors)} type="number" min="0" step="0.01" value={fields.price} onChange={(event) => field("price", event.target.value)} /><FieldError name="price" errors={errors} /></label>
          <label>Currency <span className="field-required">Required</span><input {...fieldErrorProps("currency", errors)} maxLength={3} value={fields.currency} onChange={(event) => field("currency", event.target.value.toUpperCase())} /><FieldError name="currency" errors={errors} /></label>
          <label>Version <span className="field-required">Required</span><input {...fieldErrorProps("version", errors)} value={fields.version} onChange={(event) => field("version", event.target.value)} /><FieldError name="version" errors={errors} /></label>
          <label>Stack, comma separated <span className="field-required">Required</span><input {...fieldErrorProps("stack", errors)} value={fields.stack} onChange={(event) => field("stack", event.target.value)} /><FieldError name="stack" errors={errors} /></label>
          <label className="full">Features, one per line <span className="field-required">Required</span><textarea {...fieldErrorProps("features", errors)} rows={6} value={fields.features} onChange={(event) => field("features", event.target.value)} /><FieldError name="features" errors={errors} /></label>
          <label className="full">Public HTTPS preview URL <span className="field-required">Required</span><input {...fieldErrorProps("previewUrl", errors)} type="url" value={fields.previewUrl} onChange={(event) => field("previewUrl", event.target.value)} placeholder="https://preview.example.com" /><FieldError name="previewUrl" errors={errors} /></label>
        </div></div>

        <div className="editor-section"><h2>Documentation</h2><div className="form-grid">
          <RichTextEditor id="setupInstructions" label="Setup instructions" value={fields.setupInstructions} onChange={(value) => field("setupInstructions", value)} error={errors.setupInstructions} disabled={save.isLoading} />
          <RichTextEditor id="deployInstructions" label="Deployment instructions" value={fields.deployInstructions} onChange={(value) => field("deployInstructions", value)} error={errors.deployInstructions} disabled={save.isLoading} />
          <label className="full">Changelog<textarea {...fieldErrorProps("changelog", errors)} rows={4} value={fields.changelog} onChange={(event) => field("changelog", event.target.value)} /><FieldError name="changelog" errors={errors} /></label>
        </div></div>
      </section>

      <aside className="editor-side">
        <div className="editor-section asset-section">
          <div className="asset-section-heading"><div><h2>Theme assets</h2><p>Complete all four requirements.</p></div><span className={completedRequirements === 4 ? "complete" : ""}>{completedRequirements} / 4</span></div>
          {uploading && <UploadProgress upload={uploading} />}
          <div className={`asset-requirement ${previewReady ? "met" : ""}`}><CheckCircle2 size={16} /><span>Card preview</span><b>{preview ? 1 : 0} / 1</b></div>
          <button type="button" disabled={busy} className={`upload-drop ${errors.previewAssets ? "invalid" : ""}`} {...fieldErrorProps("previewAssets", errors)} onClick={() => previewInputRef.current?.click()}><Film size={18} /><strong className="text-xs">{preview ? "Replace preview" : "Upload preview"}</strong><span className="text-xs">MP4 or WebM up to 250 MB · GIF up to 10 MB</span></button>
          <input ref={previewInputRef} className="asset-file-input" disabled={busy} type="file" accept="video/mp4,video/webm,image/gif" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void selectFiles(files, "preview"); }} />
          {preview && <div className="asset-row"><span><ThemeMedia asset={preview} alt="Card preview" preview /></span><div><strong className="text-xs">{preview.originalName}</strong><small>Card thumbnail · {preview.status}</small></div><button type="button" disabled={busy} onClick={() => setPreview(undefined)}>Remove</button></div>}
          <FieldError name="previewAssets" errors={errors} />

          <div className={`asset-requirement source-requirement ${galleryReady ? "met" : ""}`}><CheckCircle2 size={16} /><span>Theme images</span><b>{images.length} / 10</b></div>
          <button type="button" disabled={busy || images.length >= 10} className={`upload-drop ${errors.galleryAssets ? "invalid" : ""}`} {...fieldErrorProps("galleryAssets", errors)} onClick={() => imageInputRef.current?.click()}><ImagePlus size={18} /><strong className="text-xs">Add gallery images · minimum 2</strong><span className="text-xs">{uploadRules.image.description} each</span></button>
          <input ref={imageInputRef} className="asset-file-input" disabled={busy} type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void selectFiles(files, "gallery"); }} />
          {images.map((asset, index) => <div className="asset-row" key={asset.id}><span><ThemeMedia asset={asset} alt={`Gallery image ${index + 1}`} /></span><div><strong className="text-xs">{asset.originalName}</strong><small>Image {index + 1} · {asset.status}</small></div><button type="button" disabled={busy} aria-label={`Remove gallery image ${index + 1}`} onClick={() => { setImages((items) => items.filter((item) => item.id !== asset.id)); clearError("galleryAssets"); }}>Remove</button></div>)}
          <FieldError name="galleryAssets" errors={errors} />

          <div className={`asset-requirement source-requirement ${tutorialsReady ? "met" : ""}`}><CheckCircle2 size={16} /><span>Tutorial videos</span><b>{videos.length} / 2</b></div>
          <button type="button" disabled={busy || videos.length >= 2} className={`upload-drop source ${errors.tutorialAssets ? "invalid" : ""}`} {...fieldErrorProps("tutorialAssets", errors)} onClick={() => videoInputRef.current?.click()}><Film size={18} /><strong className="text-xs">Add tutorials · minimum 1</strong><span className="text-xs">Setup, deployment, or editing · {uploadRules.video.description}</span></button>
          <input ref={videoInputRef} className="asset-file-input" disabled={busy} type="file" multiple accept="video/mp4,video/webm" onChange={(event) => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void selectFiles(files, "tutorial"); }} />
          {videos.map((asset, index) => <div className="asset-row" key={asset.id}><span><Film size={18} /></span><div><strong className="text-xs">{asset.originalName}</strong><small>Tutorial {index + 1} · {asset.status}</small></div><button type="button" disabled={busy} aria-label={`Remove tutorial ${index + 1}`} onClick={() => { setVideos((items) => items.filter((item) => item.id !== asset.id)); clearError("tutorialAssets"); }}>Remove</button></div>)}
          <FieldError name="tutorialAssets" errors={errors} />

          <div className={`asset-requirement source-requirement ${source?.status === "ready" ? "met" : ""}`}><CheckCircle2 size={16} /><span>Theme source package</span><b>Required</b></div>
          <button type="button" disabled={busy} className={`upload-drop source ${errors.sourceAsset ? "invalid" : ""}`} {...fieldErrorProps("sourceAsset", errors)} onClick={() => sourceInputRef.current?.click()}><FileArchive size={18} /><strong className="text-xs">{source ? "Replace source ZIP" : "Upload source ZIP"}</strong><span className="text-xs">{source?.originalName ?? uploadRules.theme_zip.description}</span></button>
          <input ref={sourceInputRef} className="asset-file-input" disabled={busy} type="file" accept=".zip,application/zip,application/x-zip,application/x-zip-compressed" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ""; void selectFiles(file ? [file] : [], "source"); }} />
          {source && <div className="asset-row source-file"><span><FileArchive /></span><div><strong className="text-xs">{source.originalName}</strong><small>{source.status}</small></div><button type="button" disabled={busy} onClick={() => { setSource(undefined); setErrors((current) => ({ ...current, sourceAsset: "Upload the required source ZIP file" })); }}>Remove</button></div>}
          <FieldError name="sourceAsset" errors={errors} />
        </div>

        <div className="editor-section"><h2>Presentation</h2>
          <label className="check-label"><input type="checkbox" checked={fields.featured} onChange={(event) => field("featured", event.target.checked)} />Feature on the home page</label>
          <label>SEO title<input {...fieldErrorProps("seoTitle", errors)} value={fields.seoTitle} maxLength={70} onChange={(event) => field("seoTitle", event.target.value)} /><FieldError name="seoTitle" errors={errors} /></label>
          <label>SEO description<textarea {...fieldErrorProps("seoDescription", errors)} rows={3} maxLength={170} value={fields.seoDescription} onChange={(event) => field("seoDescription", event.target.value)} /><FieldError name="seoDescription" errors={errors} /></label>
        </div>
        <button type="submit" className="primary-button editor-save" disabled={busy}>{save.isLoading ? <Spinner size="sm" /> : <Save size={17} />}{id ? "Save changes" : "Create draft"}</button>
      </aside>
    </form>
  </main>;
}
