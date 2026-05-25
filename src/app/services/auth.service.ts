import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import { LoginResponse, User } from '../models/chat.models';
import { environment } from '../../env/env';
import { CryptoService } from './crypto.service';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiBase: string = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);
  private encryptionInitialized = false;

  // New subjects for device switch flow
public deviceSwitchRequired$ = new Subject<string>();   // emits userId
public deviceSwitchConfirmed$ = new Subject<void>();
public deviceSwitchDeclined$  = new Subject<void>();

  currentUser$ = this.currentUserSubject.asObservable();
  token$ = this.tokenSubject.asObservable();

  constructor(
    private http: HttpClient,
    private cryptoService: CryptoService
  ) {
    this.loadFromCookies();
  }

  // ========================================
  // INITIALIZATION
  // ========================================

  private loadFromCookies(): void {
    const token = this.getCookie('auth_token');
    const userJson = this.getCookie('current_user');

    if (token) {
      this.tokenSubject.next(token);
    }

    if (userJson) {
      try {
        const user = JSON.parse(decodeURIComponent(userJson));
        this.currentUserSubject.next(user);
      } catch (e) {
        console.error('Error parsing user from cookie:', e);
      }
    }
  }

  // ========================================
  // AUTH METHODS
  // ========================================

  login(userName: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiBase}/auth/login`, {
      userName,
      password
    }).pipe(
      tap(async response => {
        // Store auth data in cookies (expires in 8 hours to match JWT)
        this.setCookie('auth_token', response.token, 8);
        this.setCookie('current_user', encodeURIComponent(JSON.stringify(response.user)), 8);

        // Update subjects
        this.currentUserSubject.next(response.user);
        this.tokenSubject.next(response.token);

        // Initialize E2EE keys for this user on this device.
        // If they already have a key pair in IndexedDB, this is a no-op.
        // If this is a new device/first login, generates and registers keys.
        await this.initializeEncryption(response.user.userId);
      })
    );
  }

  register(userName: string, displayName: string, password: string): Observable<any> {
    return this.http.post<any>(`${this.apiBase}/auth/register`, {
      userName,
      displayName,
      password
    });
    // Note: Key generation happens on first login after register,
    // not during registration, since we need the userId from the login response.
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiBase}/auth/logout`, {}).pipe(
      tap(() => this.clearAuthData()),
      catchError(err => {
        this.clearAuthData();
        return throwError(() => err);
      })
    );
  }

  forceLogout(): void {
    this.deleteCookie('auth_token');
    this.deleteCookie('current_user');
    this.currentUserSubject.next(null);
    this.tokenSubject.next(null);
    // Note: We intentionally do NOT clear IndexedDB keys on logout.
    // The private key should persist across sessions on the same device
    // so the user doesn't need to re-register their public key every login.
  }

  // ========================================
  // E2EE INITIALIZATION
  // ========================================

  /**
   * Called after successful login.
   * Checks if a private key already exists in IndexedDB for this user/device.
   * If not, generates a new RSA key pair, stores the private key locally,
   * and registers the public key with the server.
   */
  // private async initializeEncryption(userId: string): Promise<void> {
  //   try {
  //     const existingPrivateKey = await this.cryptoService.getPrivateKey(userId);

  //     if (!existingPrivateKey) {
  //       console.log('🔐 No E2EE key found for this device — generating new key pair...');

  //       const { publicKeyJwk, privateKeyJwk } = await this.cryptoService.generateKeyPair();

  //       // Private key stays on this device only — never sent to server
  //       await this.cryptoService.storePrivateKey(userId, privateKeyJwk);

  //       // Register public key with server so others can encrypt messages to us
  //       await this.registerPublicKey(JSON.stringify(publicKeyJwk));

  //       console.log('✅ E2EE keys generated and registered successfully');
  //     } else {
  //       console.log('✅ E2EE key already exists for this device');
  //     }
  //   } catch (err) {
  //     // Encryption init failure should NOT block the user from logging in.
  //     // They'll see encrypted blobs they can't decrypt, but the app stays functional.
  //     console.error('❌ Failed to initialize E2EE keys:', err);
  //   }
  // }

  // auth.service.ts — replace initializeEncryption entirely

