export interface CallHistoryEntry {
  callId:            string;
  conversationId:    string;
 
  callerId:          string;
  callerDisplayName: string;
  callerUserName:    string;
  callerPhotoUrl?:   string;
 
  calleeId:          string;
  calleeDisplayName: string;
  calleeUserName:    string;
  calleePhotoUrl?:   string;
 
  startedAt:         string;   // ISO datetime from server
  connectedAt?:      string;
  endedAt?:          string;
  durationSeconds:   number;
  reason:            string;   // ended | declined | missed | busy | disconnected | error
}
 