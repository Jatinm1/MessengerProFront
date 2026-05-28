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
import { firstValueFrom, Subject, takeUntil } from 'rxjs';
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
import { CryptoService } from '../../services/crypto.service';
import { ClientSearchResult } from '../../services/search.service';
import { AudioCallComponent } from '../audio-call/audio-call.component';
import { IncomingCallComponent } from '../audio-call/incoming-call.component';
import { CallService } from '../../services/call.service';

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
    AudioCallComponent,
    IncomingCallComponent,
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
  currentPrivateKey: CryptoKey | null = null;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private cryptoService: CryptoService,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public callService: CallService
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
        this.listenForDeviceSwitch();
    }

    

    try {
      await this.chatService.connectToHub();
      console.log('✅ SignalR Hub Connected');
      await this.callService.connect();
      console.log('✅ CallHub Connected');

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

  private listenForDeviceSwitch(): void {
  this.authService.deviceSwitchConfirmed$
    .pipe(takeUntil(this.destroy$))
    .subscribe(async () => {
      console.log('🔐 [Chat] Device switch confirmed — reloading history with new key');

      // Refresh the private key reference since it just changed
      const userId = this.authService.getCurrentUserId()!;
      this.currentPrivateKey = await this.cryptoService.getPrivateKey(userId);

      // Reload history — old messages will show 🔒, new ones will decrypt fine
      if (this.conversationId) {
        this.loadHistory();
      }
    });
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
    this.callService.disconnect();
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.disconnectFromHub();
  }

  // ========================================
  // SIGNALR LISTENERS
  // ========================================
  // private setupSignalRListeners(): void {
  //   if (this.listenersSetup) return;
  //   this.listenersSetup = true;

  //   this.chatService.messageReceived$
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe((message) => {
  //       if (message.fromUserId === this.currentUser?.userId) return;

  //       if (message.conversationId === this.conversationId) {
  //         const messageExists = this.messages.some(
  //           m => Number(m.messageId) === Number(message.messageId)
  //         );

  //         if (!messageExists) {
  //           console.log('✅ Adding new received message:', message.messageId);
  //           this.addMessageToView(message, false);

  //           if (this.userScrolledUp) {
  //             this.newMessageCount++;
  //             this.showNewMessageButton = true;
  //           } else {
  //             this.shouldScrollToBottom = true;
  //             setTimeout(() => this.markLastMessageAsRead(), 300);
  //           }
  //         } else {
  //           console.log('⚠️ Duplicate message ignored:', message.messageId);
  //         }
  //       }
  //     });

  //   this.chatService.messageSent$
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe((message) => {
  //       const messageExists = this.messages.some(
  //         m => Number(m.messageId) === Number(message.messageId)
  //       );

  //       if (!messageExists) {
  //         console.log('✅ Adding new sent message:', message.messageId);
  //         this.addMessageToView(message, true);
  //         this.shouldScrollToBottom = true;
  //       } else {
  //         console.log('⚠️ Duplicate sent message ignored:', message.messageId);
  //       }
  //     });

  //   this.chatService.messageStatusUpdated$
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe((data) => {
  //       const msg = this.messages.find(
  //         (m) => Number(m.messageId) === data.messageId
  //       );
  //       if (msg) {
  //         msg.messageStatus = data.status as any;
  //         this.cdr.detectChanges();
  //       }
  //     });

  //   this.chatService.conversationReadUpdated$
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe((data) => {
  //       this.messages.forEach((msg) => {
  //         if (
  //           Number(msg.messageId) <= data.lastReadMessageId &&
  //           msg.fromUserId === this.currentUser?.userId
  //         ) {
  //           msg.messageStatus = 'Read';
  //         }
  //       });
  //       this.cdr.detectChanges();
  //     });

  //   this.chatService.conversationMarkedAsRead$
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe((data) => {
  //       if (data.conversationId === this.conversationId) {
  //         this.firstUnreadMessageId = null;
  //         this.cdr.detectChanges();
  //       }
  //     });
  // }

loadHistory(): void {
  this.chatService
    .getHistory(this.conversationId!)
    .pipe(takeUntil(this.destroy$))
    .subscribe(async (history) => {
      // Decrypt all messages before processing
      const decrypted = await this.decryptMessages(history);
      this.messages = this.processMessages(decrypted.reverse());

      if (!this.searchTargetMessageId) {
        this.shouldScrollToBottom = true;
        this.markLastMessageAsRead();
      } else {
        console.log('Search target set, skipping auto-scroll to bottom');
      }
    });
}

private setupSignalRListeners(): void {
  if (this.listenersSetup) return;
  this.listenersSetup = true;

  // ─── messageReceived ───────────────────────────────────────────────────────
  this.chatService.messageReceived$
    .pipe(takeUntil(this.destroy$))
    .subscribe(async (message) => {
      if (message.fromUserId === this.currentUser?.userId) return;
      if (message.conversationId !== this.conversationId) return;

      const messageExists = this.messages.some(
        m => Number(m.messageId) === Number(message.messageId)
      );

      if (!messageExists) {
        console.log('✅ Adding new received message:', message.messageId);
        const decrypted = await this.decryptSingleMessage(message);
        this.addMessageToView(decrypted, false);

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
    });

  // ─── messageSent ──────────────────────────────────────────────────────────
  this.chatService.messageSent$
    .pipe(takeUntil(this.destroy$))
    .subscribe(async (message) => {
      const messageExists = this.messages.some(
        m => Number(m.messageId) === Number(message.messageId)
      );

      if (!messageExists) {
        console.log('✅ Adding new sent message:', message.messageId);
        const decrypted = await this.decryptSingleMessage(message);
        this.addMessageToView(decrypted, true);
        this.shouldScrollToBottom = true;
      } else {
        console.log('⚠️ Duplicate sent message ignored:', message.messageId);
      }
    });

  // ─── messageStatusUpdated ─────────────────────────────────────────────────
  this.chatService.messageStatusUpdated$
    .pipe(takeUntil(this.destroy$))
    .subscribe((data) => {
      const msg = this.messages.find(
        m => Number(m.messageId) === data.messageId
      );
      if (msg) {
        msg.messageStatus = data.status as any;
        this.cdr.detectChanges();
      }
    });

  // ─── conversationReadUpdated ──────────────────────────────────────────────
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

  // ─── conversationMarkedAsRead ─────────────────────────────────────────────
  this.chatService.conversationMarkedAsRead$
    .pipe(takeUntil(this.destroy$))
    .subscribe((data) => {
      if (data.conversationId === this.conversationId) {
        this.firstUnreadMessageId = null;
        this.cdr.detectChanges();
      }
    });
}

// ============================================================================
// DECRYPT HELPERS
// ============================================================================

private async decryptMessages(messages: any[]): Promise<any[]> {
  const currentUserId = this.authService.getCurrentUserId();
  if (!currentUserId) return messages;

  // Fetch private key once and reuse for every message in the batch
  const privateKey = await this.cryptoService.getPrivateKey(currentUserId);
  if (!privateKey) {
    console.warn('⚠️ No private key on this device — messages will show as encrypted');
    return messages;
  }

  return Promise.all(messages.map(m => this.decryptSingleMessage(m, privateKey)));
}

// private async decryptSingleMessage(message: any, privateKey?: CryptoKey): Promise<any> {
//   // Deleted messages already have a placeholder body — nothing to decrypt
//   if (message.isDeleted) return message;

//   // No encrypted key means either a legacy message or a media-only message
//   // with no caption — return as-is either way
//   if (!message.body || !message.encryptedKey) return message;

//   // Must be "iv:ciphertext" format — single colon separator
//   // A plain URL or legacy text body won't match this pattern
//   const colonIndex = message.body.indexOf(':');
//   if (colonIndex === -1) return message;

//   try {
//     const currentUserId = this.authService.getCurrentUserId()!;
//     const key = privateKey ?? await this.cryptoService.getPrivateKey(currentUserId);
//     if (!key) return message;

//     const iv         = message.body.substring(0, colonIndex);
//     const ciphertext = message.body.substring(colonIndex + 1);

//     const decryptedBody = await this.cryptoService.decryptMessage(
//       ciphertext,
//       iv,
//       message.encryptedKey,
//       key
//     );

//     return { ...message, body: decryptedBody };

//   } catch (err) {
//     console.error(`❌ Failed to decrypt message ${message.messageId}:`, err);
//     return { ...message, body: '🔒 Unable to decrypt message' };
//   }
// }

// chat.component.ts — decryptSingleMessage, fix the split
private async decryptSingleMessage(message: any, privateKey?: CryptoKey): Promise<any> {
  if (message.isDeleted)              return message;
  if (!message.body)                  return message;
  if (!message.encryptedKey)          return message;

  // Body must contain exactly one colon separating iv:ciphertext
  const colonIdx = message.body.indexOf(':');
  if (colonIdx === -1)                return message;

  try {
    const currentUserId = this.authService.getCurrentUserId()!;
    const key = privateKey ?? await this.cryptoService.getPrivateKey(currentUserId);
    if (!key) return message;

    // Split on FIRST colon only — ciphertext (base64) never contains colons
    const iv         = message.body.substring(0, colonIdx);
    const ciphertext = message.body.substring(colonIdx + 1);

    const decryptedBody = await this.cryptoService.decryptMessage(
      ciphertext,
      iv,
      message.encryptedKey,
      key
    );

    return { ...message, body: decryptedBody };

  } catch (err) {
    console.error(`❌ Failed to decrypt message ${message.messageId}:`, err);
    return { ...message, body: '🔒 Unable to decrypt message' };
  }
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

  // loadHistory(): void {
  //   this.chatService
  //     .getHistory(this.conversationId!)
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe((history) => {
  //       this.messages = this.processMessages(history.reverse());

  //       if (!this.searchTargetMessageId) {
  //         this.shouldScrollToBottom = true;
  //         this.markLastMessageAsRead();
  //       } else {
  //         console.log('Search target set, skipping auto-scroll to bottom');
  //       }
  //     });
  // }

  
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

  // ========================================
// SEND TEXT MESSAGE
// ========================================

async sendMessage(): Promise<void> {
  if (!this.messageText.trim() || !this.conversationId) return;

  const body = this.messageText.trim();
  this.messageText = '';
  this.showEmojiPicker = false;

  try {
    if (this.selectedContact?.isGroup) {
      await this.sendEncryptedGroupMessage(body, 'text');
    } else if (this.currentChatUserId) {
      await this.sendEncryptedDirectMessage(body, 'text');
    }
  } catch (err) {
    console.error('❌ Failed to send message:', err);
    // Optionally restore the message text so user doesn't lose it
    this.messageText = body;
  }
}

// ========================================
// SEND MEDIA MESSAGE
// ========================================

sendMediaMessage(): void {
  if (!this.selectedMediaFile || this.isUploadingMedia) return;

  this.isUploadingMedia = true;

  this.chatService
    .uploadMedia(this.selectedMediaFile)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: async (response) => {
        const mediaUrl  = response.url;
        const mediaType = response.contentType.startsWith('image') ? 'image' : 'video';
        const caption   = this.mediaCaption;

        try {
          // For media messages we encrypt the caption (or mediaUrl as fallback).
          // The mediaUrl itself is a Cloudinary link — it is NOT encrypted here.
          // To fully encrypt media, you would need to encrypt the file bytes
          // client-side before uploading. That is a separate concern.
          const bodyToEncrypt = caption || mediaUrl;

          if (this.selectedContact?.isGroup) {
            await this.sendEncryptedGroupMessage(bodyToEncrypt, mediaType, mediaUrl);
          } else if (this.currentChatUserId) {
            await this.sendEncryptedDirectMessage(bodyToEncrypt, mediaType, mediaUrl);
          }
        } catch (err) {
          console.error('❌ Failed to send media message:', err);
        }

        this.cancelMediaUpload();
      },
      error: (err) => {
        console.error('Media upload failed:', err);
        this.isUploadingMedia = false;
      },
    });
}

// ========================================
// ENCRYPTED SEND — DIRECT
// ========================================

private async sendEncryptedDirectMessage(
  plaintext: string,
  contentType: string = 'text',
  mediaUrl?: string
): Promise<void> {
  const currentUser = this.authService.getCurrentUser();
  const currentUserId = currentUser?.userId;
  if (!currentUserId || !this.currentChatUserId) return;

  // Fetch public keys for both sender and recipient.
  // Sender needs their own copy so they can decrypt their sent messages.
  const keys = await this.chatService
    .getPublicKeys([this.currentChatUserId, currentUserId])
    .toPromise();

  if (!keys || keys.length === 0) {
    throw new Error('Could not fetch public keys for encryption');
  }

  const keyMap = keys.map(k => ({
    userId: k.userId,
    jwk: JSON.parse(k.publicKeyJwk) as JsonWebKey
  }));

  const { ciphertext, iv, encryptedKeys } =
    await this.cryptoService.encryptMessage(plaintext, keyMap);

  // Body format: "iv:ciphertext" — opaque blob stored in DB
  const encryptedBody = `${iv}:${ciphertext}`;

  await this.chatService.sendDirectMessage(
    this.currentChatUserId,
    encryptedBody,
    contentType,
    mediaUrl,
    encryptedKeys   // per-user AES key copies
  );
}

// ========================================
// ENCRYPTED SEND — GROUP
// ========================================

private async sendEncryptedGroupMessage(
  plaintext: string,
  contentType: string = 'text',
  mediaUrl?: string
): Promise<void> {
  if (!this.conversationId) return;

  const currentUser = this.authService.getCurrentUser();
  const currentUserId = currentUser?.userId;
  if (!currentUserId) return;

  // Fetch public keys for ALL group members (including self).
  // Group member IDs come from the already-loaded group details.
  const memberIds = this.currentGroupDetails?.members?.map((m: any) => m.userId) ?? [];

  if (memberIds.length === 0) {
    throw new Error('No group members found for encryption');
  }

  // Ensure sender is included (they need to decrypt their own sent messages)
  const userIds = Array.from(new Set([...memberIds, currentUserId]));

  const keys = await this.chatService.getPublicKeys(userIds).toPromise();

  if (!keys || keys.length === 0) {
    throw new Error('Could not fetch public keys for group encryption');
  }

  const keyMap = keys.map(k => ({
    userId: k.userId,
    jwk: JSON.parse(k.publicKeyJwk) as JsonWebKey
  }));

  const { ciphertext, iv, encryptedKeys } =
    await this.cryptoService.encryptMessage(plaintext, keyMap);

  const encryptedBody = `${iv}:${ciphertext}`;

  await this.chatService.sendGroupMessage(
    this.conversationId,
    encryptedBody,
    contentType,
    mediaUrl,
    encryptedKeys
  );
}

  // sendMessage(): void {
  //   if (!this.messageText.trim() || !this.conversationId) return;

  //   const body = this.messageText.trim();

  //   if (this.selectedContact?.isGroup) {
  //     this.chatService.sendGroupMessage(this.conversationId, body);
  //   } else if (this.currentChatUserId) {
  //     this.chatService.sendDirectMessage(this.currentChatUserId, body);
  //   }

  //   this.messageText = '';
  //   this.showEmojiPicker = false;
  // }

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

  // sendMediaMessage(): void {
  //   if (!this.selectedMediaFile || this.isUploadingMedia) return;

  //   this.isUploadingMedia = true;

  //   this.chatService
  //     .uploadMedia(this.selectedMediaFile)
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe({
  //       next: (response) => {
  //         const mediaUrl = response.url;
  //         const mediaType = response.contentType.startsWith('image') ? 'image' : 'video';
  //         const caption = this.mediaCaption;

  //         if (this.selectedContact?.isGroup) {
  //           this.chatService.sendGroupMessage(
  //             this.conversationId!,
  //             caption || mediaUrl,
  //             mediaType,
  //             mediaUrl
  //           );
  //         } else if (this.currentChatUserId) {
  //           this.chatService.sendDirectMessage(
  //             this.currentChatUserId,
  //             caption || mediaUrl,
  //             mediaType,
  //             mediaUrl
  //           );
  //         }

  //         this.cancelMediaUpload();
  //       },
  //       error: (err) => {
  //         console.error('Media upload failed:', err);
  //         this.isUploadingMedia = false;
  //       },
  //     });
  // }

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

  // performLeaveGroup(): void {
  //   if (
  //     !confirm(
  //       `Are you sure you want to leave the group "${this.currentGroupDetails?.groupName}"?`
  //     )
  //   )
  //     return;

  //   this.chatService
  //     .leaveGroup(this.conversationId!)
  //     .pipe(takeUntil(this.destroy$))
  //     .subscribe({
  //       next: () => {
  //         this.closeGroupDetailsModal();
  //         this.selectedContact = null;
  //         this.showChat = false;
  //         this.conversationId = null;
  //       },
  //       error: (err) => {
  //         console.error('Failed to leave group:', err);
  //       },
  //     });
  // }
  
performLeaveGroup(): void {
  if (!confirm(`Are you sure you want to leave the group "${this.currentGroupDetails?.groupName}"?`))
    return;

  // ❌ Remove this REST call:
  // this.chatService.leaveGroup(this.conversationId!)...

  // ✅ Use hub instead — this fires groupLeft$ which sidebar already listens to:
  this.chatService.leaveGroupViaHub(this.conversationId!)
    .then(() => {
      this.closeGroupDetailsModal();
      this.selectedContact = null;
      this.showChat = false;
      this.conversationId = null;
    })
    .catch(err => console.error('Failed to leave group:', err));
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

  // forwardMessageTo(contact: Contact): void {
  //   if (this.forwardMessage) {
  //     this.chatService.forwardMessageViaHub(
  //       Number(this.forwardMessage.messageId),
  //       contact.conversationId
  //     );

  //     this.closeForwardModal();
  //     this.openChat(contact);

  //     setTimeout(() => {
  //       this.shouldScrollToBottom = true;
  //       this.cdr.detectChanges();
  //     }, 200);
  //   }
  // }

  // chat.component.ts — replace forwardMessageTo

async forwardMessageTo(contact: Contact): Promise<void> {
  if (!this.forwardMessage) return;

  try {
    // 1. Get the decrypted body from the in-memory message object
    //    (it's already decrypted in this.messages array)
    const decryptedMessage = this.messages.find(
      m => Number(m.messageId) === Number(this.forwardMessage!.messageId)
    );

    if (!decryptedMessage?.body) {
      console.error('❌ Cannot forward — message body not found in memory');
      return;
    }

    const plaintext    = decryptedMessage.body;
    const contentType  = decryptedMessage.contentType ?? 'text';
    const mediaUrl     = decryptedMessage.mediaUrl ?? undefined;
    const currentUserId = this.authService.getCurrentUserId()!;

    // 2. Get the target conversation ID
    const convResponse: any = await firstValueFrom(
      this.chatService.createConversation(contact.userId ?? contact.conversationId)
    );
    const targetConversationId = contact.conversationId;

    // 3. Get public keys for all recipients in the target conversation
    let recipientIds: string[];

    if (contact.isGroup) {
      // For group — need group member IDs
      const groupDetails: any = await firstValueFrom(
        this.chatService.getGroupDetails(targetConversationId)
      );
      recipientIds = groupDetails.members.map((m: any) => m.userId);
    } else {
      // For DM — recipient + sender
      recipientIds = [contact.userId!, currentUserId];
    }

    // Deduplicate
    const uniqueIds = Array.from(new Set(recipientIds));
    const keys      = await firstValueFrom(
      this.chatService.getPublicKeys(uniqueIds)
    );

    if (!keys || keys.length === 0) {
      throw new Error('Could not fetch public keys for forwarding');
    }

    const keyMap = keys.map((k: any) => ({
      userId: k.userId,
      jwk:    JSON.parse(k.publicKeyJwk) as JsonWebKey
    }));

    // 4. Re-encrypt the plaintext for the new recipients
    const { ciphertext, iv, encryptedKeys } =
      await this.cryptoService.encryptMessage(plaintext, keyMap);

    const encryptedBody = `${iv}:${ciphertext}`;

    // 5. Send as a fresh message to the target conversation
    if (contact.isGroup) {
      await this.chatService.sendGroupMessage(
        targetConversationId,
        encryptedBody,
        contentType,
        mediaUrl,
        encryptedKeys
      );
    } else {
      await this.chatService.sendDirectMessage(
        contact.userId!,
        encryptedBody,
        contentType,
        mediaUrl,
        encryptedKeys
      );
    }

    this.closeForwardModal();
    this.openChat(contact);

    setTimeout(() => {
      this.shouldScrollToBottom = true;
      this.cdr.detectChanges();
    }, 200);

  } catch (err) {
    console.error('❌ Forward failed:', err);
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

  async onMessageSelectedFromSearch(result: ClientSearchResult): Promise<void> {
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

  // ========================================
  // AUDIO CALLING
  // ========================================
  startCall(contact: Contact | null): void {
    if (!contact || contact.isGroup || !contact.userId || !contact.conversationId || !this.currentUser || !this.currentUser.userId) return;

    this.callService.startCall(
      contact.userId,
      contact.conversationId,
      {
        userId: this.currentUser.userId,
        name: this.currentUser.displayName ?? this.currentUser.userName,
        photoUrl: this.currentUser.profilePhotoUrl,
      },
      {
        userId: contact.userId,
        name: contact.displayName,
        photoUrl: contact.photoUrl,
      }
    );
  }
}