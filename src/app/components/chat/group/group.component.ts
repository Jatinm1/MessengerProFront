// src/app/components/chat/group/group.component.ts - Updated

import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Contact } from '../../../models/chat.models';

@Component({
  selector: 'app-group',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './group.component.html',
  styleUrls: ['./group.component.css']
})
export class GroupComponent {
  @Input() selectedContact: Contact | null = null;
  @Output() openGroupDetails = new EventEmitter<void>();
  @Output() audioCallClicked = new EventEmitter<void>(); // NEW
  @Output() videoCallClicked = new EventEmitter<void>(); // NEW

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

  onAudioCallClick(): void {
    if (!this.selectedContact?.isGroup) {
      this.audioCallClicked.emit();
    }
  }

  onVideoCallClick(): void {
    if (!this.selectedContact?.isGroup) {
      this.videoCallClicked.emit();
    }
  }
}