// src/app/services/call.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, Subject, take } from 'rxjs';
import { WebRTCService } from './webrtc.service';
import { ChatService } from './chat.service';
import { CallSession, CallType, CallStatus, CallOffer, CallAnswer, IceCandidate, CallParticipant, CallStateUpdate, CallEndReason } from '../models/call.models';

@Injectable({
  providedIn: 'root'
})
export class CallService {
  private currentCall: CallSession | null = null;
  
  currentCall$ = new BehaviorSubject<CallSession | null>(null);
  incomingCall$ = new Subject<CallOffer>();
  callEnded$ = new Subject<{ callId: string; reason: CallEndReason }>();
  remoteStateUpdate$ = new Subject<CallStateUpdate>();
  
  private ringingTimeout: any = null;
  private connectingTimeout: any = null;

  // CRITICAL FIX: Store ICE candidates that arrive before we're ready
  private pendingRemoteIceCandidates: any[] = [];

  constructor(
    private webrtcService: WebRTCService,
    private chatService: ChatService
  ) {
    this.setupSignalRListeners();
  }

  private setupSignalRListeners(): void {
    // Incoming call offers
    this.chatService.hubConnection?.on('calloffer', async (offer: CallOffer) => {
      console.log('📞 Incoming call offer:', offer);
      
      this.currentCall = {
        callId: offer.callId,
        conversationId: offer.conversationId,
        callType: offer.callType,
        initiatorId: offer.from.userId,
        recipientId: offer.to.userId,
        status: 'ringing'
      };
      
      this.currentCall$.next(this.currentCall);
      this.incomingCall$.next(offer);
      
      this.ringingTimeout = setTimeout(() => {
        if (this.currentCall?.status === 'ringing') {
          this.endCall('missed', 'Call was not answered');
        }
      }, 45000);
    });

    // CRITICAL FIX: Call answers - only process if we're the CALLER
  this.chatService.hubConnection?.on('callanswer', async (answer: CallAnswer) => {
  console.log('✅ Call answer received:', answer);

  if (!this.currentCall || this.currentCall.callId !== answer.callId) {
    return;
  }

  // ✅ ONLY CALLER SHOULD PROCESS ANSWER
  if (this.currentCall.status !== 'ringing') {
    console.log('⚠️ Ignoring answer - not in ringing state');
    return;
  }

  console.log('✅ Processing answer as CALLER');

  this.clearRingingTimeout();
  this.updateCallStatus('connecting');

  try {
    await this.webrtcService.setRemoteDescription(answer.sdp);
    console.log('✅ Remote description set on CALLER');

    await this.processPendingIceCandidates();

    this.waitForConnection();
  } catch (error) {
    console.error('❌ Failed to process answer:', error);
    this.endCall('error', 'Failed to establish connection');
  }
});

    // ICE candidates
    this.chatService.hubConnection?.on('icecandidate', async (data: IceCandidate) => {
      if (this.currentCall?.callId === data.callId) {
        try {
          // Store candidates if remote description not set yet
          if (!this.webrtcService.hasRemoteDescription()) {
            console.log('📦 Buffering ICE candidate - remote description not set yet');
            this.pendingRemoteIceCandidates.push(data.candidate);
          } else {
            await this.webrtcService.addIceCandidate(data.candidate);
          }
        } catch (error) {
          console.error('❌ Error adding ICE candidate:', error);
        }
      }
    });

    // Call rejections
    this.chatService.hubConnection?.on('callrejected', (data: { callId: string; reason: string }) => {
      console.log('❌ Call rejected:', data);
      
      if (this.currentCall?.callId === data.callId) {
        this.clearAllTimeouts();
        this.updateCallStatus('declined');
        this.callEnded$.next({
          callId: data.callId,
          reason: { reason: 'declined', message: data.reason }
        });
        this.cleanup();
      }
    });

    // Call end
    this.chatService.hubConnection?.on('callended', (data: { callId: string; endedBy: string; reason: string }) => {
      console.log('📴 Call ended:', data);
      
      if (this.currentCall?.callId === data.callId) {
        this.clearAllTimeouts();
        this.updateCallStatus('ended');
        this.callEnded$.next({
          callId: data.callId,
          reason: { reason: 'normal', message: data.reason }
        });
        this.cleanup();
      }
    });

    // Remote state updates
    this.chatService.hubConnection?.on('callstateupdate', (data: CallStateUpdate) => {
      console.log('🔄 Remote state update:', data);
      
      if (this.currentCall?.callId === data.callId) {
        this.remoteStateUpdate$.next(data);
      }
    });

    // Busy signal
    this.chatService.hubConnection?.on('callbusy', (data: { callId: string }) => {
      console.log('📵 User is busy:', data);
      
      if (this.currentCall?.callId === data.callId) {
        this.clearAllTimeouts();
        this.updateCallStatus('busy');
        this.callEnded$.next({
          callId: data.callId,
          reason: { reason: 'busy', message: 'User is on another call' }
        });
        this.cleanup();
      }
    });
  }

