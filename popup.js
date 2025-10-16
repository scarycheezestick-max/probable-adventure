let savedMediaData = [];
let currentAuthor = 'all';
let currentSort = 'newest';
let currentType = 'all';
let currentCollectionFilterPopup = 'all';
let currentPage = 1;
let imagesPerPage = 6;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const FAVORITE_AUTHORS_KEY = 'x_media_saver_favorite_authors';
let favoriteAuthorsList = [];
let collectionsListPopup = [];

const STAR_SVG_PATH_POPUP = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2l-2.81 6.63L2 9.24l5.46 4.73L5.82 21z";
const FOLDER_PLUS_SVG_PATH_POPUP = "M10 4H4c-1.11 0-2 .89-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z M16 15h-2v2h-2v-2h-2v-2h2v-2h2v2h2v2z";
const PEN_SVG_PATH_POPUP = "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const TRASH_SVG_PATH_POPUP = "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const PLUS_ICON_SVG_PATH = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
const CHECK_SVG_PATH = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
const CANCEL_SVG_PATH = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const GEAR_ICON_SVG_PATH = "M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69-.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12-.64l2 3.46c.12.22.39.3.61.22l2.49 1c.52.4 1.08.73 1.69-.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61.22l2-3.46c.12-.22-.07.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z";
const VIDEO_PLACEHOLDER_ICON_SVG_POPUP = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="rgba(128,128,128,0.3)" d="M10 16.5v-9l6 4.5-6 4.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>';
const VIDEO_UNPLAYABLE_ICON_SVG_POPUP = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="rgba(128,128,128,0.4)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/><path fill="rgba(255,80,80,0.7)" d="M11 7h2v6h-2zm0 8h2v2h-2z"/></svg>';
const VIDEO_THUMBNAIL_ONLY_ICON_SVG_POPUP = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ADADAD" width="24px" height="24px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM7 7h2v2H7V7zm0 4h2v2H7v-2zm0 4h2v2H7v-2zm10 2h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>';
const IMAGE_ERROR_ICON_SVG_POPUP = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="rgba(150,150,150,0.5)" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';


// DOM Element Caching
let domElements = {};

function cacheDOM() {
    domElements = {
        extensionVersionPopup: document.getElementById('extension-version-popup'),
        tabButtons: document.querySelectorAll('.tab-button'),
        tabContents: document.querySelectorAll('.tab-content'),
        // Stats Tab
        totalMedia: document.getElementById('total-media'),
        imageCount: document.getElementById('image-count'),
        videoCount: document.getElementById('video-count'),
        totalAuthors: document.getElementById('total-authors'),
        todayMedia: document.getElementById('today-media'),
        recentMediaContainer: document.getElementById('recent-media-container'),
        // Gallery Tab
        galleryFilterAuthor: document.getElementById('gallery-filter-author'),
        popupRandomAuthorBtn: document.getElementById('popup-random-author-btn'),
        galleryFilterCollection: document.getElementById('gallery-filter-collection'),
        gallerySort: document.getElementById('gallery-sort'),
        galleryFilterType: document.getElementById('gallery-filter-type'),
        galleryPrevBtn: document.getElementById('gallery-prev'),
        galleryNextBtn: document.getElementById('gallery-next'),
        galleryPageInfo: document.getElementById('gallery-page-info'),
        galleryGrid: document.getElementById('gallery-grid'),
        openFullGalleryBtn: document.getElementById('open-full-gallery'),
        // Authors Tab
        authorSearch: document.getElementById('author-search'),
        authorSort: document.getElementById('author-sort'),
        authorsListContainer: document.getElementById('authors-list'),
        // Settings Tab
        downloadFolderInput: document.getElementById('downloadFolder'),
        buttonOpacityInput: document.getElementById('buttonOpacity'),
        opacityValueSpan: document.getElementById('opacityValue'),
        showNotificationsCheckbox: document.getElementById('showNotifications'),
        autoManageStorageCheckbox: document.getElementById('autoManageStorage'),
        saveSettingsBtn: document.getElementById('save-settings'),
        clearDataBtn: document.getElementById('clear-data'),
        storageUsedSpan: document.getElementById('storage-used'),
        storageLimitSpan: document.getElementById('storage-limit'),
        storageMeterUsed: document.querySelector('.storage-used'),
        // Logs Tab
        refreshLogsBtn: document.getElementById('refresh-logs-btn'),
        logLevelFilters: document.querySelectorAll('.log-level-filter'),
        logSourceFilters: document.querySelectorAll('.log-source-filter'),
        logTextFilter: document.getElementById('log-text-filter'),
        copyLogsBtn: document.getElementById('copy-logs-btn'),
        downloadLogsBtn: document.getElementById('download-logs-btn'),
        clearAllLogsBtn: document.getElementById('clear-all-logs-btn'),
        logsDisplayContainer: document.getElementById('logs-display-container'),
        // Modals
        manageCollectionsModalPopup: document.getElementById('manage-collections-modal-popup'),
        manageCollectionsModalPopupTitle: document.getElementById('manage-collections-modal-title-popup'),
        manageCollectionsMediaIdPopup: document.getElementById('manage-collections-media-id-popup'),
        manageCollectionsPreviewContainerPopup: document.getElementById('manage-collections-media-preview-container-popup'),
        manageCollectionsSearchInputPopup: document.getElementById('search-collections-modal-popup'),
        manageCollectionsListUlPopup: document.getElementById('existing-collections-list-modal-popup'),
        manageCollectionsLoadingPopup: document.getElementById('manage-collections-loading-popup'),
        manageCollectionsEmptyPopup: document.getElementById('manage-collections-empty-popup'),
        closeManageCollectionsModalPopupBtn: document.getElementById('close-manage-collections-modal-popup'),
        cancelCollectionChangesPopupBtn: document.getElementById('cancel-collection-changes-modal-popup'),
        createAndAddCollectionModalBtn: document.getElementById('create-and-add-collection-modal-popup'),
        saveCollectionChangesModalBtn: document.getElementById('save-collection-changes-modal-popup'),
        newCollectionNameModalInputPopup: document.getElementById('new-collection-name-modal-popup'),

        collectionsHubModal: document.getElementById('popup-collections-hub-modal'),
        collectionsHubSearchInput: document.getElementById('collections-hub-search'),
        collectionsHubListUl: document.getElementById('collections-hub-list'),
        collectionsHubEmptyMsg: document.getElementById('collections-hub-empty-message'),
        hubInlineCreateFormContainer: document.getElementById('hub-inline-create-form-container'),
        hubInlineNewCollectionNameInput: document.getElementById('hub-inline-new-collection-name'),
        hubInlineSaveCollectionBtn: document.getElementById('hub-inline-save-collection-btn'),
        hubInlineCancelCollectionBtn: document.getElementById('hub-inline-cancel-collection-btn'),
        hubCreateNewCollectionBtn: document.getElementById('hub-create-new-collection-btn'),
        closeCollectionsHubBtn: document.getElementById('close-collections-hub-modal'),
        // Templates
        authorTemplate: document.getElementById('author-template'),
        mediaPreviewTemplate: document.getElementById('media-preview-template')
    };
}


// --- START: Popup Logging ---
// Sanitize input to prevent logging issues
function sanitizeInput(input, maxLength = 10000) {
    try {
        if (input === null || input === undefined) return String(input);
        
        let sanitized = String(input);
        
        // Truncate if too long
        if (sanitized.length > maxLength) {
            sanitized = sanitized.substring(0, maxLength - 3) + '...';
        }
        
        // Remove potentially problematic characters
        sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
        
        return sanitized;
    } catch (error) {
        return `[Sanitization failed: ${error.message}]`;
    }
}

// Safely serialize objects for logging
function safeSerialize(obj, maxSize = 50000) {
    try {
        if (obj === null || obj === undefined) return String(obj);
        // Fast-path primitives
        const t = typeof obj;
        if (t === 'string') return obj.length > maxSize ? obj.substring(0, maxSize - 3) + '...' : obj;
        if (t === 'number' || t === 'boolean') return JSON.stringify(obj);

        const seen = new WeakSet();
        const isDomLike = (value) => {
            try { return value && typeof value === 'object' && (value.nodeType !== undefined || (value.ownerDocument && value.tagName)); } catch(_) { return false; }
        };
        const replacer = (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular Reference]';
                seen.add(value);
            }
            if (typeof value === 'function') return '[Function]';
            if (isDomLike(value)) return `[DOM Element: ${value.tagName || 'NODE'}]`;
            if (typeof value === 'string' && value.length > 1000) return value.substring(0, 1000) + '...[truncated]';
            return value;
        };

        const serialized = JSON.stringify(obj, replacer, 2);
        if (serialized.length > maxSize) return serialized.substring(0, maxSize - 3) + '...';
        return serialized;
    } catch (error) {
        return `[Serialization failed: ${error.message}]`;
    }
}

function logPopupEntry(level, message, details = {}) {
  let logEntry;
  
  try {
    // Create robust log entry
    const sanitizedMessage = sanitizeInput(message);
    const sanitizedSource = 'POPUP';
    
    logEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      source: sanitizedSource,
      level: level.toUpperCase(),
      message: sanitizedMessage,
      stack: null,
      contextUrl: 'N/A (Popup)',
      details: {}
    };
    
    // Handle stack trace safely
    try {
      if (details.error && details.error.stack) {
        logEntry.stack = sanitizeInput(details.error.stack, 20000);
      } else if (details.stack) {
        logEntry.stack = sanitizeInput(details.stack, 20000);
      }
    } catch (stackError) {
      logEntry.stack = `[Stack trace processing failed: ${stackError.message}]`;
    }
    
    // Handle error details safely
    try {
      if (details.error) {
        logEntry.details.errorName = details.error.name || 'UnknownError';
        logEntry.details.errorMessage = sanitizeInput(details.error.message || String(details.error), 1000);
      }
    } catch (errorDetailsError) {
      logEntry.details.errorProcessingError = `Failed to process error details: ${errorDetailsError.message}`;
    }
    
    // Handle additional details safely
    try {
      if (details.additionalDetails) {
        const serializedDetails = safeSerialize(details.additionalDetails);
        logEntry.details.additionalDetails = serializedDetails;
      }
    } catch (detailsError) {
      logEntry.details.serializationError = `Failed to serialize additional details: ${detailsError.message}`;
    }
    
    // Clean up empty details
    if (Object.keys(logEntry.details).length === 0) {
      delete logEntry.details;
    }
    
  } catch (entryCreationError) {
    // Fallback log entry if creation fails
    logEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      source: 'POPUP_LOGGING_SYSTEM',
      level: 'CRITICAL',
      message: `Failed to create log entry: ${entryCreationError.message}`,
      stack: entryCreationError.stack,
      contextUrl: 'N/A (Popup)',
      details: { 
        originalMessage: String(message), 
        originalLevel: String(level),
        creationError: entryCreationError.message
      }
    };
  }

  // Console output with enhanced error handling
  try {
    const consoleArgs = [`XMS Popup [${logEntry.level}] (${logEntry.id}):`, logEntry.message];
    if (logEntry.stack && (logEntry.level === 'ERROR' || logEntry.level === 'CRITICAL')) {
      consoleArgs.push('\nStack:', logEntry.stack);
    }
    if (logEntry.details && Object.keys(logEntry.details).length > 0) {
      try {
        consoleArgs.push('\nDetails:', safeSerialize(logEntry.details));
      } catch (serializeError) {
        consoleArgs.push('\nDetails (serialization failed):', String(logEntry.details));
      }
    }

    switch(logEntry.level) {
        case 'CRITICAL':
        case 'ERROR':
            console.error(...consoleArgs);
            break;
        case 'WARN':
            console.warn(...consoleArgs);
            break;
        case 'DEBUG':
            console.debug(...consoleArgs);
            break;
        default: // INFO
            console.log(...consoleArgs);
            break;
    }
  } catch (consoleError) {
    // Ultimate fallback - direct console output
    console.error(`XMS Popup CONSOLE OUTPUT ERROR: ${consoleError.message}`);
    console.error(`Original log: ${logEntry.message}`);
  }

  // Send to background with enhanced error handling
  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage(
        { action: 'logExternalEntry', logEntry: logEntry },
        (response) => {
          if (chrome.runtime.lastError) {
            // Try localStorage fallback
            try {
              const fallbackKey = `xms_popup_log_${logEntry.id}`;
              const fallbackData = {
                timestamp: logEntry.timestamp,
                level: logEntry.level,
                message: logEntry.message,
                source: logEntry.source,
                error: chrome.runtime.lastError.message
              };
              localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
            } catch (localStorageError) {
              console.error(`XMS Popup: localStorage fallback failed: ${localStorageError.message}`);
            }
          } else if (response && !response.success) {
            // Try localStorage fallback for failed response
            try {
              const fallbackKey = `xms_popup_log_${logEntry.id}`;
              const fallbackData = {
                timestamp: logEntry.timestamp,
                level: logEntry.level,
                message: logEntry.message,
                source: logEntry.source,
                error: response.error || 'Unknown response error'
              };
              localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
            } catch (localStorageError) {
              console.error(`XMS Popup: localStorage fallback failed: ${localStorageError.message}`);
            }
          }
        }
      );
    } catch (messageError) {
      // Ultimate fallback - localStorage only
      try {
        const fallbackKey = `xms_popup_log_${logEntry.id}`;
        const fallbackData = {
          timestamp: logEntry.timestamp,
          level: logEntry.level,
          message: logEntry.message,
          source: logEntry.source,
          error: messageError.message
        };
        localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
      } catch (localStorageError) {
        console.error(`XMS Popup: All logging methods failed: ${localStorageError.message}`);
      }
    }
  } else if (logEntry.level !== 'DEBUG') {
    // Runtime not available, try localStorage fallback
    try {
      const fallbackKey = `xms_popup_log_${logEntry.id}`;
      const fallbackData = {
        timestamp: logEntry.timestamp,
        level: logEntry.level,
        message: logEntry.message,
        source: logEntry.source,
        error: 'Runtime not available'
      };
      localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
    } catch (localStorageError) {
      console.error(`XMS Popup: localStorage fallback failed: ${localStorageError.message}`);
    }
  }
}

