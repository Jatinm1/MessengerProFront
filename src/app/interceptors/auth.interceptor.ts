// ============================================================
// src/app/interceptors/auth.interceptor.ts
// MODIFIED FILE — Fixes:
//   VULN-005: No Authorization header with token from JS.
//             withCredentials: true sends the HttpOnly cookie.
//   VULN-003: On 401, attempt silent refresh then retry once.
// ============================================================
import {
  HttpInterceptorFn, HttpErrorResponse,
  HttpRequest, HttpHandlerFn, HttpEvent
} from '@angular/common/http';
import { inject }                       from '@angular/core';
import {
  catchError, switchMap, throwError, Observable, BehaviorSubject, filter, take
} from 'rxjs';
import { Router }    from '@angular/router';
import { AuthService } from '../services/auth.service';

// Shared state so concurrent 401s don't fire multiple refresh calls
let isRefreshing      = false;
const refreshSubject$ = new BehaviorSubject<boolean>(false);

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);

  // VULN-005: All requests use withCredentials so the HttpOnly cookie is sent.
  // We NEVER read the token from JS or attach an Authorization header manually.
  const secureReq = req.clone({ withCredentials: true });

  return next(secureReq).pipe(
    catchError((error: HttpErrorResponse) => {

      // Skip refresh attempts for auth endpoints to avoid infinite loops
      const isAuthEndpoint =
        req.url.includes('/auth/login')   ||
        req.url.includes('/auth/register') ||
        req.url.includes('/auth/refresh');

      if (error.status === 401 && !isAuthEndpoint) {
        return handle401(secureReq, next, auth, router);
      }

      if (error.status === 403) {
        router.navigate(['/auth']);
      }

      return throwError(() => error);
    })
  );
};

function handle401(
  req:    HttpRequest<any>,
  next:   HttpHandlerFn,
  auth:   AuthService,
  router: Router
): Observable<HttpEvent<any>> {

  if (isRefreshing) {
    // Queue: wait for the in-flight refresh to complete, then retry
    return refreshSubject$.pipe(
      filter(done => done),
      take(1),
      switchMap(() => next(req))
    );
  }

  isRefreshing = true;
  refreshSubject$.next(false);

  return auth.refresh().pipe(
    switchMap(() => {
      isRefreshing = false;
      refreshSubject$.next(true);
      // Retry the original request — cookie is now refreshed
      return next(req);
    }),
    catchError(refreshError => {
      isRefreshing = false;
      refreshSubject$.next(false);
      auth.forceLogout();
      router.navigate(['/auth']);
      return throwError(() => refreshError);
    })
  );
}
