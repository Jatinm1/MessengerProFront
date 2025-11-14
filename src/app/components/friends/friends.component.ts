import { Component, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { FriendRequest, Friend, UserSearchResult, User } from '../../models/chat.models';

@Component({
  selector: 'app-friends',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.css']
})
export class FriendsComponent implements OnInit, OnDestroy, OnChanges {
  private destroy$ = new Subject<void>();
  private searchSubject$ = new Subject<string>();
  
  currentUser: User | null = null;
  searchTerm = '';
  searchResults: UserSearchResult[] = [];
  
  sentRequests: FriendRequest[] = [];
  receivedRequests: FriendRequest[] = [];
  friends: Friend[] = [];
  
  activeTab: 'search' | 'requests' | 'friends' = 'friends';
  requestsSubTab: 'sent' | 'received' = 'received';
  
  isSearching = false;
  errorMessage = '';
  successMessage = '';

  pendingReceivedRequestsCount = 0;
  receivedRequestsCount = 0;
  sentRequestsCount = 0;
  friendsCount = 0;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    this.loadAllData();
    this.setupRealtimeListeners();
    this.setupSearchDebounce();
  }

  ngOnChanges(changes: SimpleChanges): void {
    this.updateComputedProperties();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearchDebounce(): void {
    this.searchSubject$
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.performSearch(searchTerm);
      });
  }

  private updateComputedProperties(): void {
    this.pendingReceivedRequestsCount = this.receivedRequests.filter(r => r.status === 'Pending').length;
    this.receivedRequestsCount = this.receivedRequests.length;
    this.sentRequestsCount = this.sentRequests.filter(r => r.status === 'Pending').length;
    this.friendsCount = this.friends.length;
  }

  private setupRealtimeListeners(): void {
    this.chatService.friendRequestReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(request => {
        this.receivedRequests.unshift(request);
        this.updateComputedProperties();
        this.showSuccess('New friend request received!');
      });

    this.chatService.friendRequestSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadSentRequests();
        this.showSuccess('Friend request sent!');
      });

    this.chatService.friendRequestAccepted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        if (data.acceptedByName) {
          this.showSuccess(`${data.acceptedByName} accepted your friend request!`);
        }
        this.loadAllData();
      });

    this.chatService.friendRequestRejected$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loadSentRequests();
      });

    this.chatService.friendsListUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(friends => {
        this.friends = friends;
        this.updateComputedProperties();
      });

    this.chatService.friendRequestError$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        this.showError(error);
      });

    // User Online Status Updates
    this.chatService.userOnlineStatusChanged$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        const friend = this.friends.find(f => f.friendUserId === data.userId);
        if (friend) {
          friend.isOnline = data.isOnline;
          friend.lastSeenUtc = data.lastSeenUtc;
        }
        
        const searchResult = this.searchResults.find(u => u.userId === data.userId);
        if (searchResult) {
          searchResult.isOnline = data.isOnline;
          searchResult.lastSeenUtc = data.lastSeenUtc;
        }
      });
  }

  private loadAllData(): void {
    this.loadSentRequests();
    this.loadReceivedRequests();
    this.loadFriends();
  }

  loadSentRequests(): void {
    this.chatService.getSentRequests()
      .pipe(takeUntil(this.destroy$))
      .subscribe(requests => {
        this.sentRequests = requests;
        this.updateComputedProperties();
      });
  }

  loadReceivedRequests(): void {
    this.chatService.getReceivedRequests()
      .pipe(takeUntil(this.destroy$))
      .subscribe(requests => {
        this.receivedRequests = requests;
        this.updateComputedProperties();
      });
  }

  loadFriends(): void {
    this.chatService.getFriendsList()
      .pipe(takeUntil(this.destroy$))
      .subscribe(friends => {
        this.friends = friends;
        this.updateComputedProperties();
      });
  }

  onSearchInput(): void {
    if (!this.searchTerm.trim()) {
      this.searchResults = [];
      this.isSearching = false;
      return;
    }
    
    this.searchSubject$.next(this.searchTerm.trim());
  }

  private performSearch(searchTerm: string): void {
    if (!searchTerm) {
      this.searchResults = [];
      return;
    }

    this.isSearching = true;
    this.chatService.searchUsers(searchTerm)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: results => {
          this.searchResults = results;
          this.isSearching = false;
        },
        error: () => {
          this.isSearching = false;
          this.showError('Search failed');
        }
      });
  }

  searchUsers(): void {
    if (!this.searchTerm.trim()) {
      this.searchResults = [];
      return;
    }

    this.performSearch(this.searchTerm.trim());
  }

  sendFriendRequest(userId: string): void {
    if (!this.canSendRequest('None')) {
      return;
    }
    
    this.chatService.sendFriendRequest(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Friend request sent!');
          this.loadSentRequests();
          if (this.searchTerm.trim()) {
            this.performSearch(this.searchTerm.trim());
          }
        },
        error: (error) => {
          this.showError('Failed to send friend request: ' + error.message);
        }
      });
  }

  acceptRequest(requestId: number): void {
    this.chatService.acceptFriendRequest(requestId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Friend request accepted!');
          this.loadAllData();
          if (this.searchTerm.trim()) {
            this.performSearch(this.searchTerm.trim());
          }
        },
        error: () => {
          this.showError('Failed to accept request');
        }
      });
  }

  rejectRequest(requestId: number): void {
    this.chatService.rejectFriendRequest(requestId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Friend request rejected');
          this.loadReceivedRequests();
        },
        error: () => {
          this.showError('Failed to reject request');
        }
      });
  }

  viewProfile(userId: string): void {
    this.router.navigate(['/profile', userId]);
  }

  setActiveTab(tab: 'search' | 'requests' | 'friends'): void {
    this.activeTab = tab;
    this.clearMessages();
  }

  setRequestsSubTab(tab: 'sent' | 'received'): void {
    this.requestsSubTab = tab;
  }

  getStatusClass(status: string): string {
    switch (status) {
      case 'Pending': return 'status-pending';
      case 'Accepted': return 'status-accepted';
      case 'Rejected': return 'status-rejected';
      default: return '';
    }
  }

  getRelationshipButtonText(status: string): string {
    switch (status) {
      case 'None': return 'Send Request';
      case 'Pending': return 'Pending';
      case 'Friends': return 'Friends';
      case 'Rejected': return 'Rejected';
      default: return '';
    }
  }

  canSendRequest(status: string): boolean {
    return status === 'None';
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString([], {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  formatLastSeen(lastSeenUtc?: string): string {
    if (!lastSeenUtc) return '';
    
    const lastSeen = new Date(lastSeenUtc);
    const now = new Date();
    const diffMs = now.getTime() - lastSeen.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  }

  private showSuccess(message: string): void {
    this.successMessage = message;
    this.errorMessage = '';
    setTimeout(() => this.successMessage = '', 3000);
  }

  private showError(message: string): void {
    this.errorMessage = message;
    this.successMessage = '';
    setTimeout(() => this.errorMessage = '', 3000);
  }

  private clearMessages(): void {
    this.errorMessage = '';
    this.successMessage = '';
  }
}