window.onerror = function(message, sourceURL, lineno, colno, error) {
  logPopupEntry(
    'CRITICAL',
    `Popup Uncaught: ${message}`,
    {
      error: error,
      stack: error?.stack,
      contextUrl: sourceURL,
      additionalDetails: { lineno, colno, source: 'popup.window.onerror' }
    }
  );
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  const reason = event.reason;
  logPopupEntry(
    'CRITICAL',
    `Popup Unhandled Rejection: ${reason?.message || String(reason)}`,
    {
      error: reason instanceof Error ? reason : new Error(String(reason)),
      stack: reason?.stack,
      additionalDetails: {
        reasonRaw: String(reason),
        source: 'popup.window.onunhandledrejection'
      }
    }
  );
});
// --- END: Popup Logging ---


function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func.apply(this, args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function updateFavoriteButtonUIPopup(button, isFavorite) {
    if (isFavorite) {
        button.classList.add('is-favorite');
        button.setAttribute('aria-label', 'Unfavorite this item');
        button.setAttribute('aria-pressed', 'true');
        button.title = 'Unfavorite';
    } else {
        button.classList.remove('is-favorite');
        button.setAttribute('aria-label', 'Favorite this item');
        button.setAttribute('aria-pressed', 'false');
        button.title = 'Favorite';
    }
}

async function toggleFavorite(mediaId, favoriteBtn) {
    const mediaIndex = savedMediaData.findIndex(item => item.id === mediaId);
    if (mediaIndex === -1) return;

    const item = savedMediaData[mediaIndex];
    const oldFavoriteStatus = item.favorite;
    const newFavoriteStatus = !item.favorite;

    updateFavoriteButtonUIPopup(favoriteBtn, newFavoriteStatus);
    item.favorite = newFavoriteStatus;

    if (currentType === 'favorites' && domElements.tabContents[1]?.classList.contains('active')) { // Gallery tab index
        updateGalleryDisplay();
    }

    try {
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'updateMediaFavoriteStatus', mediaId: mediaId, favorite: newFavoriteStatus }, (res) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                } else if (res && res.success) {
                    resolve(res);
                } else {
                    reject(new Error(res ? res.error : 'Unknown error updating favorite status'));
                }
            });
        });
        showNotification(newFavoriteStatus ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (error) {
        logPopupEntry('ERROR', 'Error updating favorite status in DB from popup', { error: error });
        item.favorite = oldFavoriteStatus;
        updateFavoriteButtonUIPopup(favoriteBtn, oldFavoriteStatus);
        showNotification('Failed to update favorite', 'error');
        if (currentType === 'favorites' && domElements.tabContents[1]?.classList.contains('active')) {
            updateGalleryDisplay();
        }
    }
}

async function loadFavoriteAuthors() {
    return new Promise((resolve) => {
        chrome.storage.local.get([FAVORITE_AUTHORS_KEY], (result) => {
            if (chrome.runtime.lastError) {
                logPopupEntry('WARN', "Error loading favorite authors from popup", { error: chrome.runtime.lastError });
                favoriteAuthorsList = [];
            } else {
                const storedList = result[FAVORITE_AUTHORS_KEY];
                favoriteAuthorsList = Array.isArray(storedList) ? storedList : [];
            }
            resolve();
        });
    });
}

async function saveFavoriteAuthors() {
    try {
        await chrome.storage.local.set({ [FAVORITE_AUTHORS_KEY]: favoriteAuthorsList });
        chrome.runtime.sendMessage({ action: 'favoriteAuthorsUpdated' }).catch(err => logPopupEntry('WARN', "Error sending favoriteAuthorsUpdated message from popup", { error: err }));
    } catch (error) {
        logPopupEntry('ERROR', "Error saving favorite authors from popup", { error: error });
    }
}

function updateAuthorFavoriteButtonState(button, authorUsername) {
    if (!button || !authorUsername) return;
    const isFavorite = favoriteAuthorsList.includes(authorUsername);
    if (isFavorite) {
        button.classList.add('is-favorite-author');
        button.title = `Unfavorite author ${authorUsername}`;
        button.setAttribute('aria-label', `Unfavorite author ${authorUsername}`);
        button.setAttribute('aria-pressed', 'true');
    } else {
        button.classList.remove('is-favorite-author');
        button.title = `Favorite author ${authorUsername}`;
        button.setAttribute('aria-label', `Favorite author ${authorUsername}`);
        button.setAttribute('aria-pressed', 'false');
    }
}

async function toggleAuthorFavorite(authorUsername, clickedButton) {
    if (!authorUsername) return;
    if (!Array.isArray(favoriteAuthorsList)) favoriteAuthorsList = [];

    const index = favoriteAuthorsList.indexOf(authorUsername);
    let wasFavorite = false;
    if (index > -1) {
        favoriteAuthorsList.splice(index, 1);
        showNotification(`${authorUsername} unfavorited.`, 'info');
        wasFavorite = true;
    } else {
        favoriteAuthorsList.push(authorUsername);
        showNotification(`${authorUsername} favorited!`, 'success');
        wasFavorite = false;
    }
    await saveFavoriteAuthors();
    updateAuthorFilterOptions();
    updateAuthorFavoriteButtonState(clickedButton, authorUsername);

    const authorItems = domElements.authorsListContainer.querySelectorAll('.author-item');
    authorItems.forEach(item => {
        const nameSpan = item.querySelector('.author-name');
        if (nameSpan && nameSpan.textContent === authorUsername) {
            const starBtn = item.querySelector('.author-favorite-btn');
            if (starBtn && starBtn !== clickedButton) updateAuthorFavoriteButtonState(starBtn, authorUsername);
        }
    });
    const galleryPreviews = domElements.galleryGrid.querySelectorAll('.image-preview');
    galleryPreviews.forEach(preview => {
        if (preview.dataset.author === authorUsername) {
             const starBtn = preview.querySelector('.popup-media-author-favorite-btn');
             if (starBtn && starBtn !== clickedButton) updateAuthorFavoriteButtonState(starBtn, authorUsername);
        }
    });

    if (domElements.tabContents[1]?.classList.contains('active') && // Gallery tab
        (currentAuthor === authorUsername && wasFavorite || currentSort === 'author_az' || currentSort === 'author_za')) {
        updateGalleryDisplay();
    }
    if (domElements.tabContents[2]?.classList.contains('active')) { // Authors tab
        updateAuthorsDisplay();
    }
}

function handlePopupRandomAuthorClick() {
    const authorSelect = domElements.galleryFilterAuthor;
    const allAuthors = new Set(savedMediaData.map(item => item.author).filter(author => typeof author === 'string' && author.trim() !== ''));
    const authorArray = Array.from(allAuthors);
    if (authorArray.length > 0) {
        const randomAuthor = authorArray[Math.floor(Math.random() * authorArray.length)];
        currentAuthor = randomAuthor;
        authorSelect.value = randomAuthor;
        currentPage = 1;
        updateGalleryDisplay();
    } else {
        showNotification('No authors available.', 'info');
    }
}

function handleAuthorsTabRandomAuthorClick() {
    const authorItems = Array.from(domElements.authorsListContainer.querySelectorAll('.author-item'));
    const visibleAuthors = authorItems.filter(item => item.style.display !== 'none');
    if (visibleAuthors.length === 0) {
        showNotification('No authors to select from.', 'info');
        return;
    }
    const randomItem = visibleAuthors[Math.floor(Math.random() * visibleAuthors.length)];
    const authorNameSpan = randomItem.querySelector('.author-name');
    if (authorNameSpan) {
        const authorName = authorNameSpan.textContent;
        domElements.authorSearch.value = authorName;

        const previewDiv = randomItem.querySelector('.author-preview');
        const authorHeader = randomItem.querySelector('.author-header');
        const toggleButton = randomItem.querySelector('.toggle-button');
        if (previewDiv && previewDiv.classList.contains('hidden')) {
            previewDiv.classList.remove('hidden');
            if(toggleButton) toggleButton.textContent = '▲';
            if(authorHeader) authorHeader.setAttribute('aria-expanded', 'true');
        }
        randomItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}


// Store message listener reference for cleanup
let popupMessageListener = null;

// Cleanup on popup close
window.addEventListener('beforeunload', () => {
    // Remove message listener to prevent memory leaks
    if (popupMessageListener && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.removeListener(popupMessageListener);
        popupMessageListener = null;
    }
});

// Use session flag set by gallery to avoid contention
async function isFullGalleryActive() {
  try {
    const res = await new Promise(resolve => chrome.storage.session?.get(['xmsGalleryOpen'], resolve));
    return !!res?.xmsGalleryOpen;
  } catch(e) { return false; }
}

async function loadSavedMediaDataLightweight(limit = 50) {
  return new Promise(async (resolve, reject) => {
    try {
      const dbOpenReq = indexedDB.open('XMediaGalleryDB');
      dbOpenReq.onsuccess = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('mediaItems')) {
          savedMediaData = [];
          requestAnimationFrame(() => {
            updateStatsDisplay();
            updateRecentMedia();
            updateGalleryDisplay();
            updateAuthorsDisplay();
            updateCollectionFilterOptionsPopup();
          });
          resolve();
          return;
        }
        const transaction = db.transaction('mediaItems', 'readonly');
        const store = transaction.objectStore('mediaItems');
        // Use index on date if present; else cursor from end if keypath sorted
        let items = [];
        const useIndex = store.indexNames.contains('date');
        const source = useIndex ? store.index('date') : store;
        const request = source.openCursor(null, 'prev');
        request.onsuccess = () => {
          const cursor = request.result;
          if (cursor && items.length < limit) {
            items.push(cursor.value);
            cursor.continue();
          } else {
            savedMediaData = items;
            requestAnimationFrame(() => {
              updateStatsDisplay();
              updateRecentMedia();
              updateGalleryDisplay();
              updateAuthorsDisplay();
              updateCollectionFilterOptionsPopup();
            });
            resolve();
          }
        };
        request.onerror = (e) => {
          logPopupEntry('ERROR', 'Error loading lightweight media from DB for popup', { error: e.target.error });
          reject(e.target.error);
        };
      };
      dbOpenReq.onerror = (event) => {
        logPopupEntry('ERROR', 'Failed to open DB for popup media (lightweight)', { error: event.target.error });
        reject(event.target.error);
      };
    } catch (error) {
      logPopupEntry('ERROR', 'Exception opening DB for popup media (lightweight)', { error: error });
      reject(error);
    }
  });
}

// Concurrency limiter for popup media loads
const POPUP_MAX_CONCURRENT_MEDIA_LOADS = 4;
let popupCurrentMediaLoads = 0;
const popupPendingMediaLoadQueue = [];

function popupEnqueueMediaLoad(task) {
  popupPendingMediaLoadQueue.push(task);
  popupDrainMediaLoadQueue();
}

function popupDrainMediaLoadQueue() {
  while (popupCurrentMediaLoads < POPUP_MAX_CONCURRENT_MEDIA_LOADS && popupPendingMediaLoadQueue.length > 0) {
    const next = popupPendingMediaLoadQueue.shift();
    popupCurrentMediaLoads++;
    Promise.resolve()
      .then(next)
      .catch(() => {})
      .finally(() => {
        popupCurrentMediaLoads = Math.max(0, popupCurrentMediaLoads - 1);
        if (popupPendingMediaLoadQueue.length > 0) setTimeout(popupDrainMediaLoadQueue, 0);
      });
  }
}

