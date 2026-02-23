// src/app/components/call/active-call/active-call.component.ts

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallSession, CallParticipant, CallStateUpdate } from '../../../models/call.models';
import { WebRTCService } from '../../../services/webrtc.service';
import { CallService } from '../../../services/call.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-active-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './active-call.component.html',
  styleUrls: ['./active-call.component.css']
})
export class ActiveCallComponent implements OnInit, OnDestroy, AfterViewInit {
  // FIX: { static: true } so the reference is resolved once, before ngAfterViewInit.
  // Since the <video> elements are always in the DOM (no *ngIf on them),
  // this reference never goes stale mid-call.
  @ViewChild('localVideo', { static: true }) localVideoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo', { static: true }) remoteVideoElement!: ElementRef<HTMLVideoElement>;

  @Input() callSession!: CallSession;
  @Input() remoteParticipant!: CallParticipant;
  @Input() localParticipant!: CallParticipant;

  @Output() endCall = new EventEmitter<void>();
  @Output() toggleAudio = new EventEmitter<void>();
  @Output() toggleVideo = new EventEmitter<void>();
  @Output() toggleScreenShare = new EventEmitter<void>();

  isMuted = false;
  isVideoOff = false;
  isScreenSharing = false;
  remoteIsMuted = false;
  remoteIsVideoOff = false;
  remoteIsScreenSharing = false;

  showControls = true;
  callDuration = '00:00';
  connectionQuality: 'excellent' | 'good' | 'poor' = 'excellent';

  private subscriptions: Subscription[] = [];
  private controlsTimeout: any = null;
  private callTimer: any = null;

  constructor(
    private webrtcService: WebRTCService,
    private callService: CallService
  ) {}

  ngOnInit(): void {
    this.startCallTimer();
    this.setupAutoHideControls();
    this.subscribeToConnectionState();
    this.subscribeToRemoteStateUpdates();
  }

