import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Contact } from '../../../models/chat.models';

@Component({
  selector: 'app-group',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="chat-header" *ngIf="selectedContact">
      <div class="header-left">
        <div class="chat-avatar">
          <img *ngIf="getGroupPhotoUrl()" [src]="getGroupPhotoUrl()" alt="avatar" class="avatar-img">
          <span *ngIf="!getGroupPhotoUrl()">{{ selectedContact.displayName.charAt(0).toUpperCase() }}</span>
          <span class="online-dot" *ngIf="!selectedContact.isGroup && selectedContact.isOnline"></span>
        </div>
        <div class="header-info">
          <div class="header-title">
            <span class="group-icon" *ngIf="selectedContact.isGroup">👥</span>
            {{ selectedContact.displayName }}
          </div>
          <div class="header-status">
            {{ getContactStatusText(selectedContact) }}
          </div>
        </div>
      </div>
      <button
        *ngIf="selectedContact.isGroup"
        class="group-info-btn"
        (click)="openGroupDetails.emit()">
        ℹ️ Info
      </button>
    </div>

    <div class="chat-header" *ngIf="!selectedContact">
      Select a contact to start chatting
    </div>
  `,
  styles: [`
    /* Chat Header */
    .chat-header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      color: white;
      padding: 14px 24px;
      box-shadow: 0 2px 12px rgba(13, 148, 136, 0.2);
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .chat-avatar {
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.1rem;
      font-weight: 700;
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

    .header-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }

    .header-title {
      font-weight: 600;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .group-icon {
      font-size: 0.85rem;
    }

    .header-status {
      font-size: 0.75rem;
      opacity: 0.9;
      font-weight: 400;
    }

    .group-info-btn {
      background: rgba(255, 255, 255, 0.2);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: white;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .group-info-btn:hover {
      background: rgba(255, 255, 255, 0.3);
    }
  `]
})
export class GroupComponent {
  @Input() selectedContact: Contact | null = null;
  @Output() openGroupDetails = new EventEmitter<void>();

  getGroupPhotoUrl(): string | undefined {
    return this.selectedContact?.photoUrl;
  }

  getContactStatusText(contact: Contact): string {
    if (contact.isGroup) {
      return 'Group Chat';
    }
    if (contact.isOnline) {
      return 'Online';
    }
    if (contact.lastSeenUtc) {
      return `Last seen ${this.formatLastSeen(contact.lastSeenUtc)}`;
    }
    return 'Offline';
  }

  formatLastSeen(time: string): string {
    const date = new Date(time);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const oneMinute = 60 * 1000;
    const oneHour = 60 * oneMinute;
    const oneDay = 24 * oneHour;

    if (diff < oneMinute) return 'just now';
    if (diff < oneHour) return `${Math.floor(diff / oneMinute)} minutes ago`;
    if (diff < oneDay) return `${Math.floor(diff / oneHour)} hours ago`;
    return date.toLocaleDateString();
  }
}
