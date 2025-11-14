import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { LoginResponse, User } from '../models/chat.models';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private apiBase = 'https://localhost:7006/api';
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  private tokenSubject = new BehaviorSubject<string | null>(null);

  currentUser$ = this.currentUserSubject.asObservable();
  token$ = this.tokenSubject.asObservable();

  constructor(private http: HttpClient) {}

  login(userName: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(`${this.apiBase}/auth/login`, {
      userName,
      password
    }).pipe(
      tap(response => {
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

logout(): Observable<any> {
  return this.http.post(`${this.apiBase}/auth/logout`, {})
    .pipe(
      tap(() => {
        this.currentUserSubject.next(null);
        this.tokenSubject.next(null);
      })
    );
}

}