// Wrap call site to throttle preview loading
function schedulePopupPreview(mediaElement, sourcesToTry, mediaData, placeholderSvg) {
  popupEnqueueMediaLoad(() => new Promise(resolve => {
    try { setAndHandleMediaPreviewPopup(mediaElement, sourcesToTry, mediaData, placeholderSvg); }
    finally { resolve(); }
  }));
}

// Hook into DOMContentLoaded to choose strategy
document.addEventListener('DOMContentLoaded', async () => {
  try {
    cacheDOM();
    initializeTabs();
    await loadSettings();
    await loadFavoriteAuthors();
    await loadCollectionsPopup();

    const galleryActive = await isFullGalleryActive();
    if (galleryActive) {
      logPopupEntry('INFO', 'Full gallery active; loading lightweight popup data to avoid contention.');
      await loadSavedMediaDataLightweight(60);
    } else {
      await loadSavedMediaData();
    }

    const version = chrome.runtime.getManifest().version;
    if (domElements.extensionVersionPopup) {
      domElements.extensionVersionPopup.textContent = `v${version}`;
    }

    domElements.saveSettingsBtn.addEventListener('click', saveSettings);
    domElements.clearDataBtn.addEventListener('click', confirmClearData);
    domElements.buttonOpacityInput.addEventListener('input', updateOpacityValue);

    domElements.galleryFilterAuthor.addEventListener('change', changeGalleryFilter);
    domElements.popupRandomAuthorBtn.addEventListener('click', handlePopupRandomAuthorClick);
    domElements.galleryFilterCollection.addEventListener('change', changeGalleryCollectionFilterPopup);
    domElements.gallerySort.addEventListener('change', changeGallerySort);
    domElements.galleryFilterType.addEventListener('change', changeGalleryType);

    domElements.galleryPrevBtn.addEventListener('click', previousGalleryPage);
    domElements.galleryNextBtn.addEventListener('click', nextGalleryPage);

    domElements.authorSearch.addEventListener('input', debounce(searchAuthors, 250));
    domElements.authorSort.addEventListener('change', updateAuthorsDisplay);


    domElements.openFullGalleryBtn.addEventListener('click', openFullGallery);

    if (domElements.closeManageCollectionsModalPopupBtn) domElements.closeManageCollectionsModalPopupBtn.addEventListener('click', closeManageCollectionsModalPopup);
    if(domElements.cancelCollectionChangesPopupBtn) domElements.cancelCollectionChangesPopupBtn.addEventListener('click', closeManageCollectionsModalPopup);

    const manageCollectionsPopupOverlay = domElements.manageCollectionsModalPopup.querySelector('.modal-overlay');
    if (manageCollectionsPopupOverlay) manageCollectionsPopupOverlay.addEventListener('click', closeManageCollectionsModalPopup);
    if (domElements.createAndAddCollectionModalBtn) domElements.createAndAddCollectionModalBtn.addEventListener('click', handleCreateAndAddCollectionModalPopup);
    if (domElements.saveCollectionChangesModalBtn) domElements.saveCollectionChangesModalBtn.addEventListener('click', handleSaveCollectionChangesModalPopup);

    if (domElements.manageCollectionsSearchInputPopup) {
      domElements.manageCollectionsSearchInputPopup.addEventListener('input', debounce(handleSearchCollectionsInModalPopup, 250));
    }

    if (domElements.closeCollectionsHubBtn) domElements.closeCollectionsHubBtn.addEventListener('click', closeCollectionsHubModal);
    const collectionsHubOverlay = domElements.collectionsHubModal.querySelector('.modal-overlay');
    if (collectionsHubOverlay) collectionsHubOverlay.addEventListener('click', closeCollectionsHubModal);

    if (domElements.collectionsHubSearchInput) domElements.collectionsHubSearchInput.addEventListener('input', debounce(() => populateCollectionsHubList(domElements.collectionsHubSearchInput.value), 250));
    if (domElements.hubCreateNewCollectionBtn) domElements.hubCreateNewCollectionBtn.addEventListener('click', handleHubCreateNewCollectionInline);

    // Logging Tab listeners
    domElements.refreshLogsBtn.addEventListener('click', fetchAndDisplayLogs);
    domElements.logLevelFilters.forEach(checkbox => checkbox.addEventListener('change', fetchAndDisplayLogs));
    domElements.logSourceFilters.forEach(checkbox => checkbox.addEventListener('change', fetchAndDisplayLogs));
    domElements.logTextFilter.addEventListener('input', debounce(fetchAndDisplayLogs, 300));
    domElements.copyLogsBtn.addEventListener('click', copyFilteredLogsToClipboard);
    domElements.downloadLogsBtn.addEventListener('click', downloadFilteredLogs);
    domElements.clearAllLogsBtn.addEventListener('click', clearAllLogsFromPopup);


    popupMessageListener = async (message, sender, sendResponse) => {
      // Skip processing if this is a gallery-specific message to prevent duplicate processing
      if (message.galleryOnly) {
        return false;
      }
      
      let needsFullReload = false;
      let needsUIRefresh = false;

      if (message.action === 'mediaStoreUpdated') {
        const oldMediaCount = savedMediaData.length;

        if (message.mediaId && typeof message.favorite === 'boolean') {
          const itemIndex = savedMediaData.findIndex(item => item.id === message.mediaId);
          if (itemIndex > -1) {
            const itemChanged = savedMediaData[itemIndex];
            const oldFavoriteStatus = itemChanged.favorite;
            itemChanged.favorite = message.favorite;

            const cardElement = domElements.galleryGrid.querySelector(`.image-preview[data-media-id="${message.mediaId}"]`);
            if (cardElement) {
              const favButton = cardElement.querySelector('.favorite-btn');
              if (favButton) updateFavoriteButtonUIPopup(favButton, message.favorite);
            }

            if (currentType === 'favorites' && domElements.tabContents[1]?.classList.contains('active')) {
              if (oldFavoriteStatus !== message.favorite) needsUIRefresh = true;
            }
            if (domElements.recentMediaContainer.querySelector(`.image-preview[data-media-id="${message.mediaId}"]`)) {
              needsUIRefresh = true;
            }
          }
        } else if (message.deleted === true || (message.item && (message.item.imported === true || message.created === true))) {
          needsFullReload = true;
        } else if (message.item && message.item.id) {
          const itemIndex = savedMediaData.findIndex(i => i.id === message.item.id);
          if (itemIndex > -1) {
            savedMediaData[itemIndex] = { ...savedMediaData[itemIndex], ...message.item };
          } else {
            savedMediaData.push(message.item);
          }
          needsFullReload = true;
        } else {
          needsFullReload = true;
        }

        if (needsFullReload) {
          const galleryActive = await isFullGalleryActive();
          if (galleryActive) {
            logPopupEntry('INFO', 'Full gallery active; performing lightweight reload in popup.');
            await loadSavedMediaDataLightweight(60);
          } else {
            await loadSavedMediaData();
          }
        } else if (needsUIRefresh) {
          // Selective updates
          if (domElements.tabContents[0]?.classList.contains('active')) updateRecentMedia(); // Stats tab
          if (domElements.tabContents[1]?.classList.contains('active')) updateGalleryDisplay(); // Gallery tab
          updateStatsDisplay(); // Always update stats
        }

        // Refresh modals if they are open and relevant data might have changed
        if (savedMediaData.length !== oldMediaCount || message.deleted === true || (message.item && (message.item.imported === true || message.created === true))) {
          await loadCollectionsPopup();
          updateCollectionFilterOptionsPopup();
          if (domElements.collectionsHubModal.classList.contains('active')) {
            populateCollectionsHubList();
          }
          if (domElements.manageCollectionsModalPopup.classList.contains('active') && currentMediaItemForModalPopup) {
            openManageCollectionsModalPopup(currentMediaItemForModalPopup);
          }
        }
      } else if (message.action === 'mediaStoreUpdatedBatch') {
          logPopupEntry('INFO', 'Received mediaStoreUpdatedBatch, reloading data.', { additionalDetails: { itemCount: message.items?.length } });
          const galleryActive = await isFullGalleryActive();
          if (galleryActive) {
            await loadSavedMediaDataLightweight(80);
          } else {
            await loadSavedMediaData();
          }
          await loadCollectionsPopup();
          updateCollectionFilterOptionsPopup();

          const activeTabButton = document.querySelector('.tab-button.active');
          if (activeTabButton) {
              const activeTabName = activeTabButton.dataset.tab;
              if (activeTabName === 'gallery') updateGalleryDisplay();
              else if (activeTabName === 'authors') updateAuthorsDisplay();
              else if (activeTabName === 'stats') updateRecentMedia();
          }
          updateStatsDisplay();

          if (domElements.collectionsHubModal.classList.contains('active')) {
              populateCollectionsHubList();
          }
          if (domElements.manageCollectionsModalPopup.classList.contains('active') && currentMediaItemForModalPopup) {
              const itemWasInBatch = message.items.some(batchItem => batchItem.id === currentMediaItemForModalPopup.id);
              if (itemWasInBatch) {
                  const updatedItemInstance = savedMediaData.find(item => item.id === currentMediaItemForModalPopup.id);
                  if (updatedItemInstance) {
                      openManageCollectionsModalPopup(updatedItemInstance);
                  } else {
                      closeManageCollectionsModalPopup();
                  }
              }
          }
      } else if (message.action === 'favoriteAuthorsUpdated') {
          await loadFavoriteAuthors();
          updateAuthorFilterOptions();
          if (domElements.tabContents[2]?.classList.contains('active')) updateAuthorsDisplay(); // Authors tab
          if (domElements.tabContents[1]?.classList.contains('active')) { // Gallery tab
              const galleryPreviews = domElements.galleryGrid.querySelectorAll('.image-preview');
              galleryPreviews.forEach(preview => {
                  const authorFavBtn = preview.querySelector('.popup-media-author-favorite-btn');
                  if (authorFavBtn && preview.dataset.author) updateAuthorFavoriteButtonState(authorFavBtn, preview.dataset.author);
              });
              if (currentAuthor !== 'all' || currentSort === 'author_az' || currentSort === 'author_za') updateGalleryDisplay();
          }
      } else if (message.action === 'collectionsUpdated') {
          await loadCollectionsPopup();
          updateCollectionFilterOptionsPopup();
          if (domElements.tabContents[1]?.classList.contains('active') && (currentCollectionFilterPopup !== 'all' || message.collectionId)) { // Gallery tab
              updateGalleryDisplay();
          }
          if (domElements.manageCollectionsModalPopup.classList.contains('active') && currentMediaItemForModalPopup) {
              openManageCollectionsModalPopup(currentMediaItemForModalPopup);
          }
          if (domElements.collectionsHubModal.classList.contains('active')) {
              populateCollectionsHubList();
          }
      }
      return true;
    };
    
    // Register the message listener
    chrome.runtime.onMessage.addListener(popupMessageListener);
  } catch (error) {
    logPopupEntry('CRITICAL', 'Error during popup DOMContentLoaded initialization', { error: error });
    const statsTab = domElements.tabContents[0]; // Stats tab
    if (statsTab) {
        statsTab.innerHTML = '<div class="no-media-message" style="padding: 20px; text-align: center; color: red;">Critical error initializing popup. Please check extension logs or try again later.</div>';
        statsTab.classList.add('active'); // Ensure error is visible
        Array.from(domElements.tabContents).filter(tc => tc.id !== 'stats-tab').forEach(tc => tc.classList.remove('active'));
    }
  }
  logPopupEntry('INFO', 'Popup initialized.');
});

function initializeTabs() {
    domElements.tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            domElements.tabButtons.forEach(btn => {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
            });
            domElements.tabContents.forEach(content => content.classList.remove('active'));

            button.classList.add('active');
            button.setAttribute('aria-selected', 'true');
            const activeTabContent = document.getElementById(`${button.dataset.tab}-tab`);
            if (activeTabContent) activeTabContent.classList.add('active');

            if (button.dataset.tab === 'logs') {
                fetchAndDisplayLogs();
            }
        });
    });
}

async function loadSettings() {
    return new Promise((resolve) => {
        chrome.storage.sync.get({
            downloadFolder: 'X_Media',
            buttonOpacity: 0.7,
            showNotifications: true,
            autoManageStorage: true
        }, function(settings) {
            if (chrome.runtime.lastError) {
                logPopupEntry('WARN', "Error loading settings", { error: chrome.runtime.lastError });
                domElements.downloadFolderInput.value = 'X_Media';
                domElements.buttonOpacityInput.value = 0.7;
                domElements.opacityValueSpan.textContent = 0.7;
                domElements.showNotificationsCheckbox.checked = true;
                domElements.autoManageStorageCheckbox.checked = true;
            } else {
                domElements.downloadFolderInput.value = settings.downloadFolder;
                domElements.buttonOpacityInput.value = settings.buttonOpacity;
                domElements.opacityValueSpan.textContent = settings.buttonOpacity;
                domElements.showNotificationsCheckbox.checked = settings.showNotifications;
                domElements.autoManageStorageCheckbox.checked = settings.autoManageStorage;
            }
            updateStorageUsage();
            resolve();
        });
    });
}

