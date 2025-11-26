import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { Contact, Message, User, GroupDetails, CreateGroupRequest } from '../../models/chat.models';
import { GroupComponent } from './group/group.component';
import { MessagesComponent } from './messages/messages.component';
import { ModalsComponent } from './modals/modals.component';
import { SidebarComponent } from './sidebar/sidebar.component';


interface MessageWithDate extends Message {
  dateLabel?: string;
  showDateDivider?: boolean;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, GroupComponent, MessagesComponent,ModalsComponent ],
 template: `
    <div class="app">
      <!-- Sidebar -->
      <app-sidebar
        [currentUser]="currentUser"
        [selectedContact]="selectedContact"
        (contactSelected)="openChat($event)"
        (createGroupClicked)="openCreateGroupModal()"
      ></app-sidebar>

      <!-- Chat panel -->
      <div class="chat-container">
        <app-group
          [selectedContact]="selectedContact"
          (openGroupDetails)="openGroupDetails()"
        ></app-group>

        <app-messages
          #messagesComp
          [messages]="messages"
          [selectedContact]="selectedContact"
          [currentUser]="currentUser"
          [showChat]="showChat"
          [showEmojiPicker]="showEmojiPicker"
          [showNewMessageButton]="showNewMessageButton"
          [newMessageCount]="newMessageCount"
          [firstUnreadMessageId]="firstUnreadMessageId"
          [(messageText)]="messageText"
          (sendMessageEvent)="sendMessage()"
          (mediaSelected)="onMediaSelected($event)"
          (toggleEmojiPicker)="toggleEmojiPicker()"
          (mediaClicked)="openMediaViewer($event.url, $event.type)"
          (scroll)="onScroll($event)"
          (scrollToNewMessages)="scrollToNewMessages()"
        ></app-messages>
      </div>

      <!-- Modals -->
      <app-modals
        [showMediaModal]="showMediaModal"
        [mediaPreview]="mediaPreview"
        [(mediaCaption)]="mediaCaption"
        [isUploadingMedia]="isUploadingMedia"
        [showMediaViewer]="showMediaViewer"
        [viewerMediaUrl]="viewerMediaUrl"
        [viewerMediaType]="viewerMediaType"
        (cancelMediaUpload)="cancelMediaUpload()"
        (sendMediaMessage)="sendMediaMessage()"
        (closeMediaViewer)="closeMediaViewer()"

        [showCreateGroupModal]="showCreateGroupModal"
        [(groupName)]="groupName"
        [selectedFriendsForGroup]="selectedFriendsForGroup"
        [friendsList]="friendsList"
        (closeCreateGroupModal)="closeCreateGroupModal()"
        (toggleFriendSelection)="toggleFriendSelection($event)"
        (createGroup)="createGroup()"

        [showGroupDetailsModal]="showGroupDetailsModal"
        [currentGroupDetails]="currentGroupDetails"
        [isCurrentUserAdmin]="isCurrentUserAdmin()"
        [currentUserId]="currentUser?.userId ?? null"
        (closeGroupDetailsModal)="closeGroupDetailsModal()"
        (openAddMemberModal)="openAddMemberModal()"
        (openEditGroupModal)="openEditGroupModal()"
        (leaveGroup)="leaveGroup()"
        (removeMember)="removeMember($event)"

        [showAddMemberModal]="showAddMemberModal"
        [availableFriendsToAdd]="availableFriendsToAdd"
        [(selectedFriendToAdd)]="selectedFriendToAdd"
        (closeAddMemberModal)="closeAddMemberModal()"
        (addMember)="addMember()"

        [showEditGroupModal]="showEditGroupModal"
        [(editGroupName)]="editGroupName"
        [groupPhotoPreview]="groupPhotoPreview"
        [isUploadingGroupPhoto]="isUploadingGroupPhoto"
        (closeEditGroupModal)="closeEditGroupModal()"
        (groupPhotoSelected)="onGroupPhotoSelected($event)"
        (updateGroupInfo)="updateGroupInfo()"
  [showTransferAdminModal]="showTransferAdminModal"
  [transferableMembers]="transferableMembers"
  [selectedNewAdminId]="selectedNewAdminId"
  (selectNewAdmin)="onSelectNewAdmin($event)"
  (confirmTransferAdmin)="onConfirmTransferAdmin()"
  (cancelTransferAdmin)="onCancelTransferAdmin()"

  [showDeleteGroupModal]="showDeleteGroupModal"
  [(deleteConfirmationText)]="deleteConfirmationText"
  (openDeleteGroupModal)="openDeleteGroupModal()"
  (closeDeleteGroupModal)="closeDeleteGroupModal()"
  (deleteGroup)="deleteGroup()"
      ></app-modals>
    </div>
  `,
  styles: [`
    .app {
      width: 100%;
      max-width: 1400px;
      height: 100%;
      background: #ffffff;
      display: flex;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
      margin: 0 auto;
    }

    .chat-container {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #f8fafc;
      height: 100vh;
    }

    /* Media Queries for responsiveness */
    @media (max-width: 768px) {
      .app {
        flex-direction: column;
        height: 100vh;
        margin: 0;
        border-radius: 0;
      }

      app-sidebar {
        /* Sidebar is handled by the main-layout for mobile */
        display: none;
      }

      .chat-container {
        flex: 1;
        min-height: 0;
      }
    }
  `]
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesComp') messagesComp!: MessagesComponent;

  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;
  private shouldScrollToTarget = false;
  private targetScrollPosition = 0;
  private userScrolledUp = false;
  private listenersSetup = false;

  currentUser: User | null = null;
  messages: MessageWithDate[] = [];

  currentChatUserId: string | null = null;
  conversationId: string | null = null;
  selectedContact: Contact | null = null;

  messageText = '';
  showChat = false;
  showNewMessageButton = false;
  newMessageCount = 0;
  firstUnreadMessageId: number | null = null;

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
transferableMembers: User[] = [];       // list of members you can assign as admin
selectedNewAdminId: string | null = null;

