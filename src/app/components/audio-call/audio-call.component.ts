// ========================================
// src/app/components/audio-call/audio-call.component.ts
// MS Teams-style calling screen
// ========================================
import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Input,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CallService, ActiveCall } from '../../services/call.service';

@Component({
  selector: 'app-audio-call',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="call-overlay" *ngIf="call" [class.connected]="call.status === 'connected'">
      <!-- Blurred background -->
      <div class="call-bg">
        <div
          class="avatar-bg"
          [class.pulse]="call.status === 'ringing' || call.status === 'initiating'"
        >
          <div class="avatar-ring ring-3"></div>
          <div class="avatar-ring ring-2"></div>
          <div class="avatar-ring ring-1"></div>
          <div class="avatar-circle">
            <img
              *ngIf="call.remote.photoUrl"
              [src]="call.remote.photoUrl"
              class="avatar-img"
              alt="avatar"
            />
            <span *ngIf="!call.remote.photoUrl" class="avatar-initials">
              {{ getInitial(call.remote.name) }}
            </span>
          </div>
        </div>
      </div>

      <!-- Call info -->
      <div class="call-info">
        <div class="peer-name">{{ call.remote.name }}</div>
        <div class="call-status-text">{{ getStatusText(call) }}</div>
        <div class="call-timer" *ngIf="call.status === 'connected'">
          {{ formatDuration(elapsedSeconds) }}
        </div>
      </div>

      <!-- Peer muted indicator -->
      <div class="peer-muted-badge" *ngIf="call.isPeerMuted && call.status === 'connected'">
        <span class="muted-icon">🔇</span>
        <span>{{ call.remote.name }} is muted</span>
      </div>

      <!-- Controls -->
      <div class="call-controls" *ngIf="call.status === 'connected' || call.status === 'connecting' || call.status === 'ringing'">
        <!-- Mute button -->
        <button
          class="ctrl-btn mute-btn"
          [class.active]="call.isMuted"
          (click)="toggleMute()"
          [title]="call.isMuted ? 'Unmute' : 'Mute'"
          *ngIf="call.status === 'connected' || call.status === 'connecting'"
        >
          <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <ng-container *ngIf="!call.isMuted">
              <!-- Mic on -->
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor"/>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </ng-container>
            <ng-container *ngIf="call.isMuted">
              <!-- Mic off with slash -->
              <path d="M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
              <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </ng-container>
          </svg>
          <span>{{ call.isMuted ? 'Unmute' : 'Mute' }}</span>
        </button>

        <!-- End call button -->
        <button class="ctrl-btn end-btn" (click)="endCall()" title="End call">
          <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
            <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.01L6.6 10.8z"/>
          </svg>
          <span>{{ call.direction === 'inbound' && call.status === 'ringing' ? 'Decline' : 'End' }}</span>
        </button>
      </div>

      <!-- Status: ended/declined/error/busy/missed -->
      <div class="call-ended-overlay" *ngIf="showEndedMessage">
        <div class="ended-icon">{{ endedIcon }}</div>
        <div class="ended-text">{{ endedMessage }}</div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .call-overlay {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: linear-gradient(160deg, #1a1a2e 0%, #16213e 40%, #0f3460 100%);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      user-select: none;
    }

    /* ── Background avatar ──────────────────────────────────────── */
    .call-bg {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar-bg {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .avatar-ring {
      position: absolute;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.1);
      animation: none;
      transition: all 0.3s ease;
    }

    .ring-1 { width: 180px; height: 180px; }
    .ring-2 { width: 260px; height: 260px; }
    .ring-3 { width: 340px; height: 340px; }

    .avatar-bg.pulse .ring-1 { animation: pulse 2s ease-out infinite; }
    .avatar-bg.pulse .ring-2 { animation: pulse 2s ease-out infinite 0.4s; }
    .avatar-bg.pulse .ring-3 { animation: pulse 2s ease-out infinite 0.8s; }

    @keyframes pulse {
      0%   { transform: scale(1); opacity: 0.6; border-color: rgba(99,179,237,0.5); }
      60%  { transform: scale(1.05); opacity: 0.3; border-color: rgba(99,179,237,0.3); }
      100% { transform: scale(1.1); opacity: 0; border-color: transparent; }
    }

    .avatar-circle {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4a9eff, #7c5cfc);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      box-shadow: 0 0 0 4px rgba(74,158,255,0.3), 0 8px 32px rgba(0,0,0,0.4);
      position: relative;
      z-index: 1;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-initials {
      font-size: 48px;
      font-weight: 700;
      color: #fff;
      text-transform: uppercase;
    }

    /* ── Call info ─────────────────────────────────────────────── */
    .call-info {
      position: relative;
      z-index: 2;
      text-align: center;
      margin-top: 200px;
    }

    .peer-name {
      font-size: 28px;
      font-weight: 600;
      letter-spacing: -0.5px;
      margin-bottom: 8px;
      text-shadow: 0 2px 8px rgba(0,0,0,0.4);
    }

    .call-status-text {
      font-size: 15px;
      color: rgba(255,255,255,0.7);
      letter-spacing: 0.3px;
    }

    .call-timer {
      font-size: 22px;
      font-weight: 500;
      margin-top: 6px;
      font-variant-numeric: tabular-nums;
      color: rgba(255,255,255,0.9);
      letter-spacing: 1px;
    }

    /* ── Peer muted badge ──────────────────────────────────────── */
    .peer-muted-badge {
      position: absolute;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: rgba(0,0,0,0.5);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 20px;
      padding: 6px 14px;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      color: rgba(255,255,255,0.8);
      backdrop-filter: blur(8px);
      z-index: 10;
    }

    /* ── Controls ──────────────────────────────────────────────── */
    .call-controls {
      position: absolute;
      bottom: 60px;
      display: flex;
      gap: 24px;
      z-index: 10;
    }

    .ctrl-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      background: rgba(255,255,255,0.12);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 50px;
      padding: 18px 28px;
      cursor: pointer;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.2s ease, transform 0.1s ease, box-shadow 0.2s ease;
      backdrop-filter: blur(12px);
      min-width: 80px;
    }

    .ctrl-btn:hover {
      background: rgba(255,255,255,0.2);
      transform: translateY(-2px);
      box-shadow: 0 8px 20px rgba(0,0,0,0.3);
    }

    .ctrl-btn:active {
      transform: translateY(0);
    }

    .ctrl-btn svg {
      width: 26px;
      height: 26px;
    }

    /* Muted state */
    .ctrl-btn.mute-btn.active {
      background: rgba(255,255,255,0.9);
      color: #1a1a2e;
      border-color: transparent;
    }

    /* End call */
    .ctrl-btn.end-btn {
      background: #e53e3e;
      border-color: transparent;
    }

    .ctrl-btn.end-btn:hover {
      background: #c53030;
    }

    /* ── Ended overlay ─────────────────────────────────────────── */
    .call-ended-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 12px;
      background: rgba(0,0,0,0.6);
      z-index: 20;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; }
      to   { opacity: 1; }
    }

    .ended-icon { font-size: 52px; }

    .ended-text {
      font-size: 20px;
      font-weight: 500;
      color: rgba(255,255,255,0.9);
    }
  `],
})
export class AudioCallComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  call: ActiveCall | null = null;
  elapsedSeconds = 0;
  showEndedMessage = false;
  endedMessage = '';
  endedIcon = '';

  private timerSub: any = null;

  constructor(
    private callService: CallService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.callService.call$
      .pipe(takeUntil(this.destroy$))
      .subscribe((call) => {
        const prev = this.call;
        this.call = call;

        if (call?.status === 'connected' && prev?.status !== 'connected') {
          this.startTimer();
        }

        if (!call && prev) {
          this.stopTimer();
        }

        this.cdr.markForCheck();
      });

    this.callService.callEnded$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ reason, durationSeconds }) => {
        this.showEndedOverlay(reason, durationSeconds);
      });

    this.callService.callError$
      .pipe(takeUntil(this.destroy$))
      .subscribe((msg) => {
        this.showEndedOverlay('error', 0);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopTimer();
  }

  // ── Handlers ─────────────────────────────────────────────────────────────

  toggleMute(): void {
    this.callService.toggleMute();
  }

  endCall(): void {
    const call = this.call;
    if (!call) return;

    if (call.direction === 'inbound' && call.status === 'ringing') {
      this.callService.declineCall(call.callId);
    } else {
      this.callService.endCall();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getInitial(name: string): string {
    return name?.charAt(0)?.toUpperCase() ?? '?';
  }

  getStatusText(call: ActiveCall): string {
    switch (call.status) {
      case 'initiating': return 'Calling...';
      case 'ringing':    return call.direction === 'outbound' ? 'Ringing...' : 'Incoming call';
      case 'connecting': return 'Connecting...';
      case 'connected':  return 'Audio call';
      case 'ended':      return 'Call ended';
      case 'declined':   return 'Call declined';
      case 'busy':       return 'User is busy';
      case 'missed':     return 'Missed call';
      case 'error':      return 'Connection failed';
      default:           return '';
    }
  }

  formatDuration(seconds: number): string {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  private startTimer(): void {
    this.elapsedSeconds = 0;
    this.timerSub = interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.elapsedSeconds++;
        this.cdr.markForCheck();
      });
  }

  private stopTimer(): void {
    if (this.timerSub) {
      this.timerSub.unsubscribe();
      this.timerSub = null;
    }
  }

  private showEndedOverlay(reason: string, duration: number): void {
    const messages: Record<string, { icon: string; text: string }> = {
      declined:     { icon: '❌', text: 'Call declined' },
      busy:         { icon: '⚠️', text: 'User is busy' },
      missed:       { icon: '📵', text: 'No answer' },
      disconnected: { icon: '📵', text: 'Call ended' },
      error:        { icon: '⚠️', text: 'Connection failed' },
      ended:        { icon: '📵', text: duration > 0 ? `Call ended · ${this.formatDuration(duration)}` : 'Call ended' },
    };

    const m = messages[reason] ?? messages['ended'];
    this.endedIcon = m.icon;
    this.endedMessage = m.text;
    this.showEndedMessage = true;
    this.cdr.markForCheck();

    setTimeout(() => {
      this.showEndedMessage = false;
      this.cdr.markForCheck();
    }, 3000);
  }
}