function updateOpacityValue() {
    domElements.opacityValueSpan.textContent = domElements.buttonOpacityInput.value;
}

function saveSettings() {
    const settings = {
        downloadFolder: domElements.downloadFolderInput.value.trim() || 'X_Media',
        buttonOpacity: parseFloat(domElements.buttonOpacityInput.value),
        showNotifications: domElements.showNotificationsCheckbox.checked,
        autoManageStorage: domElements.autoManageStorageCheckbox.checked
    };
    chrome.storage.sync.set(settings, () => {
        if (chrome.runtime.lastError) {
            showNotification("Error saving settings: " + chrome.runtime.lastError.message, "error");
            logPopupEntry('ERROR', "Error saving settings", { error: chrome.runtime.lastError });
            return;
        }
        const saveButton = domElements.saveSettingsBtn;
        const originalText = saveButton.textContent;
        saveButton.textContent = 'Saved!';
        setTimeout(() => {
            saveButton.textContent = originalText;
        }, 1500);
    });
}

function confirmClearData() {
    if (confirm('Are you sure you want to clear all saved media data? This cannot be undone.')) {
        clearAllData();
    }
}

async function clearAllData() {
    try {
        const dbOpenReq = indexedDB.open('XMediaGalleryDB');
        dbOpenReq.onsuccess = e => {
            const db = e.target.result;
            if (db.objectStoreNames.contains('mediaItems')) {
                const tx = db.transaction('mediaItems', 'readwrite');
                const store = tx.objectStore('mediaItems');
                store.clear().onsuccess = () => {
                    if (db.objectStoreNames.contains('collections')) {
                        const tx2 = db.transaction('collections', 'readwrite');
                        tx2.objectStore('collections').clear().onsuccess = async () => {
                             await new Promise(resolve => chrome.storage.local.remove(['x_image_saver_global_saved', FAVORITE_AUTHORS_KEY], resolve));
                            savedMediaData = [];
                            favoriteAuthorsList = [];
                            collectionsListPopup = [];
                            updateStatsDisplay();
                            updateRecentMedia();
                            updateGalleryDisplay();
                            updateAuthorsDisplay();
                            updateCollectionFilterOptionsPopup();
                            updateStorageUsage();
                            showNotification('All saved media data has been cleared.', 'success');
                            logPopupEntry('INFO', 'All extension data cleared.');
                        };
                    } else {
                        (async () => {
                            await new Promise(resolve => chrome.storage.local.remove(['x_image_saver_global_saved', FAVORITE_AUTHORS_KEY], resolve));
                            savedMediaData = [];
                            favoriteAuthorsList = [];
                            collectionsListPopup = [];
                            updateStatsDisplay();
                            updateRecentMedia();
                            updateGalleryDisplay();
                            updateAuthorsDisplay();
                            updateCollectionFilterOptionsPopup();
                            updateStorageUsage();
                            showNotification('All saved media data has been cleared.', 'success');
                            logPopupEntry('INFO', 'All extension data cleared (collections store did not exist).');
                        })();
                    }
                };
            } else {
                 showNotification('No data to clear.', 'info');
                 logPopupEntry('INFO', 'Clear data called, but no mediaItems store found.');
            }
        };
        dbOpenReq.onerror = (err) => {
            showNotification('Failed to access DB to clear.', 'error');
            logPopupEntry('ERROR', 'Failed to open DB for clearing data', { error: err.target.error });
        }
    } catch (error) {
        showNotification('Failed to clear data.', 'error');
        logPopupEntry('ERROR', 'Exception during clearAllData', { error: error });
    }
}

function updateStorageUsage() {
    try {
        const openRequest = indexedDB.open('XMediaGalleryDB');
        openRequest.onsuccess = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains('mediaItems')) {
                 domElements.storageUsedSpan.textContent = `N/A`;
                 return;
            }
            const tx = db.transaction('mediaItems', 'readonly');
            const store = tx.objectStore('mediaItems');
            const countRequest = store.count();
            countRequest.onsuccess = () => {
                const itemCount = countRequest.result;
                const estimatedSizeKB = itemCount * 50;
                const estimatedSizeMB = (estimatedSizeKB / 1024).toFixed(1);
                domElements.storageUsedSpan.textContent = `${itemCount} items (~${estimatedSizeMB} MB)`;
                domElements.storageLimitSpan.textContent = `(IndexedDB)`;
                if (domElements.storageMeterUsed) {
                   domElements.storageMeterUsed.style.width = `${Math.min(100, (itemCount / 5000) * 100)}%`;
                   domElements.storageMeterUsed.parentElement.setAttribute('aria-valuenow', Math.min(100, (itemCount / 5000) * 100));
                }
            };
            countRequest.onerror = (err) => {
                domElements.storageUsedSpan.textContent = `Error counting items`;
                logPopupEntry('WARN', 'Error counting items in IndexedDB for storage usage', { error: err.target.error });
            };
        };
        openRequest.onerror = (err) => {
            domElements.storageUsedSpan.textContent = `DB Error`;
            logPopupEntry('WARN', 'Error opening IndexedDB for storage usage', { error: err.target.error });
        };
    } catch(err) {
        domElements.storageUsedSpan.textContent = `Error`;
        logPopupEntry('ERROR', 'Exception calculating storage usage', { error: err });
    }
}


async function loadSavedMediaData() {
  return new Promise(async (resolve, reject) => {
    try {
      const dbOpenReq = indexedDB.open('XMediaGalleryDB');
      dbOpenReq.onsuccess = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('mediaItems')) {
          logPopupEntry('WARN', "Media items store not found in popup.");
          savedMediaData = [];
          requestAnimationFrame(() => {
            updateStatsDisplay();
            updateRecentMedia();
            updateGalleryDisplay();
            updateAuthorsDisplay();
            updateAuthorFilterOptions();
            updateCollectionFilterOptionsPopup();
          });
          resolve();
          return;
        }
        const transaction = db.transaction('mediaItems', 'readonly');
        const store = transaction.objectStore('mediaItems');
        const request = store.getAll();
        request.onsuccess = () => {
          savedMediaData = request.result || [];
          savedMediaData = savedMediaData.map(item => ({
            ...item,
            type: item.type || (item.url && (item.url.includes('video') || (item.thumbnailUrl && item.thumbnailUrl.includes('video'))) ? 'video' : 'image'),
            favorite: item.favorite === undefined ? false : item.favorite,
            isGif: typeof item.isGif === 'boolean' ? item.isGif : (item.type === 'video' && typeof item.url === 'string' && item.url && (item.url.includes('/tweet_video/') || item.url.toLowerCase().includes('.gif'))),
            localDataUrl: item.localDataUrl || null,
            originalRemoteUrl: item.originalRemoteUrl || (typeof item.url === 'string' && !item.url.startsWith('data:') && !item.url.startsWith('blob:') ? item.url : null)
          }));
          requestAnimationFrame(() => {
            updateStatsDisplay();
            updateRecentMedia();
            updateGalleryDisplay();
            updateAuthorsDisplay();
            updateCollectionFilterOptionsPopup();
          });
          resolve();
        };
        request.onerror = (e) => {
          logPopupEntry('ERROR', 'Error loading media from DB for popup', { error: e.target.error });
          reject(e.target.error);
        };
      };
      dbOpenReq.onerror = (event) => {
        logPopupEntry('ERROR', 'Failed to open DB for popup media', { error: event.target.error });
        reject(event.target.error);
      };
    } catch (error) {
      logPopupEntry('ERROR', 'Exception opening DB for popup media', { error: error });
      reject(error);
    }
  });
}

function updateStatsDisplay() {
    domElements.totalMedia.textContent = savedMediaData.length;
    domElements.imageCount.textContent = savedMediaData.filter(item => item.type === 'image').length;
    domElements.videoCount.textContent = savedMediaData.filter(item => item.type === 'video').length;
    domElements.totalAuthors.textContent = new Set(savedMediaData.map(item => item.author).filter(author => typeof author === 'string' && author.trim() !== '')).size;
    const today = new Date().setHours(0, 0, 0, 0);
    domElements.todayMedia.textContent = savedMediaData.filter(item => new Date(item.date).setHours(0, 0, 0, 0) === today).length;
}

function updateRecentMedia() {
    const container = domElements.recentMediaContainer;
    if (!container) return;

    Array.from(container.children).forEach(childPreviewElement => {
        const mediaElement = childPreviewElement.querySelector('img, video');
        if (mediaElement) {
            if (mediaElement.dataset.activeObjectURL?.startsWith('blob:')) {
                URL.revokeObjectURL(mediaElement.dataset.activeObjectURL);
                mediaElement.dataset.activeObjectURL = '';
            }
            if (mediaElement.dataset.posterObjectURL?.startsWith('blob:')) {
                URL.revokeObjectURL(mediaElement.dataset.posterObjectURL);
                mediaElement.dataset.posterObjectURL = '';
            }
        }
    });

    const scrollY = container.scrollTop;
    container.innerHTML = '';

    const sortedMedia = [...savedMediaData].sort((a, b) => new Date(b.date) - new Date(a.date));

    const uniqueAuthorMediaItems = [];
    const authorsShown = new Set();
    const maxRecentItems = 3;

    for (const item of sortedMedia) {
        if (uniqueAuthorMediaItems.length >= maxRecentItems) break;
        if (item.author && typeof item.author === 'string' && item.author.trim() !== '' && !authorsShown.has(item.author)) {
            if (item.type === 'image' || (item.type === 'video' && (item.isGif || item.thumbnailUrl || item.localDataUrl))) {
                 uniqueAuthorMediaItems.push(item);
                 authorsShown.add(item.author);
            }
        }
    }

    if (uniqueAuthorMediaItems.length < maxRecentItems) {
        let i = 0;
        const currentIds = new Set(uniqueAuthorMediaItems.map(item => item.id));
        while (uniqueAuthorMediaItems.length < maxRecentItems && i < sortedMedia.length) {
            const item = sortedMedia[i];
            if (!currentIds.has(item.id)) {
                 if (item.type === 'image' || (item.type === 'video' && (item.isGif || item.thumbnailUrl || item.localDataUrl))) {
                    uniqueAuthorMediaItems.push(item);
                    currentIds.add(item.id);
                 }
            }
            i++;
        }
    }
    const finalDisplayItems = uniqueAuthorMediaItems.slice(0, maxRecentItems);

    if (finalDisplayItems.length === 0) {
        container.innerHTML = '<div class="no-media-message">No media saved yet.</div>';
    } else {
        const fragment = document.createDocumentFragment();
        finalDisplayItems.forEach(item => {
            const previewNode = createMediaPreview(item);
            if (previewNode) fragment.appendChild(previewNode);
        });
        container.appendChild(fragment);
    }
    container.scrollTop = scrollY;
}