// Add these new properties
  showDeleteGroupModal = false;
  deleteConfirmationText = '';


  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const emojiPicker = document.querySelector('.emoji-picker-container');
    const emojiBtn = document.querySelector('.emoji-btn');

    if (this.showEmojiPicker &&
        emojiPicker &&
        !emojiPicker.contains(event.target as Node) &&
        emojiBtn &&
        !emojiBtn.contains(event.target as Node)) {
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
            unreadCount: 0
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
      
      // ADD THIS: Listen for group deletion events
      this.chatService.groupDeleted$
        .pipe(takeUntil(this.destroy$))
        .subscribe(data => {
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

    this.autoFocusMessageInput();
  }

  private autoFocusMessageInput(): void {
    // Don't focus if any modal is open
    const isAnyModalOpen = this.showCreateGroupModal ||
                          this.showGroupDetailsModal ||
                          this.showAddMemberModal ||
                          this.showEditGroupModal ||
                          this.showMediaModal ||
                          this.showMediaViewer ||
                          this.showEmojiPicker;

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
  }

  private setupSignalRListeners(): void {
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    this.chatService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
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
      .subscribe(message => {
        this.addMessageToView(message, true);
        this.shouldScrollToBottom = true;
      });

    this.chatService.messageStatusUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        const msg = this.messages.find(m => Number(m.messageId) === data.messageId);
        if (msg) {
          msg.messageStatus = data.status as any;
          this.cdr.detectChanges();
        }
      });

    this.chatService.conversationReadUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.messages.forEach(msg => {
          if (Number(msg.messageId) <= data.lastReadMessageId &&
              msg.fromUserId === this.currentUser?.userId) {
            msg.messageStatus = 'Read';
          }
        });
        this.cdr.detectChanges();
      });

    this.chatService.conversationMarkedAsRead$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data.conversationId === this.conversationId) {
          this.firstUnreadMessageId = null;
          this.cdr.detectChanges();
        }
      });
  }

  loadFriendsForGroup(): void {
    this.chatService.getFriendsList()
      .pipe(takeUntil(this.destroy$))
      .subscribe(friends => {
        this.friendsList = friends.map(f => ({
          userId: f.friendUserId,
          userName: f.friendUserName,
          displayName: f.friendDisplayName,
        } as User));
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

    this.loadHistory();
    this.loadGroupDetailsIfGroup();
  }

  loadHistory(): void {
    this.chatService.getHistory(this.conversationId!)
      .pipe(takeUntil(this.destroy$))
      .subscribe(history => {
        this.messages = this.processMessages(history.reverse());
        this.shouldScrollToBottom = true;
        this.markLastMessageAsRead();
      });
  }

  loadGroupDetailsIfGroup(): void {
    this.currentGroupDetails = null;
    if (this.selectedContact?.isGroup) {
      this.chatService.getGroupDetails(this.conversationId!)
        .pipe(takeUntil(this.destroy$))
        .subscribe(details => {
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

      if (this.selectedContact?.unreadCount && this.selectedContact.unreadCount > 0) {
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
    if (diff < 2 * oneDay && date.toDateString() === new Date(now.getTime() - oneDay).toDateString()) return 'Yesterday';
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
        messageWithDate.dateLabel = this.formatDateDivider(message.createdAtUtc);
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
      this.chatService.sendMessage(this.currentChatUserId, body);
    }

    this.messageText = '';
    this.showEmojiPicker = false;
  }

  markLastMessageAsRead(): void {
    if (this.messages.length > 0 && this.selectedContact && this.selectedContact.unreadCount && this.selectedContact.unreadCount > 0) {
      const lastMessage = this.messages[this.messages.length - 1];
      this.chatService.markConversationAsReadViaHub(this.conversationId!, Number(lastMessage.messageId));
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
      const targetElement = this.messagesComp.messagesContainer.nativeElement.querySelector(`[data-message-id="${this.firstUnreadMessageId}"]`);
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

    this.chatService.uploadMedia(this.selectedMediaFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          const mediaUrl = response.url;
          const mediaType = response.contentType.startsWith('image') ? 'image' : 'video';
          const caption = this.mediaCaption;

          if (this.selectedContact?.isGroup) {
            this.chatService.sendGroupMedia(this.conversationId!, mediaUrl, mediaType, caption);
          } else if (this.currentChatUserId) {
            this.chatService.sendDirectMedia(this.currentChatUserId, mediaUrl, mediaType, caption);
          }

          this.cancelMediaUpload();
        },
        error: (err) => {
          console.error('Media upload failed:', err);
          this.isUploadingMedia = false;
          // Optionally show an error message to the user
        }
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

    const memberUserIds = [this.currentUser!.userId, ...this.selectedFriendsForGroup];
    const request: CreateGroupRequest = {
      groupName: this.groupName,
      memberUserIds: memberUserIds
    };

    this.chatService.createGroup(request)
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
        }
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
    return !!this.currentGroupDetails.members.find(m => m.userId === this.currentUser!.userId && m.isAdmin);
  }

leaveGroup(): void {
  if (!this.conversationId) return;

  // Load up-to-date group details (we already have the API)
  this.chatService.getGroupDetails(this.conversationId)
    .pipe(takeUntil(this.destroy$))
    .subscribe(details => {
      const currentUserId = this.authService.getCurrentUser()?.userId!;
      const currentUser = details.members.find(m => m.userId === currentUserId);

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
  this.transferableMembers = details.members.filter(m => m.userId !== currentUserId);

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

  this.chatService.transferAdmin(this.conversationId, this.selectedNewAdminId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: () => {
        this.showTransferAdminModal = false;

        // After transferring admin → leave group
        this.performLeaveGroup();
      },
      error: () => {
        // this.showError("Failed to assign new admin. Try again.");
      }
    });
}


private refreshGroupDetailsAfterTransfer(): void {
  // optional: re-fetch group details to reflect new admin in UI
  // Implement according to your existing method for fetching group details
  // this.loadCurrentGroupDetails(); // replace with your actual method
}

// performLeaveGroup extracted from your original code
performLeaveGroup(): void {
  if (!confirm(`Are you sure you want to leave the group "${this.currentGroupDetails?.groupName}"?`)) return;

  this.chatService.leaveGroup(this.conversationId!)
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
      }
    });
}

// handler for cancel modal (bound to cancelTransferAdmin output)
onCancelTransferAdmin(): void {
  this.showTransferAdminModal = false;
  this.selectedNewAdminId = null;
}



  removeMember(userId: string): void {
    if (!confirm('Are you sure you want to remove this member?')) return;

    this.chatService.removeGroupMember(this.conversationId!, userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.loadGroupDetailsIfGroup(); // Reload details to update member list
        },
        error: (err) => {
          console.error('Failed to remove member:', err);
        }
      });
  }

  // Add Member
  openAddMemberModal(): void {
    if (!this.currentGroupDetails) return;

    const currentMemberIds = this.currentGroupDetails.members.map(m => m.userId);
    this.availableFriendsToAdd = this.friendsList.filter(f => !currentMemberIds.includes(f.userId));
    this.selectedFriendToAdd = null;
    this.showAddMemberModal = true;
  }

  closeAddMemberModal(): void {
    this.showAddMemberModal = false;
  }

  addMember(): void {
    if (!this.selectedFriendToAdd || !this.conversationId) return;

    this.chatService.addGroupMember(this.conversationId, this.selectedFriendToAdd)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.closeAddMemberModal();
          this.loadGroupDetailsIfGroup(); // Reload details to update member list
        },
        error: (err) => {
          console.error('Failed to add member:', err);
        }
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

  deleteGroup(): void {
    if (this.deleteConfirmationText !== 'DELETE') {
      return;
    }

    if (!this.conversationId) {
      return;
    }

    this.chatService.deleteGroup(this.conversationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.closeDeleteGroupModal();
          this.closeGroupDetailsModal();
          this.selectedContact = null;
          this.showChat = false;
          this.conversationId = null;
          this.messages = [];
          alert('Group deleted successfully.');
        },
        error: (err) => {
          console.error('Failed to delete group:', err);
          const errorMsg = err.error?.error || 'Failed to delete group. You may not have permission.';
          alert(errorMsg);
        }
      });
  }


  updateGroupInfo(): void {
    if (!this.conversationId || !this.editGroupName) return;

    const updateName$ = this.chatService.updateGroupInfo(this.conversationId, this.editGroupName);
    let uploadPhoto$: Subject<any> | null = null;

    if (this.selectedGroupPhotoFile) {
      this.isUploadingGroupPhoto = true;
      uploadPhoto$ = new Subject<any>();
      this.chatService.uploadGroupPhoto(this.conversationId, this.selectedGroupPhotoFile)
        .subscribe({
          next: (res) => {
            uploadPhoto$!.next(res);
            uploadPhoto$!.complete();
          },
          error: (err) => {
            uploadPhoto$!.error(err);
          }
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
      }
    });

    if (uploadPhoto$) {
      uploadPhoto$.subscribe({
        next: () => {
          this.handleGroupUpdateSuccess();
        },
        error: (err) => {
          console.error('Failed to upload group photo:', err);
          this.isUploadingGroupPhoto = false;
        }
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
