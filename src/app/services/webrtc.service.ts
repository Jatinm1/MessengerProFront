import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {

  // ================================
  // Core WebRTC Objects
  // ================================

  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;

  // ICE candidate buffer (CRITICAL FIX)
  private pendingIceCandidates: RTCIceCandidateInit[] = [];

  // ================================
  // Observables
  // ================================

  localStream$ = new BehaviorSubject<MediaStream | null>(null);
  remoteStream$ = new BehaviorSubject<MediaStream | null>(null);
  screenStream$ = new BehaviorSubject<MediaStream | null>(null);

  iceCandidates$ = new Subject<RTCIceCandidate>();
  connectionState$ = new BehaviorSubject<RTCPeerConnectionState>('new');

  // ================================
  // ICE Servers (STUN + TURN READY)
  // ================================

  private config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },

      // 🔴 TURN (recommended for production)
      // {
      //   urls: 'turn:YOUR_TURN_SERVER:3478',
      //   username: 'user',
      //   credential: 'password'
      // }
    ]
  };

  // ================================
  // Peer Connection Init
  // ================================

  async initializePeerConnection(): Promise<void> {
    this.cleanup();

    this.pc = new RTCPeerConnection(this.config);

    // ICE candidates
    this.pc.onicecandidate = e => {
      if (e.candidate) {
        this.iceCandidates$.next(e.candidate);
      }
    };

    // Remote tracks
    this.remoteStream = new MediaStream();
    this.pc.ontrack = e => {
      e.streams[0].getTracks().forEach(track => {
        this.remoteStream!.addTrack(track);
      });
      this.remoteStream$.next(this.remoteStream);
    };

    // Connection state
    this.pc.onconnectionstatechange = () => {
      if (!this.pc) return;
      console.log('🌐 PC state:', this.pc.connectionState);
      this.connectionState$.next(this.pc.connectionState);
    };

    // ICE failure visibility
    this.pc.oniceconnectionstatechange = () => {
      console.log('❄ ICE state:', this.pc?.iceConnectionState);
    };
  }

  // ================================
  // Media
  // ================================

  async getUserMedia(audioOnly = false): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      },
      video: audioOnly
        ? false
        : {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          }
    };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    this.localStream$.next(this.localStream);

    this.localStream.getTracks().forEach(track => {
      this.pc?.addTrack(track, this.localStream!);
    });

    return this.localStream;
  }

  // ================================
  // Offer / Answer
  // ================================

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PC not initialized');

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });

    await this.pc.setLocalDescription(offer);
    return offer;
  }

  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PC not initialized');

    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.flushIceCandidates();

    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return answer;
  }

  async setRemoteDescription(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PC not initialized');

    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this.flushIceCandidates();
  }

  // ================================
  // ICE (CRITICAL FIX)
  // ================================

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) return;

    if (!this.pc.remoteDescription) {
      this.pendingIceCandidates.push(candidate);
      return;
    }

    await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
  }

  private async flushIceCandidates(): Promise<void> {
    if (!this.pc) return;

    for (const c of this.pendingIceCandidates) {
      await this.pc.addIceCandidate(new RTCIceCandidate(c));
    }
    this.pendingIceCandidates = [];
  }

  // ================================
  // Audio / Video Controls
  // ================================

  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  // ================================
  // Screen Share (SAFE)
  // ================================

  async startScreenShare(): Promise<void> {
    this.screenStream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: false
    });

    this.screenStream$.next(this.screenStream);

    const screenTrack = this.screenStream.getVideoTracks()[0];
    const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');

    if (sender) {
      await sender.replaceTrack(screenTrack);
    }

    screenTrack.onended = () => this.stopScreenShare();
  }

  isAudioEnabled(): boolean {
  return !!this.localStream?.getAudioTracks().some(t => t.enabled);
}

isVideoEnabled(): boolean {
  return !!this.localStream?.getVideoTracks().some(t => t.enabled);
}

  async stopScreenShare(): Promise<void> {
    if (!this.screenStream) return;

    this.screenStream.getTracks().forEach(t => t.stop());
    this.screenStream = null;
    this.screenStream$.next(null);

    const camTrack = this.localStream?.getVideoTracks()[0];
    const sender = this.pc?.getSenders().find(s => s.track?.kind === 'video');

    if (sender && camTrack) {
      await sender.replaceTrack(camTrack);
    }
  }

  isScreenSharing(): boolean {
    return !!this.screenStream;
  }

  // ================================
  // Cleanup (NO BUGS)
  // ================================

  cleanup(): void {
    this.pendingIceCandidates = [];

    this.localStream?.getTracks().forEach(t => t.stop());
    this.screenStream?.getTracks().forEach(t => t.stop());

    this.localStream = null;
    this.screenStream = null;
    this.remoteStream = null;

    this.localStream$.next(null);
    this.remoteStream$.next(null);
    this.screenStream$.next(null);

    if (this.pc) {
      this.pc.ontrack = null;
      this.pc.onicecandidate = null;
      this.pc.onconnectionstatechange = null;
      this.pc.close();
    }

    this.pc = null;
    this.connectionState$.next('closed');
  }
}
