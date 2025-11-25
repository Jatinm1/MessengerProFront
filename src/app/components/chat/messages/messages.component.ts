import { Component, Input, Output, EventEmitter, ViewChild, ElementRef, AfterViewChecked, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
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
      <div class="messages-wrapper" *ngIf="showChat">
        <div class="messages" #messagesContainer (scroll)="onScroll()">
          <ng-container *ngFor="let msg of messages">
            <div class="date-divider" *ngIf="msg.showDateDivider">
              <span>{{ msg.dateLabel }}</span>
            </div>

            <div class="unread-divider" *ngIf="isFirstUnreadMessage(msg)">
              <span>Unread Messages</span>
            </div>

            <div
              class="msg"
              [class.self]="isMessageFromCurrentUser(msg)"
              [class.other]="!isMessageFromCurrentUser(msg)"
              [class.media-msg]="isMediaMessage(msg)"
              [attr.data-message-id]="msg.messageId">
              <div class="msg-sender" *ngIf="!isMessageFromCurrentUser(msg) && selectedContact?.isGroup">
                {{ msg.fromDisplayName || msg.fromUserName }}
              </div>

              <!-- Media Content -->
              <div class="msg-media" *ngIf="isMediaMessage(msg)">
                <!-- Image -->
                <div class="media-content" *ngIf="msg.contentType === 'image'"
                     (click)="mediaClicked.emit({ url: msg.mediaUrl!, type: 'image' })">
                  <img [src]="msg.mediaUrl" alt="Image" class="media-image">
                  <div class="media-overlay">
                    <span class="view-icon">🔍</span>
                  </div>
                </div>

                <!-- Video -->
                <div class="media-content" *ngIf="msg.contentType === 'video'"
                     (click)="mediaClicked.emit({ url: msg.mediaUrl!, type: 'video' })">
                  <img [src]="getVideoThumbnail(msg.mediaUrl!)" alt="Video" class="media-image">
                  <div class="media-overlay">
                    <span class="play-icon">▶️</span>
                  </div>
                </div>

                <!-- Caption -->
                <div class="msg-caption" *ngIf="msg.body && msg.body !== msg.mediaUrl">
                  {{ msg.body }}
                </div>
              </div>

              <!-- Text Content -->
              <div class="msg-body" *ngIf="!isMediaMessage(msg)">{{ msg.body }}</div>

              <div class="meta">
                {{ formatTime(msg.createdAtUtc) }}
                <span
                  *ngIf="isMessageFromCurrentUser(msg)"
                  class="status-icon"
                  [class]="getMessageStatusClass(msg.messageStatus)">
                  {{ getMessageStatusIcon(msg.messageStatus) }}
                </span>
              </div>
            </div>
          </ng-container>
        </div>

        <button
          class="new-messages-btn"
          *ngIf="showNewMessageButton"
          (click)="scrollToNewMessages.emit()">
          ↓ {{ newMessageCount }} new message{{ newMessageCount > 1 ? 's' : '' }}
        </button>
      </div>

      <div class="no-chat" *ngIf="!showChat">
        Select a contact to start chatting
      </div>

      <!-- Send Area with Media & Emoji Support -->
      <div class="send-area" *ngIf="showChat">
        <!-- Hidden file input -->
        <input
          type="file"
          #mediaInput
          accept="image/*,video/*"
          (change)="onMediaSelected($event)"
          style="display: none" />

        <!-- Emoji Picker Container -->
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

        <!-- Message Input (first) -->
        <input
          #messageInput
          [(ngModel)]="messageText"
          placeholder="Type a message..."
          (keyup.enter)="sendMessage()" />

        <!-- Media Button -->
        <button class="media-btn" (click)="triggerMediaUpload()" type="button" title="Send photo/video">
          📎
        </button>

        <!-- Emoji Button -->
        <button class="emoji-btn" (click)="toggleEmojiPicker.emit()" type="button" title="Add emoji">
          😊
        </button>

        <!-- Send Button -->
        <button (click)="sendMessage()">Send</button>
      </div>
    </div>
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
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
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

  constructor(private cdr: ChangeDetectorRef) {}

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