private async initializeEncryption(userId: string): Promise<void> {
  // Guard: only run once per session
  if (this.encryptionInitialized) {
    console.log('🔐 [E2EE] Already initialized this session, skipping');
    return;
  }

  try {
    console.log('🔐 [E2EE] Starting initializeEncryption for', userId);

    const hasKey = await this.cryptoService.hasKeyForUser(userId);
    console.log('🔐 [E2EE] hasKey on this device:', hasKey);

    if (!hasKey) {
      const isNew = await this.isNewUser(userId);
      console.log('🔐 [E2EE] isNewUser:', isNew);

      if (isNew) {
        await this.generateAndRegisterKeys(userId);
        console.log('🔐 [E2EE] Keys generated and registered ✅');
      } else {
        console.log('🔐 [E2EE] Existing user on new device — showing prompt');
        this.deviceSwitchRequired$.next(userId);
      }
    } else {
      console.log('🔐 [E2EE] Key already exists on this device ✅');
    }

    this.encryptionInitialized = true;

  } catch (err) {
    console.error('❌ [E2EE] initializeEncryption failed:', err);
  }
}

// Reset the guard on logout so next login re-initializes
private clearAuthData(): void {
  this.deleteCookie('auth_token');
  this.deleteCookie('current_user');
  this.currentUserSubject.next(null);
  this.tokenSubject.next(null);
  this.encryptionInitialized = false;  // ← reset guard
}




// Checks if the user already has a public key registered on the server.
// If yes → existing user on new device. If no → brand new user.
private async isNewUser(userId: string): Promise<boolean> {
  try {
    const token = this.tokenSubject.value;
    const keys  = await this.http.post<{ userId: string; publicKeyJwk: string }[]>(
      `${this.apiBase}/user/public-keys`,
      { userIds: [userId] },
      { headers: { Authorization: `Bearer ${token}` } }
    ).toPromise();

    // If server has no public key for this user → new user
    return !keys || keys.length === 0 || !keys[0]?.publicKeyJwk;
  } catch {
    return true; // assume new user on error — safe default
  }
}

private promptDeviceSwitch(userId: string): void {
  // Emit an event that a UI component listens to and shows the modal
  this.deviceSwitchRequired$.next(userId);
}

// Called when user confirms they want to use this device for E2EE
async confirmDeviceSwitch(userId: string): Promise<void> {
  await this.generateAndRegisterKeys(userId);
  this.encryptionInitialized = true;
  this.deviceSwitchConfirmed$.next();
}

// Called when user dismisses the modal without switching
declineDeviceSwitch(): void {
  this.deviceSwitchDeclined$.next();
  // User stays logged in but messages won't decrypt on this device
}

private async generateAndRegisterKeys(userId: string): Promise<void> {
  console.log('🔐 [E2EE] generateAndRegisterKeys called for', userId);
  const { publicKeyJwk, privateKeyJwk } = await this.cryptoService.generateKeyPair();
  await this.cryptoService.replacePrivateKey(userId, privateKeyJwk);
  await this.registerPublicKey(JSON.stringify(publicKeyJwk));
  console.log('🔐 [E2EE] generateAndRegisterKeys complete ✅');
}

  /**
   * Registers the user's RSA public key with the server.
   * The server stores this so other users can fetch it to encrypt messages.
   */
  private async registerPublicKey(publicKeyJwk: string): Promise<void> {
    const token = this.tokenSubject.value;
    if (!token) return;

    await this.http.post(
      `${this.apiBase}/user/public-key`,
      { publicKeyJwk },
      { headers: { Authorization: `Bearer ${token}` } }
    ).toPromise();
  }

  // ========================================
  // GETTERS
  // ========================================

  getToken(): string | null {
    return this.tokenSubject.value;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  getCurrentUserId(): string | null {
    return this.currentUserSubject.value?.userId ?? null;
  }

  setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
    this.setCookie('current_user', encodeURIComponent(JSON.stringify(user)), 8);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // ========================================
  // PRIVATE HELPERS
  // ========================================

  

  private setCookie(name: string, value: string, hours: number): void {
    const date = new Date();
    date.setTime(date.getTime() + hours * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${date.toUTCString()};path=/;SameSite=Strict`;
  }

  private getCookie(name: string): string | null {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let c of ca) {
      let trimmed = c.trimStart();
      if (trimmed.indexOf(nameEQ) === 0)
        return trimmed.substring(nameEQ.length);
    }
    return null;
  }

  private deleteCookie(name: string): void {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  }
}