// ========================================
// src/app/services/call.service.ts
// WebRTC Audio Call Service
// Handles: signaling via SignalR, peer connection, media, state
// ========================================
import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { AuthService } from './auth.service';
import { environment } from '../../env/env';

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
  status: CallStatus;
  direction: 'outbound' | 'inbound';
  remote: CallParticipant;
  local: CallParticipant;
  startedAt?: Date;
  connectedAt?: Date;
  isMuted: boolean;
  isPeerMuted: boolean;
}

export interface IncomingCallEvent {
  callId: string;
  conversationId: string;
  callerId: string;
  callerName: string;
  callerPhoto?: string;
}

@Injectable({ providedIn: 'root' })
export class CallService implements OnDestroy {
  // ─── State ───────────────────────────────────────────────────────────────
  private _call$ = new BehaviorSubject<ActiveCall | null>(null);
  public call$ = this._call$.asObservable();

  // ─── Events ──────────────────────────────────────────────────────────────
  public incomingCall$ = new Subject<IncomingCallEvent>();
  public callEnded$ = new Subject<{ callId: string; reason: string; durationSeconds: number }>();
  public callError$ = new Subject<string>();

  // ─── WebRTC ──────────────────────────────────────────────────────────────
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private iceCandidateBuffer: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  // ─── SignalR ─────────────────────────────────────────────────────────────
  private hubConnection: signalR.HubConnection | null = null;
  private reconnectTimer: any = null;

