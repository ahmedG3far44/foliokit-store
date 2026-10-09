import { readFile } from "node:fs/promises";
import sharp from "sharp";

export type SeedDesign = { name: string; slug: string; color: string; accent: string; shortDescription: string };
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

export async function seedImage(theme: SeedDesign, view: "preview" | "home" | "projects"): Promise<Buffer> {
  const title = escapeHtml(theme.name);
  const heading = view === "projects" ? "Selected projects" : "Ideas made visible.";
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800" viewBox="0 0 1200 800">
    <rect width="1200" height="800" fill="#${theme.color}"/>
    <g font-family="sans-serif" fill="#${theme.accent}">
      <text x="70" y="80" font-size="28">${title}</text><text x="880" y="80" font-size="20">Work · About · Contact</text>
      <text x="70" y="230" font-size="72" font-weight="bold">${heading}</text>
      <text x="70" y="285" font-size="24">A responsive starter template for your next launch.</text>
      <rect x="70" y="330" width="205" height="55" rx="28" fill="#${theme.accent}"/>
      <text x="98" y="365" font-size="20" fill="#${theme.color}">Explore my work</text>
      <rect x="70" y="455" width="510" height="230" rx="18" fill="#${theme.accent}" fill-opacity="0.15"/>
      <rect x="620" y="455" width="510" height="230" rx="18" fill="#${theme.accent}" fill-opacity="0.25"/>
      <circle cx="325" cy="555" r="65" fill="#${theme.accent}" fill-opacity="0.7"/>
      <rect x="795" y="495" width="155" height="115" rx="20" fill="#${theme.accent}" fill-opacity="0.7"/>
      <text x="95" y="655" font-size="23">${view === "projects" ? "Project stories" : "Brand and identity"}</text>
      <text x="645" y="655" font-size="23">${view === "preview" ? "Website preview" : "Digital experiences"}</text>
      <text x="70" y="755" font-size="18">${title} · Folio Kit demo template</text>
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFiles(files: Record<string, string>): Buffer {
  const localFiles: Buffer[] = [], directory: Buffer[] = [];
  let offset = 0;
  for (const [path, content] of Object.entries(files)) {
    const filename = Buffer.from(path), data = Buffer.from(content), checksum = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    localFiles.push(local, filename, data); directory.push(central, filename);
    offset += local.length + filename.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22), count = Object.keys(files).length;
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(count, 8); end.writeUInt16LE(count, 10);
  end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localFiles, central, end]);
}

export function seedTemplateZip(theme: SeedDesign): Buffer {
  const name = escapeHtml(theme.name), description = escapeHtml(theme.shortDescription);
  return zipFiles({
    "index.html": `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${description}"><title>${name}</title><link rel="stylesheet" href="styles.css"></head>
<body><header><a href="#">${name}</a><nav aria-label="Main navigation"><a href="#work">Work</a><a href="#about">About</a><a href="#contact">Contact</a></nav></header>
<main><section class="hero"><p>Independent ideas. Considered design.</p><h1>Ideas made visible.</h1><p>${description}</p><a class="button" href="#work">Explore my work</a></section>
<section id="work"><h2>Selected projects</h2><div class="projects"><article><div class="art circle" aria-hidden="true"></div><h3>Brand and identity</h3><p>A visual identity built around a clear point of view.</p></article><article><div class="art square" aria-hidden="true"></div><h3>Digital experiences</h3><p>A thoughtful website made for real people.</p></article></div></section>
<section id="about"><h2>About the studio</h2><p>We help ambitious people bring their ideas to life. Replace this text with your story, services, and experience.</p></section>
<section id="contact"><h2>Let’s build something.</h2><a class="button" href="mailto:hello@example.com">Get in touch</a></section></main><footer>© ${name}. Demo starter template by Folio Kit.</footer></body></html>`,
    "styles.css": `:root{--bg:#${theme.color};--accent:#${theme.accent};color-scheme:dark}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--accent);font:18px/1.6 system-ui,sans-serif}header,main,footer{max-width:1120px;margin:auto;padding:32px}header{display:flex;justify-content:space-between;gap:24px}nav{display:flex;gap:24px}a{color:inherit}header a{text-decoration:none}section{padding:60px 0}.hero{padding:90px 0}h1{font-size:clamp(48px,8vw,96px);line-height:1.05;letter-spacing:-.05em;margin:24px 0}h2{font-size:36px}p{max-width:650px}.button{display:inline-block;background:var(--accent);color:var(--bg);padding:14px 24px;border-radius:40px;text-decoration:none;margin-top:16px}.projects{display:grid;grid-template-columns:1fr 1fr;gap:32px}.art{height:230px;border-radius:18px;background:color-mix(in srgb,var(--accent) 15%,var(--bg));display:grid;place-items:center}.art:after{content:"";background:var(--accent);width:120px;height:120px;opacity:.7}.circle:after{border-radius:50%}.square:after{border-radius:20px}a:focus-visible{outline:3px solid currentColor;outline-offset:5px}@media(max-width:650px){header{flex-direction:column}.projects{grid-template-columns:1fr}header,main,footer{padding:24px}.hero{padding:50px 0}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}`,
    "README.md": `# ${theme.name}\n\nThis is a working static HTML/CSS demo starter, not the advertised framework implementation.\n\n## Setup\n1. Extract the ZIP.\n2. Open index.html in your browser. No dependencies or build step are required.\n3. Edit the text in index.html and colors/layout in styles.css.\n4. Replace hello@example.com with your contact email.\n\n## Deploy\nUpload index.html and styles.css together to a static web host.\n\nReplace this demo package with the complete production theme before selling it.\n`,
  });
}

export async function seedTutorialMp4(): Promise<Buffer> {
  // Source execution and tsc's dist/server/src/utils layout.
  try { return await readFile(new URL("../../seed-assets/tutorial.mp4", import.meta.url)); }
  catch { return readFile(new URL("../../../../seed-assets/tutorial.mp4", import.meta.url)); }
}
