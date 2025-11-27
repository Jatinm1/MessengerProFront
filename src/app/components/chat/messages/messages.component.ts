import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PickerComponent } from '@ctrl/ngx-emoji-mart';
import { Message, Contact } from '../../../models/chat.models';


interface MessageWithDate extends Message {
  dateLabel?: string;
  showDateDivider?: boolean;
}

@Component({
  selector: 'app-messages',
  standalone: true,
  imports: [CommonModule, FormsModule, PickerComponent],
  template: `
    <div class="chat">

  <!-- Messages Wrapper -->
  <div class="messages-wrapper" *ngIf="showChat">
    <div class="messages" #messagesContainer (scroll)="onScroll()">

      <ng-container *ngFor="let msg of messages">

        <!-- Date Divider -->
        <div class="date-divider" *ngIf="msg.showDateDivider">
          <span>{{ msg.dateLabel }}</span>
        </div>

        <!-- Unread Divider -->
        <div class="unread-divider" *ngIf="isFirstUnreadMessage(msg)">
          <span>Unread Messages</span>
        </div>

        <!-- Message Bubble -->
        <div
          class="msg"
          [class.self]="isMessageFromCurrentUser(msg)"
          [class.other]="!isMessageFromCurrentUser(msg)"
          [class.media-msg]="isMediaMessage(msg)"
          [class.deleted-msg]="msg.isDeleted"
          [attr.data-message-id]="msg.messageId">

          <!-- Sender Name (Group Only) -->
          <div class="msg-sender"
               *ngIf="!isMessageFromCurrentUser(msg) && selectedContact?.isGroup">
            {{ msg.fromDisplayName || msg.fromUserName }}
          </div>

          <!-- Message Actions Menu -->
          <div class="msg-actions" *ngIf="!msg.isDeleted">
            <button class="msg-actions-btn"
                    (click)="toggleMessageMenu(msg.messageId)"
                    type="button">⋮</button>

            <div class="msg-actions-menu"
                 *ngIf="activeMessageMenu === msg.messageId"
                 (click)="$event.stopPropagation()">

              <!-- Edit -->
              <button *ngIf="canEditMessage(msg)"
                      (click)="startEditMessage(msg)"
                      class="msg-action-item">
                ✏️ Edit
              </button>

              <!-- Delete for Me -->
              <button (click)="deleteMessage(msg.messageId, false)"
                      class="msg-action-item">
                🗑️ Delete for Me
              </button>

              <!-- Delete for Everyone -->
              <button *ngIf="canDeleteForEveryone(msg)"
                      (click)="deleteMessage(msg.messageId, true)"
                      class="msg-action-item">
                🗑️ Delete for Everyone
              </button>

              <!-- Forward -->
              <button (click)="openForwardModal(msg)"
                      class="msg-action-item">
                ↗️ Forward
              </button>

            </div>
          </div>

          <!-- Deleted Message -->
          <div class="msg-deleted" *ngIf="msg.isDeleted">
            <span class="deleted-icon">🚫</span>
            <span class="deleted-text">
              {{ msg.deletedForEveryone ? 'This message was deleted' : 'You deleted this message' }}
            </span>
          </div>

          <!-- Normal (Non-deleted) Message -->
          <ng-container *ngIf="!msg.isDeleted">

            <!-- Media Messages -->
            <div class="msg-media" *ngIf="isMediaMessage(msg)">

              <!-- Image -->
              <div class="media-content" *ngIf="msg.contentType === 'image'"
                   (click)="mediaClicked.emit({ url: msg.mediaUrl!, type: 'image' })">
                <img [src]="msg.mediaUrl" class="media-image" alt="Image">
                <div class="media-overlay">
                  <span class="view-icon">🔍</span>
                </div>
              </div>

              <!-- Video -->
              <div class="media-content" *ngIf="msg.contentType === 'video'"
                   (click)="mediaClicked.emit({ url: msg.mediaUrl!, type: 'video' })">
                <img [src]="getVideoThumbnail(msg.mediaUrl!)" class="media-image" alt="Video">
                <div class="media-overlay">
                  <span class="play-icon">▶️</span>
                </div>
              </div>

              <!-- Caption -->
              <div class="msg-caption" *ngIf="msg.body && msg.body !== msg.mediaUrl">
                {{ msg.body }}
                <span class="edited-indicator" *ngIf="msg.isEdited">(edited)</span>
              </div>

            </div>

          <!-- Edit Mode -->
<div class="msg-edit" *ngIf="editingMessageId === msg.messageId" (click)="$event.stopPropagation()">
  <input 
    #editInput
    [(ngModel)]="editMessageText"
    (keyup.enter)="saveEditMessage(msg.messageId)"
    (keyup.escape)="cancelEditMessage()"
    (click)="$event.stopPropagation()"
    class="edit-input"
    [attr.data-edit-id]="msg.messageId"
    type="text"
    autocomplete="off"
    spellcheck="false">

  <div class="edit-actions" (click)="$event.stopPropagation()">
    <button class="edit-cancel" (click)="cancelEditMessage(); $event.stopPropagation()">Cancel</button>
    <button class="edit-save" (click)="saveEditMessage(msg.messageId); $event.stopPropagation()">Save</button>
  </div>
</div>

            <!-- Text Message -->
            <div class="msg-body"
                 *ngIf="!isMediaMessage(msg) && editingMessageId !== msg.messageId">
              {{ msg.body }}
              <span class="edited-indicator" *ngIf="msg.isEdited">(edited)</span>
            </div>

            <!-- Time + Tick -->
            <div class="meta">
              {{ formatTime(msg.createdAtUtc) }}
              <span *ngIf="isMessageFromCurrentUser(msg)"
                    class="status-icon"
                    [class]="getMessageStatusClass(msg.messageStatus)">
                {{ getMessageStatusIcon(msg.messageStatus) }}
              </span>
            </div>

          </ng-container>

        </div> <!-- END msg -->

      </ng-container> <!-- END ngFor -->

    </div> <!-- END messages -->
  </div> <!-- END messages-wrapper -->

  <!-- New Messages Button -->
  <button class="new-messages-btn"
          *ngIf="showNewMessageButton"
          (click)="scrollToNewMessages.emit()">
    ↓ {{ newMessageCount }} new message{{ newMessageCount > 1 ? 's' : '' }}
  </button>

  <!-- No Chat -->
  <div class="no-chat" *ngIf="!showChat">
    Select a contact to start chatting
  </div>

  <!-- Send Area -->
  <div class="send-area" *ngIf="showChat">

    <input type="file"
           #mediaInput
           accept="image/*,video/*"
           (change)="onMediaSelected($event)"
           style="display:none">

    <!-- Emoji Picker -->
    <div class="emoji-picker-container" *ngIf="showEmojiPicker">
      <emoji-mart
        (emojiClick)="addEmoji($event)"
        [showPreview]="false"
        [isNative]="true"
        [perLine]="8"
        [emojiSize]="24"
        [darkMode]="false"
        title="Pick your emoji">
      </emoji-mart>
    </div>

    <!-- Text Input -->
    <input #messageInput
           [(ngModel)]="messageText"
           placeholder="Type a message..."
           (keyup.enter)="sendMessage()">

    <button class="media-btn"
            (click)="triggerMediaUpload()"
            type="button">
      📎
    </button>

    <button class="emoji-btn"
            (click)="toggleEmojiPicker.emit()"
            type="button">
      😊
    </button>

    <button (click)="sendMessage()">Send</button>

  </div> <!-- END send-area -->

</div> <!-- END chat -->

  `,
  styles: [`
    /* Chat Panel */
    .chat {
      flex: 1;
      display: flex;
      flex-direction: column;
      background: #f8fafc;
    }

    /* Messages */
    .messages-wrapper {
      position: relative;
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .messages {
      flex: 1;
      overflow-y: auto;
      padding: 20px;
      display: flex;
      flex-direction: column;
      gap: 8px;
      background: linear-gradient(to bottom, #f8fafc 0%, #f1f5f9 100%);
      max-height: 550px;
    }

    .date-divider {
      text-align: center;
      color: #64748b;
      font-size: 0.7rem;
      margin: 16px 0 12px;
      position: relative;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .date-divider::before,
    .date-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: linear-gradient(to right, transparent, #cbd5e1, transparent);
    }

    .date-divider span {
      background: #ffffff;
      padding: 4px 12px;
      border-radius: 12px;
      font-weight: 600;
      box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
      border: 1px solid #e2e8f0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .unread-divider {
      text-align: center;
      margin: 10px 0;
    }

    .unread-divider span {
      background: #fef3c7;
      color: #d97706;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 0.75rem;
      font-weight: 600;
      border: 1px solid #fcd34d;
    }

    .msg {
      margin: 3px 0;
      padding: 10px 14px;
      border-radius: 16px;
      max-width: 65%;
      line-height: 1.5;
      word-wrap: break-word;
      box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
      animation: messageSlide 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      font-size: 0.9rem;
      position: relative;
    }

    @keyframes messageSlide {
      from {
        opacity: 0;
        transform: translateY(8px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .msg.self {
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: white;
      margin-left: auto;
      text-align: right;
      border-bottom-right-radius: 4px;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
    }

    .msg.other {
      background: #ffffff;
      align-self: flex-start;
      color: #1e293b;
      border-bottom-left-radius: 4px;
      border: 1px solid #e2e8f0;
    }

    .msg-sender {
      font-size: 0.75rem;
      font-weight: 600;
      color: #3b82f6;
      margin-bottom: 4px;
      text-align: left;
    }

    .msg.self .msg-sender {
      color: #ffffff;
      opacity: 0.8;
    }

    .msg-body {
      margin-bottom: 4px;
      white-space: pre-wrap;
      text-align: left;
    }

    .msg.self .msg-body {
      text-align: right;
    }

    .msg .meta {
      font-size: 0.65rem;
      margin-top: 4px;
      opacity: 0.75;
      font-weight: 500;
      display: flex;
      align-items: center;
      gap: 4px;
      justify-content: flex-end;
    }

    .msg.self .meta {
      color: rgba(255, 255, 255, 0.85);
    }

    .msg.other .meta {
      color: #94a3b8;
    }

    .status-icon {
      font-size: 0.8rem;
      margin-left: 2px;
    }

    .status-icon.read {
      color: #60a5fa;
    }

    .no-chat {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      color: #64748b;
      font-size: 1rem;
      font-weight: 500;
      gap: 12px;
    }

    .no-chat::before {
      content: '💬';
      font-size: 3rem;
      opacity: 0.3;
    }

    /* Media Message Styles */
    .msg.media-msg {
      padding: 8px;
      background: none;
      box-shadow: none;
      border: none;
    }

    .msg.media-msg.self {
      background: none;
    }

    .msg-media {
      display: flex;
      flex-direction: column;
      gap: 6px;
      max-width: 300px;
      background: #ffffff;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
      border: 1px solid #e2e8f0;
    }

    .msg.self .msg-media {
      background: #e0f2fe;
      border: 1px solid #93c5fd;
    }

    .media-content {
      position: relative;
      cursor: pointer;
      line-height: 0;
    }

    .media-image {
      width: 100%;
      height: auto;
      display: block;
    }

    .media-overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .media-content:hover .media-overlay {
      opacity: 1;
    }

    .view-icon, .play-icon {
      font-size: 2rem;
      color: white;
      text-shadow: 0 0 8px rgba(0, 0, 0, 0.8);
    }

    .msg-caption {
      padding: 8px 12px;
      font-size: 0.85rem;
      color: #1e293b;
      text-align: left;
    }

    .msg.self .msg-caption {
      color: #1e293b;
    }

    .msg.self .msg-media .meta {
      color: #64748b;
      padding: 0 12px 8px;
    }

    .msg.other .msg-media .meta {
      color: #64748b;
      padding: 0 12px 8px;
    }

    /* Send Area with Emoji Support */
    .send-area {
      position: relative;
      display: flex;
      align-items: center;
      padding: 14px 16px;
      background: #ffffff;
      border-top: 1px solid #e2e8f0;
      gap: 10px;
    }

    .send-area input {
      flex: 1;
      border: 2px solid #e2e8f0;
      border-radius: 20px;
      padding: 10px 18px;
      outline: none;
      font-size: 0.875rem;
      transition: all 0.2s ease;
      background: #f8fafc;
    }

    .send-area input:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
      background: #ffffff;
    }

    .send-area button {
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: white;
      border: none;
      padding: 10px 24px;
      border-radius: 20px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
      font-size: 0.875rem;
    }

    .send-area button:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .media-btn, .emoji-btn {
      background: #e2e8f0;
      color: #475569;
      padding: 10px;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      font-size: 1.2rem;
      line-height: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
      box-shadow: none;
    }

    .media-btn:hover, .emoji-btn:hover {
      background: #cbd5e1;
      transform: none;
      box-shadow: none;
    }

    /* Emoji Picker Styles */
    .emoji-picker-container {
      position: absolute;
      bottom: 70px;
      right: 80px;
      z-index: 1000;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
      border-radius: 12px;
      overflow: hidden;
      animation: slideUpEmoji 0.2s ease;
    }

    @keyframes slideUpEmoji {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .new-messages-btn {
      position: absolute;
      bottom: 70px;
      left: 50%;
      transform: translateX(-50%);
      background: #3b82f6;
      color: white;
      padding: 8px 16px;
      border-radius: 20px;
      border: none;
      font-size: 0.85rem;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
      transition: all 0.2s;
      z-index: 10;
    }

    .new-messages-btn:hover {
      background: #1e40af;
      transform: translateX(-50%) translateY(-2px);
    }

   /* Message Actions */
    .msg {
      position: relative;
    }

    .msg-actions {
      position: absolute;
      top: -12px;
      right: 8px;
      opacity: 0;
      transition: opacity 0.2s;
      z-index: 100;
    }

    .msg:hover .msg-actions {
      opacity: 1;
    }

    .msg-actions-btn {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      width: 28px;
      height: 28px;
      cursor: pointer;
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      color: #64748b;
    }

    .msg-actions-btn:hover {
      background: #f8fafc;
      border-color: #cbd5e1;
      color: #1e293b;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    }

    .msg-actions-menu {
      position: absolute;
      top: 30px;
      right: 0;
      background: white;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      min-width: 180px;
      z-index: 1000;
      overflow: hidden;
    }

    .msg-action-item {
      display: block;
      width: 100%;
      padding: 10px 16px;
      border: none;
      background: white;
      text-align: left;
      cursor: pointer;
      font-size: 0.875rem;
      transition: background 0.2s;
    }

    .msg-action-item:hover {
      background: #f1f5f9;
    }

    /* Deleted Message */
    .msg-deleted {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px;
      font-style: italic;
      color: #ffffffff;
    }

    .deleted-icon {
      font-size: 1.2rem;
    }

    .deleted-text {
      font-size: 0.875rem;
    }

    .deleted-msg {
      opacity: 0.7;
    }

    /* Edit Mode */
    .msg-edit {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }

    .edit-input {
      width: 100%;
      padding: 8px;
      border: 2px solid #3b82f6;
      border-radius: 8px;
      font-size: 0.9rem;
      outline: none;
    }

    .edit-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }

    .edit-cancel,
    .edit-save {
      padding: 6px 12px;
      border: none;
      border-radius: 6px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .edit-cancel {
      background: #e2e8f0;
      color: #475569;
    }

    .edit-cancel:hover {
      background: #cbd5e1;
    }

    .edit-save {
      background: #3b82f6;
      color: white;
    }

    .edit-save:hover {
      background: #1e40af;
    }

    /* Edited Indicator */
    .edited-indicator {
      font-size: 0.7rem;
      opacity: 0.7;
      margin-left: 4px;
      font-style: italic;
    }
  `],
  changeDetection: ChangeDetectionStrategy.Default  // ✅ Change from OnPush to Default
})
export class MessagesComponent implements AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('messageInput') messageInput!: ElementRef<HTMLInputElement>;
  @ViewChild('mediaInput') mediaInput!: ElementRef<HTMLInputElement>;

  @Input() messages: MessageWithDate[] = [];
  @Input() selectedContact: Contact | null = null;
  @Input() currentUser: any; // Simplified type for current user
  @Input() showChat = false;
  @Input() showEmojiPicker = false;
  @Input() showNewMessageButton = false;
  @Input() newMessageCount = 0;
  @Input() firstUnreadMessageId: number | null = null;

  @Output() messageTextChange = new EventEmitter<string>();
  @Output() sendMessageEvent = new EventEmitter<string>();
  @Output() mediaSelected = new EventEmitter<File>();
  @Output() toggleEmojiPicker = new EventEmitter<void>();
  @Output() mediaClicked = new EventEmitter<{ url: string, type: 'image' | 'video' }>();
  @Output() scroll = new EventEmitter<number>();
  @Output() scrollToNewMessages = new EventEmitter<void>();

  private _messageText = '';
  private shouldScrollToBottom = false;
  private focusEditInputFlag = false;

  



  constructor(private cdr: ChangeDetectorRef) {}

  activeMessageMenu: number | null = null;
