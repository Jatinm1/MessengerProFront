import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { ChatService } from '../../services/chat.service';
import { AuthService } from '../../services/auth.service';
import { UserProfile } from '../../models/chat.models';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="profile-container">
      <div class="profile-card" *ngIf="profile">
        <!-- Profile Header -->
        <div class="profile-header">
          <div class="profile-avatar-large">
            <img *ngIf="profile.profilePhotoUrl" [src]="profile.profilePhotoUrl" alt="Profile Photo">
            <span *ngIf="!profile.profilePhotoUrl">{{ getInitials(profile.displayName) }}</span>
            <span class="online-indicator" *ngIf="profile.isOnline"></span>
          </div>
          <h2>{{ profile.displayName }}</h2>
          <p class="username">{{ '@' + profile.userName }}</p>
          <p class="status-text">
            <span *ngIf="profile.isOnline" class="online">🟢 Online</span>
            <span *ngIf="!profile.isOnline">{{ formatLastSeen(profile.lastSeenUtc) }}</span>
          </p>
        </div>

        <!-- Edit Mode -->
        <div class="profile-body" *ngIf="isEditMode && isOwnProfile">
          <div class="form-section">
            <div class="form-group">
              <label>Display Name</label>
              <input 
                type="text" 
                [(ngModel)]="editDisplayName" 
                class="form-input"
                placeholder="Enter display name" />
            </div>
            <div class="form-group">
              <label>Profile Photo URL</label>
              <input 
                type="text" 
                [(ngModel)]="editProfilePhotoUrl" 
                class="form-input"
                placeholder="Enter photo URL" />
            </div>
            <div class="form-group">
              <label>Bio</label>
              <textarea 
                [(ngModel)]="editBio" 
                class="form-textarea"
                placeholder="Tell us about yourself..."
                rows="4"></textarea>
            </div>
            <div class="form-actions">
              <button class="btn-cancel" (click)="cancelEdit()">Cancel</button>
              <button class="btn-save" (click)="saveProfile()">Save Changes</button>
            </div>
          </div>
        </div>

        <!-- View Mode -->
        <div class="profile-body" *ngIf="!isEditMode">
          <div class="info-section">
            <div class="info-item">
              <label>Bio</label>
              <p>{{ profile.bio || 'No bio yet' }}</p>
            </div>
            <div class="info-item">
              <label>Member Since</label>
              <p>{{ formatDate(profile.createdAtUtc) }}</p>
            </div>
            <div class="info-item" *ngIf="!isOwnProfile">
              <label>Friendship Status</label>
              <p>
                <span class="friendship-badge" [class.friends]="profile.areFriends">
                  {{ profile.areFriends ? '✓ Friends' : 'Not Friends' }}
                </span>
              </p>
            </div>
          </div>

          <div class="action-buttons">
            <button 
              *ngIf="isOwnProfile" 
              class="btn-edit" 
              (click)="enterEditMode()">
              ✏️ Edit Profile
            </button>
            <button 
              *ngIf="!isOwnProfile && !profile.areFriends" 
              class="btn-add-friend"
              (click)="sendFriendRequest()">
              ➕ Add Friend
            </button>
            <button 
              *ngIf="!isOwnProfile && profile.areFriends" 
              class="btn-message"
              (click)="startChat()">
              💬 Message
            </button>
          </div>
        </div>

        <!-- Messages -->
        <div class="messages" *ngIf="successMessage || errorMessage">
          <div class="success-message" *ngIf="successMessage">{{ successMessage }}</div>
          <div class="error-message" *ngIf="errorMessage">{{ errorMessage }}</div>
        </div>
      </div>

      <div class="loading" *ngIf="!profile">
        <div class="spinner"></div>
        <p>Loading profile...</p>
      </div>
    </div>
  `,
  styles: [`
    .profile-container {
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
    }

    .profile-card {
      background: white;
      border-radius: 20px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.1);
      max-width: 600px;
      width: 100%;
      overflow: hidden;
    }

    .profile-header {
      background: linear-gradient(135deg, #1e40af 0%, #3b82f6 100%);
      padding: 40px 30px;
      text-align: center;
      color: white;
    }

    .profile-avatar-large {
      width: 120px;
      height: 120px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.2);
      margin: 0 auto 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 3rem;
      font-weight: 700;
      position: relative;
      border: 4px solid rgba(255, 255, 255, 0.3);
      overflow: hidden;
    }

    .profile-avatar-large img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .online-indicator {
      position: absolute;
      bottom: 8px;
      right: 8px;
      width: 20px;
      height: 20px;
      background: #10b981;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.8);
    }

    .profile-header h2 {
      margin: 0 0 8px;
      font-size: 1.75rem;
      font-weight: 700;
    }

    .username {
      margin: 0 0 12px;
      font-size: 1rem;
      opacity: 0.9;
    }

    .status-text {
      margin: 0;
      font-size: 0.875rem;
      opacity: 0.9;
    }

    .status-text .online {
      font-weight: 600;
    }

    .profile-body {
      padding: 30px;
    }

    .info-section {
      display: flex;
      flex-direction: column;
      gap: 20px;
      margin-bottom: 30px;
    }

    .info-item label {
      display: block;
      font-weight: 600;
      color: #475569;
      font-size: 0.875rem;
      margin-bottom: 6px;
    }

    .info-item p {
      margin: 0;
      color: #1e293b;
      font-size: 0.95rem;
      line-height: 1.6;
    }

    .friendship-badge {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 600;
      background: #f1f5f9;
      color: #64748b;
    }

    .friendship-badge.friends {
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
      color: #065f46;
    }

    .form-section {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .form-group label {
      font-weight: 600;
      color: #475569;
      font-size: 0.875rem;
    }

    .form-input,
    .form-textarea {
      width: 100%;
      padding: 10px 14px;
      border: 2px solid #e2e8f0;
      border-radius: 10px;
      font-size: 0.875rem;
      outline: none;
      transition: all 0.2s;
      font-family: inherit;
    }

    .form-input:focus,
    .form-textarea:focus {
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .form-textarea {
      resize: vertical;
      min-height: 80px;
    }

    .form-actions,
    .action-buttons {
      display: flex;
      gap: 10px;
      justify-content: flex-end;
    }

    .action-buttons {
      justify-content: center;
    }

    .btn-cancel,
    .btn-save,
    .btn-edit,
    .btn-add-friend,
    .btn-message {
      padding: 10px 24px;
      border-radius: 10px;
      font-weight: 600;
      font-size: 0.875rem;
      cursor: pointer;
      transition: all 0.2s;
      border: none;
    }

    .btn-cancel {
      background: #f1f5f9;
      color: #475569;
    }

    .btn-cancel:hover {
      background: #e2e8f0;
    }

    .btn-save,
    .btn-edit,
    .btn-message {
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(59, 130, 246, 0.3);
    }

    .btn-save:hover,
    .btn-edit:hover,
    .btn-message:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .btn-add-friend {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      color: white;
      box-shadow: 0 2px 8px rgba(16, 185, 129, 0.3);
    }

    .btn-add-friend:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(16, 185, 129, 0.4);
    }

    .messages {
      margin-top: 20px;
    }

    .success-message {
      background: linear-gradient(135deg, #d1fae5 0%, #a7f3d0 100%);
      color: #065f46;
      padding: 12px 16px;
      border-radius: 10px;
      border-left: 3px solid #10b981;
      font-weight: 500;
      font-size: 0.875rem;
    }

    .error-message {
      background: linear-gradient(135deg, #fee2e2 0%, #fecaca 100%);
      color: #991b1b;
      padding: 12px 16px;
      border-radius: 10px;
      border-left: 3px solid #ef4444;
      font-weight: 500;
      font-size: 0.875rem;
    }

    .loading {
      text-align: center;
      color: #64748b;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #e2e8f0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `]
})
export class ProfileComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  profile: UserProfile | null = null;
  isOwnProfile = false;
  isEditMode = false;
  
  editDisplayName = '';
  editProfilePhotoUrl = '';
  editBio = '';
  
  successMessage = '';
  errorMessage = '';

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        const userId = params['userId'];
        if (userId) {
          this.loadUserProfile(userId);
        } else {
          this.loadMyProfile();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  loadMyProfile(): void {
    this.isOwnProfile = true;
    this.chatService.getMyProfile()
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.profile = profile;
          this.initEditFields();
        },
        error: () => {
          this.showError('Failed to load profile');
        }
      });
  }

  loadUserProfile(userId: string): void {
    const currentUser = this.authService.getCurrentUser();
    this.isOwnProfile = currentUser?.userId === userId;
    
    if (this.isOwnProfile) {
      this.loadMyProfile();
      return;
    }

    this.chatService.getUserProfile(userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (profile) => {
          this.profile = profile;
        },
        error: () => {
          this.showError('Failed to load profile');
        }
      });
  }

  initEditFields(): void {
    if (this.profile) {
      this.editDisplayName = this.profile.displayName;
      this.editProfilePhotoUrl = this.profile.profilePhotoUrl || '';
      this.editBio = this.profile.bio || '';
    }
  }

  enterEditMode(): void {
    this.initEditFields();
    this.isEditMode = true;
  }

  cancelEdit(): void {
    this.isEditMode = false;
    this.clearMessages();
  }

  saveProfile(): void {
    if (!this.editDisplayName.trim()) {
      this.showError('Display name cannot be empty');
      return;
    }

    this.chatService.updateProfile({
      displayName: this.editDisplayName,
      profilePhotoUrl: this.editProfilePhotoUrl || undefined,
      bio: this.editBio || undefined
    }).pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Profile updated successfully!');
          this.isEditMode = false;
          this.loadMyProfile();
        },
        error: () => {
          this.showError('Failed to update profile');
        }
      });
  }

  sendFriendRequest(): void {
    if (!this.profile) return;

    this.chatService.sendFriendRequest(this.profile.userId)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.showSuccess('Friend request sent!');
        },
        error: () => {
          this.showError('Failed to send friend request');
        }
      });
  }

startChat(): void {
  if (!this.profile) return;
  
  this.chatService.createConversation(this.profile.userId)
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: (conversation) => {
        // Navigate with conversation details
        this.router.navigate(['/chat'], {
          state: {
            conversationId: conversation.conversationId,
            userId: this.profile!.userId,
            displayName: this.profile!.displayName
          }
        });
      },
      error: () => {
        this.showError('Failed to start chat');
      }
    });
}

  getInitials(name: string): string {
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString([], {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
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
    this.successMessage = '';
    this.errorMessage = '';
  }
}