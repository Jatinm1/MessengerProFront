import { Component, OnInit, OnDestroy } from '@angular/core';
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
export class FriendsComponent implements OnInit, OnDestroy {
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

  // Track if data has been loaded
  private sentRequestsLoaded = false;
  private receivedRequestsLoaded = false;
  private friendsLoaded = false;

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentUser = this.authService.getCurrentUser();
    
    // Load friends list and received requests initially (for notification badge)
    this.loadFriends();
    this.loadReceivedRequests();
    
    this.setupRealtimeListeners();
    this.setupSearchDebounce();
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

  private updateSearchResultsStatus(): void {
    if (this.searchResults.length === 0) return;

    console.log('🔄 Updating search results status...');
    
    this.searchResults = this.searchResults.map(result => {
      // Check if user is now a friend
      const isFriend = this.friends.some(f => f.friendUserId === result.userId);
      if (isFriend) {
        console.log(`👥 ${result.displayName} is now a friend`);
        return { ...result, relationshipStatus: 'Friends' };
      }

      // Check if there's a pending sent request
      const sentRequest = this.sentRequests.find(
        r => r.receiverId === result.userId && r.status === 'Pending'
      );
      if (sentRequest) {
        console.log(`⏳ ${result.displayName} has pending request`);
        return { ...result, relationshipStatus: 'Pending' };
      }

      // Check if there's a rejected sent request
      const rejectedRequest = this.sentRequests.find(
        r => r.receiverId === result.userId && r.status === 'Rejected'
      );
      if (rejectedRequest) {
        console.log(`❌ ${result.displayName} request was rejected`);
        return { ...result, relationshipStatus: 'Rejected' };
      }

      // Default to None
      console.log(`➖ ${result.displayName} has no relationship`);
      return { ...result, relationshipStatus: 'None' };
    });
  }