  // CRITICAL FIX: Process pending ICE candidates after remote description is set
  private async processPendingIceCandidates(): Promise<void> {
    if (this.pendingRemoteIceCandidates.length > 0) {
      console.log(`📦 Processing ${this.pendingRemoteIceCandidates.length} pending ICE candidates`);
      
      for (const candidate of this.pendingRemoteIceCandidates) {
        try {
          await this.webrtcService.addIceCandidate(candidate);
        } catch (error) {
          console.error('❌ Error adding pending ICE candidate:', error);
        }
      }
      
      this.pendingRemoteIceCandidates = [];
    }
  }

  // CRITICAL FIX: Wait for WebRTC connection to establish
  private waitForConnection(): void {
    console.log('⏳ Waiting for WebRTC connection to establish...');
    
    // Set a timeout for connection
    this.connectingTimeout = setTimeout(() => {
      if (this.currentCall?.status === 'connecting') {
        console.log('❌ Connection timeout');
        this.endCall('error', 'Connection timeout');
      }
    }, 30000); // 30 seconds

    // Subscribe to connection state changes
    this.webrtcService.connectionState$
  .pipe(
    filter(state =>
      state === 'connected' ||
      state === 'failed' ||
      state === 'closed'
    ),
    take(1)
  )
  .subscribe(state => {
    console.log('🌐 Connection state:', state);

    if (state === 'connected') {
      console.log('✅ WebRTC connection established!');
      this.clearConnectingTimeout();
      this.updateCallStatus('connected');

      if (this.currentCall) {
        this.currentCall.startedAt = new Date();
        this.currentCall$.next(this.currentCall);
      }
    } else {
      if (
        this.currentCall?.status === 'connecting' &&
        !this.webrtcService.isCleaningUp
      ) {
        console.log('❌ WebRTC connection failed');
        this.clearConnectingTimeout();
        this.endCall('error', 'Connection failed');
      }
    }
  });

  }

  async initiateCall(
    recipientId: string,
    conversationId: string,
    callType: CallType,
    recipientInfo: CallParticipant,
    localParticipant: CallParticipant
  ): Promise<void> {
    try {
      if (this.currentCall && this.currentCall.status !== 'ended') {
        throw new Error('Already in a call');
      }

      const callId = this.generateCallId();
      
      this.currentCall = {
        callId,
        conversationId,
        callType,
        initiatorId: localParticipant.userId,
        recipientId,
        status: 'initiating'
      };
      
      console.log('📞 Created call session:', this.currentCall);
      this.currentCall$.next(this.currentCall);

      // Initialize WebRTC
      await this.webrtcService.initializePeerConnection();
      await this.webrtcService.getUserMedia(callType === 'audio');

      // CRITICAL FIX: Subscribe to ICE candidates BEFORE creating offer
      this.webrtcService.iceCandidates$.subscribe(async (candidate) => {
        await this.sendIceCandidate(callId, candidate);
      });

      // Create offer
      const offer = await this.webrtcService.createOffer();

      // Update status to ringing
      this.updateCallStatus('ringing');

      // Send offer through SignalR
      await this.sendCallOffer({
        callId,
        conversationId,
        callType,
        from: localParticipant,
        to: recipientInfo,
        sdp: offer
      });

      // Set timeout for no answer
      this.ringingTimeout = setTimeout(() => {
        if (this.currentCall?.status === 'ringing') {
          this.endCall('missed', 'No answer from recipient');
        }
      }, 45000);

    } catch (error) {
      console.error('❌ Error initiating call:', error);
      this.cleanup();
      throw error;
    }
  }

