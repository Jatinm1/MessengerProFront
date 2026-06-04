// ============================================================
// src/app/app.config.ts
// MODIFIED FILE — Fixes:
//   VULN-018: csrfInterceptor registered BEFORE authInterceptor
//             so the X-XSRF-TOKEN header is present on all
//             requests including retries after token refresh.
//   VULN-005: withCredentials on all requests via authInterceptor.
// ============================================================
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter }         from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes }           from './app.routes';
import { csrfInterceptor }  from './interceptors/csrf.interceptor';
import { authInterceptor }  from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([
        csrfInterceptor,   // VULN-018: attach X-XSRF-TOKEN header first
        authInterceptor,   // VULN-005: attach withCredentials + handle 401
      ])
    ),
  ]
};