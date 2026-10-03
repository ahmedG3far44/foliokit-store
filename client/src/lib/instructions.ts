import DOMPurify from "dompurify";

export function instructionHtml(value: string | null | undefined, format?: "plain" | "html") {
  const safe = value ?? "";
  if (format !== "html") {
    const escaped = safe.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    return escaped.split(/\r?\n/).map((line) => `<p>${line || "<br>"}</p>`).join("");
  }
  return DOMPurify.sanitize(safe, {
    ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "b", "em", "i", "s", "del", "u", "ul", "ol", "li", "pre", "code", "blockquote", "hr", "a"],
    ALLOWED_ATTR: ["href", "title", "start"],
  });
}
