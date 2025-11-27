import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoginResponse, User } from '../models/chat.models';
import { environment } from '../../env/env';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiBase: string = environment.apiUrl;
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();
  token$ = this.tokenSubject.asObservable();

  constructor(private http: HttpClient) {
    // Load token and user from cookies on initialization
    this.loadFromCookies();
  }

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

  login(userName: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiBase}/auth/login`, {
      userName,
      password
    }).pipe(
      tap(response => {
        // Store in cookies (expires in 8 hours to match JWT)
        this.setCookie('auth_token', response.token, 8);
        this.setCookie('current_user', encodeURIComponent(JSON.stringify(response.user)), 8);
        
        // Update subjects
        this.currentUserSubject.next(response.user);
        this.tokenSubject.next(response.token);
      })
    );
  }

  getToken(): string | null {
    return this.tokenSubject.value;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  setCurrentUser(user: User): void {
    this.currentUserSubject.next(user);
    this.setCookie('current_user', encodeURIComponent(JSON.stringify(user)), 8);
  }

  logout(): Observable<any> {
    return this.http.post(`${this.apiBase}/auth/logout`, {})
      .pipe(
        tap(() => {
          // Clear cookies
          this.deleteCookie('auth_token');
          this.deleteCookie('current_user');
          
          // Clear subjects
          this.currentUserSubject.next(null);
          this.tokenSubject.next(null);
        })
      );
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  // Cookie utility methods
  private setCookie(name: string, value: string, hours: number): void {
    const date = new Date();
    date.setTime(date.getTime() + (hours * 60 * 60 * 1000));
    const expires = `expires=${date.toUTCString()}`;
    document.cookie = `${name}=${value};${expires};path=/;SameSite=Strict`;
  }

  private getCookie(name: string): string | null {
    const nameEQ = name + '=';
    const ca = document.cookie.split(';');
    for (let i = 0; i < ca.length; i++) {
      let c = ca[i];
      while (c.charAt(0) === ' ') c = c.substring(1, c.length);
      if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
    }
    return null;
  }

  private deleteCookie(name: string): void {
    document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
  }
}