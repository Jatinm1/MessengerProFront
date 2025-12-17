// src/app/models/call.models.ts

export type CallType = 'audio' | 'video';
export type CallStatus = 'idle' | 'initiating' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'declined' | 'missed' | 'busy';

export interface CallParticipant {
  userId: string;
  userName: string;
  displayName: string;
  photoUrl?: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
}

export interface CallSession {
  callId: string;
  conversationId: string;
  callType: CallType;
  initiatorId: string;
  recipientId: string;
  status: CallStatus;
  startedAt?: Date;
  endedAt?: Date;
  duration?: number;
}

export interface CallOffer {
  callId: string;
  conversationId: string;
  callType: CallType;
  from: CallParticipant;
  to: CallParticipant;
  sdp: RTCSessionDescriptionInit;
}

export interface CallAnswer {
  callId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface IceCandidate {
  callId: string;
  candidate: RTCIceCandidateInit;
}

export interface CallStateUpdate {
  callId: string;
  userId: string;
  isMuted?: boolean;
  isVideoOff?: boolean;
  isScreenSharing?: boolean;
}

export interface CallEndReason {
  reason: 'normal' | 'declined' | 'missed' | 'busy' | 'error' | 'timeout';
  message?: string;
}