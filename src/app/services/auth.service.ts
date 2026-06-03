// ============================================================
// src/app/services/auth.service.ts
// MODIFIED FILE — Fixes:
//   VULN-005: No token read/write via document.cookie from JS
//             Tokens live in HttpOnly cookies set by server
//   VULN-027: 10-minute idle session timeout
//   VULN-003: Token refresh via /auth/refresh endpoint
// ============================================================
import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { HttpClient }                    from '@angular/common/http';
import {
  BehaviorSubject, Observable, Subject,
  throwError, timer, Subscription, EMPTY
} from 'rxjs';
import { catchError, tap, switchMap } from 'rxjs/operators';
import { Router }                     from '@angular/router';
import { LoginResponse, User, SessionInfo } from '../models/chat.models';
import { environment }                from '../../env/env';
import { CryptoService }              from './crypto.service';

const IDLE_TIMEOUT_MS  = 10 * 60 * 1000;   // VULN-027: 10 minutes
const REFRESH_AHEAD_MS =  2 * 60 * 1000;   // refresh 2 min before expiry

@Injectable({ providedIn: 'root' })
export class AuthService implements OnDestroy {

  private readonly apiBase = environment.apiUrl;

  // ── State ──────────────────────────────────────────────────
  private currentUserSubject  = new BehaviorSubject<User | null>(null);
  private deviceIdSubject     = new BehaviorSubject<string | null>(null);
  private expiresAtSubject    = new BehaviorSubject<Date | null>(null);
  private encryptionInitialized = false;

  // ── E2EE subjects (unchanged) ──────────────────────────────
  public deviceSwitchRequired$ = new Subject<string>();
  public deviceSwitchConfirmed$ = new Subject<void>();
  public deviceSwitchDeclined$  = new Subject<void>();
  public keyBackupRequired$     = new Subject<void>();

  // ── Public observables ─────────────────────────────────────
  readonly currentUser$ = this.currentUserSubject.asObservable();

  // ── Idle timeout ───────────────────────────────────────────
  private idleTimer$: Subscription | null = null;
  private readonly IDLE_EVENTS = [
    'mousemove', 'mousedown', 'keydown',
    'touchstart', 'scroll', 'click'
  ];

  // ── Proactive refresh ──────────────────────────────────────
  private refreshTimer$: Subscription | null = null;

  constructor(
    private http:          HttpClient,
    private cryptoService: CryptoService,
    private router:        Router,
    private ngZone:        NgZone
  ) {
    this.loadFromSessionStorage();
  }

  // ── Init: restore user state (no tokens in JS) ─────────────

  private loadFromSessionStorage(): void {
    // VULN-005: We NO LONGER read tokens from JS-accessible storage.
    // The server sets access_token + refresh_token as HttpOnly cookies.
    // We only persist non-sensitive user profile info in sessionStorage.
    try {
      const stored = sessionStorage.getItem('mp_user');
      if (stored) {
        const user = JSON.parse(stored) as User;
        this.currentUserSubject.next(user);
      }
      const deviceId = sessionStorage.getItem('mp_device');
      if (deviceId) this.deviceIdSubject.next(deviceId);

      const expiresAt = sessionStorage.getItem('mp_expires');
      if (expiresAt) {
        const exp = new Date(expiresAt);
        this.expiresAtSubject.next(exp);
        this.scheduleProactiveRefresh(exp);
      }
    } catch {
      this.clearLocalState();
    }
  }

  // ── Login ──────────────────────────────────────────────────

