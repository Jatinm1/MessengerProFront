// ============================================================
// src/app/app.config.ts
// MODIFIED FILE — withCredentials on all requests via interceptor
// ============================================================
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter }          from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes }           from './app.routes';
import { authInterceptor }  from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptor])
    ),
  ]
};
