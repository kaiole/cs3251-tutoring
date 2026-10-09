// @ts-check
import { execSync } from 'node:child_process';
import { defineConfig, envField } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import netlify from '@astrojs/netlify';
import cspCheck, { readCspHashes } from './integrations/csp-check.mjs';

/** Identifier of the deployed build, recorded with contextual questions for attribution. */
function buildRevision() {
  const fromCi = process.env.COMMIT_REF; // set by Netlify builds
  if (fromCi && /^[A-Za-z0-9._-]{1,64}$/.test(fromCi)) return fromCi.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return 'dev';
  }
}

// https://astro.build/config
export default defineConfig({
  site: process.env.SITE_URL ?? 'http://localhost:4321',
  // Notes are pre-rendered; /questions, /api and /auth opt into on-demand rendering per route.
  output: 'static',
  // No edge functions are used; skip their local emulation (it needs a Deno toolchain).
  adapter: netlify({
    // staticHeaders: true would move page CSPs from <meta> into Netlify header rules. Its rules
    // use paths without the trailing slash Starlight serves, so validate on a deploy preview
    // before enabling; integrations/csp-check.mjs already understands both forms.
    devFeatures: { environmentVariables: false, images: true, edgeFunctions: false },
  }),
  security: {
    checkOrigin: true,
    csp: {
      directives: [
        "default-src 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "form-action 'self'",
        "connect-src 'self'",
        // No remote images anywhere (also blocks tracking pixels in student Markdown).
        "img-src 'self' data:",
        "font-src 'self'",
        "frame-src 'none'",
        // Pagefind search runs WebAssembly.
        "worker-src 'self'",
      ],
      scriptDirective: {
        resources: ["'self'", "'wasm-unsafe-eval'"],
        // Reviewed Starlight is:inline scripts; verified after every build by csp-check.
        hashes: await readCspHashes(),
      },
      // Expressive Code and Starlight emit inline style="" attributes (token colours, sidebar
      // depth), and Astro cannot emit style-src-attr. Styles therefore allow inline; scripts stay
      // strictly hash-based, which is what blocks XSS.
      styleDirective: {
        resources: ["'self'", "'unsafe-inline'"],
      },
    },
  },
  env: {
    schema: {
      SITE_URL: envField.string({ context: 'server', access: 'public', url: true }),
      SUPABASE_URL: envField.string({ context: 'server', access: 'secret', url: true }),
      SUPABASE_PUBLISHABLE_KEY: envField.string({ context: 'server', access: 'secret' }),
      // SUPABASE_SECRET_KEY is deliberately absent: only the notification worker reads it.
    },
  },
  vite: {
    define: {
      'import.meta.env.BUILD_REVISION': JSON.stringify(buildRevision()),
    },
  },
  integrations: [
    starlight({
      title: 'CS3251 Tutoring',
      description: 'C++ notes for CS3251 tutoring.',
      // One group per topic directory under src/content/docs/notes/.
      sidebar: [{ label: 'C++ fundamentals', items: [{ autogenerate: { directory: 'notes/cpp-fundamentals' } }] }],
      customCss: ['./src/styles/custom.css'],
      // Stock Shiki themes for readable code in both schemes; Expressive Code lifts any token
      // below its default contrast floor on the code background. Square, clearly framed blocks.
      expressiveCode: {
        themes: ['github-dark', 'github-light'],
        // Replace Expressive Code's hued UI defaults (selection, focus, tooltip, markers) with
        // the site's gray variables, so they also follow the light/dark switch.
        styleOverrides: {
          borderRadius: '0',
          borderWidth: '1px',
          borderColor: 'var(--tq-code-border)',
          codeBackground: 'var(--tq-code-bg)',
          codePaddingBlock: '1rem',
          codeSelectionBackground: 'var(--q-sel)',
          focusBorder: 'var(--sl-color-gray-2)',
          gutterForeground: 'var(--sl-color-gray-3)',
          gutterHighlightForeground: 'var(--sl-color-gray-1)',
          gutterBorderColor: 'var(--tq-code-border)',
          uiSelectionBackground: 'var(--sl-color-gray-5)',
          uiSelectionForeground: 'var(--sl-color-white)',
          frames: {
            tooltipSuccessBackground: 'var(--sl-color-gray-5)',
            tooltipSuccessForeground: 'var(--sl-color-white)',
          },
          textMarkers: {
            markBackground: 'var(--sl-color-gray-5)',
            markBorderColor: 'var(--sl-color-gray-3)',
            insBackground: 'var(--sl-color-gray-6)',
            insBorderColor: 'var(--sl-color-gray-2)',
            insDiffIndicatorColor: 'var(--sl-color-gray-2)',
            delBackground: 'var(--sl-color-gray-6)',
            delBorderColor: 'var(--sl-color-gray-4)',
            delDiffIndicatorColor: 'var(--sl-color-gray-4)',
          },
        },
      },
      components: {
        // Mounts the question entry points around ordinary .md notes (no per-note MDX imports).
        MarkdownContent: './src/components/overrides/MarkdownContent.astro',
        // "Ask about this note" panel under the table of contents.
        PageSidebar: './src/components/overrides/PageSidebar.astro',
        // Adds "Questions" + "Sign in/out" to the header.
        SocialIcons: './src/components/overrides/SocialIcons.astro',
      },
      pagefind: true,
    }),
    react(),
    cspCheck(),
  ],
});
