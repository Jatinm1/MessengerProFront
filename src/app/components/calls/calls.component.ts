// src/app/components/calls/calls.component.ts
import {
  Component, OnInit, OnDestroy,
  ChangeDetectionStrategy, ChangeDetectorRef
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { CallHistoryService } from '../../services/call-history.service';
import { AuthService }        from '../../services/auth.service';
import { CallHistoryEntry }   from '../../models/call-history.model';

@Component({
  selector: 'app-calls',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="calls-page">

      <!-- ── Header ── -->
      <div class="calls-header">
        <div class="header-title">
          <svg class="header-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24
                     1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1
                     C9.61 21 3 14.39 3 6c0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1
                     0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.01L6.6 10.8z"
                  fill="currentColor"/>
          </svg>
          <span>Call History</span>
        </div>
        <button class="refresh-btn" (click)="reload()" [class.spinning]="loading" title="Refresh">
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0
                     a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

      <!-- ── Loading ── -->
      <div class="loading-state" *ngIf="loading && entries.length === 0">
        <div class="spinner"></div>
        <span>Loading calls...</span>
      </div>

      <!-- ── Empty ── -->
      <div class="empty-state" *ngIf="!loading && entries.length === 0">
        <div class="empty-icon">📵</div>
        <div class="empty-title">No calls yet</div>
        <div class="empty-sub">Your call history will appear here.</div>
      </div>

      <!-- ── List ── -->
      <div class="calls-list" *ngIf="entries.length > 0">
        <div
          *ngFor="let entry of entries; trackBy: trackById"
          class="call-row"
          [class.missed]="isMissed(entry)"
          [class.declined]="entry.reason === 'declined'">

          <!-- Avatar -->
          <div class="avatar">
            <img
              *ngIf="getPeer(entry).photoUrl"
              [src]="getPeer(entry).photoUrl"
              alt="avatar"
              class="avatar-img"/>
            <span *ngIf="!getPeer(entry).photoUrl" class="avatar-initial">
              {{ getPeer(entry).name.charAt(0).toUpperCase() }}
            </span>
          </div>

          <!-- Info -->
          <div class="call-info">
            <div class="peer-name">{{ getPeer(entry).name }}</div>
            <div class="call-meta">
              <span class="direction-icon" [title]="getDirectionLabel(entry)">
                {{ getDirectionIcon(entry) }}
              </span>
              <span class="reason-label" [class]="'reason-' + entry.reason">
                {{ getReasonLabel(entry) }}
              </span>
            </div>
          </div>

          <!-- Duration + Date -->
          <div class="call-right">
            <div class="call-date">{{ formatDate(entry.startedAt) }}</div>
            <div class="call-duration" *ngIf="entry.durationSeconds > 0">
              {{ formatDuration(entry.durationSeconds) }}
            </div>
            <div class="call-duration no-duration" *ngIf="entry.durationSeconds === 0">
              —
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: flex; flex-direction: column; height: 100vh; overflow: hidden; }

    .calls-page {
      display: flex;
      flex-direction: column;
      height: 100%;
      background: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    /* ── Header ─────────────────────────────────────────────────── */
    .calls-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px;
      height: 70px;
      background: #2a74f5;
      color: #fff;
      flex-shrink: 0;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .header-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .header-icon {
      width: 22px;
      height: 22px;
      flex-shrink: 0;
    }

    .refresh-btn {
      width: 36px;
      height: 36px;
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    }

    .refresh-btn:hover { background: rgba(255,255,255,0.25); }

    .refresh-btn svg {
      width: 16px;
      height: 16px;
    }

    .refresh-btn.spinning svg {
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Loading / Empty ─────────────────────────────────────────── */
    .loading-state,
    .empty-state {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      color: #94a3b8;
    }

    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid #e2e8f0;
      border-top-color: #2a74f5;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }

    .empty-icon { font-size: 3rem; }

    .empty-title {
      font-size: 1.1rem;
      font-weight: 600;
      color: #475569;
    }

    .empty-sub {
      font-size: 0.875rem;
      color: #94a3b8;
    }

    /* ── List ────────────────────────────────────────────────────── */
    .calls-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .call-row {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 12px 14px;
      border-radius: 12px;
      margin: 2px 0;
      cursor: default;
      transition: background 0.15s;
      border: 1px solid transparent;
    }

    .call-row:hover {
      background: #fff;
      border-color: #e2e8f0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.06);
    }

    /* Red tint for missed/declined */
    .call-row.missed  { background: rgba(254,226,226,0.4); }
    .call-row.declined { background: rgba(254,226,226,0.25); }
    .call-row.missed:hover,
    .call-row.declined:hover { background: rgba(254,226,226,0.6); border-color: #fca5a5; }

    /* ── Avatar ─────────────────────────────────────────────────── */
    .avatar {
      width: 46px;
      height: 46px;
      border-radius: 50%;
      background: linear-gradient(135deg, #2a74f5, #6366f1);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      overflow: hidden;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-initial {
      font-size: 1.1rem;
      font-weight: 700;
      color: #fff;
    }

    /* ── Info ────────────────────────────────────────────────────── */
    .call-info {
      flex: 1;
      min-width: 0;
    }

    .peer-name {
      font-size: 0.95rem;
      font-weight: 600;
      color: #1e293b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .call-meta {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 3px;
    }

    .direction-icon {
      font-size: 0.75rem;
    }

    .reason-label {
      font-size: 0.8rem;
      font-weight: 500;
      color: #64748b;
    }

    .reason-missed,
    .reason-declined { color: #ef4444 !important; font-weight: 600; }

    .reason-busy      { color: #f59e0b !important; }

    /* ── Right column ────────────────────────────────────────────── */
    .call-right {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 4px;
      flex-shrink: 0;
    }

    .call-date {
      font-size: 0.75rem;
      color: #94a3b8;
      font-weight: 500;
      white-space: nowrap;
    }

    .call-duration {
      font-size: 0.78rem;
      color: #64748b;
      font-weight: 500;
      font-variant-numeric: tabular-nums;
      background: #f1f5f9;
      padding: 2px 8px;
      border-radius: 10px;
    }

    .call-duration.no-duration { color: #cbd5e1; background: none; }

    /* ── Scrollbar ───────────────────────────────────────────────── */
    .calls-list::-webkit-scrollbar        { width: 6px; }
    .calls-list::-webkit-scrollbar-track  { background: transparent; }
    .calls-list::-webkit-scrollbar-thumb  { background: #cbd5e1; border-radius: 10px; }
    .calls-list::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
  `]
})
export class CallsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  entries: CallHistoryEntry[] = [];
  loading = false;
  private currentUserId = '';

  constructor(
    private callHistoryService: CallHistoryService,
    private authService:        AuthService,
    private cdr:                ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.currentUserId = this.authService.getCurrentUserId() ?? '';

    // Subscribe to cached stream — updates automatically when a call ends
    this.callHistoryService.history$
      .pipe(takeUntil(this.destroy$))
      .subscribe(entries => {
        this.entries = entries;
        this.loading = false;
        this.cdr.markForCheck();
      });

    this.reload();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  reload(): void {
    this.loading = true;
    this.cdr.markForCheck();
    this.callHistoryService.loadHistory()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next:  ()  => { this.loading = false; this.cdr.markForCheck(); },
        error: ()  => { this.loading = false; this.cdr.markForCheck(); }
      });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  trackById(_: number, e: CallHistoryEntry): string { return e.callId; }

  /** Returns the other person in the call (not the current user). */
  getPeer(entry: CallHistoryEntry): { name: string; photoUrl?: string } {
    const isCaller = entry.callerId === this.currentUserId;
    return {
      name:     isCaller ? entry.calleeDisplayName : entry.callerDisplayName,
      photoUrl: isCaller ? entry.calleePhotoUrl    : entry.callerPhotoUrl,
    };
  }

  isInbound(entry: CallHistoryEntry): boolean {
    return entry.calleeId === this.currentUserId;
  }

  isMissed(entry: CallHistoryEntry): boolean {
    return this.isInbound(entry) && (entry.reason === 'missed' || entry.reason === 'disconnected') && entry.durationSeconds === 0;
  }

  getDirectionIcon(entry: CallHistoryEntry): string {
    if (entry.reason === 'declined') return '🚫';
    if (this.isMissed(entry))        return '📵';
    return this.isInbound(entry)     ? '📲' : '📞';
  }

  getDirectionLabel(entry: CallHistoryEntry): string {
    if (this.isMissed(entry))    return 'Missed';
    return this.isInbound(entry) ? 'Incoming' : 'Outgoing';
  }

  getReasonLabel(entry: CallHistoryEntry): string {
    if (this.isMissed(entry)) return 'Missed';
    const labels: Record<string, string> = {
      ended:        this.isInbound(entry) ? 'Incoming' : 'Outgoing',
      declined:     'Declined',
      busy:         'Busy',
      disconnected: 'Disconnected',
      error:        'Failed',
      missed:       'Missed',
    };
    return labels[entry.reason] ?? entry.reason;
  }

  formatDuration(seconds: number): string {
    if (seconds < 60)  return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }

  formatDate(iso: string): string {
    const d   = new Date(iso);
    const now = new Date();
    const diffMs  = now.getTime() - d.getTime();
    const diffDay = Math.floor(diffMs / 86_400_000);

    if (diffDay === 0 && d.getDate() === now.getDate()) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDay <= 1) return 'Yesterday';
    if (diffDay < 7)  return d.toLocaleDateString([], { weekday: 'short' });
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}