  login(userName: string, password: string, deviceName?: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiBase}/auth/login`,
      { userName, password, deviceName: deviceName ?? navigator.userAgent.substring(0, 50) },
      { withCredentials: true }   // essential: sends/receives HttpOnly cookies
    ).pipe(
      tap(async (response) => {
        this.persistSession(response);
        await this.initializeEncryption(response.user.userId);
        this.startIdleTimer();
        this.scheduleProactiveRefresh(
          new Date(Date.now() + response.expiresIn * 1000)
        );
      }),
      catchError(err => throwError(() => err))
    );
  }

  // ── Register ───────────────────────────────────────────────

  register(userName: string, displayName: string, emailId: string, password: string): Observable<any> {
    return this.http.post<any>(
      `${this.apiBase}/auth/register`,
      { userName, displayName, emailId, password },
      { withCredentials: true }
    );
  }

  // ── Logout (current device) ────────────────────────────────

  logout(): Observable<any> {
    return this.http.post(
      `${this.apiBase}/auth/logout`,
      {},
      { withCredentials: true }
    ).pipe(
      tap(() => this.handleLogout()),
      catchError(err => {
        this.handleLogout();
        return throwError(() => err);
      })
    );
  }

  // ── Global Logout (all devices) ────────────────────────────

  globalLogout(): Observable<any> {
    return this.http.post(
      `${this.apiBase}/auth/logout/all`,
      {},
      { withCredentials: true }
    ).pipe(
      tap(() => this.handleLogout()),
      catchError(err => {
        this.handleLogout();
        return throwError(() => err);
      })
    );
  }

  // ── Refresh (called by interceptor on 401) ─────────────────

  refresh(): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiBase}/auth/refresh`,
      {},
      { withCredentials: true }   // sends refresh_token cookie
    ).pipe(
      tap((response) => {
        this.persistSession(response);
        this.scheduleProactiveRefresh(
          new Date(Date.now() + response.expiresIn * 1000)
        );
      })
    );
  }

  // ── Sessions ───────────────────────────────────────────────

  getSessions(): Observable<SessionInfo[]> {
    return this.http.get<SessionInfo[]>(
      `${this.apiBase}/auth/sessions`,
      { withCredentials: true }
    );
  }

  revokeSession(familyId: string): Observable<any> {
    return this.http.delete(
      `${this.apiBase}/auth/sessions/${familyId}`,
      { withCredentials: true }
    );
  }

  // ── Getters ────────────────────────────────────────────────

  getCurrentUser(): User | null       { return this.currentUserSubject.value; }
  getCurrentUserId(): string | null   { return this.currentUserSubject.value?.userId ?? null; }
  getDeviceId(): string | null        { return this.deviceIdSubject.value; }

  // VULN-005: No getToken() — token lives in HttpOnly cookie, not accessible to JS
  // Angular interceptor uses withCredentials: true for all requests instead.

  isAuthenticated(): boolean {
    return !!this.currentUserSubject.value
        && !!this.expiresAtSubject.value
        && this.expiresAtSubject.value > new Date();
  }

  setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
    sessionStorage.setItem('mp_user', JSON.stringify(user));
  }

  // ── Idle Timer (VULN-027: 10-min inactivity logout) ────────

  private startIdleTimer(): void {
    this.stopIdleTimer();
    this.ngZone.runOutsideAngular(() => {
      const reset = () => this.ngZone.run(() => this.resetIdleTimer());
      this.IDLE_EVENTS.forEach(e => document.addEventListener(e, reset, { passive: true }));
      this.resetIdleTimer();
    });
  }

  private resetIdleTimer(): void {
    this.idleTimer$?.unsubscribe();
    this.idleTimer$ = timer(IDLE_TIMEOUT_MS).subscribe(() => {
      console.warn('[Auth] Idle timeout — logging out');
      this.logout().subscribe();
    });
  }

  private stopIdleTimer(): void {
    this.idleTimer$?.unsubscribe();
    this.idleTimer$ = null;
    this.IDLE_EVENTS.forEach(e =>
      document.removeEventListener(e, this.resetIdleTimer.bind(this)));
  }

  // ── Proactive Token Refresh ────────────────────────────────

  private scheduleProactiveRefresh(expiresAt: Date): void {
    this.refreshTimer$?.unsubscribe();
    const msUntilRefresh = expiresAt.getTime() - Date.now() - REFRESH_AHEAD_MS;
    if (msUntilRefresh <= 0) return;

    this.refreshTimer$ = timer(msUntilRefresh).pipe(
      switchMap(() => this.refresh().pipe(catchError(() => EMPTY)))
    ).subscribe();
  }

  // ── Internal helpers ───────────────────────────────────────

  private persistSession(response: LoginResponse): void {
    this.currentUserSubject.next(response.user);
    this.deviceIdSubject.next(response.deviceId);
    const expiresAt = new Date(Date.now() + response.expiresIn * 1000);
    this.expiresAtSubject.next(expiresAt);
    // Only non-sensitive data in sessionStorage
    sessionStorage.setItem('mp_user',    JSON.stringify(response.user));
    sessionStorage.setItem('mp_device',  response.deviceId);
    sessionStorage.setItem('mp_expires', expiresAt.toISOString());
  }

  private handleLogout(): void {
    this.stopIdleTimer();
    this.refreshTimer$?.unsubscribe();
    this.clearLocalState();
    this.router.navigate(['/auth']);
  }

  private clearLocalState(): void {
    this.currentUserSubject.next(null);
    this.deviceIdSubject.next(null);
    this.expiresAtSubject.next(null);
    this.encryptionInitialized = false;
    sessionStorage.removeItem('mp_user');
    sessionStorage.removeItem('mp_device');
    sessionStorage.removeItem('mp_expires');
  }

  forceLogout(): void {
    this.handleLogout();
  }

  // ── E2EE (unchanged logic, token reference removed) ────────

  private async initializeEncryption(userId: string): Promise<void> {
    if (this.encryptionInitialized) return;
    try {
      const hasKey = await this.cryptoService.hasKeyForUser(userId);
      if (!hasKey) {
        const isNew = await this.isNewUser(userId);
        if (isNew)
          await this.generateAndRegisterKeys(userId);
        else
          this.deviceSwitchRequired$.next(userId);
      }
      this.encryptionInitialized = true;
    } catch (err) {
      console.error('[E2EE] initializeEncryption failed:', err);
    }
  }

  private async isNewUser(userId: string): Promise<boolean> {
    try {
      const keys = await this.http.post<{ userId: string; publicKeyJwk: string }[]>(
        `${this.apiBase}/user/public-keys`,
        { userIds: [userId] },
        { withCredentials: true }
      ).toPromise();
      return !keys || keys.length === 0 || !keys[0]?.publicKeyJwk;
    } catch { return true; }
  }

  async confirmDeviceSwitch(userId: string): Promise<void> {
    await this.generateAndRegisterKeys(userId);
    this.encryptionInitialized = true;
    this.deviceSwitchConfirmed$.next();
  }

  declineDeviceSwitch(): void { this.deviceSwitchDeclined$.next(); }

  private async generateAndRegisterKeys(userId: string): Promise<void> {
    const { publicKeyJwk, privateKeyJwk } = await this.cryptoService.generateKeyPair();
    await this.cryptoService.replacePrivateKey(userId, privateKeyJwk);
    await this.registerPublicKey(JSON.stringify(publicKeyJwk));
    this.keyBackupRequired$.next();
  }

  private async registerPublicKey(publicKeyJwk: string): Promise<void> {
    await this.http.post(
      `${this.apiBase}/user/public-key`,
      { publicKeyJwk },
      { withCredentials: true }
    ).toPromise();
  }

  async confirmDeviceSwitchAfterRestore(userId: string): Promise<void> {
    this.encryptionInitialized = true;
    try {
      const privateJwk = await this.cryptoService.getPrivateKeyJwk(userId);
      if (!privateJwk) {
        await this.generateAndRegisterKeys(userId);
      } else {
        const publicJwk = await this.cryptoService.derivePublicJwkFromPrivate(privateJwk);
        await this.registerPublicKey(JSON.stringify(publicJwk));
      }
      this.deviceSwitchConfirmed$.next();
    } catch {
      this.encryptionInitialized = false;
      await this.generateAndRegisterKeys(userId);
      this.encryptionInitialized = true;
      this.deviceSwitchConfirmed$.next();
    }
  }

  ngOnDestroy(): void {
    this.stopIdleTimer();
    this.refreshTimer$?.unsubscribe();
  }
}
