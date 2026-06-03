// ============================================================
// src/app/guards/auth-guard.ts
// MODIFIED FILE — Uses isAuthenticated() which checks expiry,
//                 not just presence of cookie token
// ============================================================
import { inject }                       from '@angular/core';
import { Router, CanActivateFn, UrlTree } from '@angular/router';
import { Observable, from, of }          from 'rxjs';
import { switchMap, catchError }         from 'rxjs/operators';
import { AuthService }                   from '../services/auth.service';

export const authGuard: CanActivateFn = (): Observable<boolean | UrlTree> => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) {
    return of(true);
  }

  // Attempt a silent refresh — cookie may still be valid even if session state was lost
  return from(auth.refresh()).pipe(
    switchMap(() => of(true)),
    catchError(() => {
      auth.forceLogout();
      return of(router.parseUrl('/auth'));
    })
  );
};