function setAndHandleMediaPreviewPopup(mediaElement, sourcesToTry, mediaData, placeholderSvg) {
    const parent = mediaElement.parentNode;
    if (mediaElement.dataset.activeObjectURL && mediaElement.dataset.activeObjectURL.startsWith('blob:')) {
        URL.revokeObjectURL(mediaElement.dataset.activeObjectURL);
    }
    mediaElement.dataset.activeObjectURL = '';

    if (mediaElement.tagName === 'VIDEO' && mediaElement.dataset.posterObjectURL && mediaElement.dataset.posterObjectURL.startsWith('blob:')) {
        URL.revokeObjectURL(mediaElement.dataset.posterObjectURL);
        mediaElement.dataset.posterObjectURL = '';
    }

    const originalOnError = mediaElement.onerror;
    const originalOnLoad = mediaElement.onload;
    const originalOnLoadedData = mediaElement.onloadeddata;

    const cleanupListeners = () => {
        mediaElement.onload = originalOnLoad;
        mediaElement.onerror = originalOnError;
        mediaElement.onloadeddata = originalOnLoadedData;
    };

    const attemptLoad = (sources) => {
        if (sources.length === 0) {
            cleanupListeners();
            if (mediaElement.tagName === 'VIDEO' && mediaData.thumbnailUrl &&
                (typeof mediaData.thumbnailUrl === 'string' && (mediaData.thumbnailUrl.startsWith('data:image') || /\.(jpe?g|png|webp|gif)$/i.test(mediaData.thumbnailUrl)))) {
                if (parent && parent.contains(mediaElement)) {
                    const imgPlaceholder = document.createElement('img');
                    imgPlaceholder.alt = mediaData.alt || "Video thumbnail";
                    imgPlaceholder.style.width = "100%";
                    imgPlaceholder.style.height = "100%";
                    imgPlaceholder.style.objectFit = "cover";
                    imgPlaceholder.src = mediaData.thumbnailUrl;
                    imgPlaceholder.onerror = () => { imgPlaceholder.src = VIDEO_UNPLAYABLE_ICON_SVG_POPUP; imgPlaceholder.style.objectFit = "contain"; };
                    parent.replaceChild(imgPlaceholder, mediaElement);
                } else {
                     logPopupEntry('DEBUG', 'MediaElement parent not found or mediaElement already replaced (Popup attemptLoad video thumbnail fallback).', { additionalDetails: { mediaId: mediaData.id } });
                    mediaElement.src = VIDEO_UNPLAYABLE_ICON_SVG_POPUP;
                }
            } else {
                mediaElement.src = placeholderSvg;
                if (mediaElement.tagName === 'IMG' || (mediaElement.tagName === 'VIDEO' && (!parent || !parent.contains(mediaElement)))) {
                    mediaElement.style.objectFit = "contain";
                } else if (mediaElement.tagName === 'VIDEO') {
                     if (parent && parent.contains(mediaElement)) {
                        const imgPlaceholder = document.createElement('img');
                        imgPlaceholder.src = VIDEO_UNPLAYABLE_ICON_SVG_POPUP;
                        imgPlaceholder.alt = "Video unplayable";
                        imgPlaceholder.style.width = "100%";
                        imgPlaceholder.style.height = "100%";
                        imgPlaceholder.style.objectFit = "contain";
                        parent.replaceChild(imgPlaceholder, mediaElement);
                    }
                }
            }
            return;
        }

        const currentSource = sources[0];
        const remainingSources = sources.slice(1);
        let objectUrlForThisSrcAttempt = null;

        if (currentSource instanceof Blob) {
            objectUrlForThisSrcAttempt = URL.createObjectURL(currentSource);
            mediaElement.src = objectUrlForThisSrcAttempt;
            mediaElement.dataset.activeObjectURL = objectUrlForThisSrcAttempt;
        } else if (typeof currentSource === 'string') {
            mediaElement.src = currentSource;
        } else {
            logPopupEntry('WARN', `Skipping invalid source type for popup preview ${mediaData.id}: type ${typeof currentSource}`, { additionalDetails: {mediaId: mediaData.id}});
            attemptLoad(remainingSources);
            return;
        }

        const handleLoadSuccess = () => {
            cleanupListeners();
            if (mediaElement.tagName === 'VIDEO') mediaElement.currentTime = 0.01;
        };

        const handleError = (e) => {
            cleanupListeners();
            const failedSrcType = currentSource instanceof Blob ? `Blob (${currentSource.type}, ${currentSource.size}b)` : `String URL (${String(currentSource).substring(0,60)}...)`;

            const mediaError = e.target?.error;
            const errorDetailsForLog = {
                mediaId: mediaData.id,
                eventType: e.type,
                failedSrcDisplay: failedSrcType,
                mediaErrorCode: mediaError?.code,
                mediaErrorMessage: mediaError?.message
            };

            const isGenericImgError = (mediaElement.tagName === 'IMG' && !mediaError);
            logPopupEntry(isGenericImgError ? 'DEBUG' : 'WARN', `Popup ${mediaElement.tagName} thumbnail error for ${mediaData.id}, source: ${failedSrcType}`, {
                error: mediaError ? new Error(`Media Error (Popup Preview): ${mediaError.message} (Code: ${mediaError.code})`) : new Error('Unknown media preview error'),
                additionalDetails: errorDetailsForLog
            });

            if (objectUrlForThisSrcAttempt) { URL.revokeObjectURL(objectUrlForThisSrcAttempt); mediaElement.dataset.activeObjectURL = ''; }
            attemptLoad(remainingSources);
        };

        if (mediaElement.tagName === 'IMG') {
            mediaElement.onload = handleLoadSuccess;
            mediaElement.onerror = handleError;
        } else if (mediaElement.tagName === 'VIDEO') {
            mediaElement.onloadeddata = handleLoadSuccess;
            mediaElement.onerror = handleError;
            if (mediaElement.src.startsWith('blob:')) {
                 if(mediaElement.readyState < HTMLMediaElement.HAVE_METADATA) mediaElement.load();
            }
        }
    };
    attemptLoad(sourcesToTry);
}


function createMediaPreview(mediaData) {
  const template = domElements.mediaPreviewTemplate;
  if (!template || !template.content || !template.content.firstElementChild) {
    logPopupEntry('ERROR', "Media preview template, its content, or root element is invalid!");
    const errorDiv = document.createElement('div');
    errorDiv.textContent = "Template Error"; errorDiv.style.color = "red";
    return errorDiv;
  }

  const previewElement = template.content.firstElementChild.cloneNode(true);

  const imageContainer = previewElement.querySelector('.image-container');
  const imageInfoElement = previewElement.querySelector('.image-info');
  const actionsWrapper = previewElement.querySelector('.image-actions-popup');

  if (!imageContainer || !imageInfoElement || !actionsWrapper) {
    logPopupEntry('ERROR', "Essential elements missing in cloned media preview template!", {
        additionalDetails: {
            mediaId: mediaData.id,
            hasImageContainer: !!imageContainer,
            hasImageInfo: !!imageInfoElement,
            hasActionsWrapper: !!actionsWrapper,
            templateRootTag: previewElement.tagName,
            templateRootClasses: previewElement.className
        }
    });
    const errorDiv = document.createElement('div');
    errorDiv.textContent = "Preview Structure Error"; errorDiv.style.color = "red";
    errorDiv.title = `Missing: ${!imageContainer ? '.image-container ' : ''}${!imageInfoElement ? '.image-info ' : ''}${!actionsWrapper ? '.image-actions-popup' : ''}`;
    return errorDiv;
  }

  imageContainer.innerHTML = '';
  imageInfoElement.innerHTML = '';

  const isVideo = mediaData.type === 'video';
  const isGif = mediaData.isGif === true;

  let mediaElement;
  let placeholderForType;
  let sourcesToTry = [];

  if (previewElement.dataset.posterObjectURL && previewElement.dataset.posterObjectURL.startsWith('blob:')) {
    URL.revokeObjectURL(previewElement.dataset.posterObjectURL);
  }
  previewElement.dataset.posterObjectURL = '';

  if (isGif) {
      let preferredStaticThumbnail = null;
      if (mediaData.thumbnailUrl && (typeof mediaData.thumbnailUrl === 'string' && (mediaData.thumbnailUrl.startsWith('data:image/') || /\.(jpe?g|png|webp)$/i.test(mediaData.thumbnailUrl)))) {
          preferredStaticThumbnail = mediaData.thumbnailUrl;
      } else if (mediaData.localDataUrl && (typeof mediaData.localDataUrl === 'string' && mediaData.localDataUrl.startsWith('data:image/'))) {
           preferredStaticThumbnail = mediaData.localDataUrl;
      } else if (mediaData.url && (typeof mediaData.url === 'string' && mediaData.url.startsWith('data:image/'))) {
          preferredStaticThumbnail = mediaData.url;
      }

      if (preferredStaticThumbnail) {
          mediaElement = document.createElement('img');
          placeholderForType = IMAGE_ERROR_ICON_SVG_POPUP;
          mediaElement.alt = `GIF by ${mediaData.author}`;
          sourcesToTry.push(preferredStaticThumbnail);
      } else {
          mediaElement = document.createElement('video');
          Object.assign(mediaElement, { muted: true, playsinline: true, loop: true, autoplay: true, preload: "metadata", style: "pointer-events:none;"});
          placeholderForType = VIDEO_UNPLAYABLE_ICON_SVG_POPUP;
          mediaElement.alt = `GIF (video format) by ${mediaData.author}`;
          if (mediaData.localDataUrl && mediaData.localDataUrl instanceof Blob) sourcesToTry.push(mediaData.localDataUrl);
      }
  } else if (isVideo) {
      // Force static thumbnail preview for videos to avoid playback/format errors in popup
      if (mediaData.thumbnailUrl) {
          mediaElement = document.createElement('img');
          mediaElement.alt = `Video thumbnail by ${mediaData.author}`;
          placeholderForType = VIDEO_THUMBNAIL_ONLY_ICON_SVG_POPUP;
          if (mediaData.thumbnailUrl instanceof Blob) {
              sourcesToTry.push(mediaData.thumbnailUrl);
          } else if (typeof mediaData.thumbnailUrl === 'string') {
              sourcesToTry.push(mediaData.thumbnailUrl);
          }
      } else {
          // Fallback: create IMG using any available image-like source, else placeholder
          mediaElement = document.createElement('img');
          mediaElement.alt = `Video (no thumbnail) by ${mediaData.author}`;
          placeholderForType = VIDEO_UNPLAYABLE_ICON_SVG_POPUP;
          if (mediaData.localDataUrl && typeof mediaData.localDataUrl === 'string' && mediaData.localDataUrl.startsWith('data:image/')) {
              sourcesToTry.push(mediaData.localDataUrl);
          } else if (typeof mediaData.url === 'string' && mediaData.url.startsWith('data:image/')) {
              sourcesToTry.push(mediaData.url);
          }
      }
  } else { // Image
      mediaElement = document.createElement('img');
      placeholderForType = IMAGE_ERROR_ICON_SVG_POPUP;
      mediaElement.alt = `Image by ${mediaData.author}`;
      if (mediaData.localDataUrl && mediaData.localDataUrl instanceof Blob) {
           sourcesToTry.push(mediaData.localDataUrl);
      }
  }

  // Add other potential sources, ensuring localDataUrl (if Blob) is prioritized
  if (mediaData.localDataUrl && typeof mediaData.localDataUrl === 'string' && mediaData.localDataUrl.startsWith('data:image') && !sourcesToTry.includes(mediaData.localDataUrl) && mediaElement.tagName === 'IMG') {
    sourcesToTry.push(mediaData.localDataUrl);
  }
  [mediaData.url, mediaData.thumbnailUrl, mediaData.originalRemoteUrl].forEach(srcCandidate => {
      if (srcCandidate && !sourcesToTry.includes(srcCandidate)) {
          const isStringSrc = typeof srcCandidate === 'string';
          if (mediaElement.tagName === 'IMG' && (srcCandidate instanceof Blob || (isStringSrc && (srcCandidate.startsWith('data:image/') || /\.(gif|jpe?g|png|webp)$/i.test(srcCandidate))))) {
              sourcesToTry.push(srcCandidate);
          } else if (mediaElement.tagName === 'VIDEO' && (srcCandidate instanceof Blob || (isStringSrc && /\.(mp4|webm|mov|ogv|gif)$/i.test(srcCandidate)))) {
              sourcesToTry.push(srcCandidate);
          }
      }
  });


  if (isVideo && mediaData.thumbnailUrl && !isGif) {
      if (mediaData.thumbnailUrl instanceof Blob) {
          const posterObjectUrl = URL.createObjectURL(mediaData.thumbnailUrl);
          mediaElement.poster = posterObjectUrl;
          mediaElement.dataset.posterObjectURL = posterObjectUrl;
      } else if (typeof mediaData.thumbnailUrl === 'string') {
          mediaElement.poster = mediaData.thumbnailUrl;
      }
  }

  mediaElement.style.width = "100%"; mediaElement.style.height = "100%"; mediaElement.style.objectFit = "cover";
  if (mediaElement.tagName === 'IMG') {
    mediaElement.crossOrigin = 'anonymous';
    mediaElement.referrerPolicy = 'no-referrer';
  }
  imageContainer.appendChild(mediaElement);
  sourcesToTry = sourcesToTry.filter(s => s);
  schedulePopupPreview(mediaElement, sourcesToTry, mediaData, placeholderForType);

  const itemFavoriteBtn = document.createElement('button');
  itemFavoriteBtn.type = 'button'; itemFavoriteBtn.className = 'favorite-btn';
  itemFavoriteBtn.innerHTML = `<svg class="star-icon" viewBox="0 0 24 24"><path d="${STAR_SVG_PATH_POPUP}"></path></svg>`;
  updateFavoriteButtonUIPopup(itemFavoriteBtn, mediaData.favorite);
  itemFavoriteBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); toggleFavorite(mediaData.id, itemFavoriteBtn); });
  imageContainer.appendChild(itemFavoriteBtn);

  if (isVideo && !isGif) {
    imageContainer.classList.add('video-container');
    imageContainer.insertAdjacentHTML('beforeend', `<div class="video-indicator"><span>▶</span></div>`);
    if (mediaData.duration) imageContainer.insertAdjacentHTML('beforeend', `<div class="video-duration">${formatDuration(mediaData.duration)}</div>`);
  }
  if (isGif) imageContainer.insertAdjacentHTML('beforeend', `<div class="gif-indicator">GIF</div>`);

  const authorDetailsDiv = document.createElement('div');
  authorDetailsDiv.className = 'popup-author-details';
  authorDetailsDiv.innerHTML = `<span class="image-author">${mediaData.author || 'Unknown'}</span>`;

  const authorFavoriteBtn = document.createElement('button');
  authorFavoriteBtn.type = 'button'; authorFavoriteBtn.className = 'popup-media-author-favorite-btn';
  authorFavoriteBtn.innerHTML = `<svg class="star-icon" viewBox="0 0 24 24"><path d="${STAR_SVG_PATH_POPUP}"></path></svg>`;
  updateAuthorFavoriteButtonState(authorFavoriteBtn, mediaData.author);
  authorFavoriteBtn.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); toggleAuthorFavorite(mediaData.author, authorFavoriteBtn); });
  authorDetailsDiv.appendChild(authorFavoriteBtn);
  imageInfoElement.appendChild(authorDetailsDiv);
  imageInfoElement.insertAdjacentHTML('beforeend', `<span class="image-date">${formatDate(mediaData.date)}</span>`);

  actionsWrapper.innerHTML = '';
  const addToCollectionBtnPopup = document.createElement('button');
  addToCollectionBtnPopup.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="${FOLDER_PLUS_SVG_PATH_POPUP}"></path></svg>`;
  addToCollectionBtnPopup.title = "Add to/remove from collections";
  addToCollectionBtnPopup.classList.add('add-to-collection-popup-btn');
  addToCollectionBtnPopup.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); openManageCollectionsModalPopup(mediaData); });
  actionsWrapper.appendChild(addToCollectionBtnPopup);

  const deleteBtn = document.createElement('button');
  deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="${TRASH_SVG_PATH_POPUP}"></path></svg>`;
  deleteBtn.title = "Delete media"; deleteBtn.classList.add('delete-button');
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation(); e.preventDefault();
    if (confirm('Are you sure you want to delete this media?')) {
      previewElement.classList.add('deleting');
      chrome.runtime.sendMessage({ action: 'deleteMedia', mediaId: mediaData.id }, (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          const errorMsg = chrome.runtime.lastError ? chrome.runtime.lastError.message : (response ? response.error : "Unknown error");
          logPopupEntry('ERROR', `Delete media message error for ${mediaData.id}`, { additionalDetails: { message: errorMsg } });
          showNotification("Error deleting media: " + errorMsg, "error");
          previewElement.classList.remove('deleting');
          return;
        }
        showNotification('Media deleted successfully', 'success');
      });
    }
  });
  actionsWrapper.appendChild(deleteBtn);
  imageContainer.appendChild(actionsWrapper);

  previewElement.dataset.mediaId = mediaData.id;
  previewElement.dataset.author = mediaData.author;
  previewElement.addEventListener('click', (e) => {
    if (e.target.closest('.favorite-btn, .popup-media-author-favorite-btn, .add-to-collection-popup-btn, .delete-button')) return;
    const galleryUrl = new URL(chrome.runtime.getURL('gallery.html'));
    galleryUrl.searchParams.set('author', mediaData.author);
    galleryUrl.searchParams.set('type', isGif ? 'gif' : mediaData.type);
    window.open(galleryUrl.toString(), '_blank');
  });

  return previewElement;
}

