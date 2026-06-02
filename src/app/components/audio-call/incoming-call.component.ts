// ============================================================
// src/app/components/audio-call/incoming-call.component.ts
// Incoming call notification banner — works for audio + video
// ============================================================
import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CallService, IncomingCallEvent } from '../../services/call.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-incoming-call',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="incoming-call-banner" *ngIf="incoming">

      <!-- Ringing animation + avatar -->
      <div class="ring-wrapper">
        <div class="ring-anim"></div>
        <div class="avatar-sm">
          <img *ngIf="incoming.callerPhoto" [src]="incoming.callerPhoto" alt="avatar" />
          <span *ngIf="!incoming.callerPhoto">{{ incoming.callerName.charAt(0).toUpperCase() }}</span>
        </div>
      </div>

      <div class="caller-info">
        <div class="caller-name">{{ incoming.callerName }}</div>
        <div class="call-type-label">
          <span *ngIf="incoming.callType === 'audio'">📞 Incoming audio call</span>
          <span *ngIf="incoming.callType === 'video'">📹 Incoming video call</span>
        </div>
      </div>

      <div class="action-btns">
        <!-- Accept -->
        <button class="accept-btn" (click)="accept()" [title]="'Accept ' + incoming.callType + ' call'">
          <svg *ngIf="incoming.callType === 'audio'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.01L6.6 10.8z"/>
          </svg>
          <svg *ngIf="incoming.callType === 'video'" viewBox="0 0 24 24" fill="currentColor">
            <path d="M23 7l-7 5 7 5V7z"/>
            <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
          </svg>
        </button>

        <!-- Decline -->
        <button class="decline-btn" (click)="decline()" title="Decline">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.01L6.6 10.8z" transform="rotate(135 12 12)"/>
          </svg>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .incoming-call-banner {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 10000;
      width: 320px;
      background: #1e1e2e;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      padding: 16px 18px;
      display: flex;
      align-items: center;
      gap: 14px;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06);
      animation: slideInRight 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    }

    @keyframes slideInRight {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);   opacity: 1; }
    }

    .ring-wrapper {
      position: relative;
      width: 48px;
      height: 48px;
      flex-shrink: 0;
    }

    .ring-anim {
      position: absolute;
      inset: -6px;
      border-radius: 50%;
      border: 2px solid rgba(72,199,142,0.6);
      animation: ringPulse 1.2s ease-out infinite;
    }

    @keyframes ringPulse {
      0%   { transform: scale(1); opacity: 1; }
      100% { transform: scale(1.5); opacity: 0; }
    }

    .avatar-sm {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4a9eff, #7c5cfc);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-size: 20px;
      font-weight: 700;
      color: #fff;
    }

    .avatar-sm img { width: 100%; height: 100%; object-fit: cover; }

    .caller-info {
      flex: 1;
      min-width: 0;
    }

    .caller-name {
      font-size: 15px;
      font-weight: 600;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .call-type-label {
      font-size: 12px;
      color: rgba(255,255,255,0.6);
      margin-top: 2px;
    }

    .action-btns {
      display: flex;
      gap: 10px;
    }

    .accept-btn,
    .decline-btn {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.15s ease, box-shadow 0.15s ease;
    }

    .accept-btn { background: #48c78e; color: #fff; }
    .decline-btn { background: #f14668; color: #fff; }

    .accept-btn:hover  { transform: scale(1.1); box-shadow: 0 4px 12px rgba(72,199,142,0.5); }
    .decline-btn:hover { transform: scale(1.1); box-shadow: 0 4px 12px rgba(241,70,104,0.5); }

    .accept-btn svg,
    .decline-btn svg { width: 20px; height: 20px; }
  `],
})
export class IncomingCallComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  incoming: IncomingCallEvent | null = null;

  constructor(
    private callService: CallService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.callService.incomingCall$
      .pipe(takeUntil(this.destroy$))
      .subscribe(event => {
        this.incoming = event;
        this.cdr.markForCheck();

        // Auto-dismiss after 30s (missed call)
        setTimeout(() => {
          if (this.incoming?.callId === event.callId) {
            this.incoming = null;
            this.cdr.markForCheck();
          }
        }, 30_000);
      });

    // Dismiss when call ends
    this.callService.callEnded$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.incoming = null;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  accept(): void {
    if (!this.incoming) return;
    const user = this.authService.getCurrentUser();
    this.callService.answerCall(this.incoming, {
      userId:   user?.userId ?? '',
      name:     user?.displayName ?? user?.userName ?? 'Me',
      photoUrl: user?.profilePhotoUrl,
    });
    this.incoming = null;
    this.cdr.markForCheck();
  }

  decline(): void {
    if (!this.incoming) return;
    this.callService.declineCall(this.incoming.callId);
    this.incoming = null;
    this.cdr.markForCheck();
  }
}