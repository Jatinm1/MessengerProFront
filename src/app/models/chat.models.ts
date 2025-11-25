export interface User {
  userId: string;
  userName: string;
  displayName: string;
  profilePhotoUrl?: string;
  bio?: string;
  isOnline?: boolean;
  lastSeenUtc?: string;
}

export interface Contact {
  conversationId: string;
  isGroup: boolean;
  userId?: string;
  userName?: string;
  displayName: string;
  photoUrl?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  isOnline?: boolean;
  lastSeenUtc?: string;
}

export interface Message {
  messageId: number;
  conversationId: string;
  fromUserId: string;
  fromUserName: string;
  fromDisplayName?: string;
  body: string;
  contentType?: string; // 'text', 'image', 'video'
  mediaUrl?: string;
  createdAtUtc: string;
  messageStatus?: 'Sent' | 'Delivered' | 'Read';
}

export interface MessageWithDate extends Message {
  dateLabel?: string;
  showDateDivider?: boolean;
}

export interface LoginResponse {
  token: string;
  user: User;
}

export interface ConversationResponse {
  conversationId: string;
}

export interface FriendRequest {
  requestId: number;
  senderId: string;
  senderUserName: string;
  senderDisplayName: string;
  receiverId: string;
  receiverUserName: string;
  receiverDisplayName: string;
  status: 'Pending' | 'Accepted' | 'Rejected';
  createdAtUtc: string;
  updatedAtUtc?: string;
}

export interface Friend {
  friendUserId: string;
  friendUserName: string;
  friendDisplayName: string;
  friendsSince: string;
  isOnline?: boolean;
  lastSeenUtc?: string;
}

export interface UserSearchResult {
  userId: string;
  userName: string;
  displayName: string;
  createdAtUtc: string;
  relationshipStatus: 'None' | 'Pending' | 'Friends' | 'Rejected';
  profilePhotoUrl?: string;
  bio?: string;
  isOnline?: boolean;
  lastSeenUtc?: string;
}

export interface SendFriendRequestRequest {
  receiverId: string;
}

// Group Models
export interface CreateGroupRequest {
  groupName: string;
  groupPhotoUrl?: string;
  memberUserIds: string[];
}

export interface GroupDetails {
  conversationId: string;
  groupName: string;
  groupPhotoUrl?: string;
  createdBy?: string;
  creatorDisplayName?: string;
  createdAtUtc: string;
  members: GroupMember[];
}

export interface GroupMember {
  userId: string;
  userName: string;
  displayName: string;
  profilePhotoUrl?: string;
  joinedAtUtc: string;
  isAdmin: boolean;
}

// User Profile Models
export interface UserProfile {
  userId: string;
  userName: string;
  displayName: string;
  profilePhotoUrl?: string;
  bio?: string;
  createdAtUtc: string;
  lastSeenUtc?: string;
  isOnline: boolean;
  areFriends?: boolean;
}

export interface UpdateProfileRequest {
  displayName?: string;
  profilePhotoUrl?: string;
  bio?: string;
}

// Message Status Models
export interface MessageStatusDto {
  messageId: number;
  userId: string;
  displayName: string;
  status: 'Sent' | 'Delivered' | 'Read';
  statusTimestamp: string;
}