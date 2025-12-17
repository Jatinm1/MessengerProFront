// src/app/components/call/active-call/active-call.component.ts

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallSession, CallParticipant, CallStateUpdate } from '../../../models/call.models';
import { WebRTCService } from '../../../services/webrtc.service';
import { Subscription, interval } from 'rxjs';

@Component({
  selector: 'app-active-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './active-call.component.html',
  styleUrls: ['./active-call.component.css']
})
export class ActiveCallComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('localVideo') localVideoElement!: ElementRef<HTMLVideoElement>;
  @ViewChild('remoteVideo') remoteVideoElement!: ElementRef<HTMLVideoElement>;

  @Input() callSession!: CallSession;
  @Input() remoteParticipant!: CallParticipant;
  @Input() localParticipant!: CallParticipant;
  
  @Output() endCall = new EventEmitter<void>();
  @Output() toggleAudio = new EventEmitter<void>();
  @Output() toggleVideo = new EventEmitter<void>();
  @Output() toggleScreenShare = new EventEmitter<void>();

  // Call state
  isMuted = false;
  isVideoOff = false;
  isScreenSharing = false;
  remoteIsMuted = false;
  remoteIsVideoOff = false;
  remoteIsScreenSharing = false;

  // UI state
  showControls = true;
  callDuration = '00:00';
  connectionQuality: 'excellent' | 'good' | 'poor' = 'excellent';

  private subscriptions: Subscription[] = [];
  private controlsTimeout: any = null;
  private callTimer: any = null;

  constructor(private webrtcService: WebRTCService) {}

  ngOnInit(): void {
    this.startCallTimer();
    this.setupAutoHideControls();
    this.subscribeToStreams();
  }

  ngAfterViewInit(): void {
    // Set up video elements after view init
    setTimeout(() => {
      this.setupVideoElements();
    }, 100);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach(sub => sub.unsubscribe());
    if (this.callTimer) {
      clearInterval(this.callTimer);
    }
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    }
  }

  private setupVideoElements(): void {
    // Subscribe to local stream
    const localStreamSub = this.webrtcService.localStream$.subscribe(stream => {
      if (stream && this.localVideoElement) {
        this.localVideoElement.nativeElement.srcObject = stream;
      }
    });
    this.subscriptions.push(localStreamSub);

    // Subscribe to remote stream
    const remoteStreamSub = this.webrtcService.remoteStream$.subscribe(stream => {
      if (stream && this.remoteVideoElement) {
        this.remoteVideoElement.nativeElement.srcObject = stream;
      }
    });
    this.subscriptions.push(remoteStreamSub);

    // Subscribe to screen share stream
    const screenStreamSub = this.webrtcService.screenStream$.subscribe(stream => {
      if (stream && this.remoteVideoElement) {
        // When local user shares screen, show it in main video
        this.remoteVideoElement.nativeElement.srcObject = stream;
      }
    });
    this.subscriptions.push(screenStreamSub);
  }

  private subscribeToStreams(): void {
    // Monitor connection state
    const connectionSub = this.webrtcService.connectionState$.subscribe(state => {
      this.updateConnectionQuality(state);
    });
    this.subscriptions.push(connectionSub);
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
    if (this.controlsTimeout) {
      clearTimeout(this.controlsTimeout);
    }
    
    this.showControls = true;
    
    this.controlsTimeout = setTimeout(() => {
      this.showControls = false;
    }, 5000); // Hide after 5 seconds of inactivity
  }

  onMouseMove(): void {
    this.resetControlsTimeout();
  }

  onToggleAudio(): void {
    this.isMuted = !this.webrtcService.isAudioEnabled();
    this.toggleAudio.emit();
  }

  onToggleVideo(): void {
    this.isVideoOff = !this.webrtcService.isVideoEnabled();
    this.toggleVideo.emit();
  }

  onToggleScreenShare(): void {
    this.isScreenSharing = !this.isScreenSharing;
    this.toggleScreenShare.emit();
  }

  onEndCall(): void {
    this.endCall.emit();
  }

  updateRemoteState(state: CallStateUpdate): void {
    if (state.isMuted !== undefined) {
      this.remoteIsMuted = state.isMuted;
    }
    if (state.isVideoOff !== undefined) {
      this.remoteIsVideoOff = state.isVideoOff;
    }
    if (state.isScreenSharing !== undefined) {
      this.remoteIsScreenSharing = state.isScreenSharing;
    }
  }

  private updateConnectionQuality(state: RTCPeerConnectionState): void {
    switch (state) {
      case 'connected':
        this.connectionQuality = 'excellent';
        break;
      case 'connecting':
        this.connectionQuality = 'good';
        break;
      case 'disconnected':
      case 'failed':
        this.connectionQuality = 'poor';
        break;
    }
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  isVideoCall(): boolean {
    return this.callSession.callType === 'video';
  }
}