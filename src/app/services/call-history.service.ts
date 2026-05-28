// src/app/services/call-history.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { environment } from '../../env/env';
import { CallHistoryEntry } from '../models/call-history.model';

@Injectable({ providedIn: 'root' })
export class CallHistoryService {
  private readonly baseUrl = environment.apiUrl;

  // Local cache so the view re-renders instantly when a new call ends
  private _history$ = new BehaviorSubject<CallHistoryEntry[]>([]);
  public  history$  = this._history$.asObservable();

  constructor(private http: HttpClient) {}

  /** Fetch full history from the server and cache it. */
  loadHistory(): Observable<CallHistoryEntry[]> {
    return this.http
      .get<CallHistoryEntry[]>(`${this.baseUrl}/calls/history`)
      .pipe(tap(entries => this._history$.next(entries)));
  }

  /**
   * Called by CallService when a call ends so the Calls tab
   * refreshes without the user having to navigate away and back.
   */
  refresh(): void {
    this.loadHistory().subscribe();
  }

  get snapshot(): CallHistoryEntry[] {
    return this._history$.value;
  }
}