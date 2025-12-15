import { Component, OnInit, OnDestroy, ElementRef, ViewChild, ChangeDetectorRef } from '@angular/core';
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
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  @ViewChild('profilePhotoInput') profilePhotoInput!: ElementRef<HTMLInputElement>;
  
  profile: UserProfile | null = null;
  isOwnProfile = false;
  isEditMode = false;
  
  editDisplayName = '';
  editBio = '';
  
  selectedProfilePhotoFile: File | null = null;
  profilePhotoPreview: string | null = null;
  isUploadingPhoto = false;
  
  successMessage = '';
  errorMessage = '';

  constructor(
    private chatService: ChatService,
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef
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
      this.editBio = this.profile.bio || '';
    }
  }

  enterEditMode(): void {
    this.initEditFields();
    this.isEditMode = true;
    this.clearPhotoSelection();
  }

  cancelEdit(): void {
    this.isEditMode = false;
    this.clearPhotoSelection();
    this.clearMessages();
  }

  saveProfile(): void {
    if (!this.editDisplayName.trim()) {
      this.showError('Display name cannot be empty');
      return;
    }

    this.chatService.updateProfile({
      displayName: this.editDisplayName,
      bio: this.editBio || undefined
    })
    .pipe(takeUntil(this.destroy$))
    .subscribe({
      next: () => {
        // Fetch latest profile AFTER saving
        this.chatService.getMyProfile()
          .pipe(takeUntil(this.destroy$))
          .subscribe(updatedProfile => {

            this.profile = updatedProfile;

            // 🔥 Now update main layout ONLY when Save is clicked
            this.authService.setCurrentUser(updatedProfile);

            this.showSuccess('Profile updated successfully!');
            this.isEditMode = false;
            this.clearPhotoSelection();
          });
      },
      error: () => {
        this.showError('Failed to update profile');
      }
    });
  }

  // Photo Upload Methods
  triggerProfilePhotoUpload(): void {
    this.profilePhotoInput.nativeElement.click();
  }

  onProfilePhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      
      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.showError('Please select an image file (JPG, PNG, GIF)');
        return;
      }
      
      // Validate file size (10MB)
      if (file.size > 10 * 1024 * 1024) {
        this.showError('File size must be less than 10MB');
        return;
      }
      
      this.selectedProfilePhotoFile = file;
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e: any) => {
        this.profilePhotoPreview = e.target.result;
        this.cdr.detectChanges();
      };
      reader.readAsDataURL(file);
      
      // Auto-upload the photo
      this.uploadProfilePhoto();
    }
  }

  uploadProfilePhoto(): void {
    if (!this.selectedProfilePhotoFile) return;

    this.isUploadingPhoto = true;

    this.chatService.uploadProfilePhoto(this.selectedProfilePhotoFile)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Local preview updates only
          this.showSuccess('Photo uploaded! (not applied yet)');
          this.isUploadingPhoto = false;
        },
        error: () => {
          this.showError('Failed to upload profile photo.');
          this.isUploadingPhoto = false;
        }
      });
  }

  cancelPhotoUpload(): void {
    this.selectedProfilePhotoFile = null;
    this.profilePhotoPreview = null;
    this.profilePhotoInput.nativeElement.value = '';
  }

  clearPhotoSelection(): void {
    this.selectedProfilePhotoFile = null;
    this.profilePhotoPreview = null;
    if (this.profilePhotoInput) {
      this.profilePhotoInput.nativeElement.value = '';
    }
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