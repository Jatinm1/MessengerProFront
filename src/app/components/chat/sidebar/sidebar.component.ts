import { Component, OnInit, OnDestroy, Input, Output, EventEmitter, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { User, Contact } from '../../../models/chat.models';
import { ChatService } from '../../../services/chat.service';
import { CryptoService } from '../../../services/crypto.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="header-content">
          <span>Logged in as: {{ currentUser?.displayName }}</span>
          <div class="header-actions">
            <button class="search-btn" (click)="searchClicked.emit()" title="Search Messages">
              <img src="/images/search.png" alt="Search" class="search-icon" />
            </button>
            <button class="create-group-btn" (click)="createGroupClicked.emit()" title="Create Group">
            New Group
            </button>
          </div>
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
              <span class="name-text">{{ contact.displayName }}</span>
              <span class="unread-badge"
                    *ngIf="contact.unreadCount && contact.unreadCount > 0">
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
    .sidebar {
      width: 360px;
      border-right: 1px solid #e2e8f0;
      display: flex;
      flex-direction: column;
      background: #ffffff;
      height: 100vh;
    }
    .sidebar-header {
      background: #2a74f5ff;
      color: white;
      height: 70px;
      padding: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    .header-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      font-size: 0.9rem;
      font-weight: 600;
    }
    .header-actions { display: flex; gap: 10px; }
    .search-btn, .create-group-btn {
      background: rgba(255,255,255,0.15);
      border: 1px solid rgba(255,255,255,0.2);
      color: white;
      padding: 8px 14px;
      border-radius: 10px;
      font-size: 0.8rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
      backdrop-filter: blur(10px);
    }
    .search-btn { font-size: 1.1rem; padding: 8px 12px; }
    .search-icon { width: 1.6rem; height: 1.6rem; vertical-align: middle; }
    .search-btn:hover, .create-group-btn:hover {
      background: rgba(255,255,255,0.25);
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .contacts { flex: 1; overflow-y: auto; padding: 8px; }
    .contact {
      padding: 14px 16px;
      cursor: pointer;
      background: transparent;
      display: flex;
      align-items: center;
      gap: 14px;
      transition: all 0.2s cubic-bezier(0.4,0,0.2,1);
      margin: 2px 0;
      border-radius: 12px;
      border: 1px solid transparent;
      position: relative;
    }
    .contact::before {
      content: '';
      position: absolute;
      left: 0;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 0;
      background: #3b82f6;
      border-radius: 0 3px 3px 0;
      transition: height 0.2s;
    }
    .contact:hover { background: #f8fafc; border-color: #e2e8f0; }
    .contact:hover::before { height: 60%; }
    .contact.active {
      background: linear-gradient(90deg, #eff6ff 0%, #dbeafe 100%);
      border-color: #bfdbfe;
    }
    .contact.active::before { height: 70%; }
    .contact-avatar {
      width: 52px;
      height: 52px;
      border-radius: 14px;
      background: #2a74f5ff;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.2rem;
      font-weight: 700;
      flex-shrink: 0;
      position: relative;
      overflow: hidden;
      box-shadow: 0 2px 8px rgba(59,130,246,0.2);
    }
    .avatar-img { width: 100%; height: 100%; object-fit: cover; border-radius: 14px; }
    .online-dot {
      position: absolute;
      bottom: 2px;
      right: 2px;
      width: 14px;
      height: 14px;
      background: #10b981;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 0 2px rgba(16,185,129,0.2);
    }
    .info { min-width: 0; flex: 1; }
    .contact .name {
      font-weight: 600;
      color: #1e293b;
      font-size: 0.95rem;
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.4;
    }
    .name-text {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .group-icon { font-size: 0.9rem; opacity: 0.8; }
    .unread-badge {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      color: white;
      border-radius: 12px;
      padding: 3px 9px;
      font-size: 0.7rem;
      font-weight: 700;
      box-shadow: 0 2px 6px rgba(239,68,68,0.3);
      min-width: 22px;
      text-align: center;
    }
    .preview {
      font-size: 0.85rem;
      color: #64748b;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      line-height: 1.4;
    }
    .time {
      font-size: 0.75rem;
      color: #94a3b8;
      font-weight: 500;
      flex-shrink: 0;
      align-self: flex-start;
      margin-top: 2px;
    }
    .contact.active .time { color: #3b82f6; font-weight: 600; }
    .contacts::-webkit-scrollbar { width: 8px; }
    .contacts::-webkit-scrollbar-track { background: transparent; margin: 8px 0; }
    .contacts::-webkit-scrollbar-thumb {
      background: #cbd5e1;
      border-radius: 10px;
      border: 2px solid transparent;
      background-clip: padding-box;
    }
    .contacts::-webkit-scrollbar-thumb:hover {
      background: #94a3b8;
      background-clip: padding-box;
    }
    @media (max-width: 768px) {
      .sidebar { width: 100%; }
      .contact-avatar { width: 48px; height: 48px; }
    }
  `]
})
export class SidebarComponent implements OnInit, OnDestroy {
  @Input() currentUser: User | null = null;
  @Input() selectedContact: Contact | null = null;
  @Output() contactSelected    = new EventEmitter<Contact>();
  @Output() createGroupClicked = new EventEmitter<void>();
  @Output() searchClicked      = new EventEmitter<void>();

  contacts: Contact[] = [];
  private destroy$    = new Subject<void>();

  // Private key cached for the session — fetched once, reused on every update
  private privateKey: CryptoKey | null = null;

  constructor(
    private chatService:   ChatService,
    private cryptoService: CryptoService,
    private authService:   AuthService,
    private cdr:           ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    // Pre-load private key once so every incoming contactUpdated event
    // doesn't have to hit IndexedDB individually
    const userId = this.authService.getCurrentUserId();
    if (userId) {
      this.privateKey = await this.cryptoService.getPrivateKey(userId);
    }

    await this.loadContacts();
    this.setupSignalRListeners();
     this.listenForDeviceSwitch();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  // ============================================================================
  // LOAD CONTACTS
  // ============================================================================

  async loadContacts(): Promise<void> {
    this.chatService.getContacts()
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (contacts) => {
        this.contacts = await this.decryptContactPreviews(contacts);
        this.cdr.detectChanges();
      });
  }

  // ============================================================================
  // SIGNALR LISTENERS
  // ============================================================================

  private setupSignalRListeners(): void {

    // Delta update from server — decrypt preview before patching into list
    this.chatService.contactUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(async (contactUpdate) => {
        const index = this.contacts.findIndex(
          c => c.conversationId === contactUpdate.conversationId
        );

        const decryptedUpdate = await this.decryptContactPreview(
          index !== -1 ? this.contacts[index] : null,
          contactUpdate
        );

        if (index !== -1) {
          // Patch existing contact
          this.contacts[index] = { ...this.contacts[index], ...decryptedUpdate };
        } else {
          // Brand-new conversation — prepend to top
          this.contacts.unshift(decryptedUpdate);
        }

        // Re-sort by most recent message
        this.contacts.sort((a, b) =>
          new Date(b.lastMessageTime ?? 0).getTime() -
          new Date(a.lastMessageTime ?? 0).getTime()
        );

        this.cdr.detectChanges();
      });

    // These events still trigger a full reload (no delta payload available)
    this.chatService.friendsListUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.conversationMarkedAsRead$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.userStatusChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.groupCreated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    // Message deleted/edited — reload so SP re-computes the correct lastMessage
    this.chatService.messageDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    this.chatService.messageEdited$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => this.loadContacts());

    // Remove deleted/left groups from the list immediately
    this.chatService.groupLeft$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.contacts = this.contacts.filter(
          c => c.conversationId !== data.conversationId
        );
        this.cdr.detectChanges();
      });

    this.chatService.groupDeleted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.contacts = this.contacts.filter(
          c => c.conversationId !== data.conversationId
        );
        this.cdr.detectChanges();
      });

    // messageSent / messageReceived — contactUpdated$ handles the preview update;
    // nothing extra to do here
    this.chatService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {});

    this.chatService.messageSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {});
  }

  // ============================================================================
  // DECRYPT HELPERS
  // ============================================================================

  private async decryptContactPreviews(contacts: Contact[]): Promise<Contact[]> {
    return Promise.all(contacts.map(c => this.decryptContactPreview(c, null)));
  }

  /**
   * Decrypts the lastMessage preview string of a contact.
   *
   * The SP returns lastMessage in one of these forms:
   *   "You: <iv>:<ciphertext>"
   *   "DisplayName: <iv>:<ciphertext>"
   *   "<iv>:<ciphertext>"          ← direct message, receiver side
   *
   * Non-encrypted values (deleted, media icons, legacy) are returned as-is.
   */
  private async decryptContactPreview(
    existing: Contact | null,
    update:   any | null
  ): Promise<Contact> {
    // Merge update on top of existing so we have a full Contact object
    const contact: Contact = update
      ? { ...(existing ?? {}), ...update } as Contact
      : { ...existing! };

    const raw = contact.lastMessage ?? '';

    // ── Skip patterns that are never encrypted ──────────────────────────────
    const skipPatterns = [
      'This message was deleted',
      '📷', '🎥', '🎵', '📎', '🔒',
      // If there's no encrypted key, we can't decrypt anyway
    ];
    if (!raw || skipPatterns.some(p => raw.includes(p))) return contact;

    // ── No key → can't decrypt ───────────────────────────────────────────────
    if (!contact.lastMessageEncryptedKey) return contact;

    // ── Extract prefix and encrypted portion ─────────────────────────────────
    // Possible prefixes: "You: " or "SomeName: "
    let prefix    = '';
    let encrypted = raw;

    const youPrefix = 'You: ';
    if (raw.startsWith(youPrefix)) {
      prefix    = youPrefix;
      encrypted = raw.substring(youPrefix.length);
    } else {
      // "DisplayName: <blob>" — find first ": " that is followed by an iv:ciphertext pair
      const colonSpaceIdx = raw.indexOf(': ');
      if (colonSpaceIdx !== -1) {
        const possibleBlob = raw.substring(colonSpaceIdx + 2);
        // Only treat as prefixed if the remainder looks like iv:ciphertext
        if (possibleBlob.includes(':')) {
          prefix    = raw.substring(0, colonSpaceIdx + 2);
          encrypted = possibleBlob;
        }
      }
    }

    // ── Must be "iv:ciphertext" ───────────────────────────────────────────────
    const splitIdx = encrypted.indexOf(':');
    if (splitIdx === -1) return contact;

    try {
      const key = this.privateKey;
      if (!key) return contact;

      const iv         = encrypted.substring(0, splitIdx);
      const ciphertext = encrypted.substring(splitIdx + 1);

      const plaintext = await this.cryptoService.decryptMessage(
        ciphertext,
        iv,
        contact.lastMessageEncryptedKey,
        key
      );

      return { ...contact, lastMessage: prefix + plaintext };

    } catch (err) {
      console.error(
        `❌ Failed to decrypt preview for conversation ${contact.conversationId}:`, err
      );
      return { ...contact, lastMessage: prefix + '🔒 Encrypted message' };
    }
  }

  private listenForDeviceSwitch(): void {
  this.authService.deviceSwitchConfirmed$
    .pipe(takeUntil(this.destroy$))
    .subscribe(async () => {
      console.log('🔐 [Sidebar] Device switch confirmed — refreshing key');
      const userId = this.authService.getCurrentUserId()!;
      this.privateKey = await this.cryptoService.getPrivateKey(userId);
      await this.loadContacts();
    });
}

  // ============================================================================
  // UTILS
  // ============================================================================

  isContactActive(contact: Contact): boolean {
    return this.selectedContact?.conversationId === contact.conversationId;
  }

  formatLastMessageTime(time?: string): string {
    if (!time) return '';
    const date   = new Date(time);
    const now    = new Date();
    const diff   = now.getTime() - date.getTime();
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