  ngAfterViewInit(): void {
    // No setTimeout needed — static ViewChild + always-in-DOM elements means
    // the references are valid immediately.
    this.setupVideoElements();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.callTimer) clearInterval(this.callTimer);
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
  }

  // ─── Template helper ─────────────────────────────────────────────────────────
  shouldShowRemoteVideo(): boolean {
    // Show the remote video element when:
    // 1. Video call AND remote has camera on, OR
    // 2. Local user is screen sharing (self-preview in the main slot), OR
    // 3. Remote user is screen sharing (even in an audio call — they're sending video)
    return (this.isVideoCall() && !this.remoteIsVideoOff)
        || this.isScreenSharing
        || this.remoteIsScreenSharing;
  }

  // ─── Stream wiring ────────────────────────────────────────────────────────────
  private setVideoSrc(el: HTMLVideoElement | undefined, stream: MediaStream | null): void {
    if (!el) return;
    // Always force a null → stream reassignment even if srcObject already points
    // to the same MediaStream object. When ontrack replaces a dead track inside
    // the same stream object, the browser won't pick up the new track unless
    // srcObject is cleared and re-set — same-reference checks would pass silently.
    el.srcObject = null;
    el.srcObject = stream;
    if (stream) {
      el.muted = false;
      el.volume = 1;
      el.play().catch(err => console.warn('Autoplay blocked:', err));
    }
  }

  private setupVideoElements(): void {

    // LOCAL stream → local <video>
    const localSub = this.webrtcService.localStream$.subscribe(stream => {
      const el = this.localVideoElement?.nativeElement;
      if (el && stream) {
        el.srcObject = stream;
        el.muted = true;
      }
    });
    this.subscriptions.push(localSub);

    // REMOTE stream → remote <video>
    // BehaviorSubject replays current value on subscribe, so this also handles
    // the case where the stream arrived before setupVideoElements() was called.
    const remoteSub = this.webrtcService.remoteStream$.subscribe(stream => {
      if (!stream) return;
      console.log('📺 Remote stream received — wiring to video element');
      // Always update srcObject when remoteStream$ emits, even mid-call.
      // ontrack fires with a new track when remote replaceTrack() is called
      // (screen share start/stop). We must re-attach so the browser picks up
      // the new track. The null→stream pattern in setVideoSrc forces a re-attach
      // even when the MediaStream object reference hasn't changed.
      // Exception: if local screen share is active, don't overwrite the preview —
      // the remote stream will be restored when screen share stops.
      if (!this.isScreenSharing) {
        this.setVideoSrc(this.remoteVideoElement?.nativeElement, stream);
      }
    });
    this.subscriptions.push(remoteSub);

    // LOCAL screen share → remote <video> slot (self-preview)
    // When null is emitted (share stopped), restore remote stream from BehaviorSubject.
    const screenSub = this.webrtcService.screenStream$.subscribe(stream => {
      if (stream) {
        console.log('🖥️ Screen share started — showing self-preview');
        this.isScreenSharing = true;
        this.setVideoSrc(this.remoteVideoElement?.nativeElement, stream);
      } else if (this.isScreenSharing) {
        console.log('🖥️ Screen share stopped — restoring remote stream');
        this.isScreenSharing = false;

        const el = this.remoteVideoElement?.nativeElement;
        // Get the current value directly from BehaviorSubject — no need to
        // wait for a new emission since the stream object hasn't changed.
        const currentRemote = this.webrtcService.remoteStream$.getValue();
        if (el && currentRemote) {
          // Null out first so the browser cleanly re-attaches the stream.
          el.srcObject = null;
          setTimeout(() => this.setVideoSrc(el, currentRemote), 0);
        }
      }
    });
    this.subscriptions.push(screenSub);
  }

  private subscribeToConnectionState(): void {
    const sub = this.webrtcService.connectionState$.subscribe(state => {
      this.updateConnectionQuality(state);
    });
    this.subscriptions.push(sub);
  }

  private subscribeToRemoteStateUpdates(): void {
    const sub = this.callService.remoteStateUpdate$.subscribe(state => {
      console.log('🔄 Remote state update received:', state);
      this.updateRemoteState(state);
    });
    this.subscriptions.push(sub);
  }

  private startCallTimer(): void {
    let seconds = 0;
    this.callTimer = setInterval(() => {
      seconds++;
      const mins = Math.floor(seconds / 60);
      const secs = seconds % 60;
      this.callDuration = `${this.padZero(mins)}:${this.padZero(secs)}`;
    }, 1000);
  }

  private padZero(num: number): string {
    return num.toString().padStart(2, '0');
  }

  private setupAutoHideControls(): void {
    this.resetControlsTimeout();
  }

  private resetControlsTimeout(): void {
    if (this.controlsTimeout) clearTimeout(this.controlsTimeout);
    this.showControls = true;
    this.controlsTimeout = setTimeout(() => { this.showControls = false; }, 5000);
  }

  onMouseMove(): void {
    this.resetControlsTimeout();
  }

  onToggleAudio(): void {
    this.callService.toggleAudio();
    setTimeout(() => { this.isMuted = !this.webrtcService.isAudioEnabled(); }, 50);
  }

  onToggleVideo(): void {
    this.callService.toggleVideo();
    setTimeout(() => { this.isVideoOff = !this.webrtcService.isVideoEnabled(); }, 50);
  }

  onToggleScreenShare(): void {
    this.callService.toggleScreenShare()
      .then(() => { this.isScreenSharing = this.webrtcService.isScreenSharing(); })
      .catch(err => {
        console.error('Screen share toggle failed:', err);
        this.isScreenSharing = false;
      });
  }

  onEndCall(): void {
    this.endCall.emit();
  }

  updateRemoteState(state: CallStateUpdate): void {
    if (state.isMuted != null)         this.remoteIsMuted = state.isMuted;
    if (state.isVideoOff != null)      this.remoteIsVideoOff = state.isVideoOff;
    if (state.isScreenSharing != null) this.remoteIsScreenSharing = state.isScreenSharing;
  }

  private updateConnectionQuality(state: RTCPeerConnectionState): void {
    switch (state) {
      case 'connected':    this.connectionQuality = 'excellent'; break;
      case 'connecting':   this.connectionQuality = 'good';      break;
      case 'disconnected':
      case 'failed':       this.connectionQuality = 'poor';      break;
    }
  }

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  }

  isVideoCall(): boolean {
    return this.callSession.callType === 'video';
  }
}