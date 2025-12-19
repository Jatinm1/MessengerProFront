import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  AfterViewChecked,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import {
  Contact,
  Message,
  User,
  GroupDetails,
  CreateGroupRequest,
  SearchResultDto,
} from '../../models/chat.models';
import { GroupComponent } from './group/group.component';
import { MessagesComponent } from './messages/messages.component';
import { ModalsComponent } from './modals/modals.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { SearchModalComponent } from './modals/search-modal/search-modal.component';
import Swal from 'sweetalert2';
import { CallService } from '../../services/call.service';
import { WebRTCService } from '../../services/webrtc.service';
import { CallSession, CallOffer, CallParticipant, CallType } from '../../models/call.models';
import { ActiveCallComponent } from '../call/active-call/active-call.component';
import { IncomingCallComponent } from '../call/incoming-call/incoming-call.component';
import { OutgoingCallComponent } from '../call/outgoing-call/outgoing-call.component';
// import { ActiveCallComponent } from '../call/active-call/active-call.component';
// import { IncomingCallComponent } from '../call/incoming-call/incoming-call.component';
// import { OutgoingCallComponent } from '../call/outgoing-call/outgoing-call.component';



interface MessageWithDate extends Message {
  dateLabel?: string;
  showDateDivider?: boolean;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    SidebarComponent,
    GroupComponent,
    MessagesComponent,
    ModalsComponent,
    SearchModalComponent,
    IncomingCallComponent,
    OutgoingCallComponent,
    ActiveCallComponent
  ],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css'],
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesComp') messagesComp!: MessagesComponent;
  @ViewChild('editInput') editInput?: ElementRef<HTMLInputElement>;
  @ViewChild('sidebarComp') sidebarComp!: SidebarComponent;

  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;
  private shouldScrollToTarget = false;
  private targetScrollPosition = 0;
  private userScrolledUp = false;
  private listenersSetup = false;

  currentCall: CallSession | null = null;
  incomingCallOffer: CallOffer | null = null;
  showIncomingCall = false;
  showOutgoingCall = false;
  showActiveCall = false;
  localCallParticipant: CallParticipant | null = null;
  remoteCallParticipant: CallParticipant | null = null;
  showSearchModal = false;
  searchTargetMessageId: number | null = null;

  currentUser: User | null = null;
  messages: MessageWithDate[] = [];
  contacts: Contact[] = []; // NEW: Store contacts for search modal

  currentChatUserId: string | null = null;
  conversationId: string | null = null;
  selectedContact: Contact | null = null;

  messageText = '';
  showChat = false;
  showNewMessageButton = false;
  newMessageCount = 0;
  firstUnreadMessageId: number | null = null;
  editingMessageId: number | null = null;

  // Emoji Picker
  showEmojiPicker = false;

  // Group Management
  showCreateGroupModal = false;
  showGroupDetailsModal = false;
  showAddMemberModal = false;
  showEditGroupModal = false;
  groupName = '';
  selectedFriendsForGroup: string[] = [];
  friendsList: User[] = [];
  currentGroupDetails: GroupDetails | null = null;

  // Edit Group
  editGroupName = '';
  selectedGroupPhotoFile: File | null = null;
  groupPhotoPreview: string | null = null;
  isUploadingGroupPhoto = false;

  // Add Member
  availableFriendsToAdd: User[] = [];
  selectedFriendToAdd: string | null = null;

  // Media upload properties
  selectedMediaFile: File | null = null;
  mediaPreview: string | null = null;
  isUploadingMedia = false;
  showMediaModal = false;
  mediaCaption = '';

  // Image/Video viewer modal
  showMediaViewer = false;
  viewerMediaUrl: string | null = null;
  viewerMediaType: 'image' | 'video' | null = null;

  showTransferAdminModal = false;
  transferableMembers: User[] = []; // list of members you can assign as admin
  selectedNewAdminId: string | null = null;

  // Add these new properties
  showDeleteGroupModal = false;
  deleteConfirmationText = '';

  showForwardModal = false;
  forwardMessage: Message | null = null;
  forwardContacts: Contact[] = [];

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    private callService: CallService,
    private webrtcService: WebRTCService
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const emojiPicker = document.querySelector('.emoji-picker-container');
    const emojiBtn = document.querySelector('.emoji-btn');

    if (
      this.showEmojiPicker &&
      emojiPicker &&
      !emojiPicker.contains(event.target as Node) &&
      emojiBtn &&
      !emojiBtn.contains(event.target as Node)
    ) {
      this.showEmojiPicker = false;
    }
  }

  async ngOnInit(): Promise<void> {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    try {
      await this.chatService.connectToHub();
      console.log('✅ SignalR Hub Connected');

      this.loadFriendsForGroup();
      this.setupSignalRListeners();
      this.setupCallListeners();      

      const navigation = this.router.getCurrentNavigation();
      const state = navigation?.extras?.state || window.history.state;

      if (state && state.conversationId) {
        setTimeout(() => {
          // The sidebar component will load contacts, so we find the contact there
          // For now, we simulate finding the contact to open the chat
          const tempContact: Contact = {
            conversationId: state.conversationId,
            isGroup: state.isGroup || false,
            userId: state.userId,
            displayName: state.displayName,
            unreadCount: 0,
          };
          this.openChat(tempContact);
        }, 200);
      }
    } catch (error) {
      console.error('Failed to connect to chat hub:', error);
    }

    try {
      await this.chatService.connectToHub();
      console.log('✅ SignalR Hub Connected');

      this.loadFriendsForGroup();
      this.setupSignalRListeners();

      this.chatService.messageDeleted$
        .pipe(takeUntil(this.destroy$))
        .subscribe((data) => {
          if (data.conversationId === this.conversationId) {
            this.messages = this.messages.map((msg) => {
              if (Number(msg.messageId) === data.messageId) {
                return {
                  ...msg,
                  isDeleted: true,
                  deletedForEveryone: data.deleteForEveryone,
                  body: null,
                };
              }
              return msg;
            });
            this.cdr.markForCheck();
          }
        });

      this.chatService.messageEdited$
        .pipe(takeUntil(this.destroy$))
        .subscribe((data) => {
          if (data.conversationId === this.conversationId) {
            this.messages = this.messages.map((msg) => {
              if (Number(msg.messageId) === data.messageId) {
                return {
                  ...msg,
                  body: data.newBody,
                  isEdited: true,
                  editedAtUtc: data.editedAtUtc,
                };
              }
              return msg;
            });
            this.cdr.markForCheck();
          }
        });

      this.chatService.messageActionError$
        .pipe(takeUntil(this.destroy$))
        .subscribe((error) => {
          alert(error);
        });

      // ADD THIS: Listen for group deletion events
      this.chatService.groupDeleted$
        .pipe(takeUntil(this.destroy$))
        .subscribe((data) => {
          // If the current chat is the deleted group, close it
          if (this.conversationId === data.conversationId) {
            this.selectedContact = null;
            this.showChat = false;
            this.conversationId = null;
            this.messages = [];
          }

          // Show notification to user
          // alert(`The group "${data.groupName}" has been deleted by an admin.`);
        });

      // ... rest of existing ngOnInit code ...
    } catch (error) {
      console.error('Failed to connect to chat hub:', error);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.messagesComp.setShouldScrollToBottom(true);
      this.shouldScrollToBottom = false;
    }

    if (this.shouldScrollToTarget) {
      this.scrollToPosition(this.targetScrollPosition);
      this.shouldScrollToTarget = false;
    }

    // ✅ Only auto-focus if NOT editing
    if (this.messagesComp && this.messagesComp.editingMessageId === null) {
      this.autoFocusMessageInput();
    }
  }

  private autoFocusMessageInput(): void {
    // ✅ Don't focus message input if we're editing a message
    if (this.editingMessageId !== null) {
      return;
    }

    // Don't focus if any modal is open
    const isAnyModalOpen =
      this.showCreateGroupModal ||
      this.showGroupDetailsModal ||
      this.showAddMemberModal ||
      this.showEditGroupModal ||
      this.showMediaModal ||
      this.showMediaViewer ||
      this.showEmojiPicker ||
      this.showSearchModal;

    if (this.showChat && !isAnyModalOpen) {
      setTimeout(() => {
        this.messagesComp.focusMessageInput();
      }, 0);
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.disconnectFromHub();
    if (this.currentCall) {
      this.callService.endCall("declined", "User left chat");
    }
  }

 // Replace your setupCallListeners method with this:
// Replace your setupCallListeners method with this:
private setupCallListeners(): void {
  // Listen for incoming calls
  this.callService.incomingCall$
    .pipe(takeUntil(this.destroy$))
    .subscribe((offer) => {
      console.log('📞 Incoming call received in component:', offer);
      this.incomingCallOffer = offer;
      this.remoteCallParticipant = offer.from;
      this.localCallParticipant = this.createLocalParticipant();
      this.showIncomingCall = true;
      
      // Hide other call UIs
      this.showOutgoingCall = false;
      this.showActiveCall = false;
      
      this.cdr.detectChanges();
    });

  // Listen for current call changes
  this.callService.currentCall$
    .pipe(takeUntil(this.destroy$))
    .subscribe((call) => {
      console.log('🔄 Call state changed:', call);
      this.currentCall = call;
      
      if (call) {
        // Determine which UI to show based on status
        switch (call.status) {
          case 'ringing':
            if (call.initiatorId === this.currentUser?.userId) {
              // Outgoing call - I initiated
              this.showOutgoingCall = true;
              this.showIncomingCall = false;
              this.showActiveCall = false;
            } else {
              // Incoming call - showing in incomingCall$ handler
              this.showIncomingCall = true;
              this.showOutgoingCall = false;
              this.showActiveCall = false;
            }
            break;
            
          case 'connecting':
            // Show connecting state
            console.log('⏳ Call connecting...');
            // Keep current UI showing
            break;
            
          case 'connected':
            // Show active call UI
            console.log('✅ Call connected, showing active call UI');
            this.showIncomingCall = false;
            this.showOutgoingCall = false;
            this.showActiveCall = true;
            break;
            
          case 'ended':
          case 'declined':
          case 'missed':
          case 'busy':
            // Hide all call UIs
            this.showIncomingCall = false;
            this.showOutgoingCall = false;
            this.showActiveCall = false;
            break;
        }
      } else {
        // No call - hide all UIs
        this.showIncomingCall = false;
        this.showOutgoingCall = false;
        this.showActiveCall = false;
      }
      
      this.cdr.detectChanges();
    });

  // Listen for call ended
  this.callService.callEnded$
    .pipe(takeUntil(this.destroy$))
    .subscribe((data) => {
      console.log('📴 Call ended:', data);
      
      this.showIncomingCall = false;
      this.showOutgoingCall = false;
      this.showActiveCall = false;
      this.currentCall = null;
      this.incomingCallOffer = null;
      this.remoteCallParticipant = null;
      
      // Show notification based on reason
      if (data.reason.reason === 'declined') {
        this.showNotification('Call declined', 'info');
      } else if (data.reason.reason === 'missed') {
        this.showNotification('Call was not answered', 'warning');
      } else if (data.reason.reason === 'busy') {
        this.showNotification('User is busy', 'warning');
      }
      
      this.cdr.detectChanges();
    });

  // Listen for remote state updates (mute, video, etc.)
  this.callService.remoteStateUpdate$
    .pipe(takeUntil(this.destroy$))
    .subscribe((state) => {
      console.log('🔄 Remote state update:', state);
      // The active-call component will handle this
      this.cdr.detectChanges();
    });
}

  // Initiate audio call
 async initiateAudioCall(): Promise<void> {
  if (!this.selectedContact || !this.currentUser) {
    console.error('❌ No contact selected or no current user');
    return;
  }
  
  console.log('📞 Initiating audio call to:', this.selectedContact.displayName);
  
  try {
    // Set participants BEFORE initiating call
    this.localCallParticipant = this.createLocalParticipant();
    this.remoteCallParticipant = this.createRemoteParticipant();
    
    await this.callService.initiateCall(
      this.selectedContact.userId!,
      this.conversationId!,
      'audio',
      this.remoteCallParticipant,
      this.localCallParticipant // Pass local participant too
    );
    
    // The UI will be updated by currentCall$ subscription
    
  } catch (error) {
    console.error('❌ Error initiating audio call:', error);
    this.showNotification('Failed to initiate call', 'error');
  }
}

  // Initiate video call
 async initiateVideoCall(): Promise<void> {
  if (!this.selectedContact || !this.currentUser) {
    console.error('❌ No contact selected or no current user');
    return;
  }
  
  console.log('📹 Initiating video call to:', this.selectedContact.displayName);
  
  try {
    // Set participants BEFORE initiating call
    this.localCallParticipant = this.createLocalParticipant();
    this.remoteCallParticipant = this.createRemoteParticipant();
    
    await this.callService.initiateCall(
      this.selectedContact.userId!,
      this.conversationId!,
      'video',
      this.remoteCallParticipant,
      this.localCallParticipant // Pass local participant too
    );
    
    // The UI will be updated by currentCall$ subscription
    
  } catch (error) {
    console.error('❌ Error initiating video call:', error);
    this.showNotification('Failed to initiate call', 'error');
  }
}

  // Accept incoming call
  // Replace your acceptIncomingCall method with this:
async acceptIncomingCall(): Promise<void> {
  // 🚫 HARD GUARD
  if (!this.incomingCallOffer) return;

  if (this.currentCall?.status !== 'ringing') {
    console.warn('⚠️ Accept ignored — call is already', this.currentCall?.status);
    return;
  }

  console.log('✅ Accepting incoming call:', this.incomingCallOffer.callId);

  // 🔒 Prevent second click immediately
  this.showIncomingCall = false;
  this.cdr.detectChanges();

  try {
    await this.callService.acceptCall(this.incomingCallOffer);
  } catch (error) {
    console.error('❌ Error accepting call:', error);
  }
}


  // Reject incoming call
  async rejectIncomingCall(): Promise<void> {
    if (!this.incomingCallOffer) return;
    
    try {
      await this.callService.rejectCall(this.incomingCallOffer.callId);
      this.showIncomingCall = false;
      this.incomingCallOffer = null;
    } catch (error) {
      console.error('Error rejecting call:', error);
    }
  }

  // Cancel outgoing call
  async cancelOutgoingCall(): Promise<void> {
    try {
      await this.callService.endCall('normal', 'Call cancelled');
    } catch (error) {
      console.error('Error cancelling call:', error);
    }
  }

  // End active call
  async endActiveCall(): Promise<void> {
    try {
      await this.callService.endCall("declined", "Call ended by user");
    } catch (error) {
      console.error('Error ending call:', error);
    }
  }

  // Toggle audio in active call
  toggleCallAudio(): void {
    this.callService.toggleAudio();
  }

  // Toggle video in active call
  toggleCallVideo(): void {
    this.callService.toggleVideo();
  }

  // Toggle screen share in active call
  async toggleCallScreenShare(): Promise<void> {
    try {
      await this.callService.toggleScreenShare();
    } catch (error) {
      console.error('Error toggling screen share:', error);
      this.showNotification('Failed to share screen', 'error');
    }
  }

  // Create local participant info
  private createLocalParticipant(): CallParticipant {
    return {
      userId: this.currentUser!.userId,
      userName: this.currentUser!.userName,
      displayName: this.currentUser!.displayName,
      photoUrl: this.currentUser!.profilePhotoUrl
    };
  }

  // Create remote participant info
  private createRemoteParticipant(): CallParticipant {
    return {
      userId: this.selectedContact!.userId!,
      userName: this.selectedContact!.userName!,
      displayName: this.selectedContact!.displayName,
      photoUrl: this.selectedContact!.photoUrl
    };
  }

  // Show notification helper
  private showNotification(message: string, type: 'success' | 'error' | 'info' | 'warning'): void {
    // Use SweetAlert or your preferred notification library
    Swal.fire({
      icon: type === 'success' ? 'success' : type === 'error' ? 'error' : type === 'warning' ? 'warning' : 'info',
      title: message,
      timer: 2000,
      showConfirmButton: false
    });
  }


  private setupSignalRListeners(): void {
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    this.chatService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        if (message.fromUserId === this.currentUser?.userId) return;

        if (message.conversationId === this.conversationId) {
          this.addMessageToView(message, false);

          if (this.userScrolledUp) {
            this.newMessageCount++;
            this.showNewMessageButton = true;
          } else {
            this.shouldScrollToBottom = true;
            setTimeout(() => this.markLastMessageAsRead(), 300);
          }
        }
      });

    this.chatService.messageSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        this.addMessageToView(message, true);
        this.shouldScrollToBottom = true;
      });

    this.chatService.messageStatusUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        const msg = this.messages.find(
          (m) => Number(m.messageId) === data.messageId
        );
        if (msg) {
          msg.messageStatus = data.status as any;
          this.cdr.detectChanges();
        }
      });

    this.chatService.conversationReadUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        this.messages.forEach((msg) => {
          if (
            Number(msg.messageId) <= data.lastReadMessageId &&
            msg.fromUserId === this.currentUser?.userId
          ) {
            msg.messageStatus = 'Read';
          }
        });
        this.cdr.detectChanges();
      });

    this.chatService.conversationMarkedAsRead$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        if (data.conversationId === this.conversationId) {
          this.firstUnreadMessageId = null;
          this.cdr.detectChanges();
        }
      });
  }

  loadFriendsForGroup(): void {
    this.chatService
      .getFriendsList()
      .pipe(takeUntil(this.destroy$))
      .subscribe((friends) => {
        this.friendsList = friends.map(
          (f) =>
            ({
              userId: f.friendUserId,
              userName: f.friendUserName,
              displayName: f.friendDisplayName,
            } as User)
        );
      });
  }

  openChat(contact: Contact): void {
    if (this.selectedContact?.conversationId === contact.conversationId) return;

    this.selectedContact = contact;
    this.conversationId = contact.conversationId;
    this.currentChatUserId = contact.userId || null;
    this.showChat = true;
    this.messages = [];
    this.userScrolledUp = false;
    this.showNewMessageButton = false;
    this.newMessageCount = 0;
    this.firstUnreadMessageId = null;

    // Don't clear searchTargetMessageId here - it's needed for the scroll

    this.loadHistory();
    this.loadGroupDetailsIfGroup();
  }

  loadHistory(): void {
    this.chatService
      .getHistory(this.conversationId!)
      .pipe(takeUntil(this.destroy$))
      .subscribe((history) => {
        this.messages = this.processMessages(history.reverse());

        // Only scroll to bottom if we're NOT trying to scroll to a specific message
        if (!this.searchTargetMessageId) {
          this.shouldScrollToBottom = true;
          this.markLastMessageAsRead();
        } else {
          console.log('Search target set, skipping auto-scroll to bottom');
        }
      });
  }

  loadGroupDetailsIfGroup(): void {
    this.currentGroupDetails = null;
    if (this.selectedContact?.isGroup) {
      this.chatService
        .getGroupDetails(this.conversationId!)
        .pipe(takeUntil(this.destroy$))
        .subscribe((details) => {
          this.currentGroupDetails = details;
        });
    }
  }

  private processMessages(messages: Message[]): MessageWithDate[] {
    const processed: MessageWithDate[] = [];
    let lastDate: string | null = null;

    messages.forEach((msg, index) => {
      const msgDate = new Date(msg.createdAtUtc).toDateString();
      const messageWithDate: MessageWithDate = { ...msg };

      if (msgDate !== lastDate) {
        messageWithDate.showDateDivider = true;
        messageWithDate.dateLabel = this.formatDateDivider(msg.createdAtUtc);
        lastDate = msgDate;
      }

      if (
        this.selectedContact?.unreadCount &&
        this.selectedContact.unreadCount > 0
      ) {
        const unreadIndex = messages.length - this.selectedContact.unreadCount;
        if (index === unreadIndex) {
          this.firstUnreadMessageId = Number(msg.messageId);
        }
      }

      processed.push(messageWithDate);
    });

    return processed;
  }

  private formatDateDivider(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    if (date.toDateString() === now.toDateString()) return 'Today';
    if (
      diff < 2 * oneDay &&
      date.toDateString() === new Date(now.getTime() - oneDay).toDateString()
    )
      return 'Yesterday';
    return date.toLocaleDateString();
  }

  addMessageToView(message: Message, isSent: boolean): void {
    const messageWithDate: MessageWithDate = { ...message };
    const lastMessage = this.messages[this.messages.length - 1];

    if (lastMessage) {
      const msgDate = new Date(message.createdAtUtc).toDateString();
      const lastMsgDate = new Date(lastMessage.createdAtUtc).toDateString();

      if (msgDate !== lastMsgDate) {
        messageWithDate.showDateDivider = true;
        messageWithDate.dateLabel = this.formatDateDivider(
          message.createdAtUtc
        );
      }
    } else {
      messageWithDate.showDateDivider = true;
      messageWithDate.dateLabel = this.formatDateDivider(message.createdAtUtc);
    }

    this.messages.push(messageWithDate);
    this.cdr.detectChanges();
  }

  sendMessage(): void {
    if (!this.messageText.trim() || !this.conversationId) return;

    const body = this.messageText.trim();

    if (this.selectedContact?.isGroup) {
      this.chatService.sendGroupMessage(this.conversationId, body);
    } else if (this.currentChatUserId) {
      this.chatService.sendDirectMessage(this.currentChatUserId, body);
    }

    this.messageText = '';
    this.showEmojiPicker = false;
  }

  markLastMessageAsRead(): void {
    if (
      this.messages.length > 0 &&
      this.selectedContact &&
      this.selectedContact.unreadCount &&
      this.selectedContact.unreadCount > 0
    ) {
      const lastMessage = this.messages[this.messages.length - 1];
      this.chatService.markConversationRead(
        this.conversationId!,
        Number(lastMessage.messageId)
      );
    }
  }

  onScroll(scrollTop: number): void {
    const container = this.messagesComp.messagesContainer.nativeElement;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;

    // If scrolled up more than 100px from the bottom
    this.userScrolledUp = scrollBottom > 100;

    if (!this.userScrolledUp) {
      this.showNewMessageButton = false;
      this.newMessageCount = 0;
    }
  }

  scrollToNewMessages(): void {
    if (this.firstUnreadMessageId && this.messagesComp.messagesContainer) {
      const targetElement =
        this.messagesComp.messagesContainer.nativeElement.querySelector(
          `[data-message-id="${this.firstUnreadMessageId}"]`
        );
      if (targetElement) {
        this.targetScrollPosition = targetElement.offsetTop - 50; // 50px offset for visibility
        this.shouldScrollToTarget = true;
        this.userScrolledUp = false;
        this.showNewMessageButton = false;
        this.newMessageCount = 0;
      }
    } else {
      this.shouldScrollToBottom = true;
      this.userScrolledUp = false;
      this.showNewMessageButton = false;
      this.newMessageCount = 0;
    }
  }

  scrollToPosition(position: number): void {
    this.messagesComp.messagesContainer.nativeElement.scrollTop = position;
  }

  private scrollToMessage(messageId: number): void {
    if (this.messagesComp && this.messagesComp.messagesContainer) {
      const targetElement =
        this.messagesComp.messagesContainer.nativeElement.querySelector(
          `[data-message-id="${messageId}"]`
        );
      if (targetElement) {
        const targetPosition = targetElement.offsetTop - 50; // 50px offset for visibility
        this.scrollToPosition(targetPosition);
      }
    }
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

  // --- Modals Logic ---

  // Media Upload
  onMediaSelected(file: File): void {
    this.selectedMediaFile = file;
    this.mediaCaption = this.messageText;
    this.messageText = '';

    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.mediaPreview = e.target.result;
      this.showMediaModal = true;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  cancelMediaUpload(): void {
    this.showMediaModal = false;
    this.selectedMediaFile = null;
    this.mediaPreview = null;
    this.mediaCaption = '';
    this.isUploadingMedia = false;
  }

  sendMediaMessage(): void {
    if (!this.selectedMediaFile || this.isUploadingMedia) return;

    this.isUploadingMedia = true;

    this.chatService
      .uploadMedia(this.selectedMediaFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const mediaUrl = response.url;
          const mediaType = response.contentType.startsWith('image')
            ? 'image'
            : 'video';
          const caption = this.mediaCaption;

          if (this.selectedContact?.isGroup) {
            this.chatService.sendGroupMessage(
              this.conversationId!,
              caption || mediaUrl,
              mediaType,
              mediaUrl
            );
          } else if (this.currentChatUserId) {
            this.chatService.sendDirectMessage(
              this.currentChatUserId,
              caption || mediaUrl,
              mediaType,
              mediaUrl
            );
          }

          this.cancelMediaUpload();
        },
        error: (err) => {
          console.error('Media upload failed:', err);
          this.isUploadingMedia = false;
        },
      });
  }

  // Media Viewer
  openMediaViewer(url: string, type: 'image' | 'video'): void {
    this.viewerMediaUrl = url;
    this.viewerMediaType = type;
    this.showMediaViewer = true;
  }

  closeMediaViewer(): void {
    this.showMediaViewer = false;
    this.viewerMediaUrl = null;
    this.viewerMediaType = null;
  }

  // Create Group
  openCreateGroupModal(): void {
    this.showCreateGroupModal = true;
    this.groupName = '';
    this.selectedFriendsForGroup = [];
  }

  closeCreateGroupModal(): void {
    this.showCreateGroupModal = false;
  }

  toggleFriendSelection(userId: string): void {
    const index = this.selectedFriendsForGroup.indexOf(userId);
    if (index > -1) {
      this.selectedFriendsForGroup.splice(index, 1);
    } else {
      this.selectedFriendsForGroup.push(userId);
    }
  }

  createGroup(): void {
    if (!this.groupName || this.selectedFriendsForGroup.length === 0) return;

    const memberUserIds = [
      this.currentUser!.userId,
      ...this.selectedFriendsForGroup,
    ];
    const request: CreateGroupRequest = {
      groupName: this.groupName,
      memberUserIds: memberUserIds,
    };

    this.chatService
      .createGroup(request)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.closeCreateGroupModal();
          // The sidebar component will reload contacts and the new group will appear
          // Optionally, auto-open the new chat
          // this.openChat({ conversationId: response.conversationId, isGroup: true, displayName: this.groupName, unreadCount: 0 });
        },
        error: (err) => {
          console.error('Group creation failed:', err);
        },
      });
  }

  // Group Details
  openGroupDetails(): void {
    if (this.selectedContact?.isGroup) {
      this.loadGroupDetailsIfGroup();
      this.showGroupDetailsModal = true;
    }
  }

  closeGroupDetailsModal(): void {
    this.showGroupDetailsModal = false;
  }

  isCurrentUserAdmin(): boolean {
    if (!this.currentGroupDetails || !this.currentUser) return false;
    return !!this.currentGroupDetails.members.find(
      (m) => m.userId === this.currentUser!.userId && m.isAdmin
    );
  }

  leaveGroup(): void {
    if (!this.conversationId) return;

    // Load up-to-date group details (we already have the API)
    this.chatService
      .getGroupDetails(this.conversationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((details) => {
        const currentUserId = this.authService.getCurrentUser()?.userId!;
        const currentUser = details.members.find(
          (m) => m.userId === currentUserId
        );

        if (!currentUser) {
          // Should not happen, but fallback to direct leave
          this.performLeaveGroup();
          return;
        }

        // If user is NOT admin → directly leave
        if (!currentUser.isAdmin) {
          this.performLeaveGroup();
          return;
        }

        // If user IS admin → open Transfer Admin modal
        this.openTransferAdminModal(details);
      });
  }

  openTransferAdminModal(details: GroupDetails): void {
    const currentUserId = this.authService.getCurrentUser()?.userId!;

    // Members who can be assigned new admin (everyone except current user)
    this.transferableMembers = details.members.filter(
      (m) => m.userId !== currentUserId
    );

    this.selectedNewAdminId = null;
    this.showTransferAdminModal = true;

    // Store it in case you need it later
    this.currentGroupDetails = details;
  }

  // handler: user clicked a member inside modal (bound to selectNewAdmin)
  onSelectNewAdmin(userId: string) {
    this.selectedNewAdminId = userId;
  }

  // handler: user clicked confirm "Assign & Leave" (bound to confirmTransferAdmin)
  onConfirmTransferAdmin(): void {
    if (!this.selectedNewAdminId || !this.conversationId) return;

    this.chatService
      .transferAdmin(this.conversationId, this.selectedNewAdminId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showTransferAdminModal = false;

          // After transferring admin → leave group
          this.performLeaveGroup();
        },
        error: () => {
          // this.showError("Failed to assign new admin. Try again.");
        },
      });
  }

  private refreshGroupDetailsAfterTransfer(): void {
    // optional: re-fetch group details to reflect new admin in UI
    // Implement according to your existing method for fetching group details
    // this.loadCurrentGroupDetails(); // replace with your actual method
  }

  // performLeaveGroup extracted from your original code
  performLeaveGroup(): void {
    if (
      !confirm(
        `Are you sure you want to leave the group "${this.currentGroupDetails?.groupName}"?`
      )
    )
      return;

    this.chatService
      .leaveGroup(this.conversationId!)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.closeGroupDetailsModal();
          this.selectedContact = null;
          this.showChat = false;
          this.conversationId = null;
        },
        error: (err) => {
          console.error('Failed to leave group:', err);
          // this.showError('Failed to leave group. Please try again.');
        },
      });
  }

  // handler for cancel modal (bound to cancelTransferAdmin output)
  onCancelTransferAdmin(): void {
    this.showTransferAdminModal = false;
    this.selectedNewAdminId = null;
  }

  removeMember(userId: string): void {
    if (!confirm('Are you sure you want to remove this member?')) return;

    this.chatService
      .removeGroupMember(this.conversationId!, userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadGroupDetailsIfGroup(); // Reload details to update member list
        },
        error: (err) => {
          console.error('Failed to remove member:', err);
        },
      });
  }

  // Add Member
  openAddMemberModal(): void {
    if (!this.currentGroupDetails) return;

    const currentMemberIds = this.currentGroupDetails.members.map(
      (m) => m.userId
    );
    this.availableFriendsToAdd = this.friendsList.filter(
      (f) => !currentMemberIds.includes(f.userId)
    );
    this.selectedFriendToAdd = null;
    this.showAddMemberModal = true;
  }

  closeAddMemberModal(): void {
    this.showAddMemberModal = false;
  }

  addMember(): void {
    if (!this.selectedFriendToAdd || !this.conversationId) return;

    this.chatService
      .addGroupMember(this.conversationId, this.selectedFriendToAdd)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.closeAddMemberModal();
          this.loadGroupDetailsIfGroup(); // Reload details to update member list
        },
        error: (err) => {
          console.error('Failed to add member:', err);
        },
      });
  }

  // Edit Group
  openEditGroupModal(): void {
    if (!this.currentGroupDetails) return;

    this.editGroupName = this.currentGroupDetails.groupName;
    this.groupPhotoPreview = this.currentGroupDetails.groupPhotoUrl || null;
    this.selectedGroupPhotoFile = null;
    this.isUploadingGroupPhoto = false;
    this.showEditGroupModal = true;
  }

  closeEditGroupModal(): void {
    this.showEditGroupModal = false;
  }

  onGroupPhotoSelected(file: File): void {
    this.selectedGroupPhotoFile = file;
    const reader = new FileReader();
    reader.onload = (e: any) => {
      this.groupPhotoPreview = e.target.result;
      this.cdr.detectChanges();
    };
    reader.readAsDataURL(file);
  }

  openDeleteGroupModal(): void {
    this.showDeleteGroupModal = true;
    this.deleteConfirmationText = '';
  }

  closeDeleteGroupModal(): void {
    this.showDeleteGroupModal = false;
    this.deleteConfirmationText = '';
  }

  // In the onDeleteMessage method:
  onDeleteMessage(event: {
    messageId: number;
    deleteForEveryone: boolean;
  }): void {
    this.chatService.deleteMessage(event.messageId, event.deleteForEveryone);
  }

  // In the onEditMessage method:
  onEditMessage(event: { messageId: number; newBody: string }): void {
    this.chatService.editMessage(event.messageId, event.newBody);
  }

  // In the onForwardMessage method:
  onForwardMessage(message: Message): void {
    // Load all contacts for forwarding
    this.chatService
      .getContacts()
      .pipe(takeUntil(this.destroy$))
      .subscribe((contacts) => {
        // Exclude current conversation
        this.forwardContacts = contacts.filter(
          (c) => c.conversationId !== this.conversationId
        );
        this.forwardMessage = message;
        this.showForwardModal = true;
      });
  }

  closeForwardModal(): void {
    this.showForwardModal = false;
    this.forwardMessage = null;
    this.forwardContacts = [];
  }

  forwardMessageTo(contact: Contact): void {
    if (this.forwardMessage) {
      this.chatService.forwardMessageViaHub(
        Number(this.forwardMessage.messageId),
        contact.conversationId
      );

      // Close modal
      this.closeForwardModal();

      // ⭐️ Automatically open the forwarded chat
      this.openChat(contact);

      // ⭐️ Scroll to bottom
      setTimeout(() => {
        this.shouldScrollToBottom = true;
        this.cdr.detectChanges();
      }, 200);
    }
  }

  deleteGroup(): void {
    if (this.deleteConfirmationText !== 'DELETE') {
      return;
    }

    if (!this.conversationId) {
      return;
    }

    this.chatService
      .deleteGroup(this.conversationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.closeDeleteGroupModal();
          this.closeGroupDetailsModal();
          this.selectedContact = null;
          this.showChat = false;
          this.conversationId = null;
          this.messages = [];
        this.success('Group deleted successfully.');
        },
        error: (err) => {
          console.error('Failed to delete group:', err);
          const errorMsg =
            err.error?.error ||
            'Failed to delete group. You may not have permission.';
          alert(errorMsg);
        },
      });
  }
  openSearchModal(): void {
    this.showSearchModal = true;
  }

  closeSearchModal(): void {
    this.showSearchModal = false;
  }

  async onMessageSelectedFromSearch(result: SearchResultDto): Promise<void> {
    console.log('Search result selected:', result);

    // Get contacts from sidebar component
    let targetContact = this.findContactByConversationId(result.conversationId);

    // If contact not found, reload contacts and try again
    if (!targetContact) {
      console.log('Contact not found in current list, reloading contacts...');
      await this.loadContactByConversationId(result.conversationId);
      targetContact = this.findContactByConversationId(result.conversationId);
    }

    if (!targetContact) {
      console.error('Could not find or load contact');
      return;
    }

    // Set the target message ID before opening chat
    this.searchTargetMessageId = result.messageId;

    // Close search modal
    this.closeSearchModal();

    // Open the chat
    this.openChat(targetContact);

    // Wait for messages to load, then scroll to target
    // Use a longer delay and retry mechanism
    this.waitForMessagesAndScroll(result.messageId);
  }

  private waitForMessagesAndScroll(
    messageId: number,
    attempt: number = 0
  ): void {
    const maxAttempts = 15; // Increased attempts
    const delay = 300; // Slightly longer delay

    if (attempt >= maxAttempts) {
      console.error('Could not find message after', maxAttempts, 'attempts');
      console.log(
        'Available messages:',
        this.messages.map((m) => m.messageId)
      );
      this.searchTargetMessageId = null; // Clear target on failure
      return;
    }

    setTimeout(() => {
      // Check if messages are loaded
      if (this.messages.length === 0) {
        console.log('Messages not loaded yet, retrying...', attempt + 1);
        this.waitForMessagesAndScroll(messageId, attempt + 1);
        return;
      }

      // Check if target message exists in messages array
      const messageFound = this.messages.find(
        (m) => Number(m.messageId) === messageId
      );

      if (messageFound) {
        console.log(
          'Message found in array, attempting scroll. MessageId:',
          messageId
        );

        // Force change detection to ensure DOM is updated
        this.cdr.detectChanges();

        // Give DOM time to render after change detection
        setTimeout(() => {
          this.scrollToMessage(messageId);
          // Clear the target after successful scroll
          setTimeout(() => {
            this.searchTargetMessageId = null;
          }, 3000);
        }, 100);
      } else {
        console.log(
          'Message not in array yet, retrying...',
          attempt + 1,
          'MessageId:',
          messageId
        );
        console.log(
          'Current message IDs:',
          this.messages.map((m) => m.messageId)
        );
        this.waitForMessagesAndScroll(messageId, attempt + 1);
      }
    }, delay);
  }

  // 4. Implement the findContactByConversationId method:
  private findContactByConversationId(conversationId: string): Contact | null {
    // Access contacts from sidebar component
    if (!this.sidebarComp || !this.sidebarComp.contacts) {
      console.error('Sidebar component or contacts not available');
      return null;
    }

    const contact = this.sidebarComp.contacts.find(
      (c) => c.conversationId === conversationId
    );
    return contact || null;
  }

  // 5. Implement the loadContactByConversationId method:
  private async loadContactByConversationId(
    conversationId: string
  ): Promise<void> {
    return new Promise((resolve) => {
      // Tell sidebar to reload its contacts
      if (this.sidebarComp) {
        this.sidebarComp.loadContacts();

        // Wait a bit for the contacts to load
        setTimeout(() => {
          resolve();
        }, 300);
      } else {
        resolve();
      }
    });
  }

  // 6. Update the getContactsForSearch method to actually return contacts:
  getContactsForSearch(): Contact[] {
    // Get contacts from sidebar component
    if (this.sidebarComp && this.sidebarComp.contacts) {
      return this.sidebarComp.contacts;
    }
    return [];
  }
  success(msg: string) {
  Swal.fire({
    icon: 'success',
    title: 'Success',
    text: msg,
    timer: 2000,
    showConfirmButton: false
  });
}


  updateGroupInfo(): void {
    if (!this.conversationId || !this.editGroupName) return;

    const updateName$ = this.chatService.updateGroupInfo(
      this.conversationId,
      this.editGroupName
    );
    let uploadPhoto$: Subject<any> | null = null;

    if (this.selectedGroupPhotoFile) {
      this.isUploadingGroupPhoto = true;
      uploadPhoto$ = new Subject<any>();
      this.chatService
        .uploadGroupPhoto(this.conversationId, this.selectedGroupPhotoFile)
        .subscribe({
          next: (res) => {
            uploadPhoto$!.next(res);
            uploadPhoto$!.complete();
          },
          error: (err) => {
            uploadPhoto$!.error(err);
          },
        });
    }

    updateName$.subscribe({
      next: () => {
        if (!uploadPhoto$) {
          this.handleGroupUpdateSuccess();
        }
      },
      error: (err) => {
        console.error('Failed to update group name:', err);
        this.isUploadingGroupPhoto = false;
      },
    });

    if (uploadPhoto$) {
      uploadPhoto$.subscribe({
        next: () => {
          this.handleGroupUpdateSuccess();
        },
        error: (err) => {
          console.error('Failed to upload group photo:', err);
          this.isUploadingGroupPhoto = false;
        },
      });
    }
  }

  private handleGroupUpdateSuccess(): void {
    this.isUploadingGroupPhoto = false;
    this.closeEditGroupModal();
    this.loadGroupDetailsIfGroup();
    // The sidebar component will update automatically via SignalR
  }
}
