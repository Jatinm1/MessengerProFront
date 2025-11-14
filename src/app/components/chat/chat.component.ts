import { Component, OnInit, OnDestroy, ViewChild, ElementRef, AfterViewChecked, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../services/auth.service';
import { ChatService } from '../../services/chat.service';
import { Contact, Message, User, GroupDetails } from '../../models/chat.models';

interface MessageWithDate extends Message {
  dateLabel?: string;
  showDateDivider?: boolean;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewChecked {
  @ViewChild('messagesContainer') messagesContainer!: ElementRef;
  @ViewChild('groupPhotoInput') groupPhotoInput!: ElementRef<HTMLInputElement>;

  private destroy$ = new Subject<void>();
  private shouldScrollToBottom = false;
  private shouldScrollToFirstUnread = false;
  private userScrolledUp = false;
  private listenersSetup = false;

  currentUser: User | null = null;
  contacts: Contact[] = [];
  allUsers: User[] = [];
  messages: MessageWithDate[] = [];

  currentChatUserId: string | null = null;
  conversationId: string | null = null;
  selectedContact: Contact | null = null;

  messageText = '';
  showChat = false;
  showNewMessageButton = false;
  newMessageCount = 0;
  firstUnreadMessageId: number | null = null;

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
  editGroupPhotoUrl = '';
  selectedGroupPhotoFile: File | null = null;
  groupPhotoPreview: string | null = null;

  // Add Member
  availableFriendsToAdd: User[] = [];
  selectedFriendToAdd: string | null = null;

  constructor(
    private authService: AuthService,
    private chatService: ChatService,
    private router: Router,
    private cdr: ChangeDetectorRef
  ) {}

  async ngOnInit(): Promise<void> {
    this.currentUser = this.authService.getCurrentUser();
    if (!this.currentUser) {
      this.router.navigate(['/login']);
      return;
    }

    try {
      await this.chatService.connectToHub();
      console.log('✅ SignalR Hub Connected');
      
      this.loadContacts();
      this.loadAllUsers();
      this.loadFriendsForGroup();
      this.setupSignalRListeners();

      const navigation = this.router.getCurrentNavigation();
      const state = navigation?.extras?.state || window.history.state;
      
      if (state && state.conversationId) {
        setTimeout(() => {
          const contact = this.contacts.find(c => c.conversationId === state.conversationId);
          
          if (contact) {
            this.openChat(contact);
          } else {
            const tempContact: Contact = {
              conversationId: state.conversationId,
              isGroup: false,
              userId: state.userId,
              displayName: state.displayName,
              unreadCount: 0
            };
            this.openChat(tempContact);
          }
        }, 200);
      }
    } catch (error) {
      console.error('Failed to connect to chat hub:', error);
    }
  }

  ngAfterViewChecked(): void {
    if (this.shouldScrollToBottom) {
      this.scrollToBottom();
      this.shouldScrollToBottom = false;
    }

    if (this.shouldScrollToFirstUnread && this.firstUnreadMessageId) {
      this.scrollToFirstUnread();
      this.shouldScrollToFirstUnread = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.chatService.disconnectFromHub();
  }

  private setupSignalRListeners(): void {
    if (this.listenersSetup) return;
    this.listenersSetup = true;

    this.chatService.messageReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        if (message.fromUserId === this.currentUser?.userId) return;

        if (message.conversationId === this.conversationId) {
          this.addMessageToView(message, false);

          if (this.userScrolledUp) {
            this.newMessageCount++;
            this.showNewMessageButton = true;
          } else {
            this.shouldScrollToBottom = true;
            setTimeout(() => this.markLastMessageAsRead(), 300);
          }
        }
        
        this.loadContacts();
      });

    this.chatService.messageSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(message => {
        this.addMessageToView(message, true);
        this.shouldScrollToBottom = true;
        this.loadContacts();
      });

    this.chatService.friendsListUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadContacts();
        this.loadFriendsForGroup();
      });

    this.chatService.messageStatusUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        const msg = this.messages.find(m => Number(m.messageId) === data.messageId);
        if (msg) {
          msg.messageStatus = data.status as any;
          this.cdr.detectChanges();
        }
      });

    this.chatService.conversationReadUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        this.messages.forEach(msg => {
          if (Number(msg.messageId) <= data.lastReadMessageId && 
              msg.fromUserId === this.currentUser?.userId) {
            msg.messageStatus = 'Read';
          }
        });
        
        this.loadContacts();
        this.cdr.detectChanges();
      });

    this.chatService.conversationMarkedAsRead$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data.conversationId === this.conversationId) {
          this.firstUnreadMessageId = null;
          
          const contact = this.contacts.find(c => c.conversationId === data.conversationId);
          if (contact) contact.unreadCount = 0;
          
          if (this.selectedContact && this.selectedContact.conversationId === data.conversationId) {
            this.selectedContact.unreadCount = 0;
          }
          
          this.loadContacts();
          this.cdr.detectChanges();
        }
      });

    this.chatService.userOnlineStatusChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        const contact = this.contacts.find(c => c.userId === data.userId);
        if (contact) {
          contact.isOnline = data.isOnline;
          contact.lastSeenUtc = data.lastSeenUtc;
        }
        if (this.selectedContact && this.selectedContact.userId === data.userId) {
          this.selectedContact.isOnline = data.isOnline;
          this.selectedContact.lastSeenUtc = data.lastSeenUtc;
        }
      });
  }

  loadContacts(): void {
    this.chatService.getContacts()
      .pipe(takeUntil(this.destroy$))
      .subscribe(contacts => {
        this.contacts = contacts;
        
        if (this.selectedContact) {
          const updated = contacts.find(c => c.conversationId === this.selectedContact!.conversationId);
          if (updated) {
            this.selectedContact = { ...updated };
          }
        }
        
        this.cdr.detectChanges();
      });
  }

  loadAllUsers(): void {
    this.chatService.getAllUsers()
      .pipe(takeUntil(this.destroy$))
      .subscribe(users => {
        this.allUsers = users.filter(u => u.userId !== this.currentUser?.userId);
      });
  }

  loadFriendsForGroup(): void {
    this.chatService.getFriendsList()
      .pipe(takeUntil(this.destroy$))
      .subscribe(friends => {
        this.friendsList = friends.map(f => ({
          userId: f.friendUserId,
          userName: f.friendUserName,
          displayName: f.friendDisplayName
        }));
      });
  }

  openChat(contact: Contact): void {
    this.currentChatUserId = contact.userId || null;
    this.conversationId = contact.conversationId;
    this.selectedContact = { ...contact };
    this.showChat = true;
    this.messages = [];
    this.userScrolledUp = false;
    this.showNewMessageButton = false;
    this.newMessageCount = 0;
    this.currentGroupDetails = null;

    if (contact.isGroup) {
      this.loadGroupDetails(contact.conversationId);
    }

    this.chatService.getHistory(contact.conversationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(messages => {
        const reversedMessages = messages.reverse();
        const unreadCount = contact.unreadCount || 0;

        if (unreadCount > 0 && reversedMessages.length >= unreadCount) {
          this.firstUnreadMessageId = Number(
            reversedMessages[reversedMessages.length - unreadCount].messageId
          );
          this.shouldScrollToFirstUnread = true;
        } else {
          this.firstUnreadMessageId = null;
          this.shouldScrollToBottom = true;
        }

        reversedMessages.forEach(msg => {
          this.addMessageToView(msg, msg.fromUserId === this.currentUser?.userId);
        });

        if (messages.length > 0) {
          const lastMessageId = Math.max(...messages.map(m => Number(m.messageId)));
          setTimeout(() => this.markAsRead(lastMessageId), 2000);
        } else {
          this.firstUnreadMessageId = null;
          if (this.selectedContact) {
            this.selectedContact.unreadCount = 0;
          }
        }
      });
  }

  startNewChat(user: User): void {
    this.chatService.createConversation(user.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(conv => {
        const fakeContact: Contact = {
          conversationId: conv.conversationId,
          isGroup: false,
          userId: user.userId,
          displayName: user.displayName,
          unreadCount: 0
        };
        this.openChat(fakeContact);
      });
  }

  private addMessageToView(message: Message, isSelf: boolean): void {
    const messageDate = new Date(message.createdAtUtc);
    const dateKey = messageDate.toISOString().split('T')[0];

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const msgDate = new Date(messageDate);
    msgDate.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24));

    let dateLabel: string;
    if (diffDays === 0) dateLabel = "Today";
    else if (diffDays === 1) dateLabel = "Yesterday";
    else dateLabel = messageDate.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

    const lastMessage = this.messages[this.messages.length - 1];
    const lastDateKey = lastMessage ? new Date(lastMessage.createdAtUtc).toISOString().split('T')[0] : null;
    const showDateDivider = dateKey !== lastDateKey;

    const messageWithDate: MessageWithDate = { ...message, dateLabel, showDateDivider };
    this.messages.push(messageWithDate);
  }

  async sendMessage(): Promise<void> {
    if (!this.messageText.trim() || !this.conversationId) return;

    try {
      if (this.selectedContact?.isGroup) {
        await this.chatService.sendGroupMessage(this.conversationId, this.messageText);
      } else if (this.currentChatUserId) {
        await this.chatService.sendMessage(this.currentChatUserId, this.messageText);
      }
      this.messageText = '';
      setTimeout(() => this.markLastMessageAsRead(), 100);
    } catch (error: any) {
      console.error('Failed to send message:', error);
      if (error.message && error.message.includes('friends')) {
        alert('You can only message friends. Please send a friend request first.');
      }
    }
  }

  // ========================================
  // GROUP MANAGEMENT METHODS
  // ========================================

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

  isFriendSelected(userId: string): boolean {
    return this.selectedFriendsForGroup.includes(userId);
  }

  createGroup(): void {
  if (!this.groupName.trim() || this.selectedFriendsForGroup.length === 0) {
    alert('Please enter a group name and select at least one member');
    return;
  }

  this.chatService.createGroup({
    groupName: this.groupName,
    memberUserIds: this.selectedFriendsForGroup
  })
  .pipe(takeUntil(this.destroy$))
  .subscribe({
    next: (response) => {
      this.closeCreateGroupModal();
      
      // 1️⃣ Reload contacts so group appears in list
      this.chatService.getContacts()
        .pipe(takeUntil(this.destroy$))
        .subscribe(updatedContacts => {
          this.contacts = updatedContacts;

          // 2️⃣ Find newly created group
          const newGroup = updatedContacts.find(
            c => c.conversationId === response.conversationId
          );

          // 3️⃣ Open the group chat
          if (newGroup) {
            this.openChat(newGroup);
          }

          alert('Group created successfully!');
        });
    },
    error: (error) => {
      console.error('Failed to create group:', error);
      alert('Failed to create group');
    }
  });
}


  loadGroupDetails(conversationId: string): void {
    this.chatService.getGroupDetails(conversationId)
      .pipe(takeUntil(this.destroy$))
      .subscribe(details => {
        this.currentGroupDetails = details;
      });
  }

  openGroupDetails(): void {
    if (this.selectedContact?.isGroup && this.conversationId) {
      this.loadGroupDetails(this.conversationId);
      this.showGroupDetailsModal = true;
    }
  }

  closeGroupDetailsModal(): void {
    this.showGroupDetailsModal = false;
  }

  // ========================================
  // EDIT GROUP METHODS
  // ========================================

  openEditGroupModal(): void {
    if (!this.currentGroupDetails) return;
    
    this.editGroupName = this.currentGroupDetails.groupName;
    this.editGroupPhotoUrl = this.currentGroupDetails.groupPhotoUrl || '';
    this.groupPhotoPreview = this.currentGroupDetails.groupPhotoUrl || null;
    this.selectedGroupPhotoFile = null;
    this.showEditGroupModal = true;
    this.showGroupDetailsModal = false;
  }

  closeEditGroupModal(): void {
    this.showEditGroupModal = false;
    this.selectedGroupPhotoFile = null;
    this.groupPhotoPreview = null;
  }

  onGroupPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select an image file');
        return;
      }
      
      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        alert('File size must be less than 5MB');
        return;
      }
      
      this.selectedGroupPhotoFile = file;
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.groupPhotoPreview = e.target.result;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
    }
  }

  triggerGroupPhotoUpload(): void {
    this.groupPhotoInput.nativeElement.click();
  }

  removeGroupPhoto(): void {
    this.selectedGroupPhotoFile = null;
    this.groupPhotoPreview = null;
    this.editGroupPhotoUrl = '';
    if (this.groupPhotoInput) {
      this.groupPhotoInput.nativeElement.value = '';
    }
  }

  async updateGroup(): Promise<void> {
    if (!this.conversationId || !this.editGroupName.trim()) {
      alert('Group name is required');
      return;
    }

    try {
      let photoUrl = this.editGroupPhotoUrl;

      // Upload photo if a new file was selected
      if (this.selectedGroupPhotoFile) {
        photoUrl = await this.uploadGroupPhoto(this.selectedGroupPhotoFile);
      }

      this.chatService.updateGroupInfo(
        this.conversationId,
        this.editGroupName,
        photoUrl
      ).pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => {
            alert('Group updated successfully!');
            this.closeEditGroupModal();
            this.loadGroupDetails(this.conversationId!);
            this.loadContacts();
            
            // Update selected contact
            if (this.selectedContact) {
              this.selectedContact.displayName = this.editGroupName;
              this.selectedContact.photoUrl = photoUrl;
            }
          },
          error: (error) => {
            console.error('Failed to update group:', error);
            alert('Failed to update group');
          }
        });
    } catch (error) {
      console.error('Error updating group:', error);
      alert('Failed to upload photo');
    }
  }

  private async uploadGroupPhoto(file: File): Promise<string> {
    // Convert to base64 for simplicity (you can implement actual upload to server/cloud storage)
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        resolve(e.target.result);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // ========================================
  // ADD MEMBER METHODS
  // ========================================

  openAddMemberModal(): void {
    if (!this.currentGroupDetails) return;

    // Get friends who are not already in the group
    const currentMemberIds = this.currentGroupDetails.members.map(m => m.userId);
    this.availableFriendsToAdd = this.friendsList.filter(f => 
      !currentMemberIds.includes(f.userId)
    );

    this.selectedFriendToAdd = null;
    this.showAddMemberModal = true;
    this.showGroupDetailsModal = false;
  }

  closeAddMemberModal(): void {
    this.showAddMemberModal = false;
    this.selectedFriendToAdd = null;
  }

  addMemberToGroup(): void {
    if (!this.selectedFriendToAdd || !this.conversationId) {
      alert('Please select a member to add');
      return;
    }

    this.chatService.addGroupMember(this.conversationId, this.selectedFriendToAdd)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          alert('Member added successfully!');
          this.closeAddMemberModal();
          this.loadGroupDetails(this.conversationId!);
          this.showGroupDetailsModal = true;
        },
        error: (error) => {
          console.error('Failed to add member:', error);
          alert(error.error?.error || 'Failed to add member');
        }
      });
  }

  // ========================================
  // REMOVE MEMBER METHODS
  // ========================================

  removeMember(userId: string, displayName: string): void {
    if (!this.conversationId) return;

    if (!confirm(`Are you sure you want to remove ${displayName} from this group?`)) {
      return;
    }

    this.chatService.removeGroupMember(this.conversationId, userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          alert('Member removed successfully!');
          this.loadGroupDetails(this.conversationId!);
        },
        error: (error) => {
          console.error('Failed to remove member:', error);
          alert(error.error?.error || 'Failed to remove member');
        }
      });
  }

  isCurrentUserAdmin(): boolean {
    if (!this.currentGroupDetails || !this.currentUser) return false;
    const currentMember = this.currentGroupDetails.members.find(
      m => m.userId === this.currentUser!.userId
    );
    return currentMember?.isAdmin || false;
  }

  canRemoveMember(member: any): boolean {
    // Can't remove yourself, and only admins can remove others
    return this.isCurrentUserAdmin() && member.userId !== this.currentUser?.userId;
  }

  // ========================================
  // SCROLL METHODS
  // ========================================

  onScroll(): void {
    const element = this.messagesContainer.nativeElement;
    const scrollTop = element.scrollTop;
    const scrollHeight = element.scrollHeight;
    const clientHeight = element.clientHeight;

    this.userScrolledUp = scrollTop + clientHeight < scrollHeight - 50;

    if (!this.userScrolledUp) {
      this.showNewMessageButton = false;
      this.newMessageCount = 0;
      this.markLastMessageAsRead();
    }
  }

  scrollToBottom(): void {
    if (this.messagesContainer) {
      const element = this.messagesContainer.nativeElement;
      element.scrollTop = element.scrollHeight;
      this.userScrolledUp = false;
      this.showNewMessageButton = false;
      this.newMessageCount = 0;
    }
  }

  scrollToFirstUnread(): void {
    if (this.messagesContainer && this.firstUnreadMessageId) {
      const element = this.messagesContainer.nativeElement;
      const unreadElement = element.querySelector(`[data-message-id="${this.firstUnreadMessageId}"]`);
      if (unreadElement) {
        unreadElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  scrollToNewMessages(): void {
    this.scrollToBottom();
    this.markLastMessageAsRead();
  }

  private async markLastMessageAsRead(): Promise<void> {
    if (this.messages.length > 0 && this.conversationId) {
      const lastMessageId = Math.max(...this.messages.map(m => Number(m.messageId)));
      await this.markAsRead(lastMessageId);
    }
  }

  private async markAsRead(messageId: number): Promise<void> {
    if (!this.conversationId) return;

    this.firstUnreadMessageId = null;
    
    const contact = this.contacts.find(c => c.conversationId === this.conversationId);
    if (contact) contact.unreadCount = 0;
    
    if (this.selectedContact && this.selectedContact.conversationId === this.conversationId) {
      this.selectedContact.unreadCount = 0;
    }

    this.cdr.detectChanges();

    try {
      await this.chatService.markConversationAsReadViaHub(this.conversationId, messageId);
    } catch (error) {
      this.chatService.markMessagesAsRead(this.conversationId, messageId)
        .pipe(takeUntil(this.destroy$))
        .subscribe({
          next: () => this.loadContacts(),
          error: (err) => console.error('❌ HTTP fallback also failed:', err)
        });
    }
  }

  // ========================================
  // UTILITY METHODS
  // ========================================

  formatTime(dateString: string): string {
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatLastMessageTime(dateString?: string): string {
    if (!dateString) return '';
    return new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  formatLastSeen(lastSeenUtc?: string): string {
    if (!lastSeenUtc) return 'Last seen recently';
    
    const lastSeen = new Date(lastSeenUtc);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Last seen just now';
    if (diffMins < 60) return `Last seen ${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `Last seen ${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `Last seen ${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return `Last seen on ${lastSeen.toLocaleDateString()}`;
  }

  getMessageStatusIcon(status?: string): string {
    switch (status) {
      case 'Sent': return '✓';
      case 'Delivered': return '✓✓';
      case 'Read': return '✓✓';
      default: return '⏱';
    }
  }

  getMessageStatusClass(status?: string): string {
    return status === 'Read' ? 'read' : '';
  }

  isMessageFromCurrentUser(message: Message): boolean {
    return message.fromUserId === this.currentUser?.userId;
  }

  isContactActive(contact: Contact): boolean {
    return contact.conversationId === this.conversationId;
  }

  isFirstUnreadMessage(message: MessageWithDate): boolean {
    return this.firstUnreadMessageId !== null && 
           Number(message.messageId) === this.firstUnreadMessageId;
  }

  getContactStatusText(contact: Contact): string {
    if (contact.isGroup) return '';
    if (contact.isOnline) return 'Online';
    return this.formatLastSeen(contact.lastSeenUtc);
  }

  getGroupPhotoUrl(): string {
    return this.currentGroupDetails?.groupPhotoUrl || this.selectedContact?.photoUrl || '';
  }
}