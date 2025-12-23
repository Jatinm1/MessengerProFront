// src/app/services/webrtc.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private screenStream: MediaStream | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private statsInterval: any = null;
  private cameraTrackBeforeScreenShare?: MediaStreamTrack;

  onRenegotiationNeeded?: (offer: RTCSessionDescriptionInit) => void;



  localStream$ = new BehaviorSubject<MediaStream | null>(null);
  remoteStream$ = new BehaviorSubject<MediaStream | null>(null);
  screenStream$ = new BehaviorSubject<MediaStream | null>(null);

  iceCandidates$ = new Subject<RTCIceCandidate>();
  connectionState$ = new BehaviorSubject<RTCPeerConnectionState>('new');
  isCleaningUp = false;


  private config: RTCConfiguration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
    ]
  };

  async initializePeerConnection(): Promise<void> {
    // Only cleanup if there's an existing connection
    if (this.pc) {
      this.cleanup();
    } else {
      // If no existing connection, just reset state without emitting 'closed'
      this.pendingIceCandidates = [];
      this.localStream = null;
      this.screenStream = null;
      this.remoteStream = null;
    }

    this.pc = new RTCPeerConnection(this.config);

    this.pc.addTransceiver('audio', { direction: 'sendrecv' });
this.pc.addTransceiver('video', { direction: 'sendrecv' });

    // ICE candidates
    this.pc.onicecandidate = e => {
      if (e.candidate) {
        console.log('🧊 Local ICE candidate generated');
        this.iceCandidates$.next(e.candidate);
      } else {
        console.log('🧊 ICE gathering complete');
      }
    };

    // Remote tracks
    this.remoteStream = new MediaStream();
    this.pc.ontrack = (event) => {
  console.log('📹 Remote track received:', event.track.kind);

  if (!this.remoteStream) {
    this.remoteStream = new MediaStream();
  }

  // 🔥 SAFETY: streams[] may be empty
  if (event.streams && event.streams[0]) {
    event.streams[0].getTracks().forEach(track => {
      this.remoteStream!.addTrack(track);
    });
  } else {
    // Fallback: add single track
    this.remoteStream.addTrack(event.track);
  }

  this.remoteStream$.next(this.remoteStream);
};

    // Connection state
    this.pc.onconnectionstatechange = () => {
  if (!this.pc) return;

  const state = this.pc.connectionState;
  console.log('🌐 PC state:', state);
  this.connectionState$.next(state);

  if (state === 'connected') {
    this.startStatsMonitoring();
  }

  if (state === 'failed' || state === 'disconnected' || state === 'closed') {
    this.stopStatsMonitoring();
  }
};


    // ICE connection state
    this.pc.oniceconnectionstatechange = () => {
      console.log('❄️ ICE state:', this.pc?.iceConnectionState);
    };

    // ICE gathering state
    this.pc.onicegatheringstatechange = () => {
      console.log('📦 ICE gathering state:', this.pc?.iceGatheringState);
    };

    // Set initial state to 'new'
    this.connectionState$.next('new');
    console.log('✅ Peer connection initialized');
  }

  async setRemoteOffer(offer: RTCSessionDescriptionInit): Promise<void> {
  if (!this.pc) throw new Error('PC not initialized');
  await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
}

async createRenegotiationAnswer(): Promise<RTCSessionDescriptionInit> {
  if (!this.pc) throw new Error('PC not initialized');

  const answer = await this.pc.createAnswer();
  await this.pc.setLocalDescription(answer);
  return answer;
}


async getUserMedia(audioOnly = false): Promise<MediaStream> {
  // 🔒 Prevent double camera access

  // 🚫 Do NOT open camera while screen sharing
if (this.screenStream && !audioOnly) {
  console.log('🖥️ Screen sharing active — skipping camera access');
  return this.localStream!;
}

  if (this.localStream) {
    console.log('🎥 Reusing existing local stream');
    return this.localStream;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: audioOnly ? false : true
    });

    this.localStream = stream;
    this.localStream$.next(stream);

    // 🔥 Attach tracks ONLY ONCE
    stream.getTracks().forEach(track => {
      const alreadyAdded = this.pc
        ?.getSenders()
        .some(s => s.track?.id === track.id);

      if (!alreadyAdded) {
        this.pc?.addTrack(track, stream);
      }
    });

    return stream;
  } catch (err: any) {
    console.error('Media error:', err.name);

    // 🎯 FALLBACK: If video fails → try audio-only
    if (!audioOnly && err.name === 'NotReadableError') {
      console.warn('🎤 Falling back to audio-only');
      return this.getUserMedia(true);
    }

    throw err;
  }
}



private async tryGetMedia(audioOnly: boolean): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: true,
    video: audioOnly ? false : true
  });
}

