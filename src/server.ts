// ============================================================
// src/server.ts
// MODIFIED FILE — Fixes:
//   VULN-011: Security headers on Angular SSR Express server.
//             These headers protect the SSR-rendered HTML shell
//             and all static assets served by Express.
//   VULN-028: Cache-Control no-store on SSR HTML responses.
//             Static assets (JS/CSS with content-hash names)
//             are cached with long max-age as before.
// ============================================================
import {
  AngularNodeAppEngine,
  createNodeRequestHandler,
  isMainModule,
  writeResponseToNodeResponse,
} from '@angular/ssr/node';
import express, { Request, Response, NextFunction } from 'express';
import { dirname, resolve } from 'node:path';
import { fileURLToPath }    from 'node:url';

const serverDistFolder  = dirname(fileURLToPath(import.meta.url));
const browserDistFolder = resolve(serverDistFolder, '../browser');

const app       = express();
const angularApp = new AngularNodeAppEngine();

const isProd = process.env['NODE_ENV'] === 'production';

// ── VULN-011: Security Headers on all SSR responses ──────────
app.use((_req: Request, res: Response, next: NextFunction) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');

  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Disable legacy XSS filter (CSP handles this)
  res.setHeader('X-XSS-Protection', '0');

  // Referrer leakage control
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Permissions Policy
  res.setHeader('Permissions-Policy',
    'camera=(self), microphone=(self), geolocation=(), payment=(), usb=(), ' +
    'autoplay=(self), fullscreen=(self), display-capture=(self)'
  );

  if (isProd) {
    // HSTS — 2-year max-age with preload
    res.setHeader('Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload');

    // Production CSP
    res.setHeader('Content-Security-Policy',
      [
        "default-src 'none'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://res.cloudinary.com",
        "font-src 'self'",
        "connect-src 'self' wss: https://res.cloudinary.com https://api.cloudinary.com",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'",
        "upgrade-insecure-requests"
      ].join('; ')
    );
  } else {
    // Development CSP — relaxed for hot-reload
    res.setHeader('Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://res.cloudinary.com",
        "font-src 'self' data:",
        "connect-src 'self' ws: wss: http://localhost:* https://res.cloudinary.com https://api.cloudinary.com",
        "media-src 'self' blob:",
        "worker-src 'self' blob:",
        "frame-src 'none'",
        "frame-ancestors 'none'",
        "form-action 'self'",
        "base-uri 'self'",
        "object-src 'none'"
      ].join('; ')
    );
  }

  next();
});

// ── VULN-028: Static assets — long-lived cache (hashed names) ─
// Angular build output has content-hash in filenames (main.abc123.js)
// so it is safe to cache them for 1 year.
app.use(
  express.static(browserDistFolder, {
    maxAge: '1y',
    index:  false,
    redirect: false,
    setHeaders: (res: Response, filePath: string) => {
      // For HTML files (index.html fallback): no-store
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.setHeader('Pragma',  'no-cache');
        res.setHeader('Expires', '0');
      }
      // For hashed JS/CSS/fonts: 1-year immutable cache is set by maxAge above
    }
  }),
);

// ── VULN-028: SSR HTML responses — no-store ──────────────────
// Angular renders the HTML shell here. It must not be cached.
app.use('/**', (req: Request, res: Response, next: NextFunction) => {
  // Set no-store before handing to Angular
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma',  'no-cache');
  res.setHeader('Expires', '0');

  angularApp
    .handle(req)
    .then((response) =>
      response ? writeResponseToNodeResponse(response, res) : next(),
    )
    .catch(next);
});

// ── Start server ──────────────────────────────────────────────
if (isMainModule(import.meta.url)) {
  const port = process.env['PORT'] || 4000;
  app.listen(port, () => {
    console.log(`Node Express server listening on http://localhost:${port}`);
  });
}

export const reqHandler = createNodeRequestHandler(app);