import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, Subject, BehaviorSubject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { 
  Contact, Message, User, ConversationResponse, FriendRequest, Friend, 
  UserSearchResult, CreateGroupRequest, GroupDetails, UserProfile, 
  UpdateProfileRequest, MessageStatusDto, 
  SearchResponse,
  SearchFilters
} from '../models/chat.models';
import { AuthService } from './auth.service';
import { environment } from '../../env/env';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiBase: string = environment.apiUrl;
  public hubConnection?: signalR.HubConnection;
  
  // Connection state
  private connectionState$ = new BehaviorSubject<signalR.HubConnectionState>(
    signalR.HubConnectionState.Disconnected
  );
  
  // ========================================
  // MESSAGE EVENTS
  // ========================================
  messageReceived$ = new Subject<Message>();
  messageSent$ = new Subject<Message>();
  messageStatusUpdated$ = new Subject<{ messageId: number; conversationId?: string; status: string; readBy?: string }>();
  conversationReadUpdated$ = new Subject<{ conversationId: string; userId: string; lastReadMessageId: number }>();
  conversationMarkedAsRead$ = new Subject<{ conversationId: string; lastReadMessageId: number }>();
  
  // Message actions
  messageDeleted$ = new Subject<{ messageId: number; conversationId: string; deletedBy: string; deleteForEveryone: boolean }>();
  messageEdited$ = new Subject<{ messageId: number; conversationId: string; newBody: string; editedBy: string; editedAtUtc: string }>();
  messageActionError$ = new Subject<string>();
  
  // ========================================
  // USER STATUS EVENTS
  // ========================================
  userStatusChanged$ = new Subject<{ userId: string; userName?: string; displayName?: string; isOnline: boolean; lastSeenUtc?: string }>();
  
  // ========================================
  // FRIEND REQUEST EVENTS
  // ========================================
  friendRequestReceived$ = new Subject<FriendRequest>();
  friendRequestSent$ = new Subject<{ receiverId: string }>();
  friendRequestAccepted$ = new Subject<{ requestId: number; acceptedBy: string; acceptedByName: string }>();
  friendRequestAcceptedConfirm$ = new Subject<{ requestId: number }>();
  friendRequestRejected$ = new Subject<{ requestId: number; rejectedBy: string }>();
  friendRequestRejectedConfirm$ = new Subject<{ requestId: number }>();
  friendsListUpdated$ = new Subject<Friend[]>();
  friendRequestError$ = new Subject<string>();
  sentRequestsUpdated$ = new Subject<FriendRequest[]>();
  receivedRequestsUpdated$ = new Subject<FriendRequest[]>();
  
  // ========================================
  // GROUP EVENTS
  // ========================================
  groupCreated$ = new Subject<GroupDetails>();
  groupDeleted$ = new Subject<{ conversationId: string; groupName: string; deletedBy: string }>();
  groupLeft$ = new Subject<{ conversationId: string }>();
  groupMemberAdded$ = new Subject<{ conversationId: string; addedUserId: string; addedBy: string; groupDetails: GroupDetails }>();
  groupMemberRemoved$ = new Subject<{ conversationId: string; removedUserId: string; removedBy: string; groupDetails?: GroupDetails }>();
  groupInfoUpdated$ = new Subject<GroupDetails>();
  adminTransferred$ = new Subject<{ conversationId: string; oldAdminId: string; newAdminId: string; groupDetails: GroupDetails }>();
  groupCreationError$ = new Subject<string>();
  groupError$ = new Subject<string>();
  addedToGroup$ = new Subject<{ conversationId: string; addedBy: string }>();
  removedFromGroup$ = new Subject<{ conversationId: string; removedBy: string }>();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  // ========================================
  // HELPER METHODS
  // ========================================

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  getConnectionState(): Observable<signalR.HubConnectionState> {
    return this.connectionState$.asObservable();
  }

  isConnected(): boolean {
    return this.hubConnection?.state === signalR.HubConnectionState.Connected;
  }

  // ========================================
  // SIGNALR CONNECTION MANAGEMENT
  // ========================================

  async connectToHub(): Promise<void> {
    const token = this.authService.getToken();
    if (!token) {
      console.error('❌ No token found, cannot connect to SignalR');
      return;
    }

    const hubUrl = `${this.apiBase.replace('/api', '')}/hubs/chat`;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, {
        accessTokenFactory: () => token,
        skipNegotiation: false,
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.ServerSentEvents
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    this.setupEventHandlers();
    this.setupConnectionHandlers();

    try {
      await this.hubConnection.start();
      console.log('✅ SignalR Connected');
      this.connectionState$.next(signalR.HubConnectionState.Connected);
    } catch (err) {
      console.error('❌ SignalR Connection Error:', err);
      this.connectionState$.next(signalR.HubConnectionState.Disconnected);
      throw err;
    }
  }

  async disconnectFromHub(): Promise<void> {
    if (this.hubConnection) {
      try {
        await this.hubConnection.stop();
        console.log('✅ SignalR Disconnected');
        this.connectionState$.next(signalR.HubConnectionState.Disconnected);
      } catch (err) {
        console.error('❌ Error disconnecting from SignalR:', err);
      }
    }
  }

  private setupConnectionHandlers(): void {
    if (!this.hubConnection) return;

    this.hubConnection.onreconnecting(() => {
      console.log('🔄 SignalR Reconnecting...');
      this.connectionState$.next(signalR.HubConnectionState.Reconnecting);
    });

    this.hubConnection.onreconnected(() => {
      console.log('✅ SignalR Reconnected');
      this.connectionState$.next(signalR.HubConnectionState.Connected);
    });

    this.hubConnection.onclose((error) => {
      console.log('❌ SignalR Connection Closed', error);
      this.connectionState$.next(signalR.HubConnectionState.Disconnected);
    });
  }

  private setupEventHandlers(): void {
    if (!this.hubConnection) return;

    // ========================================
    // MESSAGE EVENTS
    // ========================================
    this.hubConnection.on('messageReceived', (message: Message) => {
      console.log('📨 Message Received:', message);
      this.messageReceived$.next(message);
    });

    this.hubConnection.on('messageSent', (message: Message) => {
      console.log('✅ Message Sent:', message);
      this.messageSent$.next(message);
    });

    this.hubConnection.on('messageStatusUpdated', (data: any) => {
      console.log('📊 Message Status Updated:', data);
      this.messageStatusUpdated$.next(data);
    });

    this.hubConnection.on('conversationReadUpdated', (data: any) => {
      console.log('👁️ Conversation Read Updated:', data);
      this.conversationReadUpdated$.next(data);
    });

    this.hubConnection.on('conversationMarkedAsRead', (data: any) => {
      console.log('✅ Conversation Marked As Read:', data);
      this.conversationMarkedAsRead$.next(data);
    });

    this.hubConnection.on('messageDeleted', (data: any) => {
      console.log('🗑️ Message Deleted:', data);
      this.messageDeleted$.next(data);
    });

    this.hubConnection.on('messageEdited', (data: any) => {
      console.log('✏️ Message Edited:', data);
      this.messageEdited$.next(data);
    });

    this.hubConnection.on('messageActionError', (error: string) => {
      console.error('❌ Message Action Error:', error);
      this.messageActionError$.next(error);
    });

    // ========================================
    // USER STATUS EVENTS
    // ========================================
    this.hubConnection.on('userStatusChanged', (data: any) => {
      if (data.lastSeenUtc) {
        data.lastSeenUtc = this.convertToLocal(data.lastSeenUtc);
      }
      this.userStatusChanged$.next(data);
    });

    // ========================================
    // FRIEND REQUEST EVENTS
    // ========================================
    this.hubConnection.on('friendRequestReceived', (request: FriendRequest) => {
      console.log('🔔 Friend Request Received:', request);
      this.friendRequestReceived$.next(request);
    });

    this.hubConnection.on('friendRequestSent', (data: any) => {
      console.log('📤 Friend Request Sent:', data);
      this.friendRequestSent$.next(data);
    });

    this.hubConnection.on('friendRequestAccepted', (data: any) => {
      console.log('✅ Friend Request Accepted (Sender):', data);
      this.friendRequestAccepted$.next(data);
    });

    this.hubConnection.on('friendRequestAcceptedConfirm', (data: any) => {
      console.log('✅ Friend Request Accepted (Accepter):', data);
      this.friendRequestAcceptedConfirm$.next(data);
    });

    this.hubConnection.on('friendRequestRejected', (data: any) => {
      console.log('❌ Friend Request Rejected (Sender):', data);
      this.friendRequestRejected$.next(data);
    });

    this.hubConnection.on('friendRequestRejectedConfirm', (data: any) => {
      console.log('❌ Friend Request Rejected (Rejecter):', data);
      this.friendRequestRejectedConfirm$.next(data);
    });

    this.hubConnection.on('friendsListUpdated', (friends: Friend[]) => {
      console.log('👥 Friends List Updated:', friends);
      this.friendsListUpdated$.next(friends);
    });

    this.hubConnection.on('sentRequestsUpdated', (requests: FriendRequest[]) => {
      console.log('📋 Sent Requests Updated:', requests);
      this.sentRequestsUpdated$.next(requests);
    });

    this.hubConnection.on('receivedRequestsUpdated', (requests: FriendRequest[]) => {
      console.log('📋 Received Requests Updated:', requests);
      this.receivedRequestsUpdated$.next(requests);
    });

    this.hubConnection.on('friendRequestError', (error: string) => {
      console.error('❌ Friend Request Error:', error);
      this.friendRequestError$.next(error);
    });

    // ========================================
    // GROUP EVENTS
    // ========================================
    this.hubConnection.on('groupCreated', (groupDetails: GroupDetails) => {
      console.log('🎉 Group Created:', groupDetails);
      this.groupCreated$.next(groupDetails);
    });

    this.hubConnection.on('groupDeleted', (data: any) => {
      console.log('🗑️ Group Deleted:', data);
      this.groupDeleted$.next(data);
    });

    this.hubConnection.on('groupLeft', (data: any) => {
      console.log('👋 Group Left:', data);
      this.groupLeft$.next(data);
    });

    this.hubConnection.on('groupMemberAdded', (data: any) => {
      console.log('➕ Group Member Added:', data);
      this.groupMemberAdded$.next(data);
    });

    this.hubConnection.on('groupMemberRemoved', (data: any) => {
      console.log('➖ Group Member Removed:', data);
      this.groupMemberRemoved$.next(data);
    });

    this.hubConnection.on('groupInfoUpdated', (groupDetails: GroupDetails) => {
      console.log('✏️ Group Info Updated:', groupDetails);
      this.groupInfoUpdated$.next(groupDetails);
    });

    this.hubConnection.on('adminTransferred', (data: any) => {
      console.log('👑 Admin Transferred:', data);
      this.adminTransferred$.next(data);
    });

    this.hubConnection.on('groupCreationError', (error: string) => {
      console.error('❌ Group Creation Error:', error);
      this.groupCreationError$.next(error);
    });

    this.hubConnection.on('groupError', (error: string) => {
      console.error('❌ Group Error:', error);
      this.groupError$.next(error);
    });

    this.hubConnection.on('addedToGroup', (data: any) => {
      console.log('➕ Added To Group:', data);
      this.addedToGroup$.next(data);
    });

    this.hubConnection.on('removedFromGroup', (data: any) => {
      console.log('➖ Removed From Group:', data);
      this.removedFromGroup$.next(data);
    });

    // ========================================
    // ERROR HANDLER
    // ========================================
    this.hubConnection.on('error', (error: string) => {
      console.error('❌ SignalR Error:', error);
    });
  }

  // ========================================
  // SIGNALR HUB METHODS - MESSAGING
  // ========================================

  async sendDirectMessage(userId: string, body: string, contentType: string = 'text', mediaUrl?: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('SendDirect', userId, body, contentType, mediaUrl || null);
  }

  async sendGroupMessage(conversationId: string, body: string, contentType: string = 'text', mediaUrl?: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('SendGroupMessage', conversationId, body, contentType, mediaUrl || null);
  }

  async markMessageRead(messageId: number): Promise<void> {
    if (!this.isConnected()) return;
    await this.hubConnection!.invoke('MarkMessageRead', messageId);
  }

  async markConversationRead(conversationId: string, lastReadMessageId: number): Promise<void> {
    if (!this.isConnected()) return;
    await this.hubConnection!.invoke('MarkConversationRead', conversationId, lastReadMessageId);
  }

  convertToLocal(utcDate: string): string {
    return new Date(utcDate).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata'
    });
  }

  // ========================================
  // SIGNALR HUB METHODS - MESSAGE ACTIONS
  // ========================================

  async deleteMessage(messageId: number, deleteForEveryone: boolean): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('DeleteMessage', messageId, deleteForEveryone);
  }

  async editMessage(messageId: number, newBody: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('EditMessage', messageId, newBody);
  }

  async forwardMessage(originalMessageId: number, targetConversationId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('ForwardMessage', originalMessageId, targetConversationId);
  }

  // ========================================
  // SIGNALR HUB METHODS - GROUPS
  // ========================================

  async createGroupViaHub(groupName: string, groupPhotoUrl: string | null, memberUserIds: string[]): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('CreateGroup', groupName, groupPhotoUrl, memberUserIds);
  }

  async addMemberToGroupViaHub(conversationId: string, userId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('AddMemberToGroup', conversationId, userId);
  }

  async removeMemberFromGroupViaHub(conversationId: string, userId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('RemoveMemberFromGroup', conversationId, userId);
  }

  async leaveGroupViaHub(conversationId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('LeaveGroup', conversationId);
  }

  async deleteGroupViaHub(conversationId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('DeleteGroup', conversationId);
  }

  async updateGroupInfoViaHub(conversationId: string, groupName: string | null, groupPhotoUrl: string | null): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('UpdateGroupInfo', conversationId, groupName, groupPhotoUrl);
  }

  async transferAdminViaHub(conversationId: string, newAdminId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('TransferAdmin', conversationId, newAdminId);
  }

  // ========================================
  // SIGNALR HUB METHODS - FRIEND REQUESTS
  // ========================================

  async sendFriendRequestViaHub(receiverId: string): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('SendFriendRequest', receiverId);
  }

  async acceptFriendRequestViaHub(requestId: number): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('AcceptFriendRequest', requestId);
  }

  async rejectFriendRequestViaHub(requestId: number): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('SignalR not connected. Please reconnect.');
    }
    await this.hubConnection!.invoke('RejectFriendRequest', requestId);
  }

  // ========================================
  // REST API METHODS - CHAT
  // ========================================

  getContacts(): Observable<Contact[]> {
    return this.http.get<Contact[]>(`${this.apiBase}/chat/contacts`, {
      headers: this.getHeaders()
    });
  }

  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.apiBase}/chat/all-users`, {
      headers: this.getHeaders()
    });
  }

  getHistory(conversationId: string, page: number = 1, pageSize: number = 30): Observable<Message[]> {
    return this.http.get<Message[]>(
      `${this.apiBase}/chat/history/${conversationId}?page=${page}&pageSize=${pageSize}`,
      { headers: this.getHeaders() }
    );
  }

  createConversation(userId: string): Observable<ConversationResponse> {
    return this.http.get<ConversationResponse>(
      `${this.apiBase}/chat/conversation/${userId}`,
      { headers: this.getHeaders() }
    );
  }

  markMessagesAsRead(conversationId: string, lastReadMessageId: number): Observable<void> {
    return this.http.post<void>(
      `${this.apiBase}/chat/mark-as-read/${conversationId}`,
      { lastReadMessageId },
      { 
        headers: this.getHeaders().set('Content-Type', 'application/json') 
      }
    );
  }

  updateMessageStatus(messageId: number, status: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiBase}/chat/message/${messageId}/status`,
      { status },
      { 
        headers: this.getHeaders().set('Content-Type', 'application/json') 
      }
    );
  }

  getMessageStatus(messageId: number): Observable<MessageStatusDto[]> {
    return this.http.get<MessageStatusDto[]>(
      `${this.apiBase}/chat/message/${messageId}/status`,
      { headers: this.getHeaders() }
    );
  }

  uploadMedia(file: File): Observable<{ url: string; publicId: string; type: string; contentType: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post<{ url: string; publicId: string; type: string; contentType: string }>(
      `${this.apiBase}/chat/upload/media`,
      formData,
      { headers: this.getHeaders().delete('Content-Type') }
    );
  }

  // ========================================
  // REST API METHODS - FRIENDS
  // ========================================

  searchUsers(searchTerm: string): Observable<UserSearchResult[]> {
    return this.http.get<UserSearchResult[]>(
      `${this.apiBase}/friends/search?term=${encodeURIComponent(searchTerm)}`,
      { headers: this.getHeaders() }
    );
  }

  sendFriendRequest(receiverId: string): Observable<any> {
    return this.http.post(
      `${this.apiBase}/friends/send-request`,
      { receiverId },
      { headers: this.getHeaders() }
    );
  }

  getSentRequests(): Observable<FriendRequest[]> {
    return this.http.get<FriendRequest[]>(
      `${this.apiBase}/friends/requests/sent`,
      { headers: this.getHeaders() }
    );
  }

  getReceivedRequests(): Observable<FriendRequest[]> {
    return this.http.get<FriendRequest[]>(
      `${this.apiBase}/friends/requests/received`,
      { headers: this.getHeaders() }
    );
  }

  acceptFriendRequest(requestId: number): Observable<any> {
    return this.http.post(
      `${this.apiBase}/friends/requests/${requestId}/accept`,
      {},
      { headers: this.getHeaders() }
    );
  }

  rejectFriendRequest(requestId: number): Observable<any> {
    return this.http.post(
      `${this.apiBase}/friends/requests/${requestId}/reject`,
      {},
      { headers: this.getHeaders() }
    );
  }

  getFriendsList(): Observable<Friend[]> {
    return this.http.get<Friend[]>(
      `${this.apiBase}/friends/list`,
      { headers: this.getHeaders() }
    );
  }

  checkFriendship(userId: string): Observable<{ areFriends: boolean }> {
    return this.http.get<{ areFriends: boolean }>(
      `${this.apiBase}/friends/check/${userId}`,
      { headers: this.getHeaders() }
    );
  }

  // ========================================
  // REST API METHODS - GROUPS
  // ========================================

  createGroup(request: CreateGroupRequest): Observable<any> {
    return this.http.post(
      `${this.apiBase}/group/create`,
      request,
      { headers: this.getHeaders() }
    );
  }

  getGroupDetails(conversationId: string): Observable<GroupDetails> {
    return this.http.get<GroupDetails>(
      `${this.apiBase}/group/${conversationId}`,
      { headers: this.getHeaders() }
    );
  }

  addGroupMember(conversationId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiBase}/group/${conversationId}/add-member`,
      { userId },
      { headers: this.getHeaders() }
    );
  }

  removeGroupMember(conversationId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiBase}/group/${conversationId}/remove-member`,
      { userId },
      { headers: this.getHeaders() }
    );
  }

  leaveGroup(conversationId: string): Observable<any> {
    return this.http.post(
      `${this.apiBase}/group/${conversationId}/leave`,
      {},
      { headers: this.getHeaders() }
    );
  }

  deleteGroup(conversationId: string): Observable<any> {
    return this.http.delete(
      `${this.apiBase}/group/${conversationId}`,
      { headers: this.getHeaders() }
    );
  }

  updateGroupInfo(conversationId: string, groupName?: string, groupPhotoUrl?: string): Observable<void> {
    return this.http.put<void>(
      `${this.apiBase}/group/${conversationId}`,
      { groupName, groupPhotoUrl },
      { headers: this.getHeaders() }
    );
  }

  isUserAdmin(conversationId: string): Observable<{ isAdmin: boolean }> {
    return this.http.get<{ isAdmin: boolean }>(
      `${this.apiBase}/group/${conversationId}/is-admin`,
      { headers: this.getHeaders() }
    );
  }

  transferAdmin(conversationId: string, newAdminId: string): Observable<any> {
    return this.http.post(
      `${this.apiBase}/group/${conversationId}/transfer-admin`,
      { newAdminId },
      { headers: this.getHeaders() }
    );
  }

  uploadGroupPhoto(conversationId: string, file: File): Observable<{ url: string; publicId: string }> {
    const formData = new FormData();
    formData.append('file', file);

    return this.http.post<{ url: string; publicId: string }>(
      `${this.apiBase}/group/${conversationId}/photo`,
      formData,
      { headers: this.getHeaders().delete('Content-Type') }
    );
  }

  searchMessages(filters: SearchFilters, page: number = 1, pageSize: number = 20): Observable<SearchResponse> {
  let params = new HttpParams()
    .set('query', filters.query)
    .set('page', page.toString())
    .set('pageSize', pageSize.toString());

  if (filters.senderId) {
    params = params.set('senderId', filters.senderId);
  }

  if (filters.conversationId) {
    params = params.set('conversationId', filters.conversationId);
  }

  if (filters.startDate) {
    params = params.set('startDate', filters.startDate);
  }

  if (filters.endDate) {
    params = params.set('endDate', filters.endDate);
  }

  return this.http.get<SearchResponse>(`${this.apiBase}/chat/search`, { params });
}

  // ========================================
  // REST API METHODS - USER PROFILE
  // ========================================

  getMyProfile(): Observable<UserProfile> {
    return this.http.get<UserProfile>(
      `${this.apiBase}/user/profile`,
      { headers: this.getHeaders() }
    );
  }

  getUserProfile(userId: string): Observable<UserProfile> {
    return this.http.get<UserProfile>(
      `${this.apiBase}/user/profile/${userId}`,
      { headers: this.getHeaders() }
    );
  }

  updateProfile(request: UpdateProfileRequest): Observable<any> {
    return this.http.put(
      `${this.apiBase}/user/profile`,
      request,
      { headers: this.getHeaders() }
    );
  }

  uploadProfilePhoto(file: File): Observable<{ url: string; publicId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    
    return this.http.post<{ url: string; publicId: string }>(
      `${this.apiBase}/user/profile/photo`,
      formData,
      { headers: this.getHeaders().delete('Content-Type') }
    );
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  /** @deprecated Use sendDirectMessage instead */
  async sendMessage(userId: string, body: string): Promise<void> {
    await this.sendDirectMessage(userId, body);
  }

  /** @deprecated Use markConversationRead instead */
  async markConversationAsReadViaHub(conversationId: string, lastReadMessageId: number): Promise<void> {
    await this.markConversationRead(conversationId, lastReadMessageId);
  }

  /** @deprecated Use markMessageRead instead */
  async markMessageAsReadViaHub(messageId: number): Promise<void> {
    await this.markMessageRead(messageId);
  }

  /** @deprecated Use sendDirectMessage with mediaUrl parameter */
  async sendDirectMedia(userId: string, mediaUrl: string, mediaType: string, caption?: string): Promise<void> {
    await this.sendDirectMessage(userId, caption || mediaUrl, mediaType, mediaUrl);
  }

  /** @deprecated Use sendGroupMessage with mediaUrl parameter */
  async sendGroupMedia(conversationId: string, mediaUrl: string, mediaType: string, caption?: string): Promise<void> {
    await this.sendGroupMessage(conversationId, caption || mediaUrl, mediaType, mediaUrl);
  }

  /** @deprecated Use deleteMessage instead */
  async deleteMessageViaHub(messageId: number, deleteForEveryone: boolean): Promise<void> {
    await this.deleteMessage(messageId, deleteForEveryone);
  }

  /** @deprecated Use editMessage instead */
  async editMessageViaHub(messageId: number, newBody: string): Promise<void> {
    await this.editMessage(messageId, newBody);
  }

  /** @deprecated Use forwardMessage instead */
  async forwardMessageViaHub(originalMessageId: number, targetConversationId: string): Promise<void> {
    await this.forwardMessage(originalMessageId, targetConversationId);
  }
}