async logStats(): Promise<void> {
  if (!this.pc) return;

  const stats = await this.pc.getStats();
  stats.forEach(report => {
    if (report.type === 'outbound-rtp' && report.kind === 'audio') {
      console.log('🎤 Audio bytes sent:', report.bytesSent);
    }

    if (report.type === 'inbound-rtp' && report.kind === 'audio') {
      console.log('🎧 Audio bytes received:', report.bytesReceived);
    }

    if (report.type === 'outbound-rtp' && report.kind === 'video') {
      console.log('📹 Video bytes sent:', report.bytesSent);
    }

    if (report.type === 'inbound-rtp' && report.kind === 'video') {
      console.log('📺 Video bytes received:', report.bytesReceived);
    }
  });
}




  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PC not initialized');

    console.log('📝 Creating offer...');
    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true
    });

    console.log('📝 Setting local description (offer)...');
    await this.pc.setLocalDescription(offer);
    console.log('✅ Offer created and set as local description');
    
    return offer;
  }

  async createAnswer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PC not initialized');

    console.log('📝 Setting remote description (offer)...');
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    console.log('✅ Remote description set');
    
    // Process any buffered ICE candidates
    await this.flushIceCandidates();

    console.log('📝 Creating answer...');
    const answer = await this.pc.createAnswer();
    
    console.log('📝 Setting local description (answer)...');
    await this.pc.setLocalDescription(answer);
    console.log('✅ Answer created and set as local description');
    
    return answer;
  }

  setAudioEnabled(enabled: boolean): void {
  const track = this.localStream?.getAudioTracks()[0];
  if (track) {
    track.enabled = enabled;
    console.log('🎤 Audio:', enabled ? 'ON' : 'OFF');
  }
}

setVideoEnabled(enabled: boolean): void {
  const track = this.localStream?.getVideoTracks()[0];
  if (!track) return;

  track.enabled = enabled;
  console.log('📹 Video:', enabled ? 'ON' : 'OFF');
}



  async setRemoteDescription(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PC not initialized');

    console.log('📝 Setting remote description (answer)...');
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    console.log('✅ Remote description (answer) set successfully');
    
    // Process any buffered ICE candidates
    await this.flushIceCandidates();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      console.warn('⚠️ Cannot add ICE candidate - PC not initialized');
      return;
    }

    if (!this.pc.remoteDescription) {
      console.log('📦 Buffering ICE candidate - remote description not set yet');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('✅ ICE candidate added');
    } catch (error) {
      console.error('❌ Error adding ICE candidate:', error);
    }
  }

  private async flushIceCandidates(): Promise<void> {
    if (!this.pc || this.pendingIceCandidates.length === 0) return;

    console.log(`📦 Flushing ${this.pendingIceCandidates.length} buffered ICE candidates`);
    
    for (const c of this.pendingIceCandidates) {
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
        console.log('✅ Buffered ICE candidate added');
      } catch (error) {
        console.error('❌ Error adding buffered ICE candidate:', error);
      }
    }
    
    this.pendingIceCandidates = [];
  }

  // CRITICAL FIX: Add method to check if remote description is set
  hasRemoteDescription(): boolean {
    return !!this.pc?.remoteDescription;
  }

  toggleAudio(): boolean {
    const track = this.localStream?.getAudioTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    console.log('🎤 Audio toggled:', track.enabled ? 'ON' : 'OFF');
    return track.enabled;
  }

  toggleVideo(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    console.log('📹 Video toggled:', track.enabled ? 'ON' : 'OFF');
    return track.enabled;
  }

  private startStatsMonitoring(): void {
  if (this.statsInterval) return;

  console.log('📊 Starting WebRTC stats monitoring');

  this.statsInterval = setInterval(() => {
    this.logStats();
  }, 2000);
}

private stopStatsMonitoring(): void {
  if (this.statsInterval) {
    clearInterval(this.statsInterval);
    this.statsInterval = null;
    console.log('📊 Stopped WebRTC stats monitoring');
  }
}


 async startScreenShare(): Promise<void> {

  if (this.isScreenSharing()) {
    console.warn('Already screen sharing');
    return;
  }
  this.screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });

  const screenTrack = this.screenStream.getVideoTracks()[0];
  this.cameraTrackBeforeScreenShare =
  this.localStream?.getVideoTracks()[0];

  let sender =
  this.pc?.getSenders().find(s => s.track?.kind === 'video') ??
  this.pc?.getTransceivers()
    .find(t => t.receiver.track.kind === 'video')?.sender;

// 🔥 AUDIO CALL SAFETY NET
if (!sender && this.pc) {
  const transceiver = this.pc.getTransceivers().find(t => t.receiver.track.kind === 'video');
  sender = transceiver?.sender;
}

if (!sender || !this.pc) {
  throw new Error('Video sender not available for screen share');
}


  if (sender && this.pc) {
    await sender.replaceTrack(screenTrack);

    // 🔥 FORCE RENEGOTIATION
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);

    this.onRenegotiationNeeded?.(offer);
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

  const sender = this.pc
    ?.getSenders()
    .find(s => s.track?.kind === 'video');

  // 🔥 RESTORE CAMERA TRACK
  if (sender && this.cameraTrackBeforeScreenShare) {
    await sender.replaceTrack(this.cameraTrackBeforeScreenShare);
    console.log('📹 Camera restored after screen share');
  }
}


  isScreenSharing(): boolean {
    return !!this.screenStream;
  }

 cleanup(): void {
  console.log('🧹 Cleaning up WebRTC...');
  
  this.isCleaningUp = true;
  this.stopStatsMonitoring();


  this.pendingIceCandidates = [];

  this.localStream?.getTracks().forEach(t => {
    t.stop();
    console.log(`  Stopped ${t.kind} track`);
  });

  this.screenStream?.getTracks().forEach(t => {
    t.stop();
    console.log(`  Stopped screen share track`);
  });

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
    this.pc.oniceconnectionstatechange = null;
    this.pc.onicegatheringstatechange = null;
    this.pc.close();
    console.log('  Peer connection closed');
  }

  this.pc = null;
  this.connectionState$.next('closed');

  this.isCleaningUp = false;   // 🔓 UNLOCK
  console.log('✅ Cleanup complete');
}

}