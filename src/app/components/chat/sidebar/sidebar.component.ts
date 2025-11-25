import { Component, OnInit, OnDestroy, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { User, Contact } from '../../../models/chat.models';
import { ChatService } from '../../../services/chat.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="header-content">
          <span>Logged in as: {{ currentUser?.displayName }}</span>
          <button class="create-group-btn" (click)="createGroupClicked.emit()" title="Create Group">
            ➕ Group
          </button>
        </div>
      </div>

      <div class="contacts">
        <div
          *ngFor="let contact of contacts"
          class="contact"
          [class.active]="isContactActive(contact)"
          (click)="contactSelected.emit(contact)">
          <div class="contact-avatar">
            <img *ngIf="contact.photoUrl" [src]="contact.photoUrl" alt="avatar" class="avatar-img">
            <span *ngIf="!contact.photoUrl">{{ contact.displayName.charAt(0).toUpperCase() }}</span>
            <span class="online-dot" *ngIf="!contact.isGroup && contact.isOnline"></span>
          </div>
          <div class="info">
            <div class="name">
              <span class="group-icon" *ngIf="contact.isGroup">👥</span>
              {{ contact.displayName }}
              <span class="unread-badge" *ngIf="contact.unreadCount && contact.unreadCount > 0">
                {{ contact.unreadCount }}
              </span>
            </div>
            <div class="preview">{{ contact.lastMessage }}</div>
          </div>
          <div class="time">{{ formatLastMessageTime(contact.lastMessageTime) }}</div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    /* Sidebar */
    .sidebar {
      width: 340px;
      border-right: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      background: #f8fafc;
      height: 100vh;
    }

    .sidebar-header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 16px 20px;
      box-shadow: 0 4px 12px rgba(13, 148, 136, 0.15);
    }

    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 10px;
      font-size: 0.875rem;
      font-weight: 500;
    }

    .unread-badge {
  background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
  color: white;
  border-radius: 10px;
  padding: 2px 7px;
  font-size: 0.65rem;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);
  min-width: 18px;
  text-align: center;
}

    .create-group-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.75rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }

    .create-group-btn:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    /* Contact Avatar */
    .contact-avatar,
    .chat-avatar,
    .member-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 700;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
    }

    .avatar-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      border-radius: 50%;
    }

    .online-dot {
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 12px;
      height: 12px;
      background: #10b981;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
    }

    .contact {
      padding: 12px 14px;
      cursor: pointer;
      background: #ffffff;
      display: flex;
      align-items: center;
      gap: 12px;
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
      margin: 3px 0;
      border-radius: 10px;
      border: 1px solid transparent;
      position: relative;
    }

    .contact::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      background: #14b8a6;
      border-radius: 10px 0 0 10px;
      opacity: 0;
      transition: opacity 0.2s;
    }

    .contact:hover {
      background: #f1f5f9;
      border-color: #e2e8f0;
      transform: translateX(2px);
    }

    .contact.active {
      background: linear-gradient(90deg, #dbeafe 0%, #eff6ff 100%);
      border-color: #3b82f6;
      box-shadow: 0 2px 8px rgba(20, 184, 166, 0.12);
    }

    .contact.active::before {
      background: #3b82f6;
      opacity: 1;
    }

    .contact .info {
      display: flex;
      flex-direction: column;
      gap: 4px;
      flex: 1;
      min-width: 0;
    }

    .contact .name {
      font-weight: 600;
      color: #1e293b;
      font-size: 0.9rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .group-icon {
      font-size: 0.85rem;
    }

    .contact .preview {
      font-size: 0.8rem;
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .contact .time {
      font-size: 0.7rem;
      color: #94a3b8;
      font-weight: 500;
      flex-shrink: 0;
    }

    .contacts {
      flex: 1;
      overflow-y: auto;
      padding: 4px 8px;
      max-height: 100%;
    }

    .divider {
      background: #e2e8f0;
      height: 1px;
      margin: 8px 0;
    }
  `]
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() currentUser: User | null = null;
  @Input() selectedContact: Contact | null = null;
  @Output() contactSelected = new EventEmitter<Contact>();
  @Output() createGroupClicked = new EventEmitter<void>();

  contacts: Contact[] = [];
  private destroy$ = new Subject<void>();

  constructor(private chatService: ChatService) {}

  ngOnInit(): void {
    this.loadContacts();
    this.setupSignalRListeners();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSignalRListeners(): void {
    this.chatService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.messageSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.friendsListUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.conversationMarkedAsRead$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.userOnlineStatusChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());
      
      this.chatService.groupLeft$
  .pipe(takeUntil(this.destroy$))
  .subscribe(conversationId => {
      this.contacts = this.contacts.filter(c => c.conversationId !== conversationId);
  });

  }

  loadContacts(): void {
    this.chatService.getContacts()
      .pipe(takeUntil(this.destroy$))
      .subscribe(contacts => {
        this.contacts = contacts;
      });
  }

  isContactActive(contact: Contact): boolean {
    return this.selectedContact?.conversationId === contact.conversationId;
  }

  formatLastMessageTime(time?: string): string {
    if (!time) return '';
    const date = new Date(time);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * oneDay) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'numeric', day: 'numeric' });
    }
  }
}
