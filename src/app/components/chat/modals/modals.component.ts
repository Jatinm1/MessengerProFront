import { Component, Input, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { User, GroupDetails } from '../../../models/chat.models';
import { log } from 'console';

@Component({
  selector: 'app-modals',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <!-- Media Upload Modal -->
    <div class="modal-overlay" *ngIf="showMediaModal" (click)="cancelMediaUpload.emit()">
      <div class="modal-content media-modal" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Send Media</h2>
          <button class="close-btn" (click)="cancelMediaUpload.emit()">×</button>
        </div>
        <div class="modal-body">
          <div class="media-preview-large">
            <img *ngIf="isImage()" [src]="mediaPreview" alt="Preview">
            <video *ngIf="isVideo()" [src]="mediaPreview" controls></video>
          </div>
          <div class="form-group">
            <label>Caption (optional)</label>
            <input
              type="text"
              [(ngModel)]="mediaCaption"
              (ngModelChange)="mediaCaptionChange.emit($event)"
              placeholder="Add a caption..."
              class="form-input"
              [disabled]="isUploadingMedia" />
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" (click)="cancelMediaUpload.emit()" [disabled]="isUploadingMedia">
            Cancel
          </button>
          <button class="btn-create" (click)="sendMediaMessage.emit()" [disabled]="isUploadingMedia">
            <span *ngIf="!isUploadingMedia">Send</span>
            <span *ngIf="isUploadingMedia">Sending...</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Media Viewer Modal -->
    <div class="modal-overlay" *ngIf="showMediaViewer" (click)="closeMediaViewer.emit()">
      <div class="media-viewer-content" (click)="$event.stopPropagation()">
        <button class="media-viewer-close" (click)="closeMediaViewer.emit()">×</button>
        <img *ngIf="viewerMediaType === 'image'" [src]="viewerMediaUrl" alt="Full size image" class="media-viewer-image">
        <video *ngIf="viewerMediaType === 'video'" [src]="viewerMediaUrl" controls class="media-viewer-video"></video>
      </div>
    </div>

    <!-- Create Group Modal -->
    <div class="modal-overlay" *ngIf="showCreateGroupModal" (click)="closeCreateGroupModal.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Create New Group</h2>
          <button class="close-btn" (click)="closeCreateGroupModal.emit()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Group Name</label>
            <input
              type="text"
              [(ngModel)]="groupName"
              (ngModelChange)="groupNameChange.emit($event)"
              placeholder="Enter group name"
              class="form-input" />
          </div>
          <div class="form-group">
            <label>Select Members ({{ selectedFriendsForGroup.length }} selected)</label>
            <div class="members-list">
              <div
                *ngFor="let friend of friendsList"
                class="member-item"
                [class.selected]="isFriendSelected(friend.userId)"
                (click)="toggleFriendSelection.emit(friend.userId)">
                <div class="member-avatar">
                  {{ friend.displayName.charAt(0).toUpperCase() }}
                </div>
                <div class="member-info">
                  <div class="member-name">{{ friend.displayName }}</div>
                  <div class="member-username">{{ '@' + friend.userName }}</div>
                </div>
                <div class="member-check" *ngIf="isFriendSelected(friend.userId)">✓</div>
              </div>
              <div class="empty-state" *ngIf="friendsList.length === 0">
                <p>No friends available. Add friends first to create a group.</p>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" (click)="closeCreateGroupModal.emit()">Cancel</button>
          <button class="btn-create" (click)="createGroup.emit()" [disabled]="!groupName || selectedFriendsForGroup.length === 0">Create Group</button>
        </div>
      </div>
    </div>

    <!-- Group Details Modal -->
    <div class="modal-overlay" *ngIf="showGroupDetailsModal" (click)="closeGroupDetailsModal.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Group Details</h2>
          <button class="close-btn" (click)="closeGroupDetailsModal.emit()">×</button>
        </div>
        <div class="modal-body" *ngIf="currentGroupDetails">
          <div class="group-header-details">
            <div class="group-photo-large">
              <img *ngIf="currentGroupDetails.groupPhotoUrl" [src]="currentGroupDetails.groupPhotoUrl" alt="Group Photo">
              <span *ngIf="!currentGroupDetails.groupPhotoUrl">{{ currentGroupDetails.groupName.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="group-name-details">{{ currentGroupDetails.groupName }}</div>
            <div class="group-meta">
              Created by {{ currentGroupDetails.creatorDisplayName }} on {{ formatDate(currentGroupDetails.createdAtUtc) }}
            </div>
          </div>

          <div class="group-actions">
            <button class="action-btn" (click)="openAddMemberModal.emit()">➕ Add Member</button>
            <button class="action-btn" (click)="openEditGroupModal.emit()">✏️ Edit Group</button>
            <button class="action-btn leave-btn" (click)="leaveGroup.emit()">🚪 Leave Group</button>
          </div>

          <h3>Members ({{ currentGroupDetails.members.length }})</h3>
          <div class="members-list-details">
            <div *ngFor="let member of currentGroupDetails.members" class="member-item-details">
              <div class="member-avatar">
                <img *ngIf="member.profilePhotoUrl" [src]="member.profilePhotoUrl" alt="Member Photo">
                <span *ngIf="!member.profilePhotoUrl">{{ member.displayName.charAt(0).toUpperCase() }}</span>
              </div>
              <div class="member-info">
                <div class="member-name">{{ member.displayName }}</div>
                <div class="member-username">{{ '@' + member.userName }}</div>
              </div>
              <div class="member-role" *ngIf="member.isAdmin">Admin</div>
              <button
                *ngIf="isCurrentUserAdmin && !isCurrentUser(member.userId)"
                class="remove-btn"
                (click)="removeMember.emit(member.userId)">
                Remove
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Member Modal -->
    <div class="modal-overlay" *ngIf="showAddMemberModal" (click)="closeAddMemberModal.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Add Member to {{ currentGroupDetails?.groupName }}</h2>
          <button class="close-btn" (click)="closeAddMemberModal.emit()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Select Friend to Add</label>
            <select
              class="form-input"
              [(ngModel)]="selectedFriendToAdd"
              (ngModelChange)="selectedFriendToAddChange.emit($event)">
              <option [ngValue]="null" disabled>Select a friend</option>
              <option *ngFor="let friend of availableFriendsToAdd" [ngValue]="friend.userId">
                {{ friend.displayName }} ({{ '@' + friend.userName }})
              </option>
            </select>
          </div>
          <div class="empty-state" *ngIf="availableFriendsToAdd.length === 0">
            <p>No friends available to add to this group.</p>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" (click)="closeAddMemberModal.emit()">Cancel</button>
          <button class="btn-create" (click)="addMember.emit()" [disabled]="!selectedFriendToAdd">Add Member</button>
        </div>
      </div>
    </div>

    <!-- Edit Group Modal -->
    <div class="modal-overlay" *ngIf="showEditGroupModal" (click)="closeEditGroupModal.emit()">
      <div class="modal-content" (click)="$event.stopPropagation()">
        <div class="modal-header">
          <h2>Edit Group: {{ currentGroupDetails?.groupName }}</h2>
          <button class="close-btn" (click)="closeEditGroupModal.emit()">×</button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>Group Name</label>
            <input
              type="text"
              [(ngModel)]="editGroupName"
              (ngModelChange)="editGroupNameChange.emit($event)"
              placeholder="Enter new group name"
              class="form-input" />
          </div>

          <div class="form-group">
            <label>Group Photo</label>
            <div class="group-photo-upload">
              <div class="group-photo-preview">
                <img *ngIf="groupPhotoPreview" [src]="groupPhotoPreview" alt="Group Photo Preview">
                <span *ngIf="!groupPhotoPreview">{{ editGroupName.charAt(0).toUpperCase() || 'G' }}</span>
              </div>
              <input
                type="file"
                #groupPhotoInput
                accept="image/*"
                (change)="onGroupPhotoSelected($event)"
                style="display: none" />
              <button
                class="upload-btn"
                (click)="groupPhotoInput.click()"
                [disabled]="isUploadingGroupPhoto">
                {{ isUploadingGroupPhoto ? 'Uploading...' : 'Change Photo' }}
              </button>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cancel" (click)="closeEditGroupModal.emit()">Cancel</button>
          <button class="btn-create" (click)="updateGroupInfo.emit()" [disabled]="!editGroupName || isUploadingGroupPhoto">Save Changes</button>
        </div>
      </div>
    </div>

    <!-- Transfer Admin Modal -->
<div class="modal-overlay" *ngIf="showTransferAdminModal" (click)="cancelTransferAdmin.emit()">
  <div class="modal-content" (click)="$event.stopPropagation()">
    <div class="modal-header">
      <h2>Assign New Admin</h2>
      <button class="close-btn" (click)="cancelTransferAdmin.emit()">×</button>
    </div>

    <div class="modal-body">
      <p>You are an admin. Choose a member to assign as new admin before leaving the group:</p>

      <div class="members-list">
        <div *ngFor="let member of transferableMembers"
             class="member-item"
             [class.selected]="selectedNewAdminId === member.userId"
             (click)="selectNewAdmin.emit(member.userId)">
          <div class="member-avatar">
            <img *ngIf="member.profilePhotoUrl" [src]="member.profilePhotoUrl" alt="avatar" />
            <span *ngIf="!member.profilePhotoUrl">{{ member.displayName.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="member-info">
            <div class="member-name">{{ member.displayName }}</div>
            <div class="member-username">{{ '@' + member.userName }}</div>
          </div>
        </div>

        <div class="empty-state" *ngIf="transferableMembers.length === 0">
          <p>No other members available to assign as admin.</p>
        </div>
      </div>
    </div>

    <div class="modal-footer">
      <button class="btn-cancel" (click)="cancelTransferAdmin.emit()">Cancel</button>
      <button class="btn-create"
              (click)="confirmTransferAdmin.emit()"
              [disabled]="!selectedNewAdminId">Assign & Leave</button>
    </div>
  </div>
</div>

  `,
  styles: [`
    /* Modal Base Styles */
    .modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      backdrop-filter: blur(4px);
    }

    .modal-content {
      background: #ffffff;
      border-radius: 12px;
      width: 90%;
      max-width: 500px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
      display: flex;
      flex-direction: column;
      max-height: 90vh;
      overflow: hidden;
      animation: modalFadeIn 0.3s ease-out;
    }
      h3
      {
        margin-top:0;
        margin-bottom:10px;
        color:#1e293b;
      }

    @keyframes modalFadeIn {
      from {
        opacity: 0;
        transform: translateY(-20px) scale(0.95);
      }
      to {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
    }

    .modal-header {
      padding: 16px 24px;
      border-bottom: 1px solid #e2e8f0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .modal-header h2 {
      margin: 0;
      font-size: 1.25rem;
      color: #1e293b;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 1.5rem;
      color: #94a3b8;
      cursor: pointer;
      transition: color 0.2s;
    }

    .close-btn:hover {
      color: #1e293b;
    }

    .modal-body {
      padding: 24px;
      overflow-y: auto;
      flex: 1;
    }

    .modal-footer {
      padding: 16px 24px;
      border-top: 1px solid #e2e8f0;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }

    .form-group {
      margin-bottom: 20px;
    }

    .form-group label {
      display: block;
      margin-bottom: 8px;
      font-weight: 600;
      color: #475569;
      font-size: 0.9rem;
    }

    .form-input {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 1rem;
      transition: border-color 0.2s, box-shadow 0.2s;
    }

    .form-input:focus {
      border-color: #3b82f6;
      outline: none;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .btn-cancel {
      background: #f1f5f9;
      color: #475569;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }

    .btn-cancel:hover {
      background: #e2e8f0;
    }

    .btn-create {
      background: linear-gradient(135deg, #3b82f6 0%, #1e40af 100%);
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: all 0.2s;
    }

    .btn-create:hover {
      opacity: 0.9;
      transform: translateY(-1px);
    }

    .btn-create:disabled {
      background: #94a3b8;
      cursor: not-allowed;
      transform: none;
      opacity: 1;
    }

    /* Create Group Modal Specifics */
    .members-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
    }

    .member-item {
      display: flex;
      align-items: center;
      padding: 10px 15px;
      cursor: pointer;
      border-bottom: 1px solid #f1f5f9;
      transition: background 0.2s;
    }

    .member-item:last-child {
      border-bottom: none;
    }

    .member-item:hover {
      background: #f8fafc;
    }

    .member-item.selected {
      background: #eff6ff;
      border-left: 4px solid #3b82f6;
    }

    .member-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #93c5fd;
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 0.9rem;
      font-weight: 600;
      flex-shrink: 0;
    }

    .member-info {
      margin-left: 10px;
      flex: 1;
    }

    .member-name {
      font-weight: 600;
      font-size: 0.9rem;
      color: #1e293b;
    }

    .member-username {
      font-size: 0.75rem;
      color: #64748b;
    }

    .member-check {
      color: #10b981;
      font-size: 1.2rem;
      font-weight: 700;
    }

    .empty-state {
      padding: 20px;
      text-align: center;
      color: #64748b;
      font-style: italic;
    }

    /* Group Details Modal Specifics */
    .group-header-details {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
    }

    .group-photo-large {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1e40af);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      font-weight: 700;
      overflow: hidden;
      margin-bottom: 10px;
    }

    .group-photo-large img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .group-name-details {
      font-size: 1.5rem;
      font-weight: 700;
      color: #1e293b;
    }

    .group-meta {
      font-size: 0.8rem;
      color: #64748b;
      margin-top: 5px;
    }

    .group-actions {
      display: flex;
      justify-content: space-around;
      margin-bottom: 20px;
      padding-bottom: 20px;
      border-bottom: 1px solid #e2e8f0;
    }

    .action-btn {
      background: #f1f5f9;
      color: #1e293b;
      border: 1px solid #cbd5e1;
      padding: 8px 15px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }

    .action-btn:hover {
      background: #e2e8f0;
    }

    .action-btn.leave-btn {
      background: #fee2e2;
      color: #dc2626;
      border-color: #fca5a5;
    }

    .action-btn.leave-btn:hover {
      background: #fecaca;
    }

    .members-list-details {
      max-height: 250px;
      overflow-y: auto;
    }

    .member-item-details {
      display: flex;
      align-items: center;
      padding: 8px 0;
      border-bottom: 1px solid #f8fafc;
    }

    .member-item-details:last-child {
      border-bottom: none;
    }

    .member-item-details .member-avatar {
  width: 32px;
  height: 32px;
  font-size: 0.8rem;
  border-radius: 50%;
  overflow: hidden; /* <-- optional but helpful */
}

.member-item-details .member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
.members-list .member-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}


    .member-item-details .member-info {
      margin-left: 10px;
      flex: 1;
    }

    .member-role {
      background: #dbeafe;
      color: #1e40af;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 0.7rem;
      font-weight: 600;
      margin-right: 10px;
    }

    .remove-btn {
      background: #fef2f2;
      color: #ef4444;
      border: 1px solid #fca5a5;
      padding: 4px 10px;
      border-radius: 6px;
      font-size: 0.75rem;
      cursor: pointer;
      transition: background 0.2s;
    }

    .remove-btn:hover {
      background: #fee2e2;
    }

    /* Edit Group Modal Specifics */
    .group-photo-upload {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .group-photo-upload .group-photo-preview {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #3b82f6, #1e40af);
      color: white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      font-weight: 700;
      overflow: hidden;
      flex-shrink: 0;
    }

    .group-photo-upload .group-photo-preview img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .upload-btn {
      background: #dbeafe;
      color: #1e40af;
      border: 1px solid #93c5fd;
      padding: 8px 15px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 600;
      transition: background 0.2s;
    }

    .upload-btn:hover {
      background: #bfdbfe;
    }

    /* Media Modal Specifics */
    .media-modal {
      max-width: 600px;
    }

    .media-preview-large {
      width: 100%;
      max-height: 400px;
      overflow: hidden;
      border-radius: 8px;
      margin-bottom: 15px;
      background: #f1f5f9;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .media-preview-large img,
    .media-preview-large video {
      max-width: 100%;
      max-height: 400px;
      object-fit: contain;
    }

    /* Media Viewer Modal Specifics */
    .media-viewer-content {
      position: relative;
      max-width: 90%;
      max-height: 90%;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .media-viewer-close {
      position: absolute;
      top: -40px;
      right: -40px;
      background: rgba(0, 0, 0, 0.5);
      color: white;
      border: none;
      border-radius: 50%;
      width: 30px;
      height: 30px;
      font-size: 1.5rem;
      line-height: 1;
      cursor: pointer;
      z-index: 1001;
    }

    .media-viewer-image,
    .media-viewer-video {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
      border-radius: 8px;
    }
  `]
})
export class ModalsComponent {
  @ViewChild('groupPhotoInput') groupPhotoInput!: ElementRef<HTMLInputElement>;

  // Media Upload/Viewer
  @Input() showMediaModal = false;
  @Input() mediaPreview: string | null = null;
  @Input() mediaCaption = '';
  @Input() isUploadingMedia = false;
  @Input() showMediaViewer = false;
  @Input() viewerMediaUrl: string | null = null;
  @Input() viewerMediaType: 'image' | 'video' | null = null;

  @Output() mediaCaptionChange = new EventEmitter<string>();
  @Output() cancelMediaUpload = new EventEmitter<void>();
  @Output() sendMediaMessage = new EventEmitter<void>();
  @Output() closeMediaViewer = new EventEmitter<void>();

  // Create Group
  @Input() showCreateGroupModal = false;
  @Input() groupName = '';
  @Input() selectedFriendsForGroup: string[] = [];
  @Input() friendsList: User[] = [];

  @Output() groupNameChange = new EventEmitter<string>();
  @Output() closeCreateGroupModal = new EventEmitter<void>();
  @Output() toggleFriendSelection = new EventEmitter<string>();
  @Output() createGroup = new EventEmitter<void>();

  // Group Details
  @Input() showGroupDetailsModal = false;
  @Input() currentGroupDetails: GroupDetails | null = null;
  @Input() isCurrentUserAdmin = false;
  @Input() currentUserId: string | null = null;

  @Output() closeGroupDetailsModal = new EventEmitter<void>();
  @Output() openAddMemberModal = new EventEmitter<void>();
  @Output() openEditGroupModal = new EventEmitter<void>();
  @Output() leaveGroup = new EventEmitter<void>();
  @Output() removeMember = new EventEmitter<string>();

  // Add Member
  @Input() showAddMemberModal = false;
  @Input() availableFriendsToAdd: User[] = [];
  @Input() selectedFriendToAdd: string | null = null;

  @Output() closeAddMemberModal = new EventEmitter<void>();
  @Output() selectedFriendToAddChange = new EventEmitter<string | null>();
  @Output() addMember = new EventEmitter<void>();

  // Edit Group
  @Input() showEditGroupModal = false;
  @Input() editGroupName = '';
  @Input() groupPhotoPreview: string | null = null;
  @Input() isUploadingGroupPhoto = false;

  @Output() closeEditGroupModal = new EventEmitter<void>();
  @Output() editGroupNameChange = new EventEmitter<string>();
  @Output() groupPhotoSelected = new EventEmitter<File>();
  @Output() updateGroupInfo = new EventEmitter<void>();

  // Transfer Admin
@Input() showTransferAdminModal = false;
@Input() transferableMembers: User[] = [];
@Input() selectedNewAdminId: string | null = null;

@Output() cancelTransferAdmin = new EventEmitter<void>();
@Output() selectNewAdmin = new EventEmitter<string>();
@Output() confirmTransferAdmin = new EventEmitter<void>();


  isImage(): boolean {
  var something = this.mediaPreview !== null &&
    (this.mediaPreview.startsWith('data:image') ||
     !!this.mediaPreview.match(/\.(jpeg|jpg|gif|png)$/i));
     console.log("************",something);
     return something;
}

isVideo(): boolean {
  return this.mediaPreview !== null &&
    (this.mediaPreview.startsWith('data:video') ||
     !!this.mediaPreview.match(/\.(mp4|webm|ogg)$/i));
}


  isFriendSelected(userId: string): boolean {
    return this.selectedFriendsForGroup.includes(userId);
  }

  isCurrentUser(userId: string): boolean {
    return this.currentUserId === userId;
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString();
  }

  onGroupPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.groupPhotoSelected.emit(input.files[0]);
      input.value = ''; // Clear input for next selection
    }
  }
}
