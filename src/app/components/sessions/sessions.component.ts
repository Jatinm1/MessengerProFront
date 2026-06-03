// ============================================================
// src/app/components/sessions/sessions.component.ts
// NEW FILE — View and revoke active sessions
// ============================================================
import { Component, OnInit } from '@angular/core';
import { CommonModule }      from '@angular/common';
import { AuthService }       from '../../services/auth.service';
import { SessionInfo }       from '../../models/chat.models';

@Component({
  selector:    'app-sessions',
  standalone:  true,
  imports:     [CommonModule],
  templateUrl: './sessions.component.html',
  styleUrls:   ['./sessions.component.css']
})
export class SessionsComponent implements OnInit {

  sessions: SessionInfo[] = [];
  loading  = false;
  revoking: Set<string> = new Set();

  constructor(private auth: AuthService) {}

  ngOnInit(): void { this.loadSessions(); }

  loadSessions(): void {
    this.loading = true;
    this.auth.getSessions().subscribe({
      next:  s  => { this.sessions = s; this.loading = false; },
      error: () => { this.loading = false; }
    });
  }

  revokeSession(sessionId: string): void {
    this.revoking.add(sessionId);
    this.auth.revokeSession(sessionId).subscribe({
      next:  () => { this.sessions = this.sessions.filter(s => s.sessionId !== sessionId); this.revoking.delete(sessionId); },
      error: () => this.revoking.delete(sessionId)
    });
  }

  globalLogout(): void {
    this.auth.globalLogout().subscribe();
  }
}
