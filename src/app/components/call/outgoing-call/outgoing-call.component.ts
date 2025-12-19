// src/app/components/call/outgoing-call/outgoing-call.component.ts

import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallSession, CallParticipant } from '../../../models/call.models';

@Component({
  selector: 'app-outgoing-call',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './outgoing-call.component.html',
  styleUrls: ['./outgoing-call.component.css']
})
export class OutgoingCallComponent implements OnInit, OnDestroy {
  @Input() callSession!: CallSession;
  @Input() recipient!: CallParticipant;
  @Output() cancelCall = new EventEmitter<void>();

  ringingAudio: HTMLAudioElement | null = null;

  ngOnInit(): void {
    this.playCallingSound();
  }

  ngOnDestroy(): void {
    this.stopCallingSound();
  }

  onCancel(): void {
    this.stopCallingSound();
    this.cancelCall.emit();
  }

  getCallTypeIcon(): string {
    return this.callSession.callType === 'video' ? '📹' : '📞';
  }

  getCallTypeText(): string {
    return this.callSession.callType === 'video' ? 'Video Calling' : 'Calling';
  }

  getInitials(name: string): string {
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  }

  private playCallingSound(): void {
    // You can add a custom calling tone audio file
    // this.ringingAudio = new Audio('/assets/sounds/calling.mp3');
    // this.ringingAudio.loop = true;
    // this.ringingAudio.play().catch(err => console.error('Error playing calling tone:', err));
  }

  private stopCallingSound(): void {
    if (this.ringingAudio) {
      this.ringingAudio.pause();
      this.ringingAudio.currentTime = 0;
      this.ringingAudio = null;
    }
  }
}