// src/app/services/call.service.ts

import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { WebRTCService } from './webrtc.service';
import { ChatService } from './chat.service';
import { CallSession, CallType, CallStatus, CallOffer, CallAnswer, IceCandidate, CallParticipant, CallStateUpdate, CallEndReason } from '../models/call.models';

@Injectable({
  providedIn: 'root'
})
export class CallService {
  // Current call session
  private currentCall: CallSession | null = null;
  
  // Observables
  currentCall$ = new BehaviorSubject<CallSession | null>(null);
  incomingCall$ = new Subject<CallOffer>();
  callEnded$ = new Subject<{ callId: string; reason: CallEndReason }>();
  remoteStateUpdate$ = new Subject<CallStateUpdate>();
  
  // Call timeouts
  private ringingTimeout: any = null;
  private connectingTimeout: any = null;

  constructor(
    private webrtcService: WebRTCService,
    private chatService: ChatService
  ) {
    this.setupSignalRListeners();
  }

  // Setup SignalR listeners for call events
  private setupSignalRListeners(): void {
    // Listen for incoming call offers
    // Note: SignalR event names from C# are converted - use exact casing from server
    this.chatService.hubConnection?.on('calloffer', async (offer: CallOffer) => {
      console.log('📞 Incoming call offer:', offer);
      
      // Create call session for incoming call
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
      
      // Set timeout for missed call
      this.ringingTimeout = setTimeout(() => {
        if (this.currentCall?.status === 'ringing') {
          this.endCall('missed', 'Call was not answered');
        }
      }, 45000); // 45 seconds
    });

    // Listen for call answers
    this.chatService.hubConnection?.on('callanswer', async (answer: CallAnswer) => {
      console.log('✅ Call answered:', answer);
      
      if (this.currentCall?.callId === answer.callId) {
        this.clearRingingTimeout();
        this.updateCallStatus('connecting');
        
        try {
          await this.webrtcService.setRemoteDescription(answer.sdp);
          
          // Add a small delay to ensure WebRTC connection is established
          setTimeout(() => {
            this.updateCallStatus('connected');
            if (this.currentCall) {
              this.currentCall.startedAt = new Date();
              this.currentCall$.next(this.currentCall);
            }
          }, 500);
        } catch (error) {
          console.error('Error setting remote description:', error);
          this.endCall('error', 'Failed to establish connection');
        }
      }
    });

    // Listen for ICE candidates
    this.chatService.hubConnection?.on('icecandidate', async (data: IceCandidate) => {
      if (this.currentCall?.callId === data.callId) {
        try {
          await this.webrtcService.addIceCandidate(data.candidate);
        } catch (error) {
          console.error('Error adding ICE candidate:', error);
        }
      }
    });

    // Listen for call rejections
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

    // Listen for call end
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

    // Listen for remote state updates (mute, video off, screen share)
    this.chatService.hubConnection?.on('callstateupdate', (data: CallStateUpdate) => {
      console.log('🔄 Remote state update:', data);
      
      if (this.currentCall?.callId === data.callId) {
        this.remoteStateUpdate$.next(data);
      }
    });

    // Listen for busy signal
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

  // Initiate a call
  async initiateCall(
    recipientId: string,
    conversationId: string,
    callType: CallType,
    recipientInfo: CallParticipant,
    localParticipant: CallParticipant // Add this parameter
  ): Promise<void> {
    try {
      // Check if already in a call
      if (this.currentCall && this.currentCall.status !== 'ended') {
        throw new Error('Already in a call');
      }

      // Generate call ID
      const callId = this.generateCallId();
      
      // Create call session with proper initiator ID
      this.currentCall = {
        callId,
        conversationId,
        callType,
        initiatorId: localParticipant.userId, // Use the local participant's user ID
        recipientId,
        status: 'initiating'
      };
      
      console.log('📞 Created call session:', this.currentCall);
      this.currentCall$.next(this.currentCall);

      // Initialize WebRTC
      await this.webrtcService.initializePeerConnection();
      await this.webrtcService.getUserMedia(callType === 'audio');

      // Listen for ICE candidates and send them
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
        from: recipientInfo, // Will be set on server
        to: recipientInfo,
        sdp: offer
      });

      // Set timeout for no answer
      this.ringingTimeout = setTimeout(() => {
        if (this.currentCall?.status === 'ringing') {
          this.endCall('missed', 'No answer from recipient');
        }
      }, 45000); // 45 seconds

    } catch (error) {
      console.error('Error initiating call:', error);
      this.cleanup();
      throw error;
    }
  }

  // Accept incoming call
  async acceptCall(offer: CallOffer): Promise<void> {
    try {
      console.log('🎯 Accepting call:', offer);
      
      this.clearRingingTimeout();
      
      // Update call status to connecting
      if (this.currentCall) {
        this.currentCall.status = 'connecting';
        this.currentCall$.next(this.currentCall);
      }

      // Initialize WebRTC
      await this.webrtcService.initializePeerConnection();
      await this.webrtcService.getUserMedia(offer.callType === 'audio');

      // Listen for ICE candidates
      this.webrtcService.iceCandidates$.subscribe(async (candidate) => {
        await this.sendIceCandidate(offer.callId, candidate);
      });

      // Create answer
      const answer = await this.webrtcService.createAnswer(offer.sdp);

      // Send answer through SignalR
      await this.sendCallAnswer({
        callId: offer.callId,
        sdp: answer
      });

      // Wait a bit for the connection to establish
      setTimeout(() => {
        if (this.currentCall && this.currentCall.status === 'connecting') {
          this.updateCallStatus('connected');
          this.currentCall.startedAt = new Date();
          this.currentCall$.next(this.currentCall);
          console.log('✅ Call connected successfully');
        }
      }, 1000); // Give it 1 second to connect

    } catch (error) {
      console.error('Error accepting call:', error);
      this.endCall('error', 'Failed to accept call');
      throw error;
    }
  }

  // Reject incoming call
  async rejectCall(callId: string, reason: string = 'Call declined'): Promise<void> {
    this.clearAllTimeouts();
    
    if (this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke('RejectCall', callId, reason);
    }
    
    this.cleanup();
  }

  // End call
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

  // Toggle audio
  toggleAudio(): void {
    const isEnabled = this.webrtcService.toggleAudio();
    this.sendStateUpdate({ isMuted: !isEnabled });
  }

  // Toggle video
  toggleVideo(): void {
    const isEnabled = this.webrtcService.toggleVideo();
    this.sendStateUpdate({ isVideoOff: !isEnabled });
  }

  // Toggle screen share
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

  // Send call offer through SignalR
  private async sendCallOffer(offer: CallOffer): Promise<void> {
    if (this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'SendCallOffer',
        offer.conversationId,
        offer.to.userId,
        offer.callType,
        offer.sdp
      );
    }
  }

  // Send call answer through SignalR
  private async sendCallAnswer(answer: CallAnswer): Promise<void> {
    if (this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'SendCallAnswer',
        answer.callId,
        answer.sdp
      );
    }
  }

  // Send ICE candidate through SignalR
  private async sendIceCandidate(callId: string, candidate: RTCIceCandidate): Promise<void> {
    if (this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'SendIceCandidate',
        callId,
        candidate.toJSON()
      );
    }
  }

  // Send state update (mute, video, screen share)
  private async sendStateUpdate(update: Partial<CallStateUpdate>): Promise<void> {
    if (this.currentCall && this.chatService.hubConnection) {
      await this.chatService.hubConnection.invoke(
        'SendCallStateUpdate',
        this.currentCall.callId,
        update
      );
    }
  }

  // Update call status
  private updateCallStatus(status: CallStatus): void {
    if (this.currentCall) {
      console.log(`🔄 Call status updated: ${this.currentCall.status} → ${status}`);
      this.currentCall.status = status;
      this.currentCall$.next(this.currentCall);
    }
  }

  // Clear ringing timeout
  private clearRingingTimeout(): void {
    if (this.ringingTimeout) {
      clearTimeout(this.ringingTimeout);
      this.ringingTimeout = null;
    }
  }

  // Clear connecting timeout
  private clearConnectingTimeout(): void {
    if (this.connectingTimeout) {
      clearTimeout(this.connectingTimeout);
      this.connectingTimeout = null;
    }
  }

  // Clear all timeouts
  private clearAllTimeouts(): void {
    this.clearRingingTimeout();
    this.clearConnectingTimeout();
  }

  // Cleanup
  private cleanup(): void {
    this.webrtcService.cleanup();
    this.currentCall = null;
    this.currentCall$.next(null);
  }

  // Generate unique call ID
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get current call
  getCurrentCall(): CallSession | null {
    return this.currentCall;
  }

  // Check if in call
  isInCall(): boolean {
    return this.currentCall !== null && 
           this.currentCall.status !== 'ended' && 
           this.currentCall.status !== 'declined';
  }
}