editingMessageId: number | null = null;
editMessageText = '';
  
  // @ViewChild('editInput') editInput!: ElementRef<HTMLInputElement>;
  @Output() deleteMessageEvent = new EventEmitter<{ messageId: number; deleteForEveryone: boolean }>();
  @Output() editMessageEvent = new EventEmitter<{ messageId: number; newBody: string }>();
  @Output() forwardMessageEvent = new EventEmitter<Message>();

  toggleMessageMenu(messageId: number): void {
    this.activeMessageMenu = this.activeMessageMenu === messageId ? null : messageId;
  }

  canEditMessage(msg: Message): boolean {
    // Can edit if: own message, not media, not deleted, not read
    if (!this.isMessageFromCurrentUser(msg)) return false;
    if (this.isMediaMessage(msg)) return false;
    if (msg.isDeleted) return false;
    if (msg.messageStatus === 'Read') return false;
    
    return true;
  }

  canDeleteForEveryone(msg: Message): boolean {
    // Can delete for everyone if: own message, within time limit (e.g., 1 hour)
    if (!this.isMessageFromCurrentUser(msg)) return false;
    
    const messageTime = new Date(msg.createdAtUtc).getTime();
    const now = new Date().getTime();
    const oneHour = 60 * 60 * 1000;
    
    return (now - messageTime) < oneHour;
  }

  deleteMessage(messageId: number, deleteForEveryone: boolean): void {
    const confirmMsg = deleteForEveryone 
      ? 'Delete this message for everyone?' 
      : 'Delete this message for you?';
    
    if (confirm(confirmMsg)) {
      this.deleteMessageEvent.emit({ messageId, deleteForEveryone });
      this.activeMessageMenu = null;
    }
  }

