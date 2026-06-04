// ============================================================
// src/app/services/security.service.ts
// NEW FILE — Fixes:
//   VULN-011: Angular-side security hardening helpers
//   VULN-018: CSRF token read from XSRF-TOKEN cookie
//   VULN-028: Back-button cache protection, history replacement
// ============================================================
import { Injectable } from '@angular/core';
import { Router }     from '@angular/router';

@Injectable({ providedIn: 'root' })
export class SecurityService {

  constructor(private router: Router) {}

  // ── VULN-018: CSRF Token Reader ────────────────────────────
  // Reads the XSRF-TOKEN cookie (non-HttpOnly, set by backend).
  // The Angular CSRF interceptor calls this to obtain the token
  // for the X-XSRF-TOKEN request header.
  getCsrfToken(): string | null {
    return this.readCookie('XSRF-TOKEN');
  }

  // ── VULN-028: Post-Logout Cache Busting ───────────────────
  // Replaces browser history entry and prevents back-navigation
  // to protected pages after logout.
  clearNavigationHistory(): void {
    // Replace current history entry with /auth so back() goes
    // outside the app, not to a protected page.
    window.history.replaceState(null, '', '/auth');

    // Push a sentinel so any further back() hits /auth again.
    window.history.pushState(null, '', '/auth');
  }

  // ── VULN-028: Prevent BFCache Restore ─────────────────────
  // Registers a pageshow listener. When the browser restores a
  // page from the bfcache (persisted = true), we forcibly
  // redirect to /auth if the user is no longer authenticated.
  installBfCacheGuard(isAuthenticatedFn: () => boolean): void {
    window.addEventListener('pageshow', (event: PageTransitionEvent) => {
      if (event.persisted && !isAuthenticatedFn()) {
        // Page was restored from bfcache after logout — eject.
        window.location.replace('/auth');
      }
    });
  }

  // ── VULN-028: Disable page caching via meta tags ──────────
  // Angular's index.html doesn't have these — we inject them
  // dynamically at bootstrap so the browser's HTTP cache sees them.
  injectNoCacheMetaTags(): void {
    const metaTags: { httpEquiv: string; content: string }[] = [
      { httpEquiv: 'Cache-Control',      content: 'no-store, no-cache, must-revalidate' },
      { httpEquiv: 'Pragma',             content: 'no-cache' },
      { httpEquiv: 'Expires',            content: '0' },
    ];

    metaTags.forEach(({ httpEquiv, content }) => {
      if (!document.querySelector(`meta[http-equiv="${httpEquiv}"]`)) {
        const meta = document.createElement('meta');
        meta.httpEquiv = httpEquiv;
        meta.content   = content;
        document.head.appendChild(meta);
      }
    });
  }

  // ── Cookie Reader (used for CSRF token only) ──────────────
  // Does NOT read HttpOnly cookies — those are invisible to JS.
  // Only reads the non-HttpOnly XSRF-TOKEN cookie.
  private readCookie(name: string): string | null {
    const match = document.cookie.match(
      new RegExp('(?:^|;\\s*)' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)')
    );
    return match ? decodeURIComponent(match[1]) : null;
  }
}