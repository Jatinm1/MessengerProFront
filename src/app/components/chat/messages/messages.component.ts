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
  templateUrl: './messages.component.html',
  styleUrls: ['./messages.component.css'],
  changeDetection: ChangeDetectionStrategy.Default
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
  @Output() deleteMessageEvent = new EventEmitter<{ messageId: number; deleteForEveryone: boolean }>();
  @Output() editMessageEvent = new EventEmitter<{ messageId: number; newBody: string }>();
  @Output() forwardMessageEvent = new EventEmitter<Message>();

  private _messageText = '';
  private shouldScrollToBottom = false;
  private focusEditInputFlag = false;

  activeMessageMenu: number | null = null;
  editingMessageId: number | null = null;
  editMessageText = '';

  constructor(private cdr: ChangeDetectorRef) {}

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