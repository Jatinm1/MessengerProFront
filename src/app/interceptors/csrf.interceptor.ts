// ============================================================
// src/app/interceptors/csrf.interceptor.ts
// NEW FILE — Fixes:
//   VULN-018: CSRF Double Submit Cookie — Angular side.
//
// HOW IT WORKS:
//   The backend CsrfMiddleware sets a non-HttpOnly XSRF-TOKEN
//   cookie that Angular can read. This interceptor reads that
//   cookie and attaches it as an X-XSRF-TOKEN request header
//   on every state-changing request.
//
//   The backend validates that header value == cookie value.
//   Cross-origin attackers cannot read the cookie, so they
//   cannot craft a matching header.
//
// SKIPPED:
//   - Safe methods: GET, HEAD, OPTIONS
//   - External URLs (non-API calls to third parties)
//   - /api/auth/login and /api/auth/register (no session yet)
// ============================================================
import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpEvent
} from '@angular/common/http';
import { inject }       from '@angular/core';
import { Observable }   from 'rxjs';
// import { SecurityService } from '../services/security.service';
import { environment }  from '../../env/env';
import { SecurityService } from '../services/security.service';

const SAFE_METHODS  = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);
const CSRF_HEADER   = 'X-XSRF-TOKEN';

// Endpoints that are exempt (pre-auth, CSRF token not yet set)
const EXEMPT_PATHS  = [
  '/api/auth/login',
  '/api/auth/register',
];

export const csrfInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
): Observable<HttpEvent<unknown>> => {

  const security = inject(SecurityService);

  // Skip safe methods
  if (SAFE_METHODS.has(req.method.toUpperCase())) {
    return next(req);
  }

  // Skip exempt pre-auth paths
  const isExempt = EXEMPT_PATHS.some(p => req.url.includes(p));
  if (isExempt) {
    return next(req);
  }

  // Skip requests to external origins (Cloudinary uploads, etc.)
  const isInternal = req.url.startsWith(environment.apiUrl) ||
                     req.url.startsWith('/');
  if (!isInternal) {
    return next(req);
  }

  // Read XSRF-TOKEN cookie (non-HttpOnly — readable by JS)
  const csrfToken = security.getCsrfToken();

  if (!csrfToken) {
    // Cookie not yet set — request will proceed and backend will
    // issue the cookie on the next GET. State-changing requests
    // without the cookie will be rejected 403 by the backend.
    return next(req);
  }

  // Attach CSRF token header
  const secureReq = req.clone({
    headers: req.headers.set(CSRF_HEADER, csrfToken)
  });

  return next(secureReq);
};