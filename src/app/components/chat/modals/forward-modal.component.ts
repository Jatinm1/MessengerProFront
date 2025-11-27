import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Message, Contact } from '../../../models/chat.models';

@Component({
  selector: 'app-forward-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="modal-overlay" *ngIf="show" (click)="close()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h3>Forward Message</h3>
          <button class="close-btn" (click)="close()">✕</button>
        </div>
        
        <div class="modal-body">
          <div class="forward-preview">
            <div class="preview-label">Message:</div>
            <div class="preview-content">{{ message?.body }}</div>
          </div>
          
          <div class="contacts-list">
            <div class="contacts-label">Forward to:</div>
            <div 
              *ngFor="let contact of contacts"
              class="contact-item"
              (click)="selectContact(contact)">
              <div class="contact-avatar">
                <img *ngIf="contact.photoUrl" [src]="contact.photoUrl" alt="avatar">
                <span *ngIf="!contact.photoUrl">{{ contact.displayName.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="contact-info">
                <div class="contact-name">
                  <span class="group-icon" *ngIf="contact.isGroup">👥</span>
                  {{ contact.displayName }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2000;
    }

    .modal-content {
      background: white;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
    }

    .modal-header {
      padding: 20px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h3 {
      margin: 0;
      font-size: 1.25rem;
      color: #1e293b;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      cursor: pointer;
      color: #64748b;
      padding: 0;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      transition: background 0.2s;
    }

    .close-btn:hover {
      background: #f1f5f9;
    }

    .modal-body {
      padding: 20px;
      overflow-y: auto;
      flex: 1;
    }

    .forward-preview {
      background: #f8fafc;
      border-radius: 8px;
      padding: 12px;
      margin-bottom: 20px;
    }

    .preview-label {
      font-size: 0.75rem;
      color: #64748b;
      margin-bottom: 4px;
      font-weight: 600;
    }

    .preview-content {
      color: #1e293b;
      font-size: 0.875rem;
    }

    .contacts-label {
      font-size: 0.875rem;
      color: #64748b;
      margin-bottom: 12px;
      font-weight: 600;
    }

    .contacts-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .contact-item {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px;
      border-radius: 8px;
      cursor: pointer;
      transition: background 0.2s;
      border: 1px solid #e2e8f0;
    }

    .contact-item:hover {
      background: #f1f5f9;
    }

    .contact-avatar {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      flex-shrink: 0;
      overflow: hidden;
    }

    .contact-avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .contact-info {
      flex: 1;
    }

    .contact-name {
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
  `]
})
export class ForwardModalComponent {
  @Input() show = false;
  @Input() message: Message | null = null;
  @Input() contacts: Contact[] = [];
  @Output() closeModal = new EventEmitter<void>();
  @Output() forwardTo = new EventEmitter<Contact>();

  close(): void {
    this.closeModal.emit();
  }

  selectContact(contact: Contact): void {
    this.forwardTo.emit(contact);
  }
}