  // ─── ICE Config (using Google STUN + optional TURN) ──────────────────────
  private readonly ICE_SERVERS: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    // Add TURN servers here if needed for production:
    // { urls: 'turn:your-turn-server.com:3478', username: 'user', credential: 'pass' }
  ];

  constructor(private authService: AuthService) {}

  // ========================================
  // SIGNALR CONNECTION
  // ========================================

  async connect(): Promise<void> {
    if (
      this.hubConnection &&
      this.hubConnection.state !== signalR.HubConnectionState.Disconnected
    ) {
      return;
    }

    const token = this.authService.getToken();
    if (!token) return;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(`${environment.apiUrl}/hubs/call`, {
        accessTokenFactory: () => token,
        transport: signalR.HttpTransportType.WebSockets,
        skipNegotiation: true,
      })
      .withAutomaticReconnect([1000, 2000, 5000, 10000])
      .configureLogging(signalR.LogLevel.Warning)
      .build();

    this.registerHubEvents();

    try {
      await this.hubConnection.start();
      console.log('📞 CallHub connected');
    } catch (err) {
      console.error('CallHub connection failed', err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
      this.hubConnection = null;
    }
  }

  // ========================================
  // OUTBOUND CALL
  // ========================================

  async startCall(
    toUserId: string,
    conversationId: string,
    localUser: CallParticipant,
    remoteUser?: CallParticipant
  ): Promise<void> {
    if (!this.hubConnection || this.hubConnection.state !== signalR.HubConnectionState.Connected) {
      await this.connect();
    }

    const callId = crypto.randomUUID();

    this.updateCall({
      callId,
      conversationId,
      status: 'initiating',
      direction: 'outbound',
      remote: remoteUser ?? { userId: toUserId, name: '...' },
      local: localUser,
      isMuted: false,
      isPeerMuted: false,
    });

    try {
      await this.hubConnection!.invoke('InitiateCall', toUserId, callId, conversationId);
      this.updateCallStatus('ringing');
    } catch (err) {
      this.handleError('Failed to initiate call');
    }
  }

  // ========================================
  // INBOUND CALL — ANSWER
  // ========================================

  async answerCall(event: IncomingCallEvent, localUser: CallParticipant): Promise<void> {
    if (!this.hubConnection) return;

    this.updateCall({
      callId: event.callId,
      conversationId: event.conversationId,
      status: 'connecting',
      direction: 'inbound',
      remote: { userId: event.callerId, name: event.callerName, photoUrl: event.callerPhoto },
      local: localUser,
      isMuted: false,
      isPeerMuted: false,
    });

    try {
      await this.setupLocalMedia();
      await this.hubConnection!.invoke('AnswerCall', event.callId);
    } catch (err) {
      this.handleError('Failed to answer call');
    }
  }

  // ========================================
  // INBOUND CALL — DECLINE
  // ========================================

  async declineCall(callId: string): Promise<void> {
    if (!this.hubConnection) return;
    try {
      await this.hubConnection!.invoke('DeclineCall', callId);
    } catch {}
    this.cleanup();
  }

  // ========================================
  // MUTE TOGGLE
  // ========================================

  async toggleMute(): Promise<void> {
    const call = this._call$.value;
    if (!call || !this.localStream) return;

    const newMuted = !call.isMuted;

    this.localStream.getAudioTracks().forEach((t) => {
      t.enabled = !newMuted;
    });

    this.updateCall({ ...call, isMuted: newMuted });

    try {
      await this.hubConnection!.invoke('UpdateCallState', call.callId, newMuted);
    } catch {}
  }

  // ========================================
  // END CALL
  // ========================================

  async endCall(): Promise<void> {
    const call = this._call$.value;
    if (!call || !this.hubConnection) return;

    try {
      await this.hubConnection!.invoke('EndCall', call.callId);
    } catch {}

    this.cleanup();
  }

  // ========================================
  // HUB EVENT HANDLERS
  // ========================================

  private registerHubEvents(): void {
    if (!this.hubConnection) return;

    // ── Incoming call notification ──────────────────────────────────────────
    this.hubConnection.on('incomingCall', (data: IncomingCallEvent) => {
      this.incomingCall$.next(data);
    });

    // ── Callee accepted ─────────────────────────────────────────────────────
    this.hubConnection.on('callAnswered', async ({ callId }: { callId: string }) => {
      const call = this._call$.value;
      if (!call || call.callId !== callId) return;

      this.updateCallStatus('connecting');

      try {
        await this.setupLocalMedia();
        await this.createPeerConnection(callId);
        await this.createAndSendOffer(callId);
      } catch (err) {
        this.handleError('Failed to connect call');
      }
    });

    // ── Callee busy ─────────────────────────────────────────────────────────
    this.hubConnection.on('calleeBusy', ({ callId }: { callId: string }) => {
      this.updateCallStatus('busy');
      setTimeout(() => this.cleanup(), 3000);
    });

    // ── Receive SDP Offer ───────────────────────────────────────────────────
    this.hubConnection.on('receiveOffer', async ({ callId, sdp }: { callId: string; sdp: string }) => {
      const call = this._call$.value;
      if (!call || call.callId !== callId) return;

      try {
        await this.createPeerConnection(callId);
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
        this.remoteDescriptionSet = true;
        await this.flushIceCandidates();
        const answer = await this.peerConnection!.createAnswer();
        await this.peerConnection!.setLocalDescription(answer);
        await this.hubConnection!.invoke('SendAnswer', callId, answer.sdp!);
      } catch (err) {
        this.handleError('WebRTC offer handling failed');
      }
    });

    // ── Receive SDP Answer ──────────────────────────────────────────────────
    this.hubConnection.on('receiveAnswer', async ({ callId, sdp }: { callId: string; sdp: string }) => {
      const call = this._call$.value;
      if (!call || call.callId !== callId) return;

      try {
        await this.peerConnection!.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
        this.remoteDescriptionSet = true;
        await this.flushIceCandidates();
      } catch (err) {
        this.handleError('WebRTC answer handling failed');
      }
    });

    // ── Receive ICE Candidate ───────────────────────────────────────────────
    this.hubConnection.on('receiveIceCandidate', async ({ callId, candidate }: { callId: string; candidate: string }) => {
      const call = this._call$.value;
      if (!call || call.callId !== callId) return;

      try {
        const parsed: RTCIceCandidateInit = JSON.parse(candidate);

        if (this.remoteDescriptionSet && this.peerConnection) {
          await this.peerConnection.addIceCandidate(new RTCIceCandidate(parsed));
        } else {
          this.iceCandidateBuffer.push(parsed);
        }
      } catch {}
    });

    // ── Peer mute state ─────────────────────────────────────────────────────
    this.hubConnection.on('peerStateChanged', ({ callId, isMuted }: { callId: string; userId: string; isMuted: boolean }) => {
      const call = this._call$.value;
      if (!call || call.callId !== callId) return;
      this.updateCall({ ...call, isPeerMuted: isMuted });
    });

    // ── Call ended ──────────────────────────────────────────────────────────
    this.hubConnection.on('callEnded', (data: { callId: string; reason: string; durationSeconds: number }) => {
      this.callEnded$.next(data);
      this.cleanup();
    });

    // ── Error ───────────────────────────────────────────────────────────────
    this.hubConnection.on('callError', ({ message }: { callId: string; message: string }) => {
      this.callError$.next(message);
      this.cleanup();
    });
  }

  // ========================================
  // WEBRTC INTERNALS
  // ========================================

  private async setupLocalMedia(): Promise<void> {
    this.localStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 48000,
        channelCount: 1,
      },
      video: false,
    });
  }

  private async createPeerConnection(callId: string): Promise<void> {
    if (this.peerConnection) return;

    this.peerConnection = new RTCPeerConnection({ iceServers: this.ICE_SERVERS });

    // Add local audio tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });
    }

    // Handle remote audio
    this.peerConnection.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!this.remoteAudio) {
        this.remoteAudio = new Audio();
        this.remoteAudio.autoplay = true;
      }
      this.remoteAudio.srcObject = remoteStream;
      this.updateCallStatus('connected');
      this.updateCallConnectedAt();
    };

    // ICE candidates
    this.peerConnection.onicecandidate = async (event) => {
      if (event.candidate && this.hubConnection) {
        await this.hubConnection.invoke(
          'SendIceCandidate',
          callId,
          JSON.stringify(event.candidate.toJSON())
        );
      }
    };

    // Connection state monitoring
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log(`WebRTC connection state: ${state}`);

      if (state === 'failed' || state === 'closed') {
        this.handleError('Connection lost');
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      const state = this.peerConnection?.iceConnectionState;
      if (state === 'disconnected') {
        // Give it a moment to recover before declaring failure
        setTimeout(() => {
          if (this.peerConnection?.iceConnectionState === 'disconnected') {
            this.handleError('Network connection lost');
          }
        }, 5000);
      }
    };
  }

  private async createAndSendOffer(callId: string): Promise<void> {
    const offer = await this.peerConnection!.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });
    await this.peerConnection!.setLocalDescription(offer);
    await this.hubConnection!.invoke('SendOffer', callId, offer.sdp!);
  }

  private async flushIceCandidates(): Promise<void> {
    while (this.iceCandidateBuffer.length > 0) {
      const candidate = this.iceCandidateBuffer.shift()!;
      try {
        await this.peerConnection!.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {}
    }
  }

  // ========================================
  // STATE HELPERS
  // ========================================

  private updateCall(call: ActiveCall): void {
    this._call$.next(call);
  }

  private updateCallStatus(status: CallStatus): void {
    const call = this._call$.value;
    if (call) this._call$.next({ ...call, status });
  }

  private updateCallConnectedAt(): void {
    const call = this._call$.value;
    if (call && !call.connectedAt) {
      this._call$.next({ ...call, status: 'connected', connectedAt: new Date() });
    }
  }

  private handleError(message: string): void {
    this.callError$.next(message);
    this.updateCallStatus('error');
    setTimeout(() => this.cleanup(), 3000);
  }

  private cleanup(): void {
    // Stop local media
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.localStream = null;

    // Close peer connection
    this.peerConnection?.close();
    this.peerConnection = null;

    // Stop remote audio
    if (this.remoteAudio) {
      this.remoteAudio.srcObject = null;
      this.remoteAudio = null;
    }

    this.iceCandidateBuffer = [];
    this.remoteDescriptionSet = false;
    this._call$.next(null);
  }

  ngOnDestroy(): void {
    this.cleanup();
    this.disconnect();
  }
}