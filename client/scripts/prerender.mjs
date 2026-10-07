import { readFile, writeFile } from 'node:fs/promises'
import { renderHome } from '../.prerender/entry-server.js'

const file = new URL('../dist/index.html', import.meta.url)
const template = await readFile(file, 'utf8')
const markup = renderHome()
if (!markup.includes('id="hero-title"')) throw new Error('Homepage prerender did not include the hero')
// The same index is the SPA fallback. Remove homepage markup on other routes
// before the browser paints, then let React mount the requested route.
const guard = `<script>if(location.pathname!=="/"){document.getElementById("root").replaceChildren();document.getElementById("root").removeAttribute("data-prerendered");document.querySelector('link[rel="canonical"]').remove();}</script>`
await writeFile(file, template.replace('<div id="root"></div>', `<div id="root" data-prerendered="/">${markup}</div>${guard}`))
console.log('Prerendered homepage: visible hero, content, and crawlable links included in HTML.')
