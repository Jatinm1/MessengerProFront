// ============================================================
// src/app/components/video-call/video-call.component.ts
// Professional video call screen with screen sharing
// ============================================================
import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ViewChild,
  ElementRef,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, interval } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { CallService, ActiveCall } from '../../services/call.service';

@Component({
  selector: 'app-video-call',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Only show for video calls -->
    <ng-container *ngIf="call && call.callType === 'video'">
      <div class="vc-root" [class.controls-hidden]="controlsHidden">

        <!-- ═══ Remote video (fills the screen) ════════════════════════════ -->
        <div class="remote-video-wrap">
          <video
            #remoteVideo
            class="remote-video"
            autoplay
            playsinline
            [muted]="false"
          ></video>

          <!-- Waiting for remote video -->
          <div class="remote-placeholder" *ngIf="!remoteConnected">
            <div class="avatar-pulse">
              <div class="pulse-ring r1"></div>
              <div class="pulse-ring r2"></div>
              <div class="pulse-ring r3"></div>
              <div class="avatar-circle">
                <img *ngIf="call.remote.photoUrl" [src]="call.remote.photoUrl" alt="avatar" />
                <span *ngIf="!call.remote.photoUrl">{{ initial(call.remote.name) }}</span>
              </div>
            </div>
            <div class="waiting-text">{{ waitingText }}</div>
          </div>

          <!-- Remote video off overlay -->
          <div class="remote-video-off" *ngIf="remoteConnected && call.isPeerVideoOff">
            <div class="avatar-circle large">
              <img *ngIf="call.remote.photoUrl" [src]="call.remote.photoUrl" alt="avatar" />
              <span *ngIf="!call.remote.photoUrl">{{ initial(call.remote.name) }}</span>
            </div>
            <div class="video-off-name">{{ call.remote.name }}</div>
            <div class="video-off-label">Camera is off</div>
          </div>
        </div>

        <!-- ═══ Local video (PiP) ════════════════════════════════════════ -->
        <div
          class="local-pip"
          [class.screen-sharing]="call.isScreenSharing"
          (mousedown)="startDrag($event)"
        >
          <video
            #localVideo
            class="local-video"
            autoplay
            playsinline
            muted
          ></video>
          <div class="local-video-off" *ngIf="call.isVideoOff && !call.isScreenSharing">
            <span>{{ initial(call.local.name) }}</span>
          </div>
          <div class="pip-label" *ngIf="call.isScreenSharing">🖥 Sharing</div>
        </div>

        <!-- ═══ Status bar ═══════════════════════════════════════════════ -->
        <div class="status-bar">
          <div class="remote-name">{{ call.remote.name }}</div>
          <div class="status-detail">
            <span *ngIf="call.status !== 'connected'">{{ statusText }}</span>
            <span class="timer" *ngIf="call.status === 'connected'">{{ formatTime(elapsed) }}</span>
          </div>
          <div class="peer-badges">
            <span class="badge muted" *ngIf="call.isPeerMuted">🔇 Muted</span>
            <span class="badge video-off" *ngIf="call.isPeerVideoOff && !call.isPeerScreenSharing">📷 Camera off</span>
            <span class="badge screen" *ngIf="call.isPeerScreenSharing">🖥 Sharing screen</span>
          </div>
        </div>

        <!-- ═══ Controls ════════════════════════════════════════════════ -->
        <div class="controls-bar" (mousemove)="resetControlsHideTimer()">

          <!-- Mute -->
          <button
            class="ctrl-btn"
            [class.active]="call.isMuted"
            (click)="toggleMute()"
            [attr.aria-label]="call.isMuted ? 'Unmute' : 'Mute'"
          >
            <div class="btn-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <ng-container *ngIf="!call.isMuted">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" fill="currentColor"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </ng-container>
                <ng-container *ngIf="call.isMuted">
                  <path d="M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="12" y1="19" x2="12" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <line x1="8" y1="23" x2="16" y2="23" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                </ng-container>
              </svg>
            </div>
            <span>{{ call.isMuted ? 'Unmute' : 'Mute' }}</span>
          </button>

          <!-- Camera toggle -->
          <button
            class="ctrl-btn"
            [class.active]="call.isVideoOff"
            (click)="toggleVideo()"
            [attr.aria-label]="call.isVideoOff ? 'Start camera' : 'Stop camera'"
            [disabled]="call.isScreenSharing"
          >
            <div class="btn-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <ng-container *ngIf="!call.isVideoOff">
                  <path d="M23 7l-7 5 7 5V7z" fill="currentColor"/>
                  <rect x="1" y="5" width="15" height="14" rx="2" ry="2" fill="currentColor"/>
                </ng-container>
                <ng-container *ngIf="call.isVideoOff">
                  <path d="M1 1l22 22" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                  <path d="M16 6.5V5a2 2 0 0 0-2-2H4.5M7 5H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 1.94-1.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M16 14.5V15l7 5V7l-5 3.57" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </ng-container>
              </svg>
            </div>
            <span>{{ call.isVideoOff ? 'Start' : 'Stop' }} Cam</span>
          </button>

          <!-- Screen share -->
          <button
            class="ctrl-btn"
            [class.active]="call.isScreenSharing"
            (click)="toggleScreenShare()"
            [attr.aria-label]="call.isScreenSharing ? 'Stop sharing' : 'Share screen'"
          >
            <div class="btn-icon">
              <svg viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="14" rx="2" stroke="currentColor" stroke-width="2"/>
                <path d="M8 21h8M12 17v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
                <ng-container *ngIf="call.isScreenSharing">
                  <!-- Stop share indicator -->
                  <path d="M1 1l22 22" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </ng-container>
              </svg>
            </div>
            <span>{{ call.isScreenSharing ? 'Stop Share' : 'Share' }}</span>
          </button>

          <!-- End call -->
          <button class="ctrl-btn end-btn" (click)="endCall()" aria-label="End call">
            <div class="btn-icon">
              <svg viewBox="0 0 24 24" fill="currentColor">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.1 6.6 6.6l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.01L6.6 10.8z"/>
              </svg>
            </div>
            <span>End</span>
          </button>
        </div>

        <!-- ═══ Ended overlay ════════════════════════════════════════════ -->
        <div class="ended-overlay" *ngIf="showEnded">
          <div class="ended-icon">{{ endedIcon }}</div>
          <div class="ended-text">{{ endedText }}</div>
        </div>
      </div>
    </ng-container>
  `,
  styles: [`
    :host { display: contents; }

    /* ── Root ─────────────────────────────────────────────────────── */
    .vc-root {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: #0d0d0d;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      overflow: hidden;
      cursor: default;
    }

    /* ── Remote video ─────────────────────────────────────────────── */
    .remote-video-wrap {
      position: absolute;
      inset: 0;
    }

    .remote-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      background: #111;
    }

    /* ── Waiting / avatar placeholder ──────────────────────────────── */
    .remote-placeholder,
    .remote-video-off {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 20px;
      background: linear-gradient(160deg, #1a1a2e, #16213e, #0f3460);
      color: #fff;
    }

    .avatar-pulse { position: relative; display: flex; align-items: center; justify-content: center; }

    .pulse-ring {
      position: absolute;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,0.1);
    }
    .r1 { width: 160px; height: 160px; animation: vcpulse 2s ease-out infinite; }
    .r2 { width: 220px; height: 220px; animation: vcpulse 2s ease-out infinite 0.4s; }
    .r3 { width: 280px; height: 280px; animation: vcpulse 2s ease-out infinite 0.8s; }

    @keyframes vcpulse {
      0%   { transform: scale(1); opacity: 0.6; }
      100% { transform: scale(1.1); opacity: 0; }
    }

    .avatar-circle {
      width: 110px;
      height: 110px;
      border-radius: 50%;
      background: linear-gradient(135deg, #4a9eff, #7c5cfc);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      font-size: 42px;
      font-weight: 700;
      color: #fff;
      box-shadow: 0 0 0 4px rgba(74,158,255,0.3), 0 8px 32px rgba(0,0,0,0.4);
      z-index: 1;
    }

    .avatar-circle img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .avatar-circle.large {
      width: 140px;
      height: 140px;
      font-size: 56px;
    }

    .waiting-text {
      font-size: 16px;
      color: rgba(255,255,255,0.6);
      letter-spacing: 0.3px;
    }

    .video-off-name {
      font-size: 22px;
      font-weight: 600;
      color: #fff;
    }

    .video-off-label {
      font-size: 14px;
      color: rgba(255,255,255,0.5);
    }

    /* ── Local PiP ───────────────────────────────────────────────── */
    .local-pip {
      position: absolute;
      top: 20px;
      right: 20px;
      width: 200px;
      height: 140px;
      border-radius: 12px;
      overflow: hidden;
      background: #1a1a2e;
      border: 2px solid rgba(255,255,255,0.15);
      box-shadow: 0 8px 24px rgba(0,0,0,0.5);
      z-index: 10;
      cursor: move;
      user-select: none;
      transition: border-color 0.2s;
    }

    .local-pip.screen-sharing {
      border-color: #48c78e;
      width: 240px;
      height: 160px;
    }

    .local-pip:hover { border-color: rgba(255,255,255,0.35); }

    .local-video {
      width: 100%;
      height: 100%;
      object-fit: cover;
      transform: scaleX(-1); /* Mirror for natural selfie view */
    }

    /* Don't mirror screen share */
    .local-pip.screen-sharing .local-video {
      transform: none;
    }

    .local-video-off {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #1a1a2e;
      font-size: 40px;
      font-weight: 700;
      color: #fff;
    }

    .pip-label {
      position: absolute;
      bottom: 6px;
      left: 8px;
      font-size: 11px;
      color: #48c78e;
      font-weight: 600;
      text-shadow: 0 1px 3px rgba(0,0,0,0.8);
    }

    /* ── Status bar ──────────────────────────────────────────────── */
    .status-bar {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      padding: 20px 24px 40px;
      background: linear-gradient(to bottom, rgba(0,0,0,0.7) 0%, transparent 100%);
      color: #fff;
      z-index: 5;
      pointer-events: none;
    }

    .remote-name {
      font-size: 22px;
      font-weight: 600;
      letter-spacing: -0.3px;
      text-shadow: 0 2px 6px rgba(0,0,0,0.5);
    }

    .status-detail {
      font-size: 14px;
      color: rgba(255,255,255,0.7);
      margin-top: 4px;
    }

    .timer {
      font-variant-numeric: tabular-nums;
      font-weight: 500;
    }

    .peer-badges {
      display: flex;
      gap: 8px;
      margin-top: 8px;
      flex-wrap: wrap;
    }

    .badge {
      font-size: 12px;
      padding: 3px 10px;
      border-radius: 12px;
      font-weight: 500;
      backdrop-filter: blur(8px);
    }

    .badge.muted     { background: rgba(239,68,68,0.4);  border: 1px solid rgba(239,68,68,0.5); }
    .badge.video-off { background: rgba(107,114,128,0.4); border: 1px solid rgba(107,114,128,0.5); }
    .badge.screen    { background: rgba(72,199,142,0.4);  border: 1px solid rgba(72,199,142,0.5); }

    /* ── Controls bar ────────────────────────────────────────────── */
    .controls-bar {
      position: absolute;
      bottom: 40px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      gap: 16px;
      z-index: 10;
      padding: 16px 24px;
      background: rgba(0,0,0,0.55);
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 60px;
      backdrop-filter: blur(20px);
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      transition: opacity 0.3s ease;
    }

    .vc-root.controls-hidden .controls-bar {
      opacity: 0;
      pointer-events: none;
    }

    .ctrl-btn {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 40px;
      padding: 14px 20px;
      cursor: pointer;
      color: #fff;
      font-size: 11px;
      font-weight: 500;
      min-width: 70px;
      transition: background 0.2s, transform 0.1s, box-shadow 0.2s;
      letter-spacing: 0.2px;
    }

    .ctrl-btn:hover:not(:disabled) {
      background: rgba(255,255,255,0.2);
      transform: translateY(-2px);
      box-shadow: 0 6px 16px rgba(0,0,0,0.3);
    }

    .ctrl-btn:active:not(:disabled) { transform: translateY(0); }

    .ctrl-btn:disabled {
      opacity: 0.4;
      cursor: not-allowed;
    }

    .ctrl-btn.active {
      background: rgba(255,255,255,0.9);
      color: #1a1a2e;
      border-color: transparent;
    }

    .btn-icon {
      width: 28px;
      height: 28px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .btn-icon svg {
      width: 22px;
      height: 22px;
    }

    .ctrl-btn.end-btn {
      background: #e53e3e;
      border-color: transparent;
      color: #fff;
    }

    .ctrl-btn.end-btn:hover {
      background: #c53030;
    }

    /* ── Ended overlay ───────────────────────────────────────────── */
    .ended-overlay {
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 16px;
      background: rgba(0,0,0,0.7);
      z-index: 20;
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .ended-icon { font-size: 56px; }

    .ended-text {
      font-size: 22px;
      font-weight: 500;
      color: rgba(255,255,255,0.9);
    }
  `],
})
export class VideoCallComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('remoteVideo') remoteVideoRef!: ElementRef<HTMLVideoElement>;
  @ViewChild('localVideo')  localVideoRef!:  ElementRef<HTMLVideoElement>;

  private destroy$ = new Subject<void>();

  call: ActiveCall | null = null;
  remoteConnected = false;
  elapsed = 0;
  controlsHidden = false;
  showEnded = false;
  endedIcon = '';
  endedText = '';

  private hideControlsTimer: any = null;
  private timerSub: any = null;

  get statusText(): string {
    if (!this.call) return '';
    switch (this.call.status) {
      case 'initiating': return 'Calling...';
      case 'ringing':    return this.call.direction === 'outbound' ? 'Ringing...' : 'Incoming video call';
      case 'connecting': return 'Connecting...';
      case 'connected':  return 'Video call';
      default:           return '';
    }
  }

  get waitingText(): string {
    if (!this.call) return '';
    switch (this.call.status) {
      case 'initiating':
      case 'ringing':    return 'Calling...';
      case 'connecting': return 'Connecting...';
      default:           return 'Waiting for video...';
    }
  }

  constructor(
    private callService: CallService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Subscribe to call state
    this.callService.call$
      .pipe(takeUntil(this.destroy$))
      .subscribe(call => {
        const prev = this.call;
        this.call = call;

        if (call?.status === 'connected' && prev?.status !== 'connected') {
          this._startTimer();
          this._scheduleHideControls();
        }
        if (!call && prev) {
          this._stopTimer();
        }

        this.cdr.markForCheck();
      });

    // Subscribe to local stream changes (screen share swaps the stream)
    this.callService.localStream$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stream => {
        this._bindLocalVideo(stream);
      });

    // Subscribe to remote stream
    this.callService.remoteStream$
      .pipe(takeUntil(this.destroy$))
      .subscribe(stream => {
        this._bindRemoteVideo(stream);
        this.remoteConnected = !!stream && stream.getTracks().length > 0;
        this.cdr.markForCheck();
      });

    // Call ended event
    this.callService.callEnded$
      .pipe(takeUntil(this.destroy$))
      .subscribe(({ reason, durationSeconds }) => {
        this._showEndedOverlay(reason, durationSeconds);
      });

    // Call error event
    this.callService.callError$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this._showEndedOverlay('error', 0);
      });
  }

  ngAfterViewInit(): void {
    // In case streams arrived before view was ready (race condition guard)
    this.callService.localStream$.pipe(takeUntil(this.destroy$)).subscribe(s => this._bindLocalVideo(s));
    this.callService.remoteStream$.pipe(takeUntil(this.destroy$)).subscribe(s => this._bindRemoteVideo(s));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this._stopTimer();
    clearTimeout(this.hideControlsTimer);
  }

  // ── Controls ───────────────────────────────────────────────────────────

  toggleMute():        void { this.callService.toggleMute(); }
  toggleVideo():       void { this.callService.toggleVideo(); }
  toggleScreenShare(): void {
    if (this.call?.isScreenSharing) {
      this.callService.stopScreenShare();
    } else {
      this.callService.startScreenShare();
    }
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

  // ── Helpers ────────────────────────────────────────────────────────────

  initial(name: string): string {
    return name?.charAt(0)?.toUpperCase() ?? '?';
  }

  formatTime(sec: number): string {
    const m = Math.floor(sec / 60).toString().padStart(2, '0');
    const s = (sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  resetControlsHideTimer(): void {
    this.controlsHidden = false;
    this._scheduleHideControls();
    this.cdr.markForCheck();
  }

  // ── Drag PiP ──────────────────────────────────────────────────────────

  startDrag(event: MouseEvent): void {
    const pip = (event.currentTarget as HTMLElement);
    const startX = event.clientX - pip.getBoundingClientRect().left;
    const startY = event.clientY - pip.getBoundingClientRect().top;

    const onMove = (e: MouseEvent) => {
      const parent = pip.parentElement!.getBoundingClientRect();
      let x = e.clientX - parent.left - startX;
      let y = e.clientY - parent.top  - startY;
      // Clamp to screen
      x = Math.max(0, Math.min(x, parent.width  - pip.offsetWidth));
      y = Math.max(0, Math.min(y, parent.height - pip.offsetHeight));
      pip.style.left  = `${x}px`;
      pip.style.top   = `${y}px`;
      pip.style.right = 'auto';
    };

    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup',   onUp);
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onUp);
  }

  // ── Private ────────────────────────────────────────────────────────────

  private _bindLocalVideo(stream: MediaStream | null): void {
    if (!this.localVideoRef?.nativeElement) return;
    const el = this.localVideoRef.nativeElement;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
    }
  }

  private _bindRemoteVideo(stream: MediaStream | null): void {
    if (!this.remoteVideoRef?.nativeElement) return;
    const el = this.remoteVideoRef.nativeElement;
    if (el.srcObject !== stream) {
      el.srcObject = stream;
      if (stream) {
        // Force play (needed on some browsers after srcObject assignment)
        el.play().catch(e => console.warn('[VideoCall] remote video play() failed', e));
      }
    }
  }

  private _startTimer(): void {
    this.elapsed = 0;
    this.timerSub = interval(1000)
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.elapsed++;
        this.cdr.markForCheck();
      });
  }

  private _stopTimer(): void {
    this.timerSub?.unsubscribe();
    this.timerSub = null;
  }

  private _scheduleHideControls(): void {
    clearTimeout(this.hideControlsTimer);
    this.hideControlsTimer = setTimeout(() => {
      this.controlsHidden = true;
      this.cdr.markForCheck();
    }, 4000);
  }

  private _showEndedOverlay(reason: string, duration: number): void {
    const map: Record<string, { icon: string; text: string }> = {
      declined:     { icon: '❌', text: 'Call declined'       },
      busy:         { icon: '⚠️', text: 'User is busy'        },
      missed:       { icon: '📵', text: 'No answer'            },
      disconnected: { icon: '📵', text: 'Call ended'           },
      error:        { icon: '⚠️', text: 'Connection failed'    },
      ended:        { icon: '📵', text: duration > 0 ? `Call ended · ${this.formatTime(duration)}` : 'Call ended' },
    };
    const m = map[reason] ?? map['ended'];
    this.endedIcon = m.icon;
    this.endedText = m.text;
    this.showEnded = true;
    this.cdr.markForCheck();

    setTimeout(() => {
      this.showEnded = false;
      this.cdr.markForCheck();
    }, 3000);
  }
}