  async acceptCall(offer: CallOffer): Promise<void> {
     if (!this.currentCall || this.currentCall.status !== 'ringing') {
    console.warn('⚠️ acceptCall ignored — invalid state');
    return;
  }
    try {
      console.log('🎯 Accepting call:', offer);
      
      this.clearRingingTimeout();
      this.updateCallStatus('connecting');

      // Initialize WebRTC
      await this.webrtcService.initializePeerConnection();
      await this.webrtcService.getUserMedia(offer.callType === 'audio');

      // CRITICAL FIX: Subscribe to ICE candidates BEFORE creating answer
      this.webrtcService.iceCandidates$.subscribe(async (candidate) => {
        await this.sendIceCandidate(offer.callId, candidate);
      });

      // Set remote description (the offer) and create answer
      console.log('📝 Setting remote description and creating answer...');
      const answer = await this.webrtcService.createAnswer(offer.sdp);
      console.log('✅ Answer created successfully');

      // Send answer through SignalR
      await this.sendCallAnswer({
        callId: offer.callId,
        sdp: answer
      });
      console.log('📤 Answer sent via SignalR');

      // Process any pending ICE candidates
      await this.processPendingIceCandidates();

      // Wait for connection to establish
      this.waitForConnection();

    } catch (error) {
      console.error('❌ Error accepting call:', error);
      this.endCall('error', 'Failed to accept call');
      throw error;
    }
  }

  async rejectCall(callId: string, reason: string = 'Call declined'): Promise<void> {
    this.clearAllTimeouts();
    
    if (this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke('RejectCall', callId, reason);
    }
    
    this.cleanup();
  }

  async endCall(reason: CallEndReason['reason'] = 'normal', message?: string): Promise<void> {
    this.clearAllTimeouts();
    
    if (this.currentCall && this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'EndCall',
        this.currentCall.callId,
        message || 'Call ended'
      );
    }
    
    this.callEnded$.next({
      callId: this.currentCall?.callId || '',
      reason: { reason, message }
    });
    
    this.cleanup();
  }

  toggleAudio(): void {
    const isEnabled = this.webrtcService.toggleAudio();
    this.sendStateUpdate({ isMuted: !isEnabled });
  }

  toggleVideo(): void {
    const isEnabled = this.webrtcService.toggleVideo();
    this.sendStateUpdate({ isVideoOff: !isEnabled });
  }

  async toggleScreenShare(): Promise<void> {
    const isSharing = this.webrtcService.isScreenSharing();
    
    if (isSharing) {
      await this.webrtcService.stopScreenShare();
      this.sendStateUpdate({ isScreenSharing: false });
    } else {
      try {
        await this.webrtcService.startScreenShare();
        this.sendStateUpdate({ isScreenSharing: true });
      } catch (error) {
        console.error('Error toggling screen share:', error);
        throw error;
      }
    }
  }

  private async sendCallOffer(offer: CallOffer): Promise<void> {
    if (this.chatService.hubConnection) {
      // CRITICAL FIX: Send callId as first parameter
      await this.chatService.hubConnection.invoke(
        'SendCallOffer',
        offer.callId,
        offer.conversationId,
        offer.to.userId,
        offer.callType,
        offer.sdp
      );
      console.log('📤 Call offer sent with callId:', offer.callId);
    }
  }

  private async sendCallAnswer(answer: CallAnswer): Promise<void> {
    if (this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'SendCallAnswer',
        answer.callId,
        answer.sdp
      );
    }
  }

  private async sendIceCandidate(callId: string, candidate: RTCIceCandidate): Promise<void> {
    if (this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'SendIceCandidate',
        callId,
        candidate.toJSON()
      );
    }
  }

  private async sendStateUpdate(update: Partial<CallStateUpdate>): Promise<void> {
    if (this.currentCall && this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'SendCallStateUpdate',
        this.currentCall.callId,
        update
      );
    }
  }

  private updateCallStatus(status: CallStatus): void {
    if (this.currentCall) {
      console.log(`🔄 Call status updated: ${this.currentCall.status} → ${status}`);
      this.currentCall.status = status;
      this.currentCall$.next(this.currentCall);
    }
  }

  private clearRingingTimeout(): void {
    if (this.ringingTimeout) {
      clearTimeout(this.ringingTimeout);
      this.ringingTimeout = null;
    }
  }

  private clearConnectingTimeout(): void {
    if (this.connectingTimeout) {
      clearTimeout(this.connectingTimeout);
      this.connectingTimeout = null;
    }
  }

  private clearAllTimeouts(): void {
    this.clearRingingTimeout();
    this.clearConnectingTimeout();
  }

  private cleanup(): void {
    this.pendingRemoteIceCandidates = [];
    this.webrtcService.cleanup();
    this.currentCall = null;
    this.currentCall$.next(null);
  }

  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // CRITICAL FIX: Add method to get current user ID


  getCurrentCall(): CallSession | null {
    return this.currentCall;
  }

  isInCall(): boolean {
    return this.currentCall !== null && 
           this.currentCall.status !== 'ended' && 
           this.currentCall.status !== 'declined';
  }
}