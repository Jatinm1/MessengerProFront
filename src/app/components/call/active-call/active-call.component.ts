// src/app/components/call/active-call/active-call.component.ts

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallSession, CallParticipant, CallStateUpdate } from '../../../models/call.models';
import { WebRTCService } from '../../../services/webrtc.service';
import { CallService } from '../../../services/call.service';
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

  constructor(
    private webrtcService: WebRTCService,
    private callService: CallService
  ) {}

  ngOnInit(): void {
    this.startCallTimer();
    this.setupAutoHideControls();
    this.subscribeToStreams();
    this.subscribeToRemoteStateUpdates();
  }

  ngAfterViewInit(): void {
    // Set up video elements after view init
    setTimeout(() => {
      this.setupVideoElements();
    }, 100);

    this.webrtcService.remoteStream$
  .subscribe(stream => {
    if (!stream) return;

    // 🔥 AUDIO FIX
    const audio = document.createElement('audio');
    audio.srcObject = stream;
    audio.autoplay = true;

    document.body.appendChild(audio);
  });

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
        console.log('📺 Setting remote stream to video element');
        this.remoteVideoElement.nativeElement.srcObject = stream;
        this.remoteVideoElement.nativeElement.muted = false;
        this.remoteVideoElement.nativeElement.volume = 1;

        this.remoteVideoElement.nativeElement
          .play()
          .catch(err => console.warn('Autoplay blocked', err));
      }
    });
    this.subscriptions.push(remoteStreamSub);

    // Subscribe to screen share stream
    const screenStreamSub = this.webrtcService.screenStream$.subscribe(stream => {
      if (stream && this.remoteVideoElement) {
        // When local user shares screen, show it in main video
        console.log('🖥️ Setting screen share stream to video element');
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

  private subscribeToRemoteStateUpdates(): void {
    // Subscribe to remote state updates from CallService
    const remoteStateSub = this.callService.remoteStateUpdate$.subscribe(state => {
      console.log('🔄 Remote state update received in ActiveCall:', state);
      this.updateRemoteState(state);
    });
    this.subscriptions.push(remoteStateSub);
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
    // Toggle the audio first
    this.callService.toggleAudio();
    
    // Read the NEW state AFTER toggling
    // Use setTimeout to ensure the toggle has completed
    setTimeout(() => {
      this.isMuted = !this.webrtcService.isAudioEnabled();
      console.log('🎤 Local audio state updated:', this.isMuted ? 'MUTED' : 'UNMUTED');
    }, 50);
  }

  onToggleVideo(): void {
    // Toggle the video first
    this.callService.toggleVideo();
    
    // Read the NEW state AFTER toggling
    setTimeout(() => {
      this.isVideoOff = !this.webrtcService.isVideoEnabled();
      console.log('📹 Local video state updated:', this.isVideoOff ? 'OFF' : 'ON');
    }, 50);
  }

  onToggleScreenShare(): void {
    this.callService.toggleScreenShare();
    
    // Read the NEW state AFTER toggling
    setTimeout(() => {
      this.isScreenSharing = this.webrtcService.isScreenSharing();
      console.log('🖥️ Local screen share state updated:', this.isScreenSharing ? 'SHARING' : 'NOT SHARING');
    }, 50);
  }

  onEndCall(): void {
    this.endCall.emit();
  }

  updateRemoteState(state: CallStateUpdate): void {
    if (state.isMuted !== undefined && state.isMuted !== null) {
      this.remoteIsMuted = state.isMuted;
      console.log('🔇 Remote mute state updated:', this.remoteIsMuted);
    }
    if (state.isVideoOff !== undefined && state.isVideoOff !== null) {
      this.remoteIsVideoOff = state.isVideoOff;
      console.log('📹 Remote video state updated:', this.remoteIsVideoOff);
    }
    if (state.isScreenSharing !== undefined && state.isScreenSharing !== null) {
      this.remoteIsScreenSharing = state.isScreenSharing;
      console.log('🖥️ Remote screen share state updated:', this.remoteIsScreenSharing);
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