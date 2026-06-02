// ============================================================
// src/app/services/call.service.ts
// WebRTC Audio + Video Call Service
// Handles: signaling via SignalR, peer connection, media, state
// ============================================================
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { AuthService } from './auth.service';
import { CallHistoryService } from './call-history.service';
import { environment } from '../../env/env';

// ── Types ─────────────────────────────────────────────────────────────────

export type CallType = 'audio' | 'video';

export type CallStatus =
  | 'idle'
  | 'initiating'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'declined'
  | 'busy'
  | 'missed'
  | 'error';

export interface CallParticipant {
  userId: string;
  name: string;
  photoUrl?: string;
}

export interface ActiveCall {
  callId: string;
  conversationId: string;
  callType: CallType;
  status: CallStatus;
  direction: 'outbound' | 'inbound';
  remote: CallParticipant;
  local: CallParticipant;
  startedAt?: Date;
  connectedAt?: Date;
  isMuted: boolean;
  isVideoOff: boolean;
  isScreenSharing: boolean;
  isPeerMuted: boolean;
  isPeerVideoOff: boolean;
  isPeerScreenSharing: boolean;
}

export interface IncomingCallEvent {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
  callType: CallType;
}

// ── Internal log helper ───────────────────────────────────────────────────
// All WebRTC logs are prefixed so you can filter in DevTools:
//   console filter: "[CallService]"
function log(msg: string, ...args: any[]) {
  console.log(`[CallService] ${msg}`, ...args);
}
function warn(msg: string, ...args: any[]) {
  console.warn(`[CallService] ⚠️ ${msg}`, ...args);
}
function err(msg: string, ...args: any[]) {
  console.error(`[CallService] ❌ ${msg}`, ...args);
}

@Injectable({ providedIn: 'root' })
export class CallService implements OnDestroy {

  // ── Public state ─────────────────────────────────────────────────────────
  private _call$ = new BehaviorSubject<ActiveCall | null>(null);
  public call$ = this._call$.asObservable();

  // ── Public events ─────────────────────────────────────────────────────────
  public incomingCall$ = new Subject<IncomingCallEvent>();
  public callEnded$    = new Subject<{ callId: string; reason: string; durationSeconds: number }>();
  public callError$    = new Subject<string>();

  // ── Video stream observables (for component binding) ─────────────────────
  // These are BehaviorSubjects so video components get the stream immediately
  // on subscribe even if connection happened before component init.
  private _localStream$  = new BehaviorSubject<MediaStream | null>(null);
  private _remoteStream$ = new BehaviorSubject<MediaStream | null>(null);
  public localStream$  = this._localStream$.asObservable();
  public remoteStream$ = this._remoteStream$.asObservable();

  // ── WebRTC internals ─────────────────────────────────────────────────────
  private peerConnection: RTCPeerConnection | null = null;
  private localStream:    MediaStream | null = null;
  private screenStream:   MediaStream | null = null;    // separate stream for screen share
  private remoteStream:   MediaStream | null = null;
  private remoteAudio:    HTMLAudioElement | null = null; // audio-call only
  private iceCandidateBuffer: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;
  private isNegotiating = false;           // guard against renegotiation storms

  // ── SignalR ───────────────────────────────────────────────────────────────
  private hubConnection: signalR.HubConnection | null = null;

