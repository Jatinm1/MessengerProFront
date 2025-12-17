// src/app/components/call/incoming-call/incoming-call.component.ts

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallOffer, CallType } from '../../../models/call.models';

@Component({
  selector: 'app-incoming-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './incoming-call.component.html',
  styleUrls: ['./incoming-call.component.css']
})
export class IncomingCallComponent implements OnInit, OnDestroy {
  @Input() callOffer!: CallOffer;
  @Output() accept = new EventEmitter<void>();
  @Output() reject = new EventEmitter<void>();

  ringingAudio: HTMLAudioElement | null = null;

  ngOnInit(): void {
    // Play ringing sound
    // this.playRingingSound();
  }

  ngOnDestroy(): void {
    // this.stopRingingSound();
  }

  onAccept(): void {
    // this.stopRingingSound();
    this.accept.emit();
  }

  onReject(): void {
    // this.stopRingingSound();
    this.reject.emit();
  }

  getCallTypeIcon(): string {
    return this.callOffer.callType === 'video' ? '📹' : '📞';
  }

  getCallTypeText(): string {
    return this.callOffer.callType === 'video' ? 'Video Call' : 'Voice Call';
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  private playRingingSound(): void {
    // You can add a custom ringtone audio file
    this.ringingAudio = new Audio('/assets/sounds/ringtone.mp3');
    this.ringingAudio.loop = true;
    this.ringingAudio.play().catch(err => console.error('Error playing ringtone:', err));
  }

  private stopRingingSound(): void {
    if (this.ringingAudio) {
      this.ringingAudio.pause();
      this.ringingAudio.currentTime = 0;
      this.ringingAudio = null;
    }
  }
}