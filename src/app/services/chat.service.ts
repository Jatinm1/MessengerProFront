import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import * as signalR from '@microsoft/signalr';
import { 
  Contact, Message, User, ConversationResponse, FriendRequest, Friend, 
  UserSearchResult, CreateGroupRequest, GroupDetails, UserProfile, 
  UpdateProfileRequest, MessageStatusDto 
} from '../models/chat.models';
import { AuthService } from './auth.service';
import { environment } from '../../env/env';

@Injectable({
  providedIn: 'root'
})
export class ChatService {
  private apiBase : string = environment.apiUrl;
  private hubConnection?: signalR.HubConnection;
  
  messageReceived$ = new Subject<Message>();
  messageSent$ = new Subject<Message>();
  
  friendRequestReceived$ = new Subject<FriendRequest>();
  friendRequestSent$ = new Subject<any>();
  friendRequestAccepted$ = new Subject<any>();
  friendRequestRejected$ = new Subject<any>();
  friendsListUpdated$ = new Subject<Friend[]>();
  friendRequestError$ = new Subject<string>();

  private groupLeftSubject = new Subject<string>();
groupLeft$ = this.groupLeftSubject.asObservable();

private groupCreatedSubject = new Subject<GroupDetails>();
groupCreated$ = this.groupCreatedSubject.asObservable();



  // Message Status Events
  messageStatusUpdated$ = new Subject<{ messageId: number; status: string }>();
  conversationReadUpdated$ = new Subject<{ conversationId: string; userId: string; lastReadMessageId: number }>();
  conversationMarkedAsRead$ = new Subject<{ conversationId: string; lastReadMessageId: number }>();
  
  // User Status Events
  userOnlineStatusChanged$ = new Subject<{ userId: string; isOnline: boolean; lastSeenUtc?: string }>();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

  private groupDeletedSubject = new Subject<{ conversationId: string; groupName: string; deletedBy: string }>();
groupDeleted$ = this.groupDeletedSubject.asObservable();

  private getHeaders(): HttpHeaders {
    const token = this.authService.getToken();
    return new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
  }

  async connectToHub(): Promise<void> {
    const token = this.authService.getToken();
    const hubUrl = `${this.apiBase.replace('/api', '')}/hubs/chat?access_token=${token}`;

    this.hubConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect()
      .build();

    this.hubConnection.on('messageReceived', (message: Message) => {
      this.messageReceived$.next(message);
    });

    this.hubConnection.on('messageSent', (message: Message) => {
      this.messageSent$.next(message);
    });

    this.hubConnection.on('friendRequestReceived', (request: FriendRequest) => {
      this.friendRequestReceived$.next(request);
    });

    this.hubConnection.on('friendRequestSent', (data: any) => {
      this.friendRequestSent$.next(data);
    });

    this.hubConnection.on('friendRequestAccepted', (data: any) => {
      this.friendRequestAccepted$.next(data);
    });

    this.hubConnection.on('friendRequestRejected', (data: any) => {
      this.friendRequestRejected$.next(data);
    });

    this.hubConnection.on('friendsListUpdated', (friends: Friend[]) => {
      this.friendsListUpdated$.next(friends);
    });

    this.hubConnection.on('friendRequestError', (error: string) => {
      this.friendRequestError$.next(error);
    });

    // ✅ Message Status Events
    this.hubConnection.on('messageStatusUpdated', (data: { messageId: number; conversationId?: string; status: string }) => {
      this.messageStatusUpdated$.next(data);
    });

    // ✅ Conversation Read Events
    this.hubConnection.on('conversationReadUpdated', (data: { conversationId: string; userId: string; lastReadMessageId: number }) => {
      this.conversationReadUpdated$.next(data);
    });

    this.hubConnection.on('conversationMarkedAsRead', (data: { conversationId: string; lastReadMessageId: number }) => {
      this.conversationMarkedAsRead$.next(data);
    });

    this.hubConnection.on("groupLeft", (payload) => {
  this.groupLeftSubject.next(payload.conversationId);
  

  
});

this.hubConnection.on("groupCreated", (groupDetails: GroupDetails) => {
  this.groupCreatedSubject.next(groupDetails);
});

// Add to connectToHub() method in chat.service.ts

this.hubConnection.on('messageDeleted', (data: { messageId: number; conversationId: string; deletedBy: string; deleteForEveryone: boolean }) => {
  this.messageDeleted$.next(data);
});

this.hubConnection.on('messageEdited', (data: { messageId: number; conversationId: string; newBody: string; editedBy: string; editedAtUtc: string }) => {
  this.messageEdited$.next(data);
});

this.hubConnection.on('messageActionError', (error: string) => {
  this.messageActionError$.next(error);
});

this.hubConnection.on('groupDeleted', (data: { conversationId: string; groupName: string; deletedBy: string }) => {
  this.groupDeletedSubject.next(data);
});


    // User Online Status Events
    this.hubConnection.on('userOnlineStatusChanged', (data: { userId: string; isOnline: boolean; lastSeenUtc?: string }) => {
      this.userOnlineStatusChanged$.next(data);
    });

    await this.hubConnection.start();
  }

  