  private setupRealtimeListeners(): void {
    console.log('🎧 Setting up real-time listeners...');

    // ========================================
    // DIRECT LIST UPDATES FROM SERVER
    // ========================================
    
    this.chatService.sentRequestsUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(requests => {
        console.log('📋 [REALTIME] Sent requests updated:', requests);
        this.sentRequests = requests;
        this.sentRequestsLoaded = true;
        this.updateComputedProperties();
        this.updateSearchResultsStatus();
      });

    this.chatService.receivedRequestsUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(requests => {
        console.log('📋 [REALTIME] Received requests updated:', requests);
        this.receivedRequests = requests;
        this.receivedRequestsLoaded = true;
        this.updateComputedProperties();
      });

    this.chatService.friendsListUpdated$
      .pipe(takeUntil(this.destroy$))
      .subscribe(friends => {
        console.log('👥 [REALTIME] Friends list updated:', friends);
        this.friends = friends;
        this.friendsLoaded = true;
        this.updateComputedProperties();
        this.updateSearchResultsStatus();
      });

    // ========================================
    // INDIVIDUAL REQUEST EVENTS
    // ========================================

    this.chatService.friendRequestReceived$
      .pipe(takeUntil(this.destroy$))
      .subscribe(request => {
        console.log('🔔 [REALTIME] Friend request received:', request);
        this.showSuccess('New friend request received!');
        
        // Always reload received requests when a new request is received
        this.loadReceivedRequests();
      });

    this.chatService.friendRequestSent$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('📤 [REALTIME] Friend request sent confirmation:', data);
        this.showSuccess('Friend request sent!');
        
        // Always reload sent requests when a new request is sent
        this.loadSentRequests();
      });

    // ========================================
    // ACCEPT EVENTS
    // ========================================

    // When someone accepts YOUR request (you are the sender)
    this.chatService.friendRequestAccepted$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        console.log('✅ [REALTIME] Your friend request was accepted:', data);
        
        if (data.acceptedByName) {
          this.showSuccess(`${data.acceptedByName} accepted your friend request!`);
        }
        
        // Always reload sent requests when your request is accepted
        this.loadSentRequests();
      });

    // When YOU accept someone's request (you are the receiver)
    this.chatService.friendRequestAcceptedConfirm$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        console.log('✅ [REALTIME] You accepted a friend request:', data);
        this.showSuccess('Friend request accepted!');
        
        // Always reload received requests when you accept a request
        this.loadReceivedRequests();
      });

    // ========================================
    // REJECT EVENTS
    // ========================================

    // When someone rejects YOUR request (you are the sender)
    this.chatService.friendRequestRejected$
      .pipe(takeUntil(this.destroy$))
      .subscribe((data) => {
        console.log('❌ [REALTIME] Your friend request was rejected:', data);
        
        // Always reload sent requests when your request is rejected
        this.loadSentRequests();
      });

    // When YOU reject someone's request (you are the receiver)
    this.chatService.friendRequestRejectedConfirm$
      .pipe(takeUntil(this.destroy$))
      .subscribe(data => {
        console.log('❌ [REALTIME] You rejected a friend request:', data);
        
        // Always reload received requests when you reject a request
        this.loadReceivedRequests();
      });

    // ========================================
    // ERROR HANDLING
    // ========================================

    this.chatService.friendRequestError$
      .pipe(takeUntil(this.destroy$))
      .subscribe(error => {
        console.error('❌ [REALTIME] Friend request error:', error);
        this.showError(error);
      });

    // ========================================
    // USER ONLINE STATUS
    // ========================================

    this.chatService.userStatusChanged$
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

    console.log('✅ All real-time listeners are active');
  }

  // Load data only when needed
  loadSentRequests(): void {
    console.log('📥 Loading sent requests...');
    this.chatService.getSentRequests()
      .pipe(takeUntil(this.destroy$))
      .subscribe(requests => {
        console.log('📥 Sent requests loaded:', requests);
        this.sentRequests = requests;
        this.sentRequestsLoaded = true;
        this.updateComputedProperties();
        this.updateSearchResultsStatus();
      });
  }

  loadReceivedRequests(): void {
    console.log('📥 Loading received requests...');
    this.chatService.getReceivedRequests()
      .pipe(takeUntil(this.destroy$))
      .subscribe(requests => {
        console.log('📥 Received requests loaded:', requests);
        this.receivedRequests = requests;
        this.receivedRequestsLoaded = true;
        this.updateComputedProperties();
      });
  }

  loadFriends(): void {
    console.log('📥 Loading friends list...');
    this.chatService.getFriendsList()
      .pipe(takeUntil(this.destroy$))
      .subscribe(friends => {
        console.log('📥 Friends list loaded:', friends);
        this.friends = friends;
        this.friendsLoaded = true;
        this.updateComputedProperties();
        this.updateSearchResultsStatus();
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
          console.log('🔍 Search results:', results);
          this.searchResults = results;
          this.isSearching = false;
          this.updateSearchResultsStatus();
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
    const result = this.searchResults.find(r => r.userId === userId);
    if (result && !this.canSendRequest(result.relationshipStatus)) {
      console.log('⚠️ Cannot send request - current status:', result.relationshipStatus);
      return;
    }
    
    // Optimistic UI update
    if (result) {
      result.relationshipStatus = 'Pending';
    }
    
    console.log('📤 Sending friend request to:', userId);
    this.chatService.sendFriendRequest(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('✅ Friend request HTTP call successful');
          // SignalR events will update the UI and trigger reload
        },
        error: (error) => {
          console.error('❌ Failed to send friend request:', error);
          // Revert optimistic update
          if (result) {
            result.relationshipStatus = 'None';
          }
          this.showError('Failed to send friend request: ' + error.message);
        }
      });
  }

  acceptRequest(requestId: number): void {
    console.log('✅ Accepting friend request:', requestId);
    
    // Optimistic UI update
    const request = this.receivedRequests.find(r => r.requestId === requestId);
    if (request) {
      request.status = 'Accepted';
    }
    
    this.chatService.acceptFriendRequest(requestId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('✅ Accept request HTTP call successful');
          // SignalR events will update the UI and trigger reload
        },
        error: (error) => {
          console.error('❌ Failed to accept request:', error);
          // Revert optimistic update
          if (request) {
            request.status = 'Pending';
          }
          this.showError('Failed to accept request');
        }
      });
  }

  rejectRequest(requestId: number): void {
    console.log('❌ Rejecting friend request:', requestId);
    
    // Optimistic UI update - remove immediately
    const originalRequests = [...this.receivedRequests];
    this.receivedRequests = this.receivedRequests.filter(r => r.requestId !== requestId);
    this.updateComputedProperties();
    
    this.chatService.rejectFriendRequest(requestId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          console.log('✅ Reject request HTTP call successful');
          this.showSuccess('Friend request rejected');
          // SignalR events will update the UI and trigger reload
        },
        error: (error) => {
          console.error('❌ Failed to reject request:', error);
          // Revert optimistic update
          this.receivedRequests = originalRequests;
          this.updateComputedProperties();
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
    
    // Load sent requests when entering requests tab (for counter display)
    if (tab === 'requests' && !this.sentRequestsLoaded) {
      this.loadSentRequests();
    }
  }

  setRequestsSubTab(tab: 'sent' | 'received'): void {
    this.requestsSubTab = tab;
    
    // Load sent requests if not already loaded when switching to sent tab
    if (tab === 'sent' && !this.sentRequestsLoaded) {
      this.loadSentRequests();
    }
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
      case 'Rejected': return 'Send Again';
      default: return '';
    }
  }

  canSendRequest(status: string): boolean {
    return status === 'None' || status === 'Rejected';
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