// ============================================================
// src/app/guards/auth-guard.ts
// MODIFIED FILE — Fixes:
//   VULN-005: Uses isAuthenticated() which checks expiry,
//             not just presence of cookie token.
//   VULN-028: Back-button protection — popstate handler
//             re-validates session so bfcache-restored pages
//             cannot be viewed post-logout.
// ============================================================
import { inject }                         from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import { Observable, from, of }           from 'rxjs';
import { switchMap, catchError, tap }     from 'rxjs/operators';
import { AuthService }                    from '../services/auth.service';

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    // VULN-028: Install a popstate listener to catch the case where
    // the user presses back AFTER this guard already passed. The
    // pageshow bfcache guard in AuthService handles page restores;
    // this covers same-session SPA back navigation.
    installPopstateGuard(auth, router);
    return of(true);
  }

  // Attempt a silent refresh — cookie may still be valid even if
  // session state was lost (e.g. page reload after idle).
  return from(auth.refresh()).pipe(
    switchMap(() => {
      installPopstateGuard(auth, router);
      return of(true);
    }),
    catchError(() => {
      auth.forceLogout();
      return of(router.parseUrl('/auth'));
    })
  );
};

// ── VULN-028: Popstate back-button guard ──────────────────────
// Fires when the user navigates back via the browser button.
// If they are no longer authenticated, redirect to /auth.
let popstateInstalled = false;

function installPopstateGuard(auth: AuthService, router: Router): void {
  if (popstateInstalled) return;
  popstateInstalled = true;

  window.addEventListener('popstate', () => {
    if (!auth.isAuthenticated()) {
      // User navigated back to a protected route after logout.
      router.navigateByUrl('/auth', { replaceUrl: true });
    }
  });
}