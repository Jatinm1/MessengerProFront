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

  // FIX (Bug 1 & 3): Track whether this is an audio-only call so screen share
  // knows not to expect a pre-existing camera track.
  private isAudioOnlyCall = false;

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

    // FIX (Bug 2): Do NOT pre-add transceivers here.
    // Transceivers are added implicitly when tracks are added via addTrack(),
    // which happens in getUserMedia(). Pre-adding them caused direction/SDP
    // mismatches in audio-only calls where no video track is ever attached.
    // The offerToReceiveAudio/Video flags in createOffer() are sufficient
    // to signal bidirectional intent to the remote peer.

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
      const track = event.track;
      console.log(`📹 Remote track received: ${track.kind} (id: ${track.id})`);

      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
      }

      // REPLACE any existing track of the same kind rather than skipping.
      // When screen share starts/stops, replaceTrack() on the sender causes
      // ontrack to fire with a NEW track object of the same kind on the receiver.
      // The old track is ended/muted. If we just skip it (duplicate-kind check),
      // the remoteStream keeps the dead track and video freezes on last frame.
      const existingOfKind = this.remoteStream.getTracks()
        .find(t => t.kind === track.kind);

      if (existingOfKind && existingOfKind.id !== track.id) {
        // Remove the stale track and add the fresh one
        this.remoteStream.removeTrack(existingOfKind);
        console.log(`🔄 Replaced stale ${track.kind} track in remoteStream`);
      }

      if (!this.remoteStream.getTracks().some(t => t.id === track.id)) {
        this.remoteStream.addTrack(track);
      }

      // When a track is muted (e.g. sender paused/replaced), re-emit so the
      // component can react (e.g. show avatar). When unmuted, re-emit to restore.
      track.onmute = () => {
        console.log(`🔇 Remote ${track.kind} track muted`);
        this.remoteStream$.next(this.remoteStream);
      };
      track.onunmute = () => {
        console.log(`🔊 Remote ${track.kind} track unmuted`);
        this.remoteStream$.next(this.remoteStream);
      };
      track.onended = () => {
        console.log(`⛔ Remote ${track.kind} track ended`);
        if (this.remoteStream) {
          this.remoteStream.removeTrack(track);
          this.remoteStream$.next(this.remoteStream);
        }
      };

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

  // FIX (Bug 2): The early-exit guard `if (this.localStream) return` was causing
  // tracks to NOT be re-added to a freshly-created PC after initializePeerConnection().
  // The fix: always attach tracks to the current PC, even if we reuse the stream object.
  async getUserMedia(audioOnly = false): Promise<MediaStream> {
    // FIX (Bug 1 & 3): Track call type for screen share logic
    this.isAudioOnlyCall = audioOnly;

    // 🚫 Do NOT open camera while screen sharing
    if (this.screenStream && !audioOnly) {
      console.log('🖥️ Screen sharing active — skipping camera access');
      return this.localStream!;
    }

    let stream: MediaStream;

    if (this.localStream) {
      // Reuse existing stream object but still ensure tracks are on the PC
      console.log('🎥 Reusing existing local stream, re-attaching tracks to PC');
      stream = this.localStream;
    } else {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: audioOnly ? false : { width: { ideal: 1280 }, height: { ideal: 720 } }
        });
      } catch (err: any) {
        console.error('Media error:', err.name);

        // 🎯 FALLBACK: If video fails → try audio-only
        if (!audioOnly && err.name === 'NotReadableError') {
          console.warn('🎤 Falling back to audio-only');
          return this.getUserMedia(true);
        }

        throw err;
      }

      this.localStream = stream;
      this.localStream$.next(stream);
    }

    // FIX (Bug 2): Always attach tracks to the current PC instance.
    // The old guard `if (this.pc?.getSenders().some(s => s.track?.id === track.id))`
    // failed when the PC was recreated (new PC has no senders yet), so tracks
    // were never added and the remote side received no audio/video.
    if (this.pc) {
      stream.getTracks().forEach(track => {
        const alreadyAdded = this.pc!
          .getSenders()
          .some(s => s.track?.id === track.id);

        if (!alreadyAdded) {
          console.log(`➕ Adding ${track.kind} track to PC`);
          this.pc!.addTrack(track, stream);
        }
      });
    }

    return stream;
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

  // FIX (Bug 1 & 3): Completely rewritten screen share logic.
  //
  // Bug 1 fix: In audio-only calls, there's no video sender yet. We now
  // explicitly ADD a new video track to the PC (instead of trying to replace
  // an existing one), then trigger renegotiation so the remote side knows
  // to expect video.
  //
  // Bug 3 fix: After screen share ends (either via button OR native browser
  // "Stop sharing" button), we always trigger renegotiation so the remote
  // side gets the updated stream. The `onended` handler now calls the full
  // `stopScreenShare()` which includes renegotiation.
  async startScreenShare(): Promise<void> {
    if (this.isScreenSharing()) {
      console.warn('Already screen sharing');
      return;
    }

    if (!this.pc) throw new Error('PC not initialized');

    this.screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    const screenTrack = this.screenStream.getVideoTracks()[0];
    this.screenStream$.next(this.screenStream);

    // Save camera track (may be undefined in audio-only calls — that's fine)
    this.cameraTrackBeforeScreenShare = this.localStream?.getVideoTracks()[0];

    const existingVideoSender = this.pc.getSenders()
      .find(s => s.track?.kind === 'video');

    if (existingVideoSender) {
      // VIDEO CALL: replaceTrack swaps the track in-place on the EXISTING transceiver.
      // The RTP stream (SSRC, mid, ICE connection) stays alive — no renegotiation needed.
      // Calling createOffer here would break the ICE state and cause the remote
      // to stop receiving video entirely.
      await existingVideoSender.replaceTrack(screenTrack);
      console.log('🖥️ [Video call] Replaced camera track with screen track (no renegotiation needed)');
    } else {
      // AUDIO-ONLY CALL: no video sender exists yet, so we must add a track
      // and renegotiate so the remote peer learns a new video m-line exists.
      this.pc.addTrack(screenTrack, this.screenStream);
      console.log('🖥️ [Audio call] Added screen share track — renegotiating...');

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      this.onRenegotiationNeeded?.(offer);
    }

    // When the native browser "Stop sharing" button is pressed, trigger our
    // full stopScreenShare() so state and tracks are cleaned up properly.
    screenTrack.onended = () => {
      console.log('🖥️ Screen share track ended via native browser button');
      this.stopScreenShare();
    };
  }

  async stopScreenShare(): Promise<void> {
    if (!this.screenStream) return;

    this.screenStream.getTracks().forEach(t => t.stop());
    this.screenStream = null;
    this.screenStream$.next(null);

    if (!this.pc) return;

    const videoSender = this.pc.getSenders()
      .find(s => s.track?.kind === 'video');

    if (this.isAudioOnlyCall) {
      // AUDIO-ONLY CALL: we added an extra video sender when sharing started,
      // so remove it and renegotiate so the remote peer drops the video m-line.
      if (videoSender) {
        this.pc.removeTrack(videoSender);
        console.log('🎤 [Audio call] Removed screen share video sender');
      }

      try {
        const offer = await this.pc.createOffer();
        await this.pc.setLocalDescription(offer);
        this.onRenegotiationNeeded?.(offer);
        console.log('🔁 [Audio call] Renegotiation triggered after screen share stopped');
      } catch (err) {
        console.warn('⚠️ Could not renegotiate after screen share stop:', err);
      }
    } else {
      // VIDEO CALL: we used replaceTrack to start sharing, so just replaceTrack
      // back to the camera. The existing RTP stream stays alive — no renegotiation.
      if (videoSender && this.cameraTrackBeforeScreenShare) {
        await videoSender.replaceTrack(this.cameraTrackBeforeScreenShare);
        console.log('📹 [Video call] Camera restored after screen share (no renegotiation needed)');
      } else if (videoSender) {
        // Camera track was lost somehow — null out the sender so remote sees black
        await videoSender.replaceTrack(null);
        console.warn('⚠️ No camera track to restore — sender set to null');
      }
    }

    this.cameraTrackBeforeScreenShare = undefined;
  }

  isAudioEnabled(): boolean {
    return !!this.localStream?.getAudioTracks().some(t => t.enabled);
  }

  isVideoEnabled(): boolean {
    return !!this.localStream?.getVideoTracks().some(t => t.enabled);
  }

  isScreenSharing(): boolean {
    return !!this.screenStream;
  }

  cleanup(): void {
    console.log('🧹 Cleaning up WebRTC...');

    this.isCleaningUp = true;
    this.stopStatsMonitoring();

    this.pendingIceCandidates = [];
    this.isAudioOnlyCall = false;
    this.cameraTrackBeforeScreenShare = undefined;

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

    this.isCleaningUp = false;
    console.log('✅ Cleanup complete');
  }
}