startEditMessage(msg: Message): void {
  this.editingMessageId = msg.messageId;
  this.editMessageText = msg.body || '';
  this.activeMessageMenu = null;
  
  // Force multiple change detection cycles
  this.cdr.detectChanges();
  
  // Use multiple timeouts to ensure DOM is ready
  setTimeout(() => {
    this.cdr.detectChanges();
    
    setTimeout(() => {
      const input = document.querySelector(`input.edit-input[data-edit-id="${msg.messageId}"]`) as HTMLInputElement;
      if (input) {
        // Blur the message input first
        const messageInput = document.querySelector('input[placeholder="Type a message..."]') as HTMLInputElement;
        if (messageInput) {
          messageInput.blur();
        }
        
        // Then focus edit input
        input.focus();
        input.select();
      }
    }, 100);
  }, 50);
}



saveEditMessage(messageId: number): void {
  if (this.editMessageText.trim() && this.editMessageText !== this.messages.find(m => m.messageId === messageId)?.body) {
    this.editMessageEvent.emit({ messageId, newBody: this.editMessageText.trim() });
  }
  this.cancelEditMessage();
}

cancelEditMessage(): void {
  this.editingMessageId = null;
  this.editMessageText = '';
  
  // Restore focus to message input after canceling
  setTimeout(() => {
    if (this.messageInput) {
      this.messageInput.nativeElement.focus();
    }
  }, 100);
}

  openForwardModal(msg: Message): void {
    this.forwardMessageEvent.emit(msg);
    this.activeMessageMenu = null;
  }

  @HostListener('document:click', ['$event'])
  onDocumentClickForMenu(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.msg-actions')) {
      this.activeMessageMenu = null;
    }
  }

  ngAfterViewChecked(): void {
  if (this.shouldScrollToBottom) {
    this.scrollToBottom();
    this.shouldScrollToBottom = false;
  }
}



  @Input()
  get messageText(): string {
    return this._messageText;
  }

  set messageText(value: string) {
    this._messageText = value;
    this.messageTextChange.emit(value);
  }

  // Public method to be called by parent component
  public setShouldScrollToBottom(value: boolean): void {
    this.shouldScrollToBottom = value;
    this.cdr.detectChanges();
  }

  public focusMessageInput(): void {
    if (this.messageInput) {
      this.messageInput.nativeElement.focus();
    }
  }

  scrollToBottom(): void {
    try {
      this.messagesContainer.nativeElement.scrollTop = this.messagesContainer.nativeElement.scrollHeight;
    } catch (err) { }
  }

  onScroll(): void {
    if (this.messagesContainer) {
      this.scroll.emit(this.messagesContainer.nativeElement.scrollTop);
    }
  }

  sendMessage(): void {
    if (this.messageText.trim()) {
      this.sendMessageEvent.emit(this.messageText.trim());
      this.messageText = '';
      this.shouldScrollToBottom = true;
    }
  }

  triggerMediaUpload(): void {
    this.mediaInput.nativeElement.click();
  }

  onMediaSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.mediaSelected.emit(input.files[0]);
      input.value = ''; // Clear input for next selection
    }
  }

  addEmoji(event: any): void {
    this.messageText += event.emoji.native;
    this.messageInput.nativeElement.focus();
  }

  isMessageFromCurrentUser(msg: Message): boolean {
    return msg.fromUserId === this.currentUser?.userId;
  }

  isMediaMessage(msg: Message): boolean {
    return msg.contentType === 'image' || msg.contentType === 'video';
  }

  isFirstUnreadMessage(msg: Message): boolean {
    return this.firstUnreadMessageId !== null && Number(msg.messageId) === this.firstUnreadMessageId;
  }

  formatTime(time: string): string {
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  getMessageStatusIcon(status?: 'Sent' | 'Delivered' | 'Read'): string {
    switch (status) {
      case 'Sent':
        return '✓';
      case 'Delivered':
        return '✓✓';
      case 'Read':
        return '✓✓';
      default:
        return '';
    }
  }

  getMessageStatusClass(status?: 'Sent' | 'Delivered' | 'Read'): string {
    switch (status) {
      case 'Read':
        return 'read';
      default:
        return '';
    }
  }

  getVideoThumbnail(videoUrl: string): string {
  return videoUrl.replace('/upload/', '/upload/so_0/f_jpg/');
}

}