function updateGalleryDisplay() {
    const grid = domElements.galleryGrid;
    if (!grid) return;

    Array.from(grid.children).forEach(childPreviewElement => {
        const mediaElement = childPreviewElement.querySelector('img, video');
        if (mediaElement) {
            if (mediaElement.dataset.activeObjectURL?.startsWith('blob:')) {
                URL.revokeObjectURL(mediaElement.dataset.activeObjectURL);
                mediaElement.dataset.activeObjectURL = '';
            }
            if (mediaElement.dataset.posterObjectURL?.startsWith('blob:')) {
                URL.revokeObjectURL(mediaElement.dataset.posterObjectURL);
                mediaElement.dataset.posterObjectURL = '';
            }
        }
    });

    grid.innerHTML = '';
    const filteredMedia = getFilteredMedia();
    const startIndex = (currentPage - 1) * imagesPerPage;
    const endIndex = Math.min(startIndex + imagesPerPage, filteredMedia.length);
    const paginatedMedia = filteredMedia.slice(startIndex, endIndex);

    if (paginatedMedia.length === 0) {
        grid.innerHTML = '<div class="no-media-message">No media found for current filters.</div>';
    } else {
        const fragment = document.createDocumentFragment();
        paginatedMedia.forEach(item => {
            const previewNode = createMediaPreview(item);
            if (previewNode) fragment.appendChild(previewNode);
        });
        grid.appendChild(fragment);
    }
    domElements.galleryPageInfo.textContent = `Page ${currentPage}`;
    domElements.galleryPrevBtn.disabled = currentPage === 1;
    domElements.galleryNextBtn.disabled = endIndex >= filteredMedia.length;
    updateAuthorFilterOptions();
}

function getFilteredMedia() {
    let filtered = [...savedMediaData];
    if (currentAuthor !== 'all') {
        filtered = filtered.filter(item => item.author === currentAuthor);
    }
    if (currentCollectionFilterPopup !== 'all') {
        const collection = collectionsListPopup.find(c => c.id.toString() === currentCollectionFilterPopup);
        if (collection) {
            const mediaIdsInCollection = new Set(collection.mediaIds);
            filtered = filtered.filter(item => mediaIdsInCollection.has(item.id));
        }
    }
    if (currentType === 'favorites') {
        filtered = filtered.filter(item => item.favorite === true);
    } else if (currentType === 'gif') {
        filtered = filtered.filter(item => item.type === 'video' && item.isGif === true);
    } else if (currentType !== 'all') {
        filtered = filtered.filter(item => item.type === currentType);
    }

    const sortFunctions = {
        'newest': (a,b) => new Date(b.date) - new Date(a.date),
        'oldest': (a,b) => new Date(a.date) - new Date(b.date),
        'author_az': (a,b) => (a.author || '').toLowerCase().localeCompare((b.author || '').toLowerCase()) || (new Date(b.date) - new Date(a.date)),
        'author_za': (a,b) => (b.author || '').toLowerCase().localeCompare((a.author || '').toLowerCase()) || (new Date(b.date) - new Date(a.date)),
        'random': () => 0.5 - Math.random()
    };

    if (sortFunctions[currentSort]) {
        filtered.sort(sortFunctions[currentSort]);
    }
    return filtered;
}

function changeGalleryFilter() {
    currentAuthor = domElements.galleryFilterAuthor.value;
    currentPage = 1;
    updateGalleryDisplay();
}

function changeGalleryCollectionFilterPopup() {
    const selectedValue = domElements.galleryFilterCollection.value;
    if (selectedValue === '_find_manage_collections_') {
        openCollectionsHubModal();
        domElements.galleryFilterCollection.value = currentCollectionFilterPopup;
        return;
    }
    currentCollectionFilterPopup = selectedValue;
    currentPage = 1;
    updateGalleryDisplay();
}

function changeGallerySort() {
    currentSort = domElements.gallerySort.value;
    currentPage = 1;
    updateGalleryDisplay();
}

function changeGalleryType() {
    currentType = domElements.galleryFilterType.value;
    currentPage = 1;
    updateGalleryDisplay();
}

function previousGalleryPage() {
    if (currentPage > 1) {
        currentPage--;
        updateGalleryDisplay();
    }
}

function nextGalleryPage() {
    const filteredMedia = getFilteredMedia();
    const totalPages = Math.ceil(filteredMedia.length / imagesPerPage);
    if (currentPage < totalPages) {
        currentPage++;
        updateGalleryDisplay();
    }
}

function updateAuthorsDisplay() {
    const authorsListContainer = domElements.authorsListContainer;
    if (!authorsListContainer) return;
    const scrollY = authorsListContainer.scrollTop;
    authorsListContainer.innerHTML = '';

    const authorData = {};
    savedMediaData.forEach(item => {
        if (typeof item.author !== 'string' || item.author.trim() === '') return;
        if (!authorData[item.author]) {
            authorData[item.author] = { count: 0, recent: [], isFavorite: favoriteAuthorsList.includes(item.author) };
        }
        authorData[item.author].count++;
        authorData[item.author].recent.push(item);
    });

    let sortedAuthors = Object.entries(authorData).map(([name, data]) => ({ name, ...data }));
    const authorSortType = domElements.authorSort.value;

    const sortMap = {
        'most': (a,b) => b.count - a.count || a.name.localeCompare(b.name),
        'fewest': (a,b) => a.count - b.count || a.name.localeCompare(b.name),
        'az': (a,b) => a.name.localeCompare(b.name),
        'favorites_first': (a,b) => (b.isFavorite - a.isFavorite) || (b.count - a.count) || a.name.localeCompare(b.name),
        'random_sort': () => 0.5 - Math.random()
    };
    if (sortMap[authorSortType]) sortedAuthors.sort(sortMap[authorSortType]);


    const searchQuery = domElements.authorSearch.value.toLowerCase();
    const authorTemplate = domElements.authorTemplate;

    if (sortedAuthors.length === 0) {
        authorsListContainer.innerHTML = '<div class="no-media-message">No authors found.</div>';
    } else {
       const fragment = document.createDocumentFragment();
       sortedAuthors.forEach(author => {
            if (!author.name.toLowerCase().includes(searchQuery)) return;

            const authorClone = authorTemplate.content.cloneNode(true);
            const authorItem = authorClone.querySelector('.author-item');
            const authorNameSpan = authorClone.querySelector('.author-name');
            authorNameSpan.textContent = author.name;
            authorClone.querySelector('.author-count').textContent = `${author.count} media`;

            const authorImagesContainer = authorClone.querySelector('.author-images');
            const imageFragment = document.createDocumentFragment();
            author.recent.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 3).forEach(item => {
                const previewNode = createMediaPreview(item);
                if (previewNode) {
                    if (previewNode.style) previewNode.style.cursor = 'default';
                    previewNode.onclick = (e) => e.stopPropagation();
                    imageFragment.appendChild(previewNode);
                } else {
                     logPopupEntry('WARN', "Could not find .image-preview in fragment for author media", { additionalDetails: { item } });
                }
            });
            authorImagesContainer.appendChild(imageFragment);

            const authorHeader = authorClone.querySelector('.author-header');
            const toggleButton = authorClone.querySelector('.toggle-button');
            const authorPreviewDiv = authorClone.querySelector('.author-preview');
            authorHeader.addEventListener('click', () => {
                authorPreviewDiv.classList.toggle('hidden');
                toggleButton.textContent = authorPreviewDiv.classList.contains('hidden') ? '▼' : '▲';
                authorHeader.setAttribute('aria-expanded', !authorPreviewDiv.classList.contains('hidden'));
            });

            authorClone.querySelector('.view-all-button').addEventListener('click', () => {
                currentAuthor = author.name;
                domElements.galleryFilterAuthor.value = author.name;
                domElements.tabButtons[1].click(); // Click gallery tab button
                updateGalleryDisplay();
            });

            const authorNameWrapper = authorClone.querySelector('.author-name-wrapper');
            const authorFavoriteBtn = document.createElement('button');
            authorFavoriteBtn.type = 'button';
            authorFavoriteBtn.className = 'author-favorite-btn';
            authorFavoriteBtn.innerHTML = `<svg class="star-icon" viewBox="0 0 24 24"><path d="${STAR_SVG_PATH_POPUP}"></path></svg>`;
            updateAuthorFavoriteButtonState(authorFavoriteBtn, author.name);
            authorFavoriteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleAuthorFavorite(author.name, authorFavoriteBtn); });
            authorNameWrapper.insertBefore(authorFavoriteBtn, authorNameSpan);

            fragment.appendChild(authorClone);
        });
        authorsListContainer.appendChild(fragment);
    }

    if (authorsListContainer.children.length === 0 && sortedAuthors.length > 0 && searchQuery) {
         authorsListContainer.innerHTML = '<div class="no-media-message">No authors match your search.</div>';
    }

    authorsListContainer.scrollTop = scrollY;
    updateAuthorFilterOptions();
}

function searchAuthors() {
    updateAuthorsDisplay();
}

