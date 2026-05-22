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

  showSearchModal = false;
  searchTargetMessageId: number | null = null;

  currentUser: User | null = null;
  messages: MessageWithDate[] = [];
  contacts: Contact[] = [];

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
  transferableMembers: User[] = [];
  selectedNewAdminId: string | null = null;

  showDeleteGroupModal = false;
  deleteConfirmationText = '';

  showForwardModal = false;
  forwardMessage: Message | null = null;
  forwardContacts: Contact[] = [];

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

      const navigation = this.router.getCurrentNavigation();
      const state = navigation?.extras?.state || window.history.state;

      if (state && state.conversationId) {
        setTimeout(() => {
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

      this.chatService.messageDeleted$
  .pipe(takeUntil(this.destroy$))
  .subscribe((data) => {
    if (data.conversationId === this.conversationId) {
      console.log("hellllllllllllllllllllllllllo",this.currentUser);

      console.log('deletedBy:', data.deletedBy);
console.log('currentUserId:', this.currentUser?.userId);
console.log('match:', data.deletedBy === this.currentUser?.userId);
      
      if (!data.deleteForEveryone && data.deletedBy !== this.currentUser?.userId) {
        // ✅ "Delete for me" and I'm not the one who deleted it — do nothing
        return;
      }

      if (!data.deleteForEveryone && data.deletedBy === this.currentUser?.userId) {
        // ✅ "Delete for me" and I deleted it — remove from list entirely
        this.messages = this.messages.filter(
          (msg) => Number(msg.messageId) !== data.messageId
        );
        this.cdr.markForCheck();
        return;
      }

      // ✅ Delete for everyone — show placeholder for all
      this.messages = this.messages.map((msg) => {
        if (Number(msg.messageId) === data.messageId) {
          return {
            ...msg,
            isDeleted: true,
            deletedForEveryone: true,
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

      this.chatService.groupDeleted$
        .pipe(takeUntil(this.destroy$))
        .subscribe((data) => {
          if (this.conversationId === data.conversationId) {
            this.selectedContact = null;
            this.showChat = false;
            this.conversationId = null;
            this.messages = [];
          }
        });
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

    if (this.messagesComp && this.messagesComp.editingMessageId === null) {
      this.autoFocusMessageInput();
    }
  }

  private autoFocusMessageInput(): void {
    if (this.editingMessageId !== null) return;

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
  }

  // ========================================
  // SIGNALR LISTENERS
  // ========================================
  private setupSignalRListeners(): void {
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    this.chatService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        if (message.fromUserId === this.currentUser?.userId) return;

        if (message.conversationId === this.conversationId) {
          const messageExists = this.messages.some(
            m => Number(m.messageId) === Number(message.messageId)
          );

          if (!messageExists) {
            console.log('✅ Adding new received message:', message.messageId);
            this.addMessageToView(message, false);

            if (this.userScrolledUp) {
              this.newMessageCount++;
              this.showNewMessageButton = true;
            } else {
              this.shouldScrollToBottom = true;
              setTimeout(() => this.markLastMessageAsRead(), 300);
            }
          } else {
            console.log('⚠️ Duplicate message ignored:', message.messageId);
          }
        }
      });

    this.chatService.messageSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe((message) => {
        const messageExists = this.messages.some(
          m => Number(m.messageId) === Number(message.messageId)
        );

        if (!messageExists) {
          console.log('✅ Adding new sent message:', message.messageId);
          this.addMessageToView(message, true);
          this.shouldScrollToBottom = true;
        } else {
          console.log('⚠️ Duplicate sent message ignored:', message.messageId);
        }
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

    this.loadHistory();
    this.loadGroupDetailsIfGroup();
  }

  loadHistory(): void {
    this.chatService
      .getHistory(this.conversationId!)
      .pipe(takeUntil(this.destroy$))
      .subscribe((history) => {
        this.messages = this.processMessages(history.reverse());

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
      this.chatService.sendDirectMessage(this.currentChatUserId, body);
    }

    this.messageText = '';
    this.showEmojiPicker = false;
  }

  markLastMessageAsRead(): void {
    if (this.messages.length === 0 || !this.conversationId) return;

    const lastMessage = this.messages[this.messages.length - 1];
    if (lastMessage.fromUserId === this.currentUser?.userId) return;

    this.chatService.markConversationRead(
      this.conversationId,
      Number(lastMessage.messageId)
    );

    console.log(`✅ Marked conversation ${this.conversationId} as read up to message ${lastMessage.messageId}`);
  }

  onScroll(scrollTop: number): void {
    const container = this.messagesComp.messagesContainer.nativeElement;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;
    const scrollBottom = scrollHeight - scrollTop - clientHeight;

    this.userScrolledUp = scrollBottom > 100;

    if (!this.userScrolledUp) {
      this.showNewMessageButton = false;
      this.newMessageCount = 0;

      if (this.messages.length > 0 && this.selectedContact) {
        const lastMessage = this.messages[this.messages.length - 1];
        if (lastMessage.fromUserId !== this.currentUser?.userId) {
          this.markLastMessageAsRead();
        }
      }
    }
  }

  scrollToNewMessages(): void {
    if (this.firstUnreadMessageId && this.messagesComp.messagesContainer) {
      const targetElement =
        this.messagesComp.messagesContainer.nativeElement.querySelector(
          `[data-message-id="${this.firstUnreadMessageId}"]`
        );
      if (targetElement) {
        this.targetScrollPosition = targetElement.offsetTop - 50;
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

    setTimeout(() => {
      this.markLastMessageAsRead();
    }, 500);
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
        const targetPosition = targetElement.offsetTop - 50;
        this.scrollToPosition(targetPosition);
      }
    }
  }

  toggleEmojiPicker(): void {
    this.showEmojiPicker = !this.showEmojiPicker;
  }

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
          const mediaType = response.contentType.startsWith('image') ? 'image' : 'video';
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
        next: () => {
          this.closeCreateGroupModal();
        },
        error: (err) => {
          console.error('Group creation failed:', err);
        },
      });
  }

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

    this.chatService
      .getGroupDetails(this.conversationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe((details) => {
        const currentUserId = this.authService.getCurrentUser()?.userId!;
        const currentUser = details.members.find(
          (m) => m.userId === currentUserId
        );

        if (!currentUser || !currentUser.isAdmin) {
          this.performLeaveGroup();
          return;
        }

        this.openTransferAdminModal(details);
      });
  }

  openTransferAdminModal(details: GroupDetails): void {
    const currentUserId = this.authService.getCurrentUser()?.userId!;
    this.transferableMembers = details.members.filter(
      (m) => m.userId !== currentUserId
    );
    this.selectedNewAdminId = null;
    this.showTransferAdminModal = true;
    this.currentGroupDetails = details;
  }

  onSelectNewAdmin(userId: string): void {
    this.selectedNewAdminId = userId;
  }

  onConfirmTransferAdmin(): void {
    if (!this.selectedNewAdminId || !this.conversationId) return;

    this.chatService
      .transferAdmin(this.conversationId, this.selectedNewAdminId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showTransferAdminModal = false;
          this.performLeaveGroup();
        },
        error: () => {},
      });
  }

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
        },
      });
  }

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
          this.loadGroupDetailsIfGroup();
        },
        error: (err) => {
          console.error('Failed to remove member:', err);
        },
      });
  }

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
          this.loadGroupDetailsIfGroup();
        },
        error: (err) => {
          console.error('Failed to add member:', err);
        },
      });
  }

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

  onDeleteMessage(event: { messageId: number; deleteForEveryone: boolean }): void {
    this.chatService.deleteMessage(event.messageId, event.deleteForEveryone);
  }

  onEditMessage(event: { messageId: number; newBody: string }): void {
    this.chatService.editMessage(event.messageId, event.newBody);
  }

  onForwardMessage(message: Message): void {
    this.chatService
      .getContacts()
      .pipe(takeUntil(this.destroy$))
      .subscribe((contacts) => {
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

      this.closeForwardModal();
      this.openChat(contact);

      setTimeout(() => {
        this.shouldScrollToBottom = true;
        this.cdr.detectChanges();
      }, 200);
    }
  }

  deleteGroup(): void {
    if (this.deleteConfirmationText !== 'DELETE' || !this.conversationId) return;

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
            err.error?.error || 'Failed to delete group. You may not have permission.';
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

    let targetContact = this.findContactByConversationId(result.conversationId);

    if (!targetContact) {
      console.log('Contact not found in current list, reloading contacts...');
      await this.loadContactByConversationId(result.conversationId);
      targetContact = this.findContactByConversationId(result.conversationId);
    }

    if (!targetContact) {
      console.error('Could not find or load contact');
      return;
    }

    this.searchTargetMessageId = result.messageId;
    this.closeSearchModal();
    this.openChat(targetContact);
    this.waitForMessagesAndScroll(result.messageId);
  }

  private waitForMessagesAndScroll(messageId: number, attempt: number = 0): void {
    const maxAttempts = 15;
    const delay = 300;

    if (attempt >= maxAttempts) {
      console.error('Could not find message after', maxAttempts, 'attempts');
      this.searchTargetMessageId = null;
      return;
    }

    setTimeout(() => {
      if (this.messages.length === 0) {
        this.waitForMessagesAndScroll(messageId, attempt + 1);
        return;
      }

      const messageFound = this.messages.find(
        (m) => Number(m.messageId) === messageId
      );

      if (messageFound) {
        this.cdr.detectChanges();
        setTimeout(() => {
          this.scrollToMessage(messageId);
          setTimeout(() => {
            this.searchTargetMessageId = null;
          }, 3000);
        }, 100);
      } else {
        this.waitForMessagesAndScroll(messageId, attempt + 1);
      }
    }, delay);
  }

  private findContactByConversationId(conversationId: string): Contact | null {
    if (!this.sidebarComp || !this.sidebarComp.contacts) {
      console.error('Sidebar component or contacts not available');
      return null;
    }
    return this.sidebarComp.contacts.find(
      (c) => c.conversationId === conversationId
    ) || null;
  }

  private async loadContactByConversationId(conversationId: string): Promise<void> {
    return new Promise((resolve) => {
      if (this.sidebarComp) {
        this.sidebarComp.loadContacts();
        setTimeout(() => resolve(), 300);
      } else {
        resolve();
      }
    });
  }

  getContactsForSearch(): Contact[] {
    if (this.sidebarComp && this.sidebarComp.contacts) {
      return this.sidebarComp.contacts;
    }
    return [];
  }

  success(msg: string): void {
    Swal.fire({
      icon: 'success',
      title: 'Success',
      text: msg,
      timer: 2000,
      showConfirmButton: false,
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
  }
}