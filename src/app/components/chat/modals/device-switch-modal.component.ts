// device-switch-modal.component.ts
import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject, takeUntil } from 'rxjs';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-device-switch-modal',
  standalone: true,
  imports: [CommonModule],   // ← required for *ngIf
  template: `
    <div class="modal-overlay" *ngIf="visible">
      <div class="modal-box">

        <div class="modal-icon">🔐</div>
        <h2>New Device Detected</h2>
        <p>
          You're signing in from a new device or browser.
          To use end-to-end encryption here, this device needs to
          become your active encryption device.
        </p>

        <div class="notice">
          <strong>⚠️ Note:</strong> Messages encrypted on your previous
          device won't be readable here. New messages will be encrypted
          for this device going forward.
        </div>

        <div class="actions">
          <button class="btn-primary" (click)="onUseThisDevice()" [disabled]="loading">
            {{ loading ? 'Setting up...' : 'Use This Device for Encryption' }}
          </button>
          <button class="btn-secondary" (click)="onDismiss()" [disabled]="loading">
            Continue Without Encryption
          </button>
        </div>

        <p class="note">
          You can switch devices again anytime by logging in from
          another device and confirming there.
        </p>
      </div>
    </div>
  `,
  styles: [`
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.55);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 9999;
      backdrop-filter: blur(4px);
    }
    .modal-box {
      background: white;
      border-radius: 16px;
      padding: 36px;
      max-width: 440px;
      width: 90%;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.2);
      text-align: center;
    }
    .modal-icon {
      font-size: 3rem;
      margin-bottom: 12px;
    }
    h2 {
      font-size: 1.4rem;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 12px;
    }
    p {
      color: #475569;
      font-size: 0.95rem;
      line-height: 1.6;
      margin-bottom: 16px;
    }
    .notice {
      background: #fef3c7;
      border: 1px solid #fcd34d;
      border-radius: 10px;
      padding: 12px 16px;
      font-size: 0.88rem;
      color: #92400e;
      margin-bottom: 24px;
      text-align: left;
    }
    .actions {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .btn-primary {
      background: #2a74f5;
      color: white;
      border: none;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary:hover:not(:disabled) {
      background: #1d64e0;
      transform: translateY(-1px);
    }
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
    .btn-secondary {
      background: transparent;
      color: #64748b;
      border: 1px solid #e2e8f0;
      padding: 12px 24px;
      border-radius: 10px;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-secondary:hover:not(:disabled) {
      background: #f8fafc;
    }
    .note {
      font-size: 0.8rem;
      color: #94a3b8;
      margin-top: 16px;
      margin-bottom: 0;
    }
  `]
})
export class DeviceSwitchModalComponent implements OnInit, OnDestroy {
  visible         = false;
  loading         = false;
  private pendingUserId: string | null = null;
  private destroy$ = new Subject<void>();

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    this.authService.deviceSwitchRequired$
      .pipe(takeUntil(this.destroy$))
      .subscribe((userId) => {
        console.log('🔐 [Modal] deviceSwitchRequired$ fired for', userId);
        this.pendingUserId = userId;
        this.visible       = true;
      });

    this.authService.deviceSwitchConfirmed$
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.loading = false;
        this.visible = false;
        console.log('✅ [Modal] Device switch confirmed, modal closed');
      });
  }

  async onUseThisDevice(): Promise<void> {
    if (!this.pendingUserId) return;
    this.loading = true;
    try {
      await this.authService.confirmDeviceSwitch(this.pendingUserId);
    } catch (err) {
      console.error('❌ [Modal] confirmDeviceSwitch failed:', err);
      this.loading = false;
    }
  }

  onDismiss(): void {
    this.authService.declineDeviceSwitch();
    this.visible = false;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}