function updateAuthorFilterOptions() {
    const authorSelect = domElements.galleryFilterAuthor;
    if (!authorSelect) return;

    const currentSelectedValue = authorSelect.value;
    authorSelect.innerHTML = '<option value="all">All Authors</option>';

    const validAuthors = savedMediaData
        .map(item => item.author)
        .filter(author => typeof author === 'string' && author.trim() !== '');

    if (validAuthors.length === 0) {
        if (authorSelect.options.length > 0) authorSelect.value = 'all';
        currentAuthor = 'all';
        return;
    }

    const allAuthorsSet = new Set(validAuthors);
    const sortedAllAuthors = Array.from(allAuthorsSet).sort((a, b) =>
        a.toLowerCase().localeCompare(b.toLowerCase())
    );

    const validFavoriteAuthors = favoriteAuthorsList
        .filter(favAuthor => typeof favAuthor === 'string' && allAuthorsSet.has(favAuthor))
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const otherAuthorsGroup = sortedAllAuthors.filter(author =>
        !validFavoriteAuthors.includes(author)
    );
    const fragment = document.createDocumentFragment();

    if (validFavoriteAuthors.length > 0) {
        const favOptgroup = document.createElement('optgroup');
        favOptgroup.label = '⭐ Favorite Authors';
        validFavoriteAuthors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            favOptgroup.appendChild(option);
        });
        fragment.appendChild(favOptgroup);
    }

    if (otherAuthorsGroup.length > 0) {
        const otherOptgroupLabel = validFavoriteAuthors.length > 0 ? 'Other Authors' : (allAuthorsSet.size > 0 ? 'Authors' : 'All Authors');
        const otherOptgroup = document.createElement('optgroup');
        otherOptgroup.label = otherOptgroupLabel;
        otherAuthorsGroup.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            otherOptgroup.appendChild(option);
        });
        fragment.appendChild(otherOptgroup);
    }
    authorSelect.appendChild(fragment);

    let valueToSet = 'all';
    if (currentSelectedValue && Array.from(authorSelect.options).some(opt => opt.value === currentSelectedValue)) {
        valueToSet = currentSelectedValue;
    } else if (currentAuthor !== 'all' && Array.from(authorSelect.options).some(opt => opt.value === currentAuthor)) {
        valueToSet = currentAuthor;
    }

    authorSelect.value = valueToSet;
    currentAuthor = authorSelect.value;
}


function openFullGallery() {
    const galleryUrl = new URL(chrome.runtime.getURL('gallery.html'));
    if (currentAuthor !== 'all') galleryUrl.searchParams.set('author', currentAuthor);
    if (currentCollectionFilterPopup !== 'all') galleryUrl.searchParams.set('collection', currentCollectionFilterPopup);
    if (currentType !== 'all') galleryUrl.searchParams.set('type', currentType);
    if (currentSort !== 'newest') galleryUrl.searchParams.set('sort', currentSort);
    window.open(galleryUrl.toString(), '_blank');
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();
    return `${day} ${month} ${year}`;
}

function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return '';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.notification');
    if(existingNotification) existingNotification.remove();

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);
    requestAnimationFrame(() => {
      notification.classList.add('show');
    });
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
          if (notification.parentNode) {
            notification.remove();
          }
        }, 300);
    }, 2000);
}


async function loadCollectionsPopup() {
    return new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'getCollections' }, (response) => {
            if (chrome.runtime.lastError) {
                logPopupEntry('ERROR', 'Error loading collections for popup', { error: chrome.runtime.lastError });
                collectionsListPopup = [];
                reject(chrome.runtime.lastError);
            } else if (response && response.success) {
                collectionsListPopup = response.collections || [];
                resolve();
            } else {
                logPopupEntry('ERROR', 'Failed to load collections for popup', { additionalDetails: {error: response ? response.error : "Unknown error"}});
                collectionsListPopup = [];
                reject(response ? response.error : 'Unknown error');
            }
        });
    });
}

function updateCollectionFilterOptionsPopup() {
    const collectionSelect = domElements.galleryFilterCollection;
    if (!collectionSelect) return;
    const currentSelectedValue = collectionSelect.value;
    collectionSelect.innerHTML = '<option value="all">All Collections</option>';
    const fragment = document.createDocumentFragment();

    collectionsListPopup.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
    collectionsListPopup.forEach(collection => {
        const option = document.createElement('option');
        option.value = collection.id.toString();
        option.textContent = `${collection.name} (${collection.mediaIds.length})`;
        fragment.appendChild(option);
    });
    collectionSelect.appendChild(fragment);

    const findManageOption = document.createElement('option');
    findManageOption.value = "_find_manage_collections_";
    findManageOption.textContent = "🔍 Find / Manage Collections...";
    collectionSelect.appendChild(findManageOption);

    if (Array.from(collectionSelect.options).some(opt => opt.value === currentSelectedValue)) {
        collectionSelect.value = currentSelectedValue;
    } else {
        collectionSelect.value = 'all';
        currentCollectionFilterPopup = 'all';
    }
}

// Item-specific Collections Modal
let currentMediaItemForModalPopup = null;
function openManageCollectionsModalPopup(item) {
    currentMediaItemForModalPopup = item;
    const modal = domElements.manageCollectionsModalPopup;
    const title = domElements.manageCollectionsModalPopupTitle;
    const mediaIdDisplay = domElements.manageCollectionsMediaIdPopup;
    const previewContainer = domElements.manageCollectionsPreviewContainerPopup;
    const searchInput = domElements.manageCollectionsSearchInputPopup;
    const newNameInput = domElements.newCollectionNameModalInputPopup;

    title.textContent = "Add Item to Collections";
    if (mediaIdDisplay) {
        const displayId = item.id.length > 20 ? item.id.substring(0, 17) + '...' : item.id;
        mediaIdDisplay.textContent = `Item: ${displayId}`;
    }
    previewContainer.innerHTML = '';
    const previewImg = document.createElement('img');
    let previewSrcCandidate = item.localDataUrl || item.thumbnailUrl || item.url || IMAGE_ERROR_ICON_SVG_POPUP;
    let tempObjectUrl = null;

    if (previewSrcCandidate instanceof Blob) {
        tempObjectUrl = URL.createObjectURL(previewSrcCandidate);
        previewImg.src = tempObjectUrl;
    } else {
        previewImg.src = previewSrcCandidate;
    }
    previewImg.alt = `Preview of ${item.id}`;

    const cleanupObjectURL = () => {
      if (tempObjectUrl && previewImg.src === tempObjectUrl) {
        URL.revokeObjectURL(tempObjectUrl);
        tempObjectUrl = null;
      }
    };
    if (tempObjectUrl) {
        previewImg.onload = cleanupObjectURL;
        previewImg.onerror = () => { cleanupObjectURL(); previewImg.src = IMAGE_ERROR_ICON_SVG_POPUP; };
    } else {
        previewImg.onerror = () => { previewImg.src = IMAGE_ERROR_ICON_SVG_POPUP; };
    }
    previewContainer.appendChild(previewImg);

    searchInput.value = '';
    newNameInput.value = '';
    populateCollectionsListInModalPopup(item.id);
    modal.classList.add('active');
}

function closeManageCollectionsModalPopup() {
    const modal = domElements.manageCollectionsModalPopup;
    modal.classList.remove('active');
    const previewImg = domElements.manageCollectionsPreviewContainerPopup.querySelector('img');
    if (previewImg && previewImg.src.startsWith('blob:')) {
        URL.revokeObjectURL(previewImg.src);
    }
    currentMediaItemForModalPopup = null;
}

function populateCollectionsListInModalPopup(mediaItemId, searchTerm = '') {
    const listUl = domElements.manageCollectionsListUlPopup;
    const loadingP = domElements.manageCollectionsLoadingPopup;
    const emptyP = domElements.manageCollectionsEmptyPopup;
    listUl.innerHTML = '';
    loadingP.style.display = 'block';
    emptyP.style.display = 'none';

    const filteredCollections = collectionsListPopup.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    if (filteredCollections.length === 0) {
        loadingP.style.display = 'none';
        emptyP.style.display = 'block';
        emptyP.textContent = searchTerm ? 'No collections match search.' : 'No collections. Create one!';
        return;
    }
    loadingP.style.display = 'none';
    const fragment = document.createDocumentFragment();
    filteredCollections.forEach(collection => {
        const li = document.createElement('li');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `popup-coll-checkbox-${collection.id}`;
        checkbox.value = collection.id.toString();
        checkbox.checked = collection.mediaIds.includes(mediaItemId);
        const label = document.createElement('label');
        label.htmlFor = `popup-coll-checkbox-${collection.id}`;
        label.textContent = `${collection.name} (${collection.mediaIds.length})`;
        li.appendChild(checkbox);
        li.appendChild(label);
        fragment.appendChild(li);
    });
    listUl.appendChild(fragment);
}

function handleSearchCollectionsInModalPopup() {
    const searchTerm = domElements.manageCollectionsSearchInputPopup.value;
    if (currentMediaItemForModalPopup) {
        populateCollectionsListInModalPopup(currentMediaItemForModalPopup.id, searchTerm);
    }
}

async function handleCreateAndAddCollectionModalPopup() {
    const nameInput = domElements.newCollectionNameModalInputPopup;
    const name = nameInput.value.trim();
    if (!name) { showNotification('Collection name cannot be empty.', 'error'); return; }
    if (!currentMediaItemForModalPopup) return;

    const createBtn = domElements.createAndAddCollectionModalBtn;
    const originalBtnHTML = createBtn.innerHTML;
    createBtn.disabled = true; createBtn.innerHTML = 'Creating...';

    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'createCollection', name: name }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (res && res.success) resolve(res);
                else reject(new Error(res ? res.error : 'Failed to create collection'));
            });
        });
        const newCollection = response.collection;
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'updateMediaInCollection', collectionId: newCollection.id, mediaId: currentMediaItemForModalPopup.id, shouldBeInCollection: true }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (res && res.success) resolve(res);
                else reject(new Error(res ? res.error : 'Failed to add media to new collection'));
            });
        });
        showNotification(`Collection "${name}" created and item added.`, 'success');
        nameInput.value = '';
        await loadCollectionsPopup();
        populateCollectionsListInModalPopup(currentMediaItemForModalPopup.id, domElements.manageCollectionsSearchInputPopup.value);
        updateCollectionFilterOptionsPopup();
    } catch (error) {
        logPopupEntry('ERROR', 'Error creating/adding collection (Popup Modal)', { error: error, additionalDetails: {name} });
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        createBtn.disabled = false; createBtn.innerHTML = originalBtnHTML;
    }
}

async function handleSaveCollectionChangesModalPopup() {
    if (!currentMediaItemForModalPopup) return;
    const mediaId = currentMediaItemForModalPopup.id;
    const checkboxes = domElements.manageCollectionsListUlPopup.querySelectorAll('input[type="checkbox"]');
    let changesMade = 0;
    const saveBtn = domElements.saveCollectionChangesModalBtn;
    const originalBtnHTML = saveBtn.innerHTML;
    saveBtn.disabled = true; saveBtn.innerHTML = "Saving...";

    const promises = Array.from(checkboxes).map(async checkbox => {
        const collectionId = parseInt(checkbox.value);
        const shouldBeInCollection = checkbox.checked;
        const collection = collectionsListPopup.find(c => c.id === collectionId);
        if (!collection) return;
        const isAlreadyIn = collection.mediaIds.includes(mediaId);
        if ((shouldBeInCollection && !isAlreadyIn) || (!shouldBeInCollection && isAlreadyIn)) {
            try {
                await new Promise((resolve, reject) => {
                    chrome.runtime.sendMessage({ action: 'updateMediaInCollection', collectionId: collectionId, mediaId: mediaId, shouldBeInCollection: shouldBeInCollection }, (res) => {
                        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                        else if (res && res.success) resolve(res);
                        else reject(new Error(res ? res.error : 'Failed to update collection'));
                    });
                });
                changesMade++;
            } catch (error) {
                 logPopupEntry('ERROR', 'Error updating collection membership (Popup Modal)', { error: error, additionalDetails: { collectionId, mediaId } });
                showNotification(`Error updating "${collection.name}": ${error.message}`, 'error');
            }
        }
    });
    await Promise.all(promises);
    saveBtn.disabled = false; saveBtn.innerHTML = originalBtnHTML;
    if (changesMade > 0) {
        showNotification('Collection memberships updated!', 'success');
        await loadCollectionsPopup();
        populateCollectionsListInModalPopup(mediaId, domElements.manageCollectionsSearchInputPopup.value);
        updateCollectionFilterOptionsPopup();
        updateGalleryDisplay();
    }
    closeManageCollectionsModalPopup();
}

// Collections Hub Modal
function openCollectionsHubModal() {
    domElements.collectionsHubSearchInput.value = '';
    populateCollectionsHubList();
    domElements.collectionsHubModal.classList.add('active');
}

function closeCollectionsHubModal() {
    domElements.collectionsHubModal.classList.remove('active');
    hideHubInlineCreateForm();
}