  async disconnectFromHub(): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.stop();
    }
  }

  // Chat Methods
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
      `${this.apiBase}/chat/create-conversation?userId=${userId}`,
      { headers: this.getHeaders() }
    );
  }

  async sendMessage(userId: string, body: string): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.invoke('SendDirect', userId, body);
    }
  }

  async sendGroupMessage(conversationId: string, body: string): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.invoke('SendGroupMessage', conversationId, body);
    }
  }

  // ✅ NEW: SignalR Hub method to mark conversation as read
  async markConversationAsReadViaHub(conversationId: string, lastReadMessageId: number): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.invoke('MarkConversationRead', conversationId, lastReadMessageId);
    }
  }

  // ✅ NEW: SignalR Hub method to mark single message as read
  async markMessageAsReadViaHub(messageId: number): Promise<void> {
    if (this.hubConnection) {
      await this.hubConnection.invoke('MarkMessageRead', messageId);
    }
  }

  // HTTP endpoint (backup/fallback)
  markMessagesAsRead(conversationId: string, lastReadMessageId: number): Observable<void> {
    return this.http.post<void>(
      `${this.apiBase}/chat/mark-as-read/${conversationId}`,
      lastReadMessageId,
      { headers: this.getHeaders() }
    );
  }

  // Message Status Methods
  updateMessageStatus(messageId: number, status: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiBase}/chat/message/${messageId}/status`,
      JSON.stringify(status),
      { headers: this.getHeaders().set('Content-Type', 'application/json') }
    );
  }

  getMessageStatus(messageId: number): Observable<MessageStatusDto[]> {
    return this.http.get<MessageStatusDto[]>(
      `${this.apiBase}/chat/message/${messageId}/status`,
      { headers: this.getHeaders() }
    );
  }

  // Friend Methods
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

// returns { isAdmin: boolean }
isUserAdmin(conversationId: string): Observable<{ isAdmin: boolean }> {
  return this.http.get<{ isAdmin: boolean }>(
    `${this.apiBase}/chat/group/${conversationId}/is-admin`,
    { headers: this.getHeaders() }
  );
}

transferAdmin(conversationId: string, newAdminId: string): Observable<any> {
  return this.http.post(
    `${this.apiBase}/chat/group/${conversationId}/transfer-admin`,
    { newAdminId },
    { headers: this.getHeaders() }
  );
}


  // Group Methods
  createGroup(request: CreateGroupRequest): Observable<ConversationResponse> {
    return this.http.post<ConversationResponse>(
      `${this.apiBase}/group/create`,
      request,
      { headers: this.getHeaders() }
    );
  }

  getGroupDetails(conversationId: string): Observable<GroupDetails> {
    return this.http.get<GroupDetails>(
      `${this.apiBase}/chat/group/${conversationId}`,
      { headers: this.getHeaders() }
    );
  }

  addGroupMember(conversationId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiBase}/chat/group/${conversationId}/add-member`,
      { userId },
      { headers: this.getHeaders() }
    );
  }

  removeGroupMember(conversationId: string, userId: string): Observable<any> {
    return this.http.post(
      `${this.apiBase}/chat/group/${conversationId}/remove-member`,
      { userId },
      { headers: this.getHeaders() }
    );
  }

  leaveGroup(conversationId: string): Observable<any> {
  return this.http.post(
    `${this.apiBase}/chat/group/${conversationId}/leave`,
    {},
    { headers: this.getHeaders() }
  );
}