  // ── ICE Config ───────────────────────────────────────────────────────────
  private readonly ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302'  },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Add TURN servers here for production NAT traversal:
    // { urls: 'turn:your-turn.example.com:3478', username: 'user', credential: 'pass' }
  ];

  constructor(
    private authService: AuthService,
    private callHistoryService: CallHistoryService
  ) {}

  // ==========================================================================
  // SIGNALR CONNECTION
  // ==========================================================================

  async connect(): Promise<void> {
    if (
      this.hubConnection &&
      this.hubConnection.state !== signalR.HubConnectionState.Disconnected
    ) {
      return;
    }

    const token = this.authService.getToken();
    if (!token) { warn('connect() called with no auth token'); return; }

    const hubUrl = `${environment.apiUrl.replace('/api', '')}/hubs/call`;
    log('Connecting to', hubUrl);

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token,
        skipNegotiation: false,
        transport:
          signalR.HttpTransportType.WebSockets |
          signalR.HttpTransportType.ServerSentEvents,
      })
      .withAutomaticReconnect([1000, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.registerHubEvents();

    try {
      await this.hubConnection.start();
      log('SignalR connected');
    } catch (e) {
      err('SignalR connection failed', e);
    }
  }

  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
      this.hubConnection = null;
    }
  }

  // ==========================================================================
  // OUTBOUND CALL
  // ==========================================================================

  async startAudioCall(
    toUserId: string,
    conversationId: string,
    localUser: CallParticipant,
    callType: CallType = 'audio',
    remoteUser?: CallParticipant
  ): Promise<void> {
    if (
      !this.hubConnection ||
      this.hubConnection.state !== signalR.HubConnectionState.Connected
    ) {
      await this.connect();
    }

    const callId = crypto.randomUUID();
    log(`startCall() → callId=${callId} type=${callType} to=${toUserId}`);

    this._setCall({
      callId,
      conversationId,
      callType,
      status: 'initiating',
      direction: 'outbound',
      remote: remoteUser ?? { userId: toUserId, name: '...' },
      local: localUser,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      isPeerMuted: false,
      isPeerVideoOff: false,
      isPeerScreenSharing: false,
    });

    try {
      await this.hubConnection!.invoke('InitiateCall', toUserId, callId, conversationId, callType);
      this._setStatus('ringing');
      log('InitiateCall sent, status → ringing');
    } catch (e) {
      err('InitiateCall failed', e);
      this._handleError('Failed to initiate call');
    }
  }

  async startVideoCall(
    toUserId: string,
    conversationId: string,
    localUser: CallParticipant,
    callType: CallType = 'audio',
    remoteUser?: CallParticipant
  ): Promise<void> {
    if (
      !this.hubConnection ||
      this.hubConnection.state !== signalR.HubConnectionState.Connected
    ) {
      await this.connect();
    }

    const callId = crypto.randomUUID();
    log(`startCall() → callId=${callId} type=${callType} to=${toUserId}`);

    this._setCall({
      callId,
      conversationId,
      callType,
      status: 'initiating',
      direction: 'outbound',
      remote: remoteUser ?? { userId: toUserId, name: '...' },
      local: localUser,
      isMuted: false,
      isVideoOff: false,
      isScreenSharing: false,
      isPeerMuted: false,
      isPeerVideoOff: false,
      isPeerScreenSharing: false,
    });

    try {
      await this.hubConnection!.invoke('InitiateCall', toUserId, callId, conversationId, callType);
      this._setStatus('ringing');
      log('InitiateCall sent, status → ringing');
    } catch (e) {
      err('InitiateCall failed', e);
      this._handleError('Failed to initiate call');
    }
  }

  // ==========================================================================
  // INBOUND CALL — ANSWER
  // ==========================================================================

  async answerCall(event: IncomingCallEvent, localUser: CallParticipant): Promise<void> {
    if (!this.hubConnection) { err('answerCall: no hub connection'); return; }

    log(`answerCall() callId=${event.callId} type=${event.callType}`);

    this._setCall({
      callId:           event.callId,
      conversationId:   event.conversationId,
      callType:         event.callType,
      status:           'connecting',
      direction:        'inbound',
      remote:           { userId: event.callerId, name: event.callerName, photoUrl: event.callerPhoto },
      local:            localUser,
      isMuted:          false,
      isVideoOff:       false,
      isScreenSharing:  false,
      isPeerMuted:      false,
      isPeerVideoOff:   false,
      isPeerScreenSharing: false,
    });

    try {
      await this._setupLocalMedia(event.callType);
      await this.hubConnection!.invoke('AnswerCall', event.callId);
      log('AnswerCall sent');
    } catch (e) {
      err('answerCall failed', e);
      this._handleError('Failed to answer call');
    }
  }

  // ==========================================================================
  // INBOUND CALL — DECLINE
  // ==========================================================================

  async declineCall(callId: string): Promise<void> {
    if (!this.hubConnection) return;
    try {
      await this.hubConnection!.invoke('DeclineCall', callId);
    } catch { /* best-effort */ }
    this._cleanup();
  }

  // ==========================================================================
  // MUTE / VIDEO TOGGLE
  // ==========================================================================

  async toggleMute(): Promise<void> {
    const call = this._call$.value;
    if (!call || !this.localStream) return;

    const newMuted = !call.isMuted;
    this.localStream.getAudioTracks().forEach(t => (t.enabled = !newMuted));
    this._setCall({ ...call, isMuted: newMuted });

    log(`toggleMute → isMuted=${newMuted}`);
    try {
      await this.hubConnection!.invoke('UpdateCallState', call.callId, newMuted, call.isVideoOff, call.isScreenSharing);
    } catch { /* best-effort */ }
  }

  async toggleVideo(): Promise<void> {
    const call = this._call$.value;
    if (!call || call.callType !== 'video' || !this.localStream) return;

    const newVideoOff = !call.isVideoOff;
    this.localStream.getVideoTracks().forEach(t => (t.enabled = !newVideoOff));
    this._setCall({ ...call, isVideoOff: newVideoOff });

    log(`toggleVideo → isVideoOff=${newVideoOff}`);
    try {
      await this.hubConnection!.invoke('UpdateCallState', call.callId, call.isMuted, newVideoOff, call.isScreenSharing);
    } catch { /* best-effort */ }
  }

  // ==========================================================================
  // SCREEN SHARING
  // ==========================================================================

  async startScreenShare(): Promise<void> {
    const call = this._call$.value;
    if (!call || call.callType !== 'video' || !this.peerConnection) {
      warn('startScreenShare: preconditions not met');
      return;
    }
    if (call.isScreenSharing) return;

    log('startScreenShare: acquiring display media');
    try {
      this.screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });

      const screenTrack = this.screenStream.getVideoTracks()[0];

      // Replace the camera video track in the peer connection
      const videoSender = this.peerConnection
        .getSenders()
        .find(s => s.track?.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
        log('Screen track replaced camera track in sender');
      }

      // Also update the local stream preview
      // (replace video track so the local <video> shows the screen)
      const oldVideoTrack = this.localStream?.getVideoTracks()[0];
      if (oldVideoTrack && this.localStream) {
        this.localStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      if (this.localStream) {
        this.localStream.addTrack(screenTrack);
      }
      // Re-emit so the component's video element re-binds
      this._localStream$.next(this.localStream);

      // Auto-stop when user clicks browser's "Stop sharing" button
      screenTrack.onended = () => {
        log('Screen share track ended by browser stop button');
        this.stopScreenShare();
      };

      this._setCall({ ...call, isScreenSharing: true, isVideoOff: false });

      try {
        await this.hubConnection!.invoke('UpdateCallState', call.callId, call.isMuted, false, true);
      } catch { /* best-effort */ }

    } catch (e: any) {
      if (e.name !== 'NotAllowedError') {
        err('startScreenShare failed', e);
        this._handleError('Screen share failed');
      } else {
        log('Screen share cancelled by user');
      }
    }
  }

  async stopScreenShare(): Promise<void> {
    const call = this._call$.value;
    if (!call || !call.isScreenSharing || !this.peerConnection) return;

    log('stopScreenShare: restoring camera');

    // Stop screen stream tracks
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.screenStream = null;

    try {
      // Re-acquire camera video
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });

      const cameraTrack = cameraStream.getVideoTracks()[0];

      // Replace in peer connection
      const videoSender = this.peerConnection
        .getSenders()
        .find(s => s.track?.kind === 'video');

      if (videoSender) {
        await videoSender.replaceTrack(cameraTrack);
        log('Camera track restored in sender');
      }

      // Update local stream
      if (this.localStream) {
        const oldScreen = this.localStream.getVideoTracks()[0];
        if (oldScreen) this.localStream.removeTrack(oldScreen);
        this.localStream.addTrack(cameraTrack);
        this._localStream$.next(this.localStream);
      }

    } catch (e) {
      warn('Could not restore camera after screen share', e);
      // Non-fatal: the call continues, just no local video
    }

    const updated = this._call$.value;
    if (updated) {
      this._setCall({ ...updated, isScreenSharing: false });
      try {
        await this.hubConnection!.invoke(
          'UpdateCallState', updated.callId, updated.isMuted, updated.isVideoOff, false
        );
      } catch { /* best-effort */ }
    }
  }

  // ==========================================================================
  // END CALL
  // ==========================================================================

  async endCall(): Promise<void> {
    const call = this._call$.value;
    if (!call || !this.hubConnection) return;

    log(`endCall() callId=${call.callId}`);
    try {
      await this.hubConnection!.invoke('EndCall', call.callId);
    } catch { /* best-effort */ }

    this._cleanup();
  }

  // ==========================================================================
  // HUB EVENT HANDLERS
  // ==========================================================================

  private registerHubEvents(): void {
    if (!this.hubConnection) return;

    // ── Incoming call ─────────────────────────────────────────────────────
    this.hubConnection.on('incomingCall', (data: IncomingCallEvent) => {
      log('incomingCall received', data);
      this.incomingCall$.next(data);
    });

    // ── Callee accepted ───────────────────────────────────────────────────
    this.hubConnection.on('callAnswered', async ({ callId }: { callId: string }) => {
      const call = this._call$.value;
      if (!call || call.callId !== callId) return;

      log('callAnswered: starting WebRTC as offerer');
      this._setStatus('connecting');

      try {
        await this._setupLocalMedia(call.callType);
        await this._createPeerConnection(callId);
        await this._createAndSendOffer(callId);
      } catch (e) {
        err('callAnswered handler failed', e);
        this._handleError('Failed to connect call');
      }
    });

    // ── Callee busy ───────────────────────────────────────────────────────
    this.hubConnection.on('calleeBusy', ({ callId }: { callId: string }) => {
      log('calleeBusy received');
      this._setStatus('busy');
      setTimeout(() => this._cleanup(), 3000);
    });

    // ── SDP Offer ─────────────────────────────────────────────────────────
    this.hubConnection.on(
      'receiveOffer',
      async ({ callId, sdp }: { callId: string; sdp: string }) => {
        const call = this._call$.value;
        if (!call || call.callId !== callId) return;

        log('receiveOffer: creating answer');
        try {
          await this._createPeerConnection(callId);
          await this.peerConnection!.setRemoteDescription(
            new RTCSessionDescription({ type: 'offer', sdp })
          );
          this.remoteDescriptionSet = true;
          await this._flushIceCandidates();

          const answer = await this.peerConnection!.createAnswer();
          await this.peerConnection!.setLocalDescription(answer);
          await this.hubConnection!.invoke('SendAnswer', callId, answer.sdp!);
          log('Answer sent');
        } catch (e) {
          err('receiveOffer handler failed', e);
          this._handleError('WebRTC offer handling failed');
        }
      }
    );

    // ── SDP Answer ────────────────────────────────────────────────────────
    this.hubConnection.on(
      'receiveAnswer',
      async ({ callId, sdp }: { callId: string; sdp: string }) => {
        const call = this._call$.value;
        if (!call || call.callId !== callId) return;

        log('receiveAnswer: setting remote description');
        try {
          await this.peerConnection!.setRemoteDescription(
            new RTCSessionDescription({ type: 'answer', sdp })
          );
          this.remoteDescriptionSet = true;
          await this._flushIceCandidates();
          log('Remote description set, ICE candidates flushed');
        } catch (e) {
          err('receiveAnswer handler failed', e);
          this._handleError('WebRTC answer handling failed');
        }
      }
    );

    // ── ICE Candidate ─────────────────────────────────────────────────────
    this.hubConnection.on(
      'receiveIceCandidate',
      async ({ callId, candidate }: { callId: string; candidate: string }) => {
        const call = this._call$.value;
        if (!call || call.callId !== callId) return;

        try {
          const parsed: RTCIceCandidateInit = JSON.parse(candidate);

          if (this.remoteDescriptionSet && this.peerConnection) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(parsed));
          } else {
            // Buffer until remote description is set
            this.iceCandidateBuffer.push(parsed);
          }
        } catch (e) {
          warn('Failed to add ICE candidate', e);
        }
      }
    );

    // ── Peer state changed (mute / video / screen) ────────────────────────
    this.hubConnection.on(
      'peerStateChanged',
      ({
        callId,
        isMuted,
        isVideoOff,
        isScreenSharing,
      }: {
        callId: string;
        userId: string;
        isMuted: boolean;
        isVideoOff: boolean;
        isScreenSharing: boolean;
      }) => {
        const call = this._call$.value;
        if (!call || call.callId !== callId) return;
        log(`peerStateChanged muted=${isMuted} videoOff=${isVideoOff} screen=${isScreenSharing}`);
        this._setCall({
          ...call,
          isPeerMuted: isMuted,
          isPeerVideoOff: isVideoOff,
          isPeerScreenSharing: isScreenSharing,
        });
      }
    );

    // ── Call ended ────────────────────────────────────────────────────────
    this.hubConnection.on(
      'callEnded',
      (data: { callId: string; reason: string; durationSeconds: number }) => {
        log('callEnded received', data);
        this.callEnded$.next(data);
        this._cleanup();
        this.callHistoryService.refresh();
      }
    );

    // ── Error ─────────────────────────────────────────────────────────────
    this.hubConnection.on(
      'callError',
      ({ message }: { callId: string; message: string }) => {
        err('callError from server:', message);
        this.callError$.next(message);
        this._cleanup();
      }
    );
  }

  // ==========================================================================
  // WEBRTC INTERNALS
  // ==========================================================================

  private async _setupLocalMedia(callType: CallType): Promise<void> {
    if (this.localStream) {
      log('_setupLocalMedia: stream already exists, skipping');
      return;
    }

    log(`_setupLocalMedia: acquiring ${callType} stream`);

    const constraints: MediaStreamConstraints =
      callType === 'video'
        ? {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
            video: {
              facingMode: 'user',
              width:  { ideal: 1280 },
              height: { ideal: 720  },
              frameRate: { ideal: 30 },
            },
          }
        : {
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
              sampleRate: 48000,
              channelCount: 1,
            },
            video: false,
          };

    this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    this._localStream$.next(this.localStream);
    log('_setupLocalMedia: acquired', this.localStream.getTracks().map(t => `${t.kind}:${t.label}`));
  }

  private async _createPeerConnection(callId: string): Promise<void> {
    // Guard: only create once per call
    if (this.peerConnection) {
      log('_createPeerConnection: already exists, skipping');
      return;
    }

    log('_createPeerConnection: creating RTCPeerConnection');
    this.peerConnection = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });

    // Add local tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        this.peerConnection!.addTrack(track, this.localStream!);
        log(`  added local track: ${track.kind}`);
      });
    }

    // ── Remote track handler ──────────────────────────────────────────────
    // CRITICAL: We build one MediaStream from all incoming tracks.
    // Do NOT create a new MediaStream per ontrack event — that breaks multi-track.
    this.remoteStream = new MediaStream();
    this._remoteStream$.next(this.remoteStream);

    this.peerConnection.ontrack = (event) => {
      log(`ontrack: received ${event.track.kind} track`);

      // Add track to our single remote stream
      this.remoteStream!.addTrack(event.track);

      // For audio-only calls: keep using HTMLAudioElement (no video element needed)
      const call = this._call$.value;
      if (call?.callType === 'audio' && event.track.kind === 'audio') {
        if (!this.remoteAudio) {
          this.remoteAudio = new Audio();
          this.remoteAudio.autoplay = true;
        }
        this.remoteAudio.srcObject = new MediaStream([event.track]);
      }

      // Re-emit so video components pick up the new track
      this._remoteStream$.next(this.remoteStream);

      // Mark as connected when we receive the first track
      this._markConnected();
    };

    // ── ICE candidates ────────────────────────────────────────────────────
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate && this.hubConnection) {
        try {
          await this.hubConnection.invoke(
            'SendIceCandidate',
            callId,
            JSON.stringify(event.candidate.toJSON())
          );
        } catch (e) {
          warn('Failed to send ICE candidate', e);
        }
      }
    };

    this.peerConnection.onicegatheringstatechange = () => {
      log(`ICE gathering state: ${this.peerConnection?.iceGatheringState}`);
    };

    // ── Connection state ──────────────────────────────────────────────────
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      log(`Connection state: ${state}`);

      if (state === 'connected') {
        this._markConnected();
      } else if (state === 'failed') {
        err('Connection state: failed');
        this._handleError('Connection failed');
      } else if (state === 'closed') {
        log('Connection state: closed (expected on cleanup)');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      log(`ICE connection state: ${state}`);

      if (state === 'disconnected') {
        // Give 5 s to recover before treating as failure
        setTimeout(() => {
          if (this.peerConnection?.iceConnectionState === 'disconnected') {
            warn('ICE disconnected for 5s, treating as failure');
            this._handleError('Network connection lost');
          }
        }, 5000);
      } else if (state === 'failed') {
        err('ICE connection state: failed');
        this._handleError('Network connection failed');
      }
    };

    // ── Negotiation needed (for renegotiation e.g. after screen share) ────
    // We do NOT use onnegotiationneeded to trigger offers automatically because
    // it fires at unexpected times. We control renegotiation manually via
    // replaceTrack (which does NOT require renegotiation in modern browsers).
    this.peerConnection.onnegotiationneeded = () => {
      log('onnegotiationneeded fired (not acting — using replaceTrack)');
    };
  }

  private async _createAndSendOffer(callId: string): Promise<void> {
    log('_createAndSendOffer: creating offer');
    const offer = await this.peerConnection!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: this._call$.value?.callType === 'video',
    });
    await this.peerConnection!.setLocalDescription(offer);
    await this.hubConnection!.invoke('SendOffer', callId, offer.sdp!);
    log('Offer sent');
  }

  private async _flushIceCandidates(): Promise<void> {
    log(`_flushIceCandidates: flushing ${this.iceCandidateBuffer.length} buffered candidates`);
    while (this.iceCandidateBuffer.length > 0) {
      const candidate = this.iceCandidateBuffer.shift()!;
      try {
        await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (e) {
        warn('Failed to add buffered ICE candidate', e);
      }
    }
  }

  // ==========================================================================
  // STATE HELPERS
  // ==========================================================================

  private _setCall(call: ActiveCall): void {
    this._call$.next(call);
  }

  private _setStatus(status: CallStatus): void {
    const call = this._call$.value;
    if (call) this._call$.next({ ...call, status });
  }

  private _markConnected(): void {
    const call = this._call$.value;
    if (call && call.status !== 'connected') {
      log('_markConnected: status → connected');
      this._call$.next({
        ...call,
        status: 'connected',
        connectedAt: call.connectedAt ?? new Date(),
      });
    }
  }

  private _handleError(message: string): void {
    err('_handleError:', message);
    this.callError$.next(message);
    this._setStatus('error');
    setTimeout(() => this._cleanup(), 3000);
  }

  private _cleanup(): void {
    log('_cleanup: releasing all resources');

    // Stop screen share
    this.screenStream?.getTracks().forEach(t => t.stop());
    this.screenStream = null;

    // Stop local media
    this.localStream?.getTracks().forEach(t => t.stop());
    this.localStream = null;
    this._localStream$.next(null);

    // Close peer connection
    this.peerConnection?.close();
    this.peerConnection = null;

    // Stop remote audio element (audio calls)
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }

    // Clear remote stream
    this.remoteStream = null;
    this._remoteStream$.next(null);

    // Reset flags
    this.iceCandidateBuffer     = [];
    this.remoteDescriptionSet   = false;
    this.isNegotiating          = false;

    this._call$.next(null);
    log('_cleanup: done');
  }

  ngOnDestroy(): void {
    this._cleanup();
    this.disconnect();
  }
}