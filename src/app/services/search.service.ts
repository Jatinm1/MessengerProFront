// src/app/services/search.service.ts
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ChatService } from './chat.service';
import { CryptoService } from './crypto.service';
import { AuthService } from './auth.service';
import { Contact } from '../models/chat.models';

export interface ClientSearchResult {
  messageId:          number;
  conversationId:     string;
  conversationName:   string;
  isGroup:            boolean;
  senderId:           string;
  senderDisplayName:  string;
  senderPhotoUrl?:    string; 
  body:               string;
  matchedText:        string;
  contentType:        string;
  createdAtUtc:       string;
  mediaUrl?:          string;
}

@Injectable({ providedIn: 'root' })
export class SearchService {

  constructor(
    private chatService:   ChatService,
    private cryptoService: CryptoService,
    private authService:   AuthService
  ) {}

  async search(
    query:   string,
    contacts: Contact[],
    filters: {
      senderId?:        string;
      conversationId?:  string;
      startDate?:       string;
      endDate?:         string;
    } = {}
  ): Promise<{ results: ClientSearchResult[]; totalCount: number }> {

    if (!query.trim()) return { results: [], totalCount: 0 };

    const userId     = this.authService.getCurrentUserId()!;
    const privateKey = await this.cryptoService.getPrivateKey(userId);
    if (!privateKey) {
      console.warn('⚠️ No private key — cannot search encrypted messages');
      return { results: [], totalCount: 0 };
    }

    const lowerQuery = query.toLowerCase();

    // Apply conversation filter up front to avoid unnecessary fetches
    const conversationsToSearch = filters.conversationId
      ? contacts.filter(c => c.conversationId === filters.conversationId)
      : contacts;

    const allMatches: ClientSearchResult[] = [];

    // Search each conversation in parallel
    await Promise.all(
      conversationsToSearch.map(async (contact) => {
        try {
          // Fetch up to 500 messages — adjust if you have very long histories
          const messages = await firstValueFrom(
            this.chatService.getHistory(contact.conversationId, 1, 500)
          );

          for (const msg of messages) {
            // Skip deleted or empty
            if (msg.isDeleted || !msg.body) continue;

            // Skip if no encrypted key (legacy or system message)
            if (!msg.encryptedKey) continue;

            // Apply sender filter
            if (filters.senderId && msg.fromUserId !== filters.senderId) continue;

            // Apply date filters
            if (filters.startDate &&
                new Date(msg.createdAtUtc) < new Date(filters.startDate)) continue;
            if (filters.endDate &&
                new Date(msg.createdAtUtc) > new Date(filters.endDate))   continue;

            // Decrypt the message body
            let plaintext: string;
            const colonIdx = msg.body.indexOf(':');
            if (colonIdx === -1) {
              // Not encrypted format — skip
              continue;
            }

            try {
              const iv         = msg.body.substring(0, colonIdx);
              const ciphertext = msg.body.substring(colonIdx + 1);
              plaintext = await this.cryptoService.decryptMessage(
                ciphertext, iv, msg.encryptedKey, privateKey
              );
            } catch {
              // Can't decrypt — skip this message
              continue;
            }

            // Check if decrypted text contains the query
            if (!plaintext.toLowerCase().includes(lowerQuery)) continue;

            allMatches.push({
              messageId:         msg.messageId,
              conversationId:    contact.conversationId,
              conversationName:  contact.displayName,
              isGroup:           contact.isGroup ?? false,
              senderId:          msg.fromUserId,
              senderDisplayName: msg.fromDisplayName || msg.fromUserName,
              body:              plaintext,
              matchedText:       this.buildSnippet(plaintext, lowerQuery),
              contentType:       msg.contentType ?? 'text',
              createdAtUtc:      msg.createdAtUtc,
              mediaUrl:          msg.mediaUrl ?? undefined
            });
          }
        } catch (err) {
          console.error(
            `❌ Search failed for conversation ${contact.conversationId}:`, err
          );
        }
      })
    );

    // Sort newest first
    allMatches.sort((a, b) =>
      new Date(b.createdAtUtc).getTime() - new Date(a.createdAtUtc).getTime()
    );

    return { results: allMatches, totalCount: allMatches.length };
  }

  private buildSnippet(text: string, query: string): string {
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text.substring(0, 100);

    const start   = Math.max(0, idx - 40);
    const end     = Math.min(text.length, idx + query.length + 40);
    const snippet = text.substring(start, end);

    return (start > 0 ? '...' : '') + snippet + (end < text.length ? '...' : '');
  }
}