// Add this method for HTTP DELETE
deleteGroup(conversationId: string): Observable<any> {
  return this.http.delete(
    `${this.apiBase}/group/${conversationId}`,
    { headers: this.getHeaders() }
  );
}

// Add this method for SignalR deletion
async deleteGroupViaHub(conversationId: string): Promise<void> {
  if (this.hubConnection) {
    await this.hubConnection.invoke('DeleteGroup', conversationId);
  }
}



updateGroupInfo(conversationId: string, groupName?: string): Observable<void> {
    return this.http.put<void>(
      `${this.apiBase}/chat/group/${conversationId}`,
      { groupName},
      { headers: this.getHeaders() }
    );
  }

  // User Profile Methods
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

  

  // Add these methods to your existing ChatService

// Upload profile photo
uploadProfilePhoto(file: File): Observable<{ url: string; publicId: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  return this.http.post<{ url: string; publicId: string }>(
    `${this.apiBase}/user/profile/photo`,
    formData,
    { headers: this.getHeaders().delete('Content-Type') } // Remove Content-Type to let browser set it with boundary
  );
}

// Upload group photo
uploadGroupPhoto(conversationId: string, file: File): Observable<{ url: string; publicId: string }> {
  const formData = new FormData();
  formData.append('file', file);

   return this.http.post<{ url: string; publicId: string }>(
    `${this.apiBase}/chat/group/${conversationId}/photo`,
    formData,
    { headers: this.getHeaders().delete('Content-Type') }
  );
}

// Upload media (image/video) for chat
uploadMedia(file: File): Observable<{ url: string; publicId: string; type: string; contentType: string }> {
  const formData = new FormData();
  formData.append('file', file);
  
  return this.http.post<{ url: string; publicId: string; type: string; contentType: string }>(
    `${this.apiBase}/chat/upload/media`,
    formData,
    { headers: this.getHeaders().delete('Content-Type') }
  );
}

// Send media message via SignalR
async sendDirectMedia(userId: string, mediaUrl: string, mediaType: string, caption?: string): Promise<void> {
  if (this.hubConnection) {
    await this.hubConnection.invoke('SendDirectMedia', userId, mediaUrl, mediaType, caption || '');
  }
}

// Add to chat.service.ts

// Delete message via SignalR
async deleteMessageViaHub(messageId: number, deleteForEveryone: boolean): Promise<void> {
  if (this.hubConnection) {
    await this.hubConnection.invoke('DeleteMessage', messageId, deleteForEveryone);
  }
}

// Edit message via SignalR
async editMessageViaHub(messageId: number, newBody: string): Promise<void> {
  if (this.hubConnection) {
    await this.hubConnection.invoke('EditMessage', messageId, newBody);
  }
}

// Forward message via SignalR
async forwardMessageViaHub(originalMessageId: number, targetConversationId: string): Promise<void> {
  if (this.hubConnection) {
    await this.hubConnection.invoke('ForwardMessage', originalMessageId, targetConversationId);
  }
}

// Add new Subjects for real-time updates
messageDeleted$ = new Subject<{ messageId: number; conversationId: string; deletedBy: string; deleteForEveryone: boolean }>();
messageEdited$ = new Subject<{ messageId: number; conversationId: string; newBody: string; editedBy: string; editedAtUtc: string }>();
messageActionError$ = new Subject<string>();

// Send group media message via SignalR
async sendGroupMedia(conversationId: string, mediaUrl: string, mediaType: string, caption?: string): Promise<void> {
  if (this.hubConnection) {
    await this.hubConnection.invoke('SendGroupMedia', conversationId, mediaUrl, mediaType, caption || '');
  }
}

  updateProfile(request: UpdateProfileRequest): Observable<any> {
    return this.http.put(
      `${this.apiBase}/user/profile`,
      request,
      { headers: this.getHeaders() }
    );
  }
}