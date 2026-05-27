// search-modal.component.ts — replace the class body only, keep your template and styles

import {
  Component, EventEmitter, Output, OnDestroy,
  Input, ViewChild, ElementRef, AfterViewInit
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject, takeUntil, debounceTime, distinctUntilChanged } from 'rxjs';
import { Contact, User, SearchFilters } from '../../../../models/chat.models';
import { AuthService } from '../../../../services/auth.service';
import { SearchService, ClientSearchResult } from '../../../../services/search.service';

@Component({
  selector: 'app-search-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `<div class="modal-overlay" (click)="close()">
      <div
        class="modal-content search-modal"
        (click)="$event.stopPropagation()"
      >
        <div class="modal-header">
          <h3>Search Messages</h3>
          <button class="close-btn" (click)="close()">×</button>
        </div>

        <!-- Search Input -->
        <div class="search-input-container">
          <input
            #searchInput
            type="text"
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange($event)"
            placeholder="Search messages..."
            class="search-input"
          />

          <span class="search-icon">🔍</span>
        </div>

        <!-- Filters -->
        <div class="filters-section">
          <button class="filter-toggle" (click)="showFilters = !showFilters">
            <span>{{ showFilters ? '▼' : '▶' }} Filters</span>
          </button>

          <div class="filters-content" *ngIf="showFilters">
            <!-- Sender Filter -->
            <div class="filter-group">
              <label>Sender</label>
              <select [(ngModel)]="filters.senderId" (change)="applyFilters()">
                <option [ngValue]="undefined">All Senders</option>
                <!-- Sent by You -->
                <option *ngIf="currentUser" [ngValue]="currentUser.userId">
                  Sent by You
                </option>

                <!-- Other users (exclude groups) -->
                <ng-container *ngFor="let contact of contacts">
                  <option *ngIf="!contact.isGroup" [ngValue]="contact.userId">
                    {{ contact.displayName }}
                  </option>
                </ng-container>
              </select>
            </div>

            <!-- Conversation Filter -->
            <div class="filter-group">
              <label>Conversation</label>
              <select
                [(ngModel)]="filters.conversationId"
                (change)="applyFilters()"
              >
                <option [ngValue]="undefined">All Conversations</option>
                <option
                  *ngFor="let contact of contacts"
                  [ngValue]="contact.conversationId"
                >
                  <span *ngIf="contact.isGroup">👥</span>
                  {{ contact.displayName }}
                </option>
              </select>
            </div>

            <!-- Date Range -->
            <div class="filter-group">
              <label>From Date</label>
              <input
                type="date"
                [(ngModel)]="filters.startDate"
                (change)="applyFilters()"
              />
            </div>

            <div class="filter-group">
              <label>To Date</label>
              <input
                type="date"
                [(ngModel)]="filters.endDate"
                (change)="applyFilters()"
              />
            </div>

            <button class="clear-filters-btn" (click)="clearFilters()">
              Clear Filters
            </button>
          </div>
        </div>

        <!-- Results -->
        <div class="results-section">
          <div class="results-header" *ngIf="searchResults.length > 0">
            <span
              >{{ totalResults }} result{{
                totalResults !== 1 ? 's' : ''
              }}
              found</span
            >
          </div>

          <div class="results-list" *ngIf="!isSearching">
            <!-- No Query -->
            <div class="no-results" *ngIf="searchQuery.length === 0">
              <span class="search-icon-large">🔍</span>
              <p>Enter text to search messages</p>
            </div>

            <!-- No Results -->
            <div
              class="no-results"
              *ngIf="searchQuery.length > 0 && searchResults.length === 0"
            >
              <span class="search-icon-large">📭</span>
              <p>No messages found</p>
            </div>

            <!-- Results -->
            <div
              *ngFor="let result of searchResults"
              class="result-item"
              (click)="selectResult(result)"
            >
              <!-- Avatar -->
              <div class="result-avatar">
                <img
                  *ngIf="result.senderPhotoUrl"
                  [src]="result.senderPhotoUrl"
                  alt="avatar"
                />
                <span *ngIf="!result.senderPhotoUrl">
                  {{ result.senderDisplayName.charAt(0).toUpperCase() }}
                </span>
              </div>

              <!-- Content -->
              <div class="result-content">
                <div class="result-header">
                  <span class="result-sender">{{
                    result.senderDisplayName
                  }}</span>
                  <span class="result-conversation">
                    <span *ngIf="result.isGroup">👥</span>
                    {{ result.conversationName }}
                  </span>
                  <span class="result-time">{{
                    formatDate(result.createdAtUtc)
                  }}</span>
                </div>

                <div class="result-body">
                  <span
                    [innerHTML]="highlightText(result.body, searchQuery)"
                  ></span>
                </div>

                <div
                  class="result-meta"
                  *ngIf="
                    result.contentType === 'image' ||
                    result.contentType === 'video'
                  "
                >
                  <span class="media-indicator">
                    {{
                      result.contentType === 'image' ? '📷 Image' : '🎥 Video'
                    }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Load More -->
            <button
              *ngIf="hasMore"
              class="load-more-btn"
              (click)="loadMore()"
              [disabled]="isLoadingMore"
            >
              {{ isLoadingMore ? 'Loading...' : 'Load More' }}
            </button>
          </div>

          <!-- Loading -->
          <div class="loading" *ngIf="isSearching">
            <div class="spinner"></div>
            <p>Searching...</p>
          </div>
        </div>
      </div>
    </div>`,
  styleUrls: ['./search-modal.component.css']
})
export class SearchModalComponent implements OnDestroy, AfterViewInit {
  @Input()  contacts: Contact[] = [];
  @Output() closeModal      = new EventEmitter<void>();
  @Output() messageSelected = new EventEmitter<ClientSearchResult>();

  @ViewChild('searchInput') searchInput!: ElementRef<HTMLInputElement>;

  private destroy$      = new Subject<void>();
  private searchSubject$ = new Subject<string>();

  // All decrypted results cached in memory for this search session
  private allResults: ClientSearchResult[] = [];

  searchQuery    = '';
  searchResults: ClientSearchResult[] = [];
  totalResults   = 0;
  currentPage    = 1;
  pageSize       = 20;
  hasMore        = false;
  isSearching    = false;
  isLoadingMore  = false;
  showFilters    = false;
  currentUser: User | null = null;

  filters: SearchFilters = {
    query:          '',
    senderId:       undefined,
    conversationId: undefined,
    startDate:      undefined,
    endDate:        undefined
  };

  constructor(
    private authService:   AuthService,
    private searchService: SearchService
  ) {
    this.currentUser = this.authService.getCurrentUser();

    this.searchSubject$
      .pipe(debounceTime(400), distinctUntilChanged(), takeUntil(this.destroy$))
      .subscribe(query => this.performSearch(query));
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.searchInput?.nativeElement.focus(), 0);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearchChange(query: string): void {
    this.filters.query = query;
    this.currentPage   = 1;
    this.searchSubject$.next(query);
  }

  applyFilters(): void {
    if (this.searchQuery.trim()) {
      this.currentPage = 1;
      this.performSearch(this.searchQuery);
    }
  }

  clearFilters(): void {
    this.filters.senderId       = undefined;
    this.filters.conversationId = undefined;
    this.filters.startDate      = undefined;
    this.filters.endDate        = undefined;
    this.applyFilters();
  }

  async performSearch(query: string): Promise<void> {
    if (!query.trim()) {
      this.searchResults = [];
      this.allResults    = [];
      this.totalResults  = 0;
      this.hasMore       = false;
      return;
    }

    this.isSearching = true;
    this.currentPage = 1;
    this.allResults  = [];

    try {
      const { results, totalCount } = await this.searchService.search(
        query,
        this.contacts,
        {
          senderId:       this.filters.senderId,
          conversationId: this.filters.conversationId,
          startDate:      this.filters.startDate,
          endDate:        this.filters.endDate
        }
      );

      // Cache all results — pagination is done in memory, no further API calls
      this.allResults    = results;
      this.totalResults  = totalCount;
      this.searchResults = results.slice(0, this.pageSize);
      this.hasMore       = totalCount > this.pageSize;

    } catch (err) {
      console.error('Search failed:', err);
    } finally {
      this.isSearching = false;
    }
  }

  // No API call — slices from already-decrypted in-memory results
  loadMore(): void {
    this.currentPage++;
    const offset   = (this.currentPage - 1) * this.pageSize;
    const nextSlice = this.allResults.slice(offset, offset + this.pageSize);

    this.searchResults = [...this.searchResults, ...nextSlice];
    this.hasMore       = this.searchResults.length < this.totalResults;
    this.isLoadingMore = false;
  }

  selectResult(result: ClientSearchResult): void {
    this.messageSelected.emit(result);
    this.close();
  }

  close(): void {
    this.closeModal.emit();
  }

  highlightText(text: string, query: string): string {
    if (!query || !text) return text;
    const regex = new RegExp(`(${this.escapeRegex(query)})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  }

  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  formatDate(dateString: string): string {
    const date   = new Date(dateString);
    const now    = new Date();
    const diff   = now.getTime() - date.getTime();
    const oneDay = 24 * 60 * 60 * 1000;

    if (diff < oneDay && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 7 * oneDay) {
      return date.toLocaleDateString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  }
}