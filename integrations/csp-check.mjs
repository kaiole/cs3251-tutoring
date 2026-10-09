// @ts-check
/**
 * Build guard for the Content Security Policy.
 *
 * Astro hashes the scripts it bundles, but framework `is:inline` scripts (Starlight's theme and
 * sidebar helpers) are not hashed automatically. Their hashes live in csp-hashes.json and are passed
 * to Astro's CSP config (so on-demand pages get them too). After every build this integration checks
 * that EVERY inline script in every static page is allowed by that page's CSP <meta>, and fails the
 * build otherwise. Run `CSP_UPDATE=1 npm run build` to record new hashes after reviewing the
 * scripts (e.g. after a Starlight upgrade). Student content never appears in static pages.
 */
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HASH_FILE = new URL('../csp-hashes.json', import.meta.url);

export async function readCspHashes() {
  const data = JSON.parse(await readFile(HASH_FILE, 'utf8'));
  return /** @type {`sha256-${string}`[]} */ (data.script);
}

/**
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* htmlFiles(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* htmlFiles(path);
    else if (entry.name.endsWith('.html')) yield path;
  }
}

/** @returns {import('astro').AstroIntegration} */
export default function cspCheck() {
  return {
    name: 'csp-check',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const root = fileURLToPath(dir);
        // With the Netlify adapter's staticHeaders option, page CSPs move from <meta> into the
        // generated header config; check whichever one the page actually gets.
        const headerCsp = new Map();
        try {
          const config = JSON.parse(await readFile(join(root, '..', '.netlify', 'v1', 'config.json'), 'utf8'));
          for (const h of config.headers ?? []) {
            const value = h.values?.['Content-Security-Policy'];
            if (value) headerCsp.set(h.for, value);
          }
        } catch {
          /* no adapter header config: rely on <meta> */
        }
        /** @param {string} file */
        const routeOf = (file) => {
          const rel = '/' + relative(root, file).split(sep).join('/');
          return rel.endsWith('/index.html') ? rel.slice(0, -'index.html'.length) : rel.replace(/\.html$/, '');
        };
        const missing = new Map();
        let pages = 0;
        for await (const file of htmlFiles(root)) {
          const html = await readFile(file, 'utf8');
          const route = routeOf(file);
          const csp =
            /http-equiv="content-security-policy" content="([^"]*)"/i.exec(html)?.[1] ??
            headerCsp.get(route) ??
            headerCsp.get(route.replace(/\/$/, '')) ??
            headerCsp.get(route + '/');
          if (!csp) throw new Error(`csp-check: ${route} has no CSP (meta or header)`);
          pages++;
          const allowed = new Set(csp.match(/sha256-[A-Za-z0-9+/=]+/g) ?? []);
          for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
            const hash = `sha256-${createHash('sha256').update(m[1] ?? '').digest('base64')}`;
            if (!allowed.has(hash)) missing.set(hash, (m[1] ?? '').trim().slice(0, 80));
          }
        }
        if (missing.size === 0) {
          logger.info(`all inline scripts in ${pages} pages are allowed by CSP`);
          return;
        }
        if (process.env.CSP_UPDATE === '1') {
          const current = await readCspHashes();
          const script = [...new Set([...current, ...missing.keys()])].sort();
          await writeFile(HASH_FILE, JSON.stringify({ ...JSON.parse(await readFile(HASH_FILE, 'utf8')), script }, null, 2) + '\n');
          logger.warn(`recorded ${missing.size} new inline-script hash(es); rebuild to apply them`);
          return;
        }
        const list = [...missing].map(([h, snippet]) => `  ${h}  ${JSON.stringify(snippet)}`).join('\n');
        throw new Error(
          `csp-check: inline scripts not allowed by CSP:\n${list}\n` +
            'Review them, then run `CSP_UPDATE=1 npm run build` and rebuild.',
        );
      },
    },
  };
}