let currentEditingCollectionId = null;
function populateCollectionsHubList(searchTerm = '') {
    const listUl = domElements.collectionsHubListUl;
    const emptyMsg = domElements.collectionsHubEmptyMsg;
    listUl.innerHTML = '';

    const filtered = collectionsListPopup.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
                           .sort((a,b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    if (filtered.length === 0) {
        emptyMsg.textContent = searchTerm ? 'No collections match search.' : 'No collections. Create one!';
        emptyMsg.style.display = 'block';
        return;
    }
    emptyMsg.style.display = 'none';
    const fragment = document.createDocumentFragment();

    filtered.forEach(collection => {
        const li = document.createElement('li');
        li.className = 'collection-hub-item';
        li.dataset.collectionId = collection.id;

        if (currentEditingCollectionId === collection.id) {
            const input = document.createElement('input');
            input.type = 'text';
            input.value = collection.name;
            input.className = 'rename-input-popup-modal';
            input.onclick = (e) => e.stopPropagation(); // Prevent item click
            input.onkeydown = (e) => { if(e.key === 'Enter') handleHubSaveRename(collection.id, input.value); if(e.key === 'Escape') populateCollectionsHubList(domElements.collectionsHubSearchInput.value); }

            const saveBtn = document.createElement('button');
            saveBtn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${CHECK_SVG_PATH}"></path></svg>`;
            saveBtn.className = 'action-button primary-button icon-button';
            saveBtn.title = "Save name";
            saveBtn.onclick = (e) => { e.stopPropagation(); handleHubSaveRename(collection.id, input.value); };

            const cancelBtn = document.createElement('button');
            cancelBtn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${CANCEL_SVG_PATH}"></path></svg>`;
            cancelBtn.className = 'action-button secondary-button icon-button';
            cancelBtn.title = "Cancel edit";
            cancelBtn.onclick = (e) => { e.stopPropagation(); currentEditingCollectionId = null; populateCollectionsHubList(domElements.collectionsHubSearchInput.value); };

            li.appendChild(input);
            li.appendChild(saveBtn);
            li.appendChild(cancelBtn);
            requestAnimationFrame(() => input.focus());
        } else {
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'collection-hub-item-details';
            detailsDiv.innerHTML = `
                <span class="collection-hub-item-name">${collection.name}</span>
                <span class="collection-hub-item-count">(${collection.mediaIds.length})</span>
            `;
            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'collection-hub-item-actions';

            const renameBtn = document.createElement('button');
            renameBtn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${PEN_SVG_PATH_POPUP}"></path></svg>`;
            renameBtn.className = 'action-button secondary-button icon-button';
            renameBtn.title = "Rename collection";
            renameBtn.onclick = (e) => { e.stopPropagation(); currentEditingCollectionId = collection.id; populateCollectionsHubList(domElements.collectionsHubSearchInput.value); };

            const deleteBtn = document.createElement('button');
            deleteBtn.innerHTML = `<svg viewBox="0 0 24 24"><path fill="currentColor" d="${TRASH_SVG_PATH_POPUP}"></path></svg>`;
            deleteBtn.className = 'action-button danger-button icon-button';
            deleteBtn.title = "Delete collection";
            deleteBtn.onclick = (e) => { e.stopPropagation(); handleHubDeleteCollection(collection.id, collection.name); };

            actionsDiv.appendChild(renameBtn);
            actionsDiv.appendChild(deleteBtn);
            li.appendChild(detailsDiv);
            li.appendChild(actionsDiv);

            li.onclick = () => {
                domElements.galleryFilterCollection.value = collection.id.toString();
                changeGalleryCollectionFilterPopup();
                closeCollectionsHubModal();
                domElements.tabButtons[1].click(); // Switch to Gallery tab
            };
        }
        fragment.appendChild(li);
    });
    listUl.appendChild(fragment);
}

async function handleHubSaveRename(collectionId, newName) {
    if (!newName.trim()) { showNotification('Collection name cannot be empty.', 'error'); return; }
   const renameBtn = domElements.collectionsHubListUl.querySelector(`.collection-hub-item[data-collection-id="${collectionId}"] .primary-button`);
    if(renameBtn) {renameBtn.disabled = true; renameBtn.innerHTML = `<svg viewBox="0 0 24 24" class="spin"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"></path></svg>`; }
    try {
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'renameCollection', collectionId, newName }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (res && res.success) resolve(res);
                else reject(new Error(res?.error || 'Failed to rename collection'));
            });
        });
        showNotification('Collection renamed.', 'success');
    } catch (error) {
        logPopupEntry('ERROR', 'Error renaming collection from Hub', { error, additionalDetails: { collectionId, newName } });
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        currentEditingCollectionId = null;
        await loadCollectionsPopup();
        populateCollectionsHubList(domElements.collectionsHubSearchInput.value);
        updateCollectionFilterOptionsPopup();
    }
}

async function handleHubDeleteCollection(collectionId, collectionName) {
    if (!confirm(`Are you sure you want to delete the collection "${collectionName}"? This will not delete the media items themselves.`)) return;
    const deleteBtn = domElements.collectionsHubListUl.querySelector(`.collection-hub-item[data-collection-id="${collectionId}"] .danger-button`);
    if(deleteBtn) {deleteBtn.disabled = true; deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" class="spin"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"></path></svg>`;}

    try {
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ action: 'deleteCollection', collectionId }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (res && res.success) resolve(res);
                else reject(new Error(res?.error || 'Failed to delete collection'));
            });
        });
        showNotification(`Collection "${collectionName}" deleted.`, 'success');
    } catch (error) {
        logPopupEntry('ERROR', 'Error deleting collection from Hub', { error, additionalDetails: { collectionId } });
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        await loadCollectionsPopup();
        populateCollectionsHubList(domElements.collectionsHubSearchInput.value);
        updateCollectionFilterOptionsPopup();
         if(currentCollectionFilterPopup === collectionId.toString()) { // If deleted collection was selected in filter
            currentCollectionFilterPopup = 'all';
            domElements.galleryFilterCollection.value = 'all';
        }
        updateGalleryDisplay();
    }
}

function handleHubCreateNewCollectionInline() {
    domElements.hubInlineCreateFormContainer.style.display = 'flex';
    domElements.hubInlineNewCollectionNameInput.value = '';
    domElements.hubInlineNewCollectionNameInput.focus();
    domElements.hubCreateNewCollectionBtn.style.display = 'none'; // Hide main create button

    domElements.hubInlineSaveCollectionBtn.onclick = async () => {
        const name = domElements.hubInlineNewCollectionNameInput.value.trim();
        if (!name) { showNotification('Collection name cannot be empty.', 'error'); return; }
        const saveBtn = domElements.hubInlineSaveCollectionBtn;
        const originalSaveHTML = saveBtn.innerHTML;
        saveBtn.disabled = true; saveBtn.innerHTML = `<svg viewBox="0 0 24 24" class="spin"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"></path></svg>`;
        try {
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'createCollection', name }, (res) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else if (res && res.success) resolve(res);
                    else reject(new Error(res?.error || 'Failed to create collection'));
                });
            });
            showNotification(`Collection "${name}" created.`, 'success');
        } catch (error) {
            logPopupEntry('ERROR', 'Error creating new collection from Hub', { error, additionalDetails: { name } });
            showNotification(`Error: ${error.message}`, 'error');
        } finally {
            saveBtn.disabled = false; saveBtn.innerHTML = originalSaveHTML;
            hideHubInlineCreateForm();
            await loadCollectionsPopup();
            populateCollectionsHubList(domElements.collectionsHubSearchInput.value);
            updateCollectionFilterOptionsPopup();
        }
    };
    domElements.hubInlineCancelCollectionBtn.onclick = hideHubInlineCreateForm;
}

function hideHubInlineCreateForm() {
    domElements.hubInlineCreateFormContainer.style.display = 'none';
    domElements.hubCreateNewCollectionBtn.style.display = 'inline-flex'; // Show main create button
}


// Logging Tab Functionality
async function fetchAndDisplayLogs() {
  const container = domElements.logsDisplayContainer;
  container.innerHTML = '<div class="loading-indicator">Fetching logs...</div>';

  chrome.runtime.sendMessage({ action: 'getBackgroundLogs' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      container.textContent = 'Error fetching logs: ' + (chrome.runtime.lastError?.message || response?.error || 'Unknown error');
      logPopupEntry('ERROR', 'Failed to fetch logs for popup display', { error: chrome.runtime.lastError || new Error(response?.error) });
      return;
    }
    const selectedLevels = Array.from(domElements.logLevelFilters)
                              .filter(cb => cb.checked)
                              .map(cb => cb.value.toUpperCase());
    const selectedSources = Array.from(domElements.logSourceFilters)
                               .filter(cb => cb.checked)
                               .map(cb => cb.value.toUpperCase());
    const searchText = domElements.logTextFilter.value.toLowerCase();

    const filteredLogs = (response.logs || []).filter(log => {
      const levelMatch = selectedLevels.includes(log.level.toUpperCase());
      const sourceMatch = selectedSources.includes(log.source.toUpperCase());
      const textMatch = searchText === '' ||
                        log.message.toLowerCase().includes(searchText) ||
                        (log.details?.errorMessage && log.details.errorMessage.toLowerCase().includes(searchText)) ||
                        (log.id && log.id.toLowerCase().includes(searchText));
      return levelMatch && sourceMatch && textMatch;
    });

    if (filteredLogs.length === 0) {
      container.textContent = 'No logs match current filters.';
      return;
    }

    const fragment = document.createDocumentFragment();
    filteredLogs.slice().reverse().forEach(log => { // Display newest first
      const entryDiv = document.createElement('div');
      entryDiv.className = `log-entry level-${log.level.toLowerCase()}`;
      const summaryDiv = document.createElement('div');
      summaryDiv.className = 'log-entry-summary';

      const ts = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      summaryDiv.innerHTML = `
        <span class="log-source-ts">${log.source.substring(0,2)} ${ts}</span>
        <span class="log-message">${log.message}</span>
      `;
      entryDiv.appendChild(summaryDiv);

      if (log.stack || log.details) {
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'log-details';
        let detailsContent = '';
        if(log.id) detailsContent += `ID: ${log.id}\n`;
        if(log.contextUrl && log.contextUrl !== "N/A (Popup)" && log.contextUrl !== "N/A (Background)") detailsContent += `Context: ${log.contextUrl}\n`;
        if(log.details) detailsContent += `Details: ${JSON.stringify(log.details, null, 2)}\n`;
        if(log.stack) detailsContent += `Stack:\n${log.stack}`;
        detailsDiv.innerHTML = `<pre>${detailsContent.trim()}</pre>`;
        entryDiv.appendChild(detailsDiv);
        entryDiv.onclick = () => { detailsDiv.style.display = detailsDiv.style.display === 'none' ? 'block' : 'none'; };
      }
      fragment.appendChild(entryDiv);
    });
    container.innerHTML = '';
    container.appendChild(fragment);
  });
}

function getFilteredLogsForExport() {
    const logsText = [];
    const logEntries = domElements.logsDisplayContainer.querySelectorAll('.log-entry');
    logEntries.forEach(entryDiv => {
        const summary = entryDiv.querySelector('.log-entry-summary')?.textContent.trim().replace(/\s+/g, ' ');
        const detailsPre = entryDiv.querySelector('.log-details pre');
        let logLine = summary || '';
        if (detailsPre) {
            logLine += `\n${detailsPre.textContent.trim()}`;
        }
        logsText.push(logLine);
    });
    return logsText.join('\n\n---\n\n');
}

function copyFilteredLogsToClipboard() {
    const logsText = getFilteredLogsForExport();
    if (!logsText) {
        showNotification("No logs to copy.", "info");
        return;
    }
    navigator.clipboard.writeText(logsText).then(() => {
        showNotification("Visible logs copied to clipboard!", "success");
    }).catch(err => {
        showNotification("Failed to copy logs.", "error");
        logPopupEntry('ERROR', 'Error copying logs to clipboard', { error: err });
    });
}

function downloadFilteredLogs() {
    const logsText = getFilteredLogsForExport();
     if (!logsText) {
        showNotification("No logs to download.", "info");
        return;
    }
    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `xms_popup_logs_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showNotification("Logs downloaded.", "success");
}

function clearAllLogsFromPopup() {
    if (confirm("Are you sure you want to clear all background logs? This action cannot be undone.")) {
        chrome.runtime.sendMessage({ action: 'clearBackgroundLogs' }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                 showNotification("Error clearing logs: " + (chrome.runtime.lastError?.message || response?.error || 'Unknown'), "error");
            } else {
                showNotification("Background logs cleared successfully.", "success");
                fetchAndDisplayLogs(); // Refresh display
            }
        });
    }
}

// Coordination flag: mark popup active while open
try { chrome.storage.session?.set({ xmsPopupOpen: true, xmsPopupHeartbeat: Date.now() }); } catch(e) {}
let popupHeartbeatTimer = setInterval(() => {
  try { chrome.storage.session?.set({ xmsPopupHeartbeat: Date.now() }); } catch(e) {}
}, 1000);
window.addEventListener('unload', () => {
  try { chrome.storage.session?.set({ xmsPopupOpen: false, xmsPopupHeartbeat: 0 }); } catch(e) {}
  clearInterval(popupHeartbeatTimer);
});