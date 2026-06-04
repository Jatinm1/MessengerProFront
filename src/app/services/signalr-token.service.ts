// ============================================================
// src/app/services/signalr-token.service.ts
// NEW FILE — Provides the access token for SignalR negotiation.
//            The token is fetched once via a dedicated endpoint
//            that returns it from the HttpOnly cookie, so it
//            never lives in JS long-term.
// ============================================================
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../env/env';

@Injectable({ providedIn: 'root' })
export class SignalRTokenService {
  private readonly apiBase = environment.apiUrl;

  constructor(private http: HttpClient) {}

  /**
   * Fetches a short-lived SignalR negotiation token from the server.
   * The server reads the access_token HttpOnly cookie and issues
   * a one-time-use token valid for 30 seconds, for use only
   * during the SignalR HTTP negotiation handshake.
   */
  async getNegotiationToken(): Promise<string> {
    const response = await firstValueFrom(
      this.http.post<{ token: string }>( 
        `${this.apiBase}/auth/signalr-token`,
        {},
        { withCredentials: true }
      )
    );
    console.debug('Fetched SignalR negotiation token:', response.token);
    return response.token;
  }
}
