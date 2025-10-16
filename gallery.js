// Gallery state
let galleryData = [];
let filteredData = [];
const galleryItemById = new Map();
let currentPage = 1;
let imagesPerPage = 12;
let currentAuthor = 'all';
let currentCollectionFilter = 'all';
let currentSort = 'newest';
let currentDateFilter = 'all';
let currentTypeFilter = 'all';
let searchQuery = '';

const DB_NAME = 'XMediaGalleryDB';
const STORE_NAME = 'mediaItems';
const FAVORITE_AUTHORS_KEY = 'x_media_saver_favorite_authors';
let favoriteAuthorsList = [];
let collectionsList = [];

// Performance optimization state
let imageCache = new Map(); // Cache for processed images
let lazyLoadObserver = null; // Intersection Observer for lazy loading
let renderQueue = []; // Queue for batched rendering
let isRendering = false; // Prevent concurrent renders
const MAX_CACHE_SIZE = 8; // Smaller cache to reduce memory

// Memory management
let memoryCheckInterval = null;
const MEMORY_CHECK_INTERVAL = 8000; // Check less often to reduce overhead
const MEMORY_CLEANUP_THRESHOLD = 0.3; // Cleanup when memory usage > 30%
const AGGRESSIVE_CLEANUP_THRESHOLD = 0.5; // Aggressive cleanup when memory usage > 50%
const CRITICAL_CLEANUP_THRESHOLD = 0.7; // Critical cleanup when memory usage > 70%
const EMERGENCY_CLEANUP_THRESHOLD = 0.8; // Emergency cleanup when memory usage > 80%

// Virtual scrolling state
let virtualScrollEnabled = false; // Start with pagination by default
let visibleRange = { start: 0, end: 0 };
let itemHeight = 200; // Estimated height of each media card
let containerHeight = 0;

// Pagination state
let totalItems = 0;

// Import state
const IMPORT_PROGRESS_KEY = 'xmsImportProgress_completedPaths';
let isImportAborted = false;
const IMPORT_COMPLETED_PATHS_SAVE_INTERVAL = 20;

// Batch delete state
let isSelectModeActive = false;
let selectedItemsForBatchDelete = new Set();

// Coordination flag to avoid heavy loads from popup and gallery simultaneously
let isGalleryActive = false;

// Concurrency limiter for media loads
const MAX_CONCURRENT_MEDIA_LOADS = 2;
let currentMediaLoads = 0;
const pendingMediaLoadQueue = [];

function enqueueMediaLoad(task) {
  pendingMediaLoadQueue.push(task);
  drainMediaLoadQueue();
}

function drainMediaLoadQueue() {
  while (currentMediaLoads < MAX_CONCURRENT_MEDIA_LOADS && pendingMediaLoadQueue.length > 0) {
    const next = pendingMediaLoadQueue.shift();
    currentMediaLoads++;
    Promise.resolve()
      .then(next)
      .catch(() => {})
      .finally(() => {
        currentMediaLoads = Math.max(0, currentMediaLoads - 1);
        if (pendingMediaLoadQueue.length > 0) {
          // Spread out bursts a bit
          setTimeout(drainMediaLoadQueue, 0);
        }
      });
  }
}

// Wrap loadMediaElement to use queue
function scheduleLoadMediaElement(mediaElement, itemData) {
  if (!mediaElement || mediaElement.dataset.lazyLoad === 'false') return;
  enqueueMediaLoad(() => new Promise(resolve => {
    try {
      loadMediaElement(mediaElement, itemData);
    } catch (e) {
      logGalleryEntry('WARN', 'scheduleLoadMediaElement task error', { error: e });
    } finally {
      resolve();
    }
  }));
}

window.addEventListener('pageshow', () => {
  try { chrome.storage.session?.set({ xmsGalleryOpen: true }); } catch(e) {}
  isGalleryActive = true;
});
window.addEventListener('pagehide', () => {
  try { chrome.storage.session?.set({ xmsGalleryOpen: false }); } catch(e) {}
  isGalleryActive = false;
});

async function isPopupActive() {
  try {
    // If session storage API is unavailable in this context, consider popup inactive
    if (!chrome || !chrome.storage || !chrome.storage.session || typeof chrome.storage.session.get !== 'function') {
      return false;
    }

    const res = await new Promise((resolve) => {
      let settled = false;
      try {
        chrome.storage.session.get(['xmsPopupOpen','xmsPopupHeartbeat'], (result) => {
          settled = true; resolve(result || {});
        });
      } catch (e) {
        settled = true; resolve({});
      }
      // Failsafe: ensure the promise resolves even if the callback is never invoked
      setTimeout(() => { if (!settled) resolve({}); }, 300);
    });

    const open = !!res?.xmsPopupOpen;
    const hb = Number(res?.xmsPopupHeartbeat || 0);
    const fresh = Date.now() - hb < 2500; // heartbeat within 2.5s
    return open && fresh;
  } catch(e) {
    return false;
  }
}

let galleryDeferralStart = 0;
async function guardedLoadMediaDataFromBackground() {
  const popupActive = await isPopupActive();
  if (popupActive) {
    if (!galleryDeferralStart) galleryDeferralStart = Date.now();
    // Stop deferring after 5s of continuous popup activity
    if (Date.now() - galleryDeferralStart < 5000) {
      logGalleryEntry('INFO', 'Popup is active, deferring full gallery data load to prevent contention.');
      setTimeout(guardedLoadMediaDataFromBackground, 800);
      return;
    } else {
      logGalleryEntry('INFO', 'Popup active too long; proceeding with cautious gallery load.');
    }
  } else {
    galleryDeferralStart = 0;
  }
  await loadMediaDataFromBackground();
}

// Star SVG Path
const STAR_SVG_PATH = "M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2l-2.81 6.63L2 9.24l5.46 4.73L5.82 21z";
const FOLDER_PLUS_SVG_PATH = "M10 4H4c-1.11 0-2 .89-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z M16 15h-2v2h-2v-2h-2v-2h2v-2h2v2h2v2z";
const FOLDER_ICON_SVG_PATH = "M10 4H4c-1.11 0-2 .89-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z";
const PEN_SVG_PATH_GALLERY = "M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z";
const TRASH_SVG_PATH_GALLERY = "M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z";
const PLUS_ICON_SVG_PATH = "M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z";
const CHECK_SVG_PATH = "M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z";
const CANCEL_SVG_PATH = "M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z";
const VIDEO_PLACEHOLDER_ICON_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="rgba(128,128,128,0.3)" d="M10 16.5v-9l6 4.5-6 4.5zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>';
const VIDEO_UNPLAYABLE_ICON_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="rgba(128,128,128,0.4)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/><path fill="rgba(255,80,80,0.7)" d="M11 7h2v6h-2zm0 8h2v2h-2z"/></svg>';
const VIDEO_THUMBNAIL_ONLY_ICON_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23ADADAD" width="24px" height="24px"><path d="M0 0h24v24H0V0z" fill="none"/><path d="M10 16.5l6-4.5-6-4.5v9zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zM7 7h2v2H7V7zm0 4h2v2H7v-2zm0 4h2v2H7v-2zm10 2h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v2z"/></svg>';
const IMAGE_ERROR_ICON_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="rgba(150,150,150,0.5)" d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
const GIF_PLACEHOLDER_ICON_SVG = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24"><path fill="rgba(128,128,128,0.3)" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/><path fill="rgba(0,150,255,0.6)" d="M8 8h8v8H8V8zm2 2v4h4v-4h-4z"/><text x="12" y="16" text-anchor="middle" font-family="Arial" font-size="8" fill="rgba(0,150,255,0.8)">GIF</text></svg>';
const DOWNLOAD_SVG_PATH = "M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z";
const EXTERNAL_LINK_SVG_PATH = "M19 19H5V5h7V3H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z";
const USER_SVG_PATH = "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z";


// --- START: Gallery Logging ---
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
        
        // Handle circular references and large objects
        const seen = new WeakSet();
        const replacer = (key, value) => {
            if (typeof value === 'object' && value !== null) {
                if (seen.has(value)) return '[Circular Reference]';
                seen.add(value);
            }
            
            // Handle functions
            if (typeof value === 'function') return '[Function]';
            
            // Handle DOM elements
            if (value && typeof value === 'object' && value.nodeType !== undefined) {
                return `[DOM Element: ${value.tagName || value.nodeName || 'Unknown'}]`;
            }
            
            // Handle large strings
            if (typeof value === 'string' && value.length > 1000) {
                return value.substring(0, 1000) + '...[truncated]';
            }
            
            return value;
        };
        
        const serialized = JSON.stringify(obj, replacer, 2);
        
        if (serialized.length > maxSize) {
            return serialized.substring(0, maxSize - 3) + '...';
        }
        
        return serialized;
    } catch (error) {
        return `[Serialization failed: ${error.message}]`;
    }
}

function logGalleryEntry(level, message, details = {}) {
  let logEntry;
  
  try {
    // Clean details object to remove any DOM elements
    const cleanDetails = {};
    if (details && typeof details === 'object') {
      for (const [key, value] of Object.entries(details)) {
        if (value && typeof value === 'object' && value.nodeType !== undefined) {
          cleanDetails[key] = `[DOM Element: ${value.tagName || 'Unknown'}]`;
        } else {
          cleanDetails[key] = value;
        }
      }
    }
    
    // Create robust log entry
    const sanitizedMessage = sanitizeInput(message);
    const sanitizedSource = 'GALLERY';
    
    logEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      source: sanitizedSource,
      level: level.toUpperCase(),
      message: sanitizedMessage,
      stack: null,
      contextUrl: window.location.href,
      details: {}
    };
    
    // Handle stack trace safely
    try {
      if (cleanDetails.error && cleanDetails.error.stack) {
        logEntry.stack = sanitizeInput(cleanDetails.error.stack, 20000);
      } else if (cleanDetails.stack) {
        logEntry.stack = sanitizeInput(cleanDetails.stack, 20000);
      }
    } catch (stackError) {
      logEntry.stack = `[Stack trace processing failed: ${stackError.message}]`;
    }
    
    // Handle error details safely
    try {
      if (cleanDetails.error) {
        logEntry.details.errorName = cleanDetails.error.name || 'UnknownError';
        logEntry.details.errorMessage = sanitizeInput(cleanDetails.error.message || String(cleanDetails.error), 1000);
      }
    } catch (errorDetailsError) {
      logEntry.details.errorProcessingError = `Failed to process error details: ${errorDetailsError.message}`;
    }
    
    // Handle additional details safely
    try {
      if (cleanDetails.additionalDetails) {
        const serializedDetails = safeSerialize(cleanDetails.additionalDetails);
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
      source: 'GALLERY_LOGGING_SYSTEM',
      level: 'CRITICAL',
      message: `Failed to create log entry: ${entryCreationError.message}`,
      stack: entryCreationError.stack,
      contextUrl: window.location.href,
      details: { 
        originalMessage: String(message), 
        originalLevel: String(level),
        creationError: entryCreationError.message
      }
    };
  }

  // Console output with enhanced error handling
  try {
    let consoleOutput = `XMS Gallery [${logEntry.level}] (${logEntry.id}): ${logEntry.message}`;
    if (logEntry.stack && (logEntry.level === 'ERROR' || logEntry.level === 'CRITICAL')) {
        consoleOutput += `\nStack: ${logEntry.stack}`;
    }
    if (logEntry.details && Object.keys(logEntry.details).length > 0) {
        try {
            consoleOutput += `\nDetails: ${safeSerialize(logEntry.details)}`;
        } catch (serializeError) {
            consoleOutput += `\nDetails (serialization failed): ${String(logEntry.details)}`;
        }
    }

    switch(logEntry.level) {
        case 'CRITICAL':
        case 'ERROR':
            console.error(consoleOutput);
            break;
        case 'WARN':
            console.warn(consoleOutput);
            break;
        case 'DEBUG':
            console.debug(consoleOutput);
            break;
        default: // INFO
            console.log(consoleOutput);
            break;
    }
  } catch (consoleError) {
    // Ultimate fallback - direct console output
    console.error(`XMS Gallery CONSOLE OUTPUT ERROR: ${consoleError.message}`);
    console.error(`Original log: ${logEntry.message}`);
  }

  // Send to background with enhanced error handling
  if (chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ action: 'logExternalEntry', logEntry: logEntry }, (response) => {
        if (chrome.runtime.lastError) {
          // Try localStorage fallback
          try {
            const fallbackKey = `xms_gallery_log_${logEntry.id}`;
            const fallbackData = {
              timestamp: logEntry.timestamp,
              level: logEntry.level,
              message: logEntry.message,
              source: logEntry.source,
              error: chrome.runtime.lastError.message
            };
            localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
          } catch (localStorageError) {
            console.error(`XMS Gallery: localStorage fallback failed: ${localStorageError.message}`);
          }
        } else if (response && !response.success) {
          // Try localStorage fallback for failed response
          try {
            const fallbackKey = `xms_gallery_log_${logEntry.id}`;
            const fallbackData = {
              timestamp: logEntry.timestamp,
              level: logEntry.level,
              message: logEntry.message,
              source: logEntry.source,
              error: response.error || 'Unknown response error'
            };
            localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
          } catch (localStorageError) {
            console.error(`XMS Gallery: localStorage fallback failed: ${localStorageError.message}`);
          }
        }
      });
    } catch (messageError) {
      // Ultimate fallback - localStorage only
      try {
        const fallbackKey = `xms_gallery_log_${logEntry.id}`;
        const fallbackData = {
          timestamp: logEntry.timestamp,
          level: logEntry.level,
          message: logEntry.message,
          source: logEntry.source,
          error: messageError.message
        };
        localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
      } catch (localStorageError) {
        console.error(`XMS Gallery: All logging methods failed: ${localStorageError.message}`);
      }
    }
  } else if (logEntry.level !== 'DEBUG') {
    // Runtime not available, try localStorage fallback
    try {
      const fallbackKey = `xms_gallery_log_${logEntry.id}`;
      const fallbackData = {
        timestamp: logEntry.timestamp,
        level: logEntry.level,
        message: logEntry.message,
        source: logEntry.source,
        error: 'Runtime not available'
      };
      localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
    } catch (localStorageError) {
      console.error(`XMS Gallery: localStorage fallback failed: ${localStorageError.message}`);
    }
  }
}

window.onerror = function(message, sourceURL, lineno, colno, error) {
  logGalleryEntry(
    'CRITICAL',
    `Gallery Uncaught: ${message}`,
    {
      error: error,
      stack: error?.stack,
      contextUrl: sourceURL,
      additionalDetails: { lineno, colno, source: 'gallery.window.onerror' }
    }
  );
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  const reason = event.reason;
  logGalleryEntry(
    'CRITICAL',
    `Gallery Unhandled Rejection: ${reason?.message || String(reason)}`,
    {
      error: reason instanceof Error ? reason : new Error(String(reason)),
      stack: reason?.stack,
      contextUrl: window.location.href,
      additionalDetails: {
        reasonRaw: String(reason),
        source: 'gallery.window.onunhandledrejection'
      }
    }
  );
});
// --- END: Gallery Logging ---


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

function showNotification(message, type = 'info') {
    const existingNotification = document.querySelector('.gallery-notification');
    if (existingNotification) existingNotification.remove();

    const notification = document.createElement('div');
    notification.className = `gallery-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    requestAnimationFrame(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, 20px)';
        requestAnimationFrame(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translate(-50%, 0)';
        });
    });

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translate(-50%, 20px)';
        notification.addEventListener('transitionend', () => {
            if (notification.parentNode) notification.remove();
        }, { once: true });
    }, type === 'error' || type === 'warn' ? 5000 : 3000);
}

function updateFavoriteButtonUI(button, isFavorite) {
    button.classList.toggle('is-favorite', isFavorite);
    button.setAttribute('aria-label', isFavorite ? 'Unfavorite this item' : 'Favorite this item');
    button.setAttribute('aria-pressed', isFavorite.toString());
    button.title = isFavorite ? 'Unfavorite' : 'Favorite';
}

async function toggleFavorite(mediaId, favoriteBtn) {
    const itemIndex = galleryData.findIndex(item => item.id === mediaId);
    if (itemIndex === -1) return;

    const currentItem = galleryData[itemIndex];
    const oldFavoriteStatus = currentItem.favorite;
    const newFavoriteStatus = !currentItem.favorite;

    updateFavoriteButtonUI(favoriteBtn, newFavoriteStatus);
    currentItem.favorite = newFavoriteStatus;

    const needsReRender = currentTypeFilter === 'favorites' && oldFavoriteStatus !== newFavoriteStatus;

    if (needsReRender) {
        applyFilters();
        renderGallery();
    }

    try {
        await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'updateMediaFavoriteStatus', mediaId: mediaId, favorite: newFavoriteStatus },
                (res) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else if (res && res.success) resolve(res);
                    else reject(new Error(res?.error || 'Unknown error updating favorite status'));
                }
            );
        });
        showNotification(newFavoriteStatus ? 'Added to favorites' : 'Removed from favorites', 'success');
    } catch (error) {
        logGalleryEntry('ERROR', 'Error toggling favorite status from Gallery', { error: error });
        currentItem.favorite = oldFavoriteStatus;
        updateFavoriteButtonUI(favoriteBtn, oldFavoriteStatus);
        showNotification('Failed to update favorite status.', 'error');
        if (needsReRender) {
            applyFilters();
            renderGallery();
        }
    }
}

async function loadFavoriteAuthors() {
    return new Promise((resolve) => {
        chrome.storage.local.get([FAVORITE_AUTHORS_KEY], (result) => {
            if (chrome.runtime.lastError) {
                logGalleryEntry('WARN', "Error loading favorite authors from Gallery", { error: chrome.runtime.lastError });
                favoriteAuthorsList = [];
            } else {
                favoriteAuthorsList = Array.isArray(result[FAVORITE_AUTHORS_KEY]) ? result[FAVORITE_AUTHORS_KEY] : [];
            }
            resolve();
        });
    });
}

async function saveFavoriteAuthors() {
    try {
        await chrome.storage.local.set({ [FAVORITE_AUTHORS_KEY]: favoriteAuthorsList });
        chrome.runtime.sendMessage({ action: 'favoriteAuthorsUpdated' }).catch(err => logGalleryEntry('WARN', "Error sending favoriteAuthorsUpdated message from Gallery", { error: err }));
    } catch (error) {
        logGalleryEntry('ERROR', "Error saving favorite authors from Gallery", { error: error });
    }
}

function updateMediaCardAuthorFavoriteButtonUI(button, authorUsername) {
    if (!button || !authorUsername) return;
    const isFavorite = favoriteAuthorsList.includes(authorUsername);
    button.classList.toggle('is-favorite-author', isFavorite);
    const actionText = isFavorite ? 'Unfavorite' : 'Favorite';
    button.title = `${actionText} author ${authorUsername}`;
    button.setAttribute('aria-label', `${actionText} author ${authorUsername}`);
    button.setAttribute('aria-pressed', isFavorite.toString());
}

async function handleMediaCardAuthorFavoriteToggle(authorUsername, clickedButton) {
    if (!authorUsername) return;
    if (!Array.isArray(favoriteAuthorsList)) favoriteAuthorsList = [];

    const index = favoriteAuthorsList.indexOf(authorUsername);
    const wasFavorite = index > -1;
    if (wasFavorite) {
        favoriteAuthorsList.splice(index, 1);
        showNotification(`${authorUsername} unfavorited.`, 'info');
    } else {
        favoriteAuthorsList.push(authorUsername);
        showNotification(`${authorUsername} favorited!`, 'success');
    }
    await saveFavoriteAuthors();
    updateFilterOptions();
    updateMediaCardAuthorFavoriteButtonUI(clickedButton, authorUsername);

    document.querySelectorAll(`.media-card[data-author="${authorUsername}"] .media-card-author-favorite-btn`)
        .forEach(btn => { if (btn !== clickedButton) updateMediaCardAuthorFavoriteButtonUI(btn, authorUsername); });

    if ((currentAuthor === authorUsername && wasFavorite) || currentSort === 'author_az' || currentSort === 'author_za') {
        applyFilters();
        renderGallery();
    }
}

// Cache management functions
function cleanupImageCache() {
    try {
    if (imageCache.size > MAX_CACHE_SIZE) {
        const entries = Array.from(imageCache.entries());
            // Sort by access time to remove least recently used items
            entries.sort((a, b) => (a[1].lastAccessed || 0) - (b[1].lastAccessed || 0));
        const toDelete = entries.slice(0, imageCache.size - MAX_CACHE_SIZE);
        
        toDelete.forEach(([key, data]) => {
            if (data.objectURL && data.objectURL.startsWith('blob:')) {
                URL.revokeObjectURL(data.objectURL);
            }
            if (data.posterObjectURL && data.posterObjectURL.startsWith('blob:')) {
                URL.revokeObjectURL(data.posterObjectURL);
            }
            imageCache.delete(key);
        });
        
            console.log(`Cleaned up ${toDelete.length} cached images. Cache size: ${imageCache.size}`);
        }
    } catch (error) {
        console.error('Image cache cleanup error:', error);
    }
}

function getCachedImage(cacheKey) {
    const cached = imageCache.get(cacheKey);
    if (cached) {
        cached.lastAccessed = Date.now();
        return cached;
    }
    return null;
}

function setCachedImage(cacheKey, data) {
    imageCache.set(cacheKey, {
        ...data,
        lastAccessed: Date.now()
    });
    cleanupImageCache();
}

function clearImageCache() {
    imageCache.forEach((data) => {
        if (data.objectURL && data.objectURL.startsWith('blob:')) {
            URL.revokeObjectURL(data.objectURL);
        }
        if (data.posterObjectURL && data.posterObjectURL.startsWith('blob:')) {
            URL.revokeObjectURL(data.posterObjectURL);
        }
    });
    imageCache.clear();
    logGalleryEntry('INFO', 'Image cache cleared');
}

// Memory monitoring and cleanup
function startMemoryMonitoring() {
    if (memoryCheckInterval) {
        clearInterval(memoryCheckInterval);
        memoryCheckInterval = null;
    }
    try {
        memoryCheckInterval = setInterval(async () => {
            try {
                const mem = performance && performance.memory ? {
                    jsHeapSizeLimit: performance.memory.jsHeapSizeLimit,
                    totalJSHeapSize: performance.memory.totalJSHeapSize,
                    usedJSHeapSize: performance.memory.usedJSHeapSize
                } : null;

                const domCount = document.getElementById('media-grid')?.children?.length || 0;
                const cacheSize = imageCache.size;
                const queueLen = pendingMediaLoadQueue.length;
                const loadsInFlight = currentMediaLoads;

                logGalleryEntry('INFO', 'Memory heartbeat', {
                    mem: mem ? {
                        jsHeapSizeLimit: mem.jsHeapSizeLimit,
                        totalJSHeapSize: mem.totalJSHeapSize,
                        usedJSHeapSize: mem.usedJSHeapSize
                    } : null,
                    domCount,
                    cacheSize,
                    queueLen,
                    loadsInFlight,
                    filteredCount: filteredData.length,
                    totalCount: galleryData.length,
                    page: currentPage,
                    imagesPerPage
                });

                // Auto-clean thresholds
                if (mem && mem.usedJSHeapSize / mem.jsHeapSizeLimit > AGGRESSIVE_CLEANUP_THRESHOLD) {
                    performAggressiveMemoryCleanup();
                } else if (mem && mem.usedJSHeapSize / mem.jsHeapSizeLimit > MEMORY_CLEANUP_THRESHOLD) {
                    performMemoryCleanup();
                }
            } catch (e) {
                logGalleryEntry('WARN', 'Memory heartbeat error', { error: e });
            }
        }, MEMORY_CHECK_INTERVAL);
    } catch (e) {
        logGalleryEntry('WARN', 'Failed to start memory monitoring', { error: e });
    }
}

function stopMemoryMonitoring() {
    if (memoryCheckInterval) {
        clearInterval(memoryCheckInterval);
        memoryCheckInterval = null;
    }
}

function performMemoryCleanup() {
    try {
        logGalleryEntry('INFO', 'Performing memory cleanup');
                
                // Clear image cache
                clearImageCache();
                
                // Clear render queue
                renderQueue = [];
        
        // Clean up blob URLs from visible elements
        cleanupVisibleBlobURLs();
                
                // Force garbage collection if available
                if (window.gc) {
                    window.gc();
                }
                
        logGalleryEntry('INFO', 'Memory cleanup completed');
    } catch (error) {
        console.error('Memory cleanup error:', error);
    }
}

function performAggressiveMemoryCleanup() {
    try {
        logGalleryEntry('WARN', 'Performing aggressive memory cleanup');
        
        // Perform standard cleanup
        performMemoryCleanup();
        
        // Clear all blob URLs
                document.querySelectorAll('img[src^="blob:"], video[src^="blob:"]').forEach(element => {
                    if (element.src.startsWith('blob:')) {
                        URL.revokeObjectURL(element.src);
                element.src = element.dataset.placeholder || '';
                    }
                });
                
                // Clear unused DOM references
                const unusedElements = document.querySelectorAll('.media-card:not(.visible)');
                unusedElements.forEach(element => {
                    const img = element.querySelector('img');
                    if (img && img.src && img.src.startsWith('blob:')) {
                        URL.revokeObjectURL(img.src);
                    }
                });
        
        // Force enable virtual scrolling for large datasets
        if (galleryData.length > 500 && !virtualScrollEnabled) {
            console.log(`Large gallery data detected (${galleryData.length} items). Enabling virtual scrolling.`);
            enableVirtualScrolling();
        }
        
        // Show memory optimization indicator after aggressive cleanup
        showMemoryOptimizationIndicator();
        
        logGalleryEntry('WARN', 'Aggressive memory cleanup completed');
    } catch (error) {
        console.error('Aggressive memory cleanup error:', error);
    }
}

function performCriticalMemoryCleanup() {
    try {
        logGalleryEntry('CRITICAL', 'Performing critical memory cleanup');
        
        // Perform aggressive cleanup first
        performAggressiveMemoryCleanup();
        
        // Force enable virtual scrolling for large datasets
        if (galleryData.length > 500 && !virtualScrollEnabled) {
            console.log(`Critical memory usage with ${galleryData.length} items. Force enabling virtual scrolling.`);
            enableVirtualScrolling();
        }
        
        // Reduce gallery data significantly
        if (galleryData.length > 1000) {
            console.log(`Reducing gallery data from ${galleryData.length} to 1000 items`);
            galleryData = galleryData.slice(0, 1000);
        }
        
        // Force garbage collection multiple times
        if (window.gc) {
            window.gc();
            setTimeout(() => window.gc(), 100);
            setTimeout(() => window.gc(), 500);
        }
        
        // Re-render with reduced data
        applyFilters();
        renderGallery();
        
        // Show critical memory warning
        showNotification('Critical memory usage detected. Gallery optimized for stability.', 'warn');
        
        logGalleryEntry('CRITICAL', 'Critical memory cleanup completed');
    } catch (error) {
        console.error('Critical memory cleanup error:', error);
    }
}

function performEmergencyMemoryCleanup() {
    try {
        console.log('EMERGENCY: Performing emergency memory cleanup...');
        
        // Perform critical cleanup first
        performCriticalMemoryCleanup();
        
        // Drastically reduce gallery data
        if (galleryData.length > 500) {
            console.log(`EMERGENCY: Reducing gallery data from ${galleryData.length} to 500 items`);
            galleryData = galleryData.slice(0, 500);
        }
        
        // Clear all DOM elements and re-render
        const mediaGrid = document.getElementById('media-grid');
        if (mediaGrid) {
            mediaGrid.innerHTML = '';
        }
        
        // Force enable virtual scrolling
        if (!virtualScrollEnabled) {
            console.log('EMERGENCY: Force enabling virtual scrolling');
            virtualScrollEnabled = true;
            showMemoryOptimizationIndicator();
        }
        
        // Multiple garbage collection cycles
        if (window.gc) {
            for (let i = 0; i < 5; i++) {
                setTimeout(() => window.gc(), i * 100);
            }
        }
        
        // Re-render with minimal data
        applyFilters();
        renderGallery();
        
        // Log emergency state without intrusive notification
        console.log('EMERGENCY: Gallery optimized for stability - essential items only');
        
        console.log('EMERGENCY: Emergency memory cleanup completed');
    } catch (error) {
        console.error('EMERGENCY: Emergency memory cleanup error:', error);
    }
}

function cleanupVisibleBlobURLs() {
    const mediaGrid = document.getElementById('media-grid');
    if (!mediaGrid) return;
    
    // Do NOT revoke visible item URLs; only mark offscreen cards for reload via IntersectionObserver
    // Actual revokes are handled during card cleanup/render transitions
}

function initializeScrollHandling() {
    let scrollTimeout;
    
    window.addEventListener('scroll', () => {
        if (!virtualScrollEnabled) return;
        
        // Throttle scroll events
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const mediaGrid = document.getElementById('media-grid');
            if (mediaGrid && filteredData.length > 500) {
                renderWithVirtualScrolling(mediaGrid);
            }
        }, 100);
    }, { passive: true });
    
    // Handle window resize
    window.addEventListener('resize', () => {
        if (virtualScrollEnabled) {
            const mediaGrid = document.getElementById('media-grid');
            if (mediaGrid) {
                renderWithVirtualScrolling(mediaGrid);
            }
        }
    }, { passive: true });
}

// Initialize lazy loading observer
function initializeLazyLoading() {
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
    }
    
    lazyLoadObserver = new IntersectionObserver((entries) => {
        try {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                const mediaCard = entry.target;
                const mediaElement = mediaCard.querySelector('.media-preview img, .media-preview video');
                if (!mediaElement || mediaElement.dataset.lazyLoad !== 'true') { lazyLoadObserver.unobserve(mediaCard); return; }
                // Avoid duplicate enqueue
                if (mediaElement.dataset.loadingQueued === 'true') { lazyLoadObserver.unobserve(mediaCard); return; }
                mediaElement.dataset.loadingQueued = 'true';
                const itemObj = galleryItemById.get(mediaCard.dataset.mediaId);
                scheduleLoadMediaElement(mediaElement, itemObj || mediaCard.dataset.itemData);
                lazyLoadObserver.unobserve(mediaCard);
            });
        } catch (e) {
            logGalleryEntry('WARN', 'IntersectionObserver callback error (gallery)', { error: e });
        }
    }, {
        root: null,
        rootMargin: '50px', // Start loading 50px before element is visible
        threshold: 0.1
    });
}

// Optimized media loading function
async function loadMediaElement(mediaElement, itemData) {
    if (!itemData) {
        const mediaCard = mediaElement.closest('.media-card');
        const itemId = mediaCard ? mediaCard.dataset.mediaId : undefined;
        itemData = itemId ? galleryItemById.get(itemId) : null;
        if (!itemData && mediaCard && mediaCard.dataset.itemData) itemData = mediaCard.dataset.itemData;
        if (!itemData) return;
    }
    
    let item = (typeof itemData === 'string') ? JSON.parse(itemData) : itemData;
    if (!item || typeof item !== 'object') return;
    const cacheKey = `${item.id}_${item.type}_${item.savedAsMetadata || false}`;
    
    // Check cache first using improved caching
    const cachedData = getCachedImage(cacheKey);
    if (cachedData && cachedData.elementType === mediaElement.tagName) {
            mediaElement.src = cachedData.src;
            mediaElement.dataset.activeObjectURL = cachedData.objectURL || '';
            if (cachedData.posterURL && mediaElement.tagName === 'VIDEO') {
                mediaElement.poster = cachedData.posterURL;
                mediaElement.dataset.posterObjectURL = cachedData.posterObjectURL || '';
            }
            mediaElement.dataset.lazyLoad = 'false';
            return;
    }
    
    // Build sources array with robust fallbacks
    let sourcesToTry = [];
    const isVideo = item.type === 'video';
    const isGif = item.isGif === true;
    const isMetadataOnlyVideo = isVideo && item.savedAsMetadata === true;
    
    if (isMetadataOnlyVideo) {
        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string' && !sourcesToTry.includes(item.thumbnailUrl)) sourcesToTry.push(item.thumbnailUrl);
        if (item.url && typeof item.url === 'string' && !sourcesToTry.includes(item.url) && !item.url.startsWith('blob:')) sourcesToTry.push(item.url);
    } else if (isGif) {
        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string' && !sourcesToTry.includes(item.thumbnailUrl)) sourcesToTry.push(item.thumbnailUrl);
        if (item.url && typeof item.url === 'string' && !sourcesToTry.includes(item.url)) sourcesToTry.push(item.url);
    } else if (isVideo) {
        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string') sourcesToTry.push(item.thumbnailUrl);
        if (item.url && typeof item.url === 'string') sourcesToTry.push(item.url);
        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
    } else {
        // Image: prefer local/original over thumbnail to handle suspended accounts
        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
        if (item.originalRemoteUrl && typeof item.originalRemoteUrl === 'string') sourcesToTry.push(item.originalRemoteUrl);
        if (item.url && typeof item.url === 'string') sourcesToTry.push(item.url);
        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string') sourcesToTry.push(item.thumbnailUrl);
    }
    
    sourcesToTry = sourcesToTry.filter(s => s);

    // If no sources available (due to minimal streaming), fetch full record on demand
    if (sourcesToTry.length === 0 && item.id) {
        try {
            const openReq = indexedDB.open(DB_NAME);
            const db = await new Promise((resolve, reject) => {
                openReq.onsuccess = e => resolve(e.target.result);
                openReq.onerror = e => reject(e.target.error);
            });
            if (db && db.objectStoreNames.contains(STORE_NAME)) {
                const full = await new Promise((resolve, reject) => {
                    try {
                        const tx = db.transaction(STORE_NAME, 'readonly');
                        const store = tx.objectStore(STORE_NAME);
                        const req = store.get(item.id);
                        req.onsuccess = () => resolve(req.result || null);
                        req.onerror = e => reject(e.target.error);
                    } catch (e) { reject(e); }
                });
                if (full && typeof full === 'object') {
                    item = {
                        ...item,
                        url: full.url || item.url || null,
                        localDataUrl: full.localDataUrl || item.localDataUrl || null,
                        thumbnailUrl: full.thumbnailUrl || item.thumbnailUrl || null,
                        originalRemoteUrl: full.originalRemoteUrl || item.originalRemoteUrl || null,
                        mimeType: full.mimeType || item.mimeType || null,
                        savedAsMetadata: full.savedAsMetadata || item.savedAsMetadata || false,
                        isGif: typeof item.isGif === 'boolean' ? item.isGif : !!full.isGif
                    };
                    // Rebuild sources
                    if (isMetadataOnlyVideo) {
                        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
                        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
                        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string') sourcesToTry.push(item.thumbnailUrl);
                        if (item.url && typeof item.url === 'string' && !item.url.startsWith('blob:')) sourcesToTry.push(item.url);
                    } else if (isGif) {
                        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
                        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
                        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string') sourcesToTry.push(item.thumbnailUrl);
                        if (item.url && typeof item.url === 'string') sourcesToTry.push(item.url);
                    } else if (isVideo) {
                        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string') sourcesToTry.push(item.thumbnailUrl);
                        if (item.url && typeof item.url === 'string') sourcesToTry.push(item.url);
                        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
                        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
                    } else {
                        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
                        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
                        if (item.originalRemoteUrl && typeof item.originalRemoteUrl === 'string') sourcesToTry.push(item.originalRemoteUrl);
                        if (item.url && typeof item.url === 'string') sourcesToTry.push(item.url);
                        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string') sourcesToTry.push(item.thumbnailUrl);
                    }
                    sourcesToTry = sourcesToTry.filter(s => s);
                }
            }
        } catch (e) {
            logGalleryEntry('WARN', 'On-demand item fetch failed', { error: e, additionalDetails: { id: item.id } });
        }
    }
    
    // Use optimized loading
    setAndHandleMediaPreviewGalleryOptimized(mediaElement, sourcesToTry, item, cacheKey);
}

// Store message listener reference for cleanup
let messageListener = null;

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (lazyLoadObserver) {
        lazyLoadObserver.disconnect();
    }
    clearImageCache();
    stopMemoryMonitoring();
    
    // Remove message listener to prevent memory leaks
    if (messageListener && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.removeListener(messageListener);
        messageListener = null;
    }
});

// Global error handler to catch crashes
window.addEventListener('error', (event) => {
    console.error('GLOBAL ERROR:', event.error);
    console.error('Error details:', {
        message: event.message,
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        stack: event.error?.stack
    });
});

window.addEventListener('unhandledrejection', (event) => {
    console.error('UNHANDLED PROMISE REJECTION:', event.reason);
});

document.addEventListener('DOMContentLoaded', async () => {
  try {
  console.log('Gallery DOMContentLoaded. Initializing...');
  startMemoryMonitoring();
  
  // Initialize lazy loading
  initializeLazyLoading();
  
  // Initialize scroll handling for virtual scrolling
  initializeScrollHandling();
  
  // Initialize virtual scroll button state (defaults to pagination mode)
  try {
    virtualScrollEnabled = false; // default to pages
  } catch(_) {}
  
  const urlParams = new URLSearchParams(window.location.search);
  const authorFilterParam = urlParams.get('author');
  if (authorFilterParam) currentAuthor = authorFilterParam;

  const collectionFilterParam = urlParams.get('collection');
  if (collectionFilterParam) currentCollectionFilter = collectionFilterParam;

  const typeParam = urlParams.get('type');
  if (typeParam) {
    currentTypeFilter = typeParam;
    const typeSelect = document.getElementById('type-filter');
    if (typeSelect) typeSelect.value = typeParam;
  }

  const sortParam = urlParams.get('sort');
   if (sortParam) {
    currentSort = sortParam;
    const sortSelect = document.getElementById('sort-order');
    if (sortSelect) sortSelect.value = sortParam;
  }

  let versionText = '';
  try {
    versionText = typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.getManifest === 'function'
      ? `v${chrome.runtime.getManifest().version}`
      : '';
  } catch(_) { versionText = ''; }
  const versionElement = document.getElementById('extension-version-gallery');
  if (versionElement && versionText) versionElement.textContent = versionText;

    // Attach UI event listeners immediately so the page is interactive even if data loading is slow
    setupEventListeners();

    // Kick off data loading without blocking UI initialization
    (async () => {
      try {
        await loadFavoriteAuthors();
        await loadCollections();
        await guardedLoadMediaDataFromBackground();
        await fixExistingGifData(); // Fix existing GIF data
      } catch (innerError) {
        logGalleryEntry('ERROR', 'Error during deferred gallery data load', { error: innerError });
        // Attempt a minimal render so UI is usable
        try { applyFilters(); renderGallery(); } catch(_) {}
      }
    })();
    // startMemoryMonitoring(); // Disabled
  } catch (error) {
    logGalleryEntry('ERROR', 'Error during gallery initialization', { error: error });
    showNotification('Error initializing gallery. Please refresh the page.', 'error');
  }

  messageListener = async (message, sender, sendResponse) => {
    // Skip processing if this is a popup-specific message to prevent duplicate processing
    if (message.popupOnly) {
      return false;
    }
    
    logGalleryEntry('DEBUG', 'Received message in gallery', { additionalDetails: { action: message.action, mediaId: message.mediaId } });
    let needsFullReload = false;
    let needsUIRefreshOnly = false; // For less disruptive UI updates

    if (message.action === 'mediaStoreUpdated') {
        if (message.mediaId && typeof message.favorite === 'boolean') {
            const itemIndex = galleryData.findIndex(item => item.id === message.mediaId);
            if (itemIndex > -1) {
                const itemChanged = galleryData[itemIndex];
                if (itemChanged.favorite !== message.favorite) {
                    itemChanged.favorite = message.favorite;
                    needsUIRefreshOnly = true;
                    if (currentTypeFilter === 'favorites') needsFullReload = true;
                }
            }
        } else if (message.deleted === true || (message.item && (message.item.imported || message.created))) {
            // Avoid transient duplicates: prefer a full reload and do not mutate in-memory data here
            needsFullReload = true;
        } else if (message.item && message.item.id) {
            const itemIndex = galleryData.findIndex(i => i.id === message.item.id);
            if (itemIndex > -1) { // Item updated
                const oldItem = galleryData[itemIndex];
                galleryData[itemIndex] = { ...oldItem, ...message.item };
                 Object.keys(galleryData[itemIndex]).forEach(key => {
                    if (galleryData[itemIndex][key] === undefined && message.item[key] !== undefined) {
                         galleryData[itemIndex][key] = message.item[key];
                    }
                });
                 // If type changed due to metadata save (image became video), full reload is better
                if (oldItem.type !== galleryData[itemIndex].type || oldItem.savedAsMetadata !== galleryData[itemIndex].savedAsMetadata) {
                   needsFullReload = true;
                } else {
                   needsUIRefreshOnly = true; // Less disruptive for simple metadata updates
                }
            } else { // New item (avoid duplicates)
                const exists = galleryData.some(i => i.id === message.item.id);
                if (!exists) {
                galleryData.push(message.item);
                    needsUIRefreshOnly = true;
                }
            }
        } else {
            needsFullReload = true; // Default to full reload if unsure
        }

    } else if (message.action === 'mediaStoreUpdatedBatch') {
        logGalleryEntry('INFO', 'Received mediaStoreUpdatedBatch, performing full reload.', { additionalDetails: { itemCount: message.items?.length } });
        needsFullReload = true;

    } else if (message.action === 'favoriteAuthorsUpdated') {
        await loadFavoriteAuthors();
        updateFilterOptions();
        document.querySelectorAll('.media-card[data-author] .media-card-author-favorite-btn').forEach(btn => {
            const cardAuthor = btn.closest('.media-card').dataset.author;
            if (cardAuthor) updateMediaCardAuthorFavoriteButtonUI(btn, cardAuthor);
        });
        if (currentAuthor !== 'all' || currentSort === 'author_az' || currentSort === 'author_za') {
            needsUIRefreshOnly = true;
        }
    } else if (message.action === 'collectionsUpdated') {
        await loadCollections();
        updateCollectionFilterOptions();
        needsUIRefreshOnly = true;
    }

    if (needsFullReload) {
        await guardedLoadMediaDataFromBackground(); // This calls applyFilters and renderGallery internally
        await loadCollections();
        updateCollectionFilterOptions();
    } else if (needsUIRefreshOnly) {
        applyFilters(); renderGallery();
    }

     // Common modal refresh logic after data updates
    const itemCollectionsModal = document.getElementById('manage-collections-modal');
    if (itemCollectionsModal && itemCollectionsModal.classList.contains('active') && currentMediaItemForCollectionModal) {
        const updatedItemInstance = galleryData.find(item => item.id === currentMediaItemForCollectionModal.id);
        if (updatedItemInstance) {
            openManageCollectionsModal(updatedItemInstance); // Re-open/refresh
        } else { // Item might have been deleted or its ID changed (less likely)
            closeManageCollectionsModal();
        }
    }

    return true;
  };
  
  // Register the message listener (only if runtime is available)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage && typeof chrome.runtime.onMessage.addListener === 'function') {
    chrome.runtime.onMessage.addListener(messageListener);
  }
  logGalleryEntry('INFO', 'Gallery initialized.');
});

async function guardedLoadMediaDataFromBackground() {
  const popupActive = await isPopupActive();
  if (popupActive) {
    if (!galleryDeferralStart) galleryDeferralStart = Date.now();
    // Stop deferring after 5s of continuous popup activity
    if (Date.now() - galleryDeferralStart < 5000) {
      logGalleryEntry('INFO', 'Popup is active, deferring full gallery data load to prevent contention.');
      setTimeout(guardedLoadMediaDataFromBackground, 800);
      return;
    } else {
      logGalleryEntry('INFO', 'Popup active too long; proceeding with cautious gallery load.');
    }
  } else {
    galleryDeferralStart = 0;
  }
  await loadMediaDataFromBackground();
}

async function loadMediaDataFromBackground() {
    logGalleryEntry('DEBUG', 'Loading media data from background DB.');
    return new Promise((resolve, reject) => {
        const openRequest = indexedDB.open(DB_NAME);
        openRequest.onsuccess = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                logGalleryEntry('WARN', "Media items store not found during load in Gallery.");
                galleryData = [];
                // Ensure UI updates even if store is missing
                try {
                    updateFilterOptions();
                    updateCollectionFilterOptions();
                    applyFilters();
                    renderGallery();
                } catch(_) {}
                resolve();
                return;
            }
            
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
            
            // First, get the count to determine if we need chunked loading
            const countRequest = store.count();
            countRequest.onsuccess = () => {
                const totalCount = countRequest.result;
                totalItems = totalCount;
                
                if (totalCount === 0) {
                    galleryData = [];
                    updateFilterOptions();
                    updateCollectionFilterOptions();
                    applyFilters();
                    renderGallery();
                    resolve();
                    return;
                }
                
                // Always use streamed loading to avoid loading all Blobs at once
                logGalleryEntry('INFO', `Streaming ${totalCount} items from DB to reduce memory usage.`);
                loadAllDataStreamed(store, resolve);
            };
            
            countRequest.onerror = (e) => {
                logGalleryEntry('ERROR', 'Error counting media items in Gallery', { error: e.target.error });
                galleryData = [];
                // Ensure UI reflects empty/error state
                try {
                    updateFilterOptions();
                    updateCollectionFilterOptions();
                    applyFilters();
                    renderGallery();
                } catch(_) {}
                resolve();
            };
        };
        
        openRequest.onerror = (event) => {
            logGalleryEntry('ERROR', 'Failed to open DB for media in Gallery', { error: event.target.error });
            galleryData = [];
            // Ensure UI reflects empty/error state
            try {
                updateFilterOptions();
                updateCollectionFilterOptions();
                applyFilters();
                renderGallery();
            } catch(_) {}
            resolve();
        };
    });
}

function loadAllDataAtOnce(store, resolve) {
                const request = store.getAll();

                request.onsuccess = () => {
                const allItems = request.result || [];
        galleryData = processItemsBatch(allItems);
        
        logGalleryEntry('INFO', `Loaded ${galleryData.length} media items from DB.`);
        updateFilterOptions();
        updateCollectionFilterOptions();
        applyFilters();
        renderGallery();
        resolve();
    };
    
    request.onerror = (e) => {
        logGalleryEntry('ERROR', 'Error loading media from DB for Gallery', { error: e.target.error });
        galleryData = [];
        resolve();
    };
}

function loadAllDataAtOnceOptimized(store, resolve) {
    const request = store.getAll();
    
    request.onsuccess = () => {
        const allItems = request.result || [];
        
        // Process items in batches to avoid blocking the UI
                const batchSize = 300;
                const batches = [];
                for (let i = 0; i < allItems.length; i += batchSize) {
                    batches.push(allItems.slice(i, i + batchSize));
                }
                
                galleryData = [];
                let processedCount = 0;
                
                const processBatch = (batchIndex) => {
                    if (batchIndex >= batches.length) {
                logGalleryEntry('INFO', `Loaded ${galleryData.length} media items from DB using optimized loading.`);
                        updateFilterOptions();
                        updateCollectionFilterOptions();
                        applyFilters();
                        renderGallery();
                        resolve();
                        return;
                    }
                    
                    const batch = batches[batchIndex];
            const processedItems = processItemsBatch(batch);
                    galleryData.push(...processedItems);
                    processedCount += batch.length;
                    
            // Use requestAnimationFrame to allow UI updates between batches
            requestAnimationFrame(() => processBatch(batchIndex + 1));
                };
                
                processBatch(0);
            };
            
                request.onerror = (e) => {
        logGalleryEntry('ERROR', 'Error loading media from DB for Gallery (optimized)', { error: e.target.error });
                    galleryData = [];
                    resolve();
                };
}

function loadAllDataStreamed(store, resolve) {
    try {
        galleryData = [];
        const cursorRequest = store.openCursor();
        let processed = 0;
        let batchUpdateEvery = 200; // default periodic updates after first page is visible

        cursorRequest.onsuccess = (event) => {
            const cursor = event.target.result;
            if (cursor) {
                const raw = cursor.value || {};
                // Build minimal index item (no large URLs/DataURLs)
                const minimal = {
                    id: raw.id,
                    author: raw.author || null,
                    date: raw.date || new Date().toISOString(),
                    type: raw.type || (typeof raw.url === 'string' && raw.url.includes('video') ? 'video' : 'image'),
                    favorite: !!raw.favorite,
                    isGif: !!raw.isGif,
                    url: null,
                    thumbnailUrl: null,
                    localDataUrl: null,
                    originalRemoteUrl: null,
                    savedAsMetadata: raw.savedAsMetadata === true,
                    tweetId: raw.tweetId || null,
                    mimeType: raw.mimeType || null,
                    imported: raw.imported === true,
                    width: raw.width || 0,
                    height: raw.height || 0,
                    duration: raw.duration || 0,
                };
                galleryData.push(minimal);
                processed++;

                // Immediately render the very first page so thumbnails work right away
                if (processed === imagesPerPage) {
                    try {
                        updateFilterOptions();
                        updateCollectionFilterOptions();
                        applyFilters();
                        renderGallery();
                    } catch(_) {}
                } else if (processed < imagesPerPage) {
                    // For items before first page is filled, keep UI responsive
                    try { applyFilters(); renderGallery(); } catch(_) {}
                } else if (processed % batchUpdateEvery === 0) {
                    try {
                        updateFilterOptions();
                        updateCollectionFilterOptions();
                        applyFilters();
                        renderGallery();
                    } catch(_) {}
                }
                cursor.continue();
            } else {
                logGalleryEntry('INFO', `Streamed ${galleryData.length} media items from DB.`);
                updateFilterOptions();
                updateCollectionFilterOptions();
                applyFilters();
                renderGallery();
                resolve();
            }
        };
        cursorRequest.onerror = (e) => {
            logGalleryEntry('ERROR', 'Streamed load failed in Gallery', { error: e.target.error });
            galleryData = [];
            resolve();
        };
    } catch (e) {
        logGalleryEntry('ERROR', 'Exception in loadAllDataStreamed', { error: e });
        galleryData = [];
        resolve();
    }
}

function processItemsBatch(items) {
    return items.map(item => ({
        ...item,
        type: item.type || (item.url && (item.url instanceof Blob || (typeof item.url === 'string' && item.url.includes('video')) || (item.thumbnailUrl && (item.thumbnailUrl instanceof Blob || (typeof item.thumbnailUrl === 'string' && item.thumbnailUrl.includes('video'))))) ? 'video' : 'image'),
        favorite: typeof item.favorite === 'boolean' ? item.favorite : false,
        isGif: typeof item.isGif === 'boolean' ? item.isGif : (item.url && (item.url instanceof Blob || (typeof item.url === 'string' && (item.url.includes('/tweet_video/') || item.url.toLowerCase().includes('.gif'))))) || (item.type === 'video' && item.url && typeof item.url === 'string' && item.url.includes('/tweet_video/')),
        localDataUrl: item.localDataUrl || null,
        url: item.url || null,
        originalRemoteUrl: item.originalRemoteUrl || (typeof item.url === 'string' && !item.url.startsWith('data:') && !item.url.startsWith('blob:') ? item.url : null),
        savedAsMetadata: item.savedAsMetadata === true
    }));
}

async function fixExistingGifData() {
    logGalleryEntry('DEBUG', 'Checking and fixing existing GIF data (expanded detection)...');

    const shouldMarkGif = (it) => {
        try {
            if (it.isGif === true) return true;
            const url = typeof it.url === 'string' ? it.url : '';
            const thumb = typeof it.thumbnailUrl === 'string' ? it.thumbnailUrl : '';
            const localStr = (typeof it.localDataUrl === 'string') ? it.localDataUrl : '';
            const localIsGifBlob = (it.localDataUrl && typeof it.localDataUrl === 'object' && typeof it.localDataUrl.type === 'string' && it.localDataUrl.type.toLowerCase() === 'image/gif');
            const mime = (it.mimeType || '').toLowerCase();
            const original = (it.originalFilename || '').toLowerCase();
            const urlSuggests = url.toLowerCase().includes('.gif') || url.includes('/tweet_video/');
            const thumbSuggests = thumb.toLowerCase().includes('.gif') || thumb.includes('/tweet_video/');
            const localSuggests = localStr.startsWith('data:image/gif') || localIsGifBlob;
            const mimeSuggests = mime === 'image/gif' || mime === 'video/gif';
            const originalSuggests = original.endsWith('.gif');
            return urlSuggests || thumbSuggests || localSuggests || mimeSuggests || originalSuggests;
        } catch(_) { return false; }
    };

    return new Promise((resolve) => {
        const openRequest = indexedDB.open(DB_NAME);
        openRequest.onsuccess = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) { resolve(); return; }

            const transaction = db.transaction(STORE_NAME, 'readwrite');
            const store = transaction.objectStore(STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const items = request.result || [];
                let fixedCount = 0;
                const updatedIds = [];

                items.forEach(item => {
                    if (shouldMarkGif(item) && item.isGif !== true) {
                        item.isGif = true;
                        try { store.put(item); fixedCount++; updatedIds.push(item.id); } catch(_) {}
                    }
                });

                transaction.oncomplete = () => {
                    if (fixedCount > 0) {
                        logGalleryEntry('INFO', `Marked ${fixedCount} items as GIF via expanded detection.`);
                        try {
                            // Update in-memory galleryData and re-render if present
                            if (Array.isArray(galleryData) && galleryData.length > 0) {
                                galleryData.forEach(g => { if (updatedIds.includes(g.id)) g.isGif = true; });
                                applyFilters();
                                renderGallery();
                            }
                        } catch(_) {}
                    }
                    resolve();
                };
                transaction.onerror = () => resolve();
            };
            request.onerror = () => resolve();
        };
        openRequest.onerror = () => resolve();
    });
}

function handleClearFilters() {
    logGalleryEntry('INFO', 'Clear filters button clicked.');
    currentAuthor = 'all';
    currentCollectionFilter = 'all';
    currentTypeFilter = 'all';
    currentSort = 'newest';
    currentDateFilter = 'all';
    searchQuery = '';
    currentPage = 1;

    document.getElementById('author-filter').value = 'all';
    document.getElementById('collection-filter').value = 'all';
    document.getElementById('type-filter').value = 'all';
    document.getElementById('sort-order').value = 'newest';
    document.getElementById('date-filter').value = 'all';
    document.getElementById('image-search').value = '';

    applyFilters();
    renderGallery();
    showNotification('Filters cleared', 'info');
}
function handleRandomAuthorButtonClick() {
    logGalleryEntry('INFO', 'Random author button clicked.');
    const authorSelect = document.getElementById('author-filter');
    const allAuthors = new Set(galleryData.map(item => item.author).filter(Boolean));
    const authorArray = Array.from(allAuthors);

    if (authorArray.length > 0) {
        const randomAuthor = authorArray[Math.floor(Math.random() * authorArray.length)];
        logGalleryEntry('INFO', `Random author selected: ${randomAuthor}`);
        currentAuthor = randomAuthor;
        authorSelect.value = randomAuthor;
        currentPage = 1;
        applyFilters();
        renderGallery();
    } else {
        showNotification('No authors available to select randomly.', 'info');
    }
}

function setupEventListeners() {
  try {
  logGalleryEntry('DEBUG', 'Setting up gallery event listeners.');
  const authorFilterSelect = document.getElementById('author-filter');
  if (authorFilterSelect) authorFilterSelect.addEventListener('change', function() { currentAuthor = this.value; currentPage = 1; applyFilters(); renderGallery(); });

  const randomAuthorBtn = document.getElementById('random-author-btn');
  if (randomAuthorBtn) randomAuthorBtn.addEventListener('click', handleRandomAuthorButtonClick);

  const collectionFilterSelect = document.getElementById('collection-filter');
  if (collectionFilterSelect) collectionFilterSelect.addEventListener('change', function() { currentCollectionFilter = this.value; currentPage = 1; applyFilters(); renderGallery(); });

  const sortOrderSelect = document.getElementById('sort-order');
  if (sortOrderSelect) sortOrderSelect.addEventListener('change', function() { currentSort = this.value; applyFilters(); renderGallery(); });

  const dateFilterSelect = document.getElementById('date-filter');
  if (dateFilterSelect) dateFilterSelect.addEventListener('change', function() { currentDateFilter = this.value; currentPage = 1; applyFilters(); renderGallery(); });

  const typeFilterSelect = document.getElementById('type-filter');
  if (typeFilterSelect) typeFilterSelect.addEventListener('change', function() { currentTypeFilter = this.value; currentPage = 1; applyFilters(); renderGallery(); });

  const imageSearchInput = document.getElementById('image-search');
  if (imageSearchInput) imageSearchInput.addEventListener('input', debounce(function() { searchQuery = this.value.trim().toLowerCase(); currentPage = 1; applyFilters(); renderGallery(); }, 300));

  const clearFiltersBtn = document.getElementById('clear-filters-btn');
  if (clearFiltersBtn) clearFiltersBtn.addEventListener('click', handleClearFilters);

  const prevPageBtn = document.getElementById('prev-page');
  if (prevPageBtn) prevPageBtn.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderGallery(); window.scrollTo(0, 0); } });

  const nextPageBtn = document.getElementById('next-page');
  if (nextPageBtn) nextPageBtn.addEventListener('click', () => { const totalPages = Math.ceil(filteredData.length / imagesPerPage); if (currentPage < totalPages) { currentPage++; renderGallery(); window.scrollTo(0, 0); } });

  const modal = document.getElementById('media-modal');
  if (modal) {
    modal.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
    modal.querySelector('.close-modal')?.addEventListener('click', closeModal);
    document.getElementById('download-media')?.addEventListener('click', () => requestModalMediaDownload());
    document.getElementById('open-tweet')?.addEventListener('click', openTweetPage);
  }

  document.addEventListener('keydown', function(e) {
    if (e.key !== 'Escape') return;
    if (document.getElementById('media-modal')?.classList.contains('active')) closeModal();
    if (document.getElementById('manage-collections-modal')?.classList.contains('active')) closeManageCollectionsModal();
  });

  const manageCollectionsModal = document.getElementById('manage-collections-modal');
  if(manageCollectionsModal){
    manageCollectionsModal.querySelector('.modal-overlay')?.addEventListener('click', closeManageCollectionsModal);
    document.getElementById('close-manage-collections-modal')?.addEventListener('click', closeManageCollectionsModal);
    document.getElementById('cancel-collection-changes-gallery')?.addEventListener('click', closeManageCollectionsModal);
    document.getElementById('create-and-add-collection-gallery')?.addEventListener('click', handleCreateAndAddCollectionGallery);
    document.getElementById('save-collection-changes-gallery')?.addEventListener('click', handleSaveCollectionChangesGallery);
    document.getElementById('search-collections-modal-gallery')?.addEventListener('input', debounce(handleSearchCollectionsInModal, 250));
    document.getElementById('remove-from-all-collections-gallery')?.addEventListener('click', handleRemoveMediaFromAllCollectionsGallery);
  }

  const toggleImportBtn = document.getElementById('toggle-import-controls-btn');
  const importControlsContainer = document.getElementById('gallery-import-controls-container');
  if (toggleImportBtn && importControlsContainer) {
    toggleImportBtn.addEventListener('click', () => {
        const isExpanded = toggleImportBtn.getAttribute('aria-expanded') === 'true';
        importControlsContainer.classList.toggle('hidden', isExpanded);
        toggleImportBtn.setAttribute('aria-expanded', !isExpanded);
        logGalleryEntry('INFO', `Import controls ${!isExpanded ? 'shown' : 'hidden'}.`);
    });
  }

  const directoryImportInputGallery = document.getElementById('directoryImportInputGallery');
  const folderSelectionFeedbackGallery = document.getElementById('folderSelectionFeedbackGallery');
  if (directoryImportInputGallery && folderSelectionFeedbackGallery) {
    directoryImportInputGallery.addEventListener('change', function() {
        folderSelectionFeedbackGallery.textContent = (this.files && this.files.length > 0) ?
            `${this.files.length} items found in selected folder.` :
            'No folder selected or folder is empty.';
    });
  }

  document.getElementById('processDirectoryImportGallery')?.addEventListener('click', handleDirectoryImportGallery);
  document.getElementById('abortImportGallery')?.addEventListener('click', () => {
    isImportAborted = true;
    const abortButton = document.getElementById('abortImportGallery');
    if(abortButton) { abortButton.disabled = true; abortButton.textContent = "Aborting..."; }
    logGalleryEntry('INFO', "User requested import abort.");
    showNotification("Import abort requested. Finishing current file...", "warn");
  });

   const advancedOptionsToggle = document.getElementById('import-advanced-options-toggle');
   const advancedOptionsContainer = document.getElementById('import-advanced-options-container');
   if(advancedOptionsToggle && advancedOptionsContainer){
     advancedOptionsToggle.addEventListener('click', () => {
        const isHidden = advancedOptionsContainer.classList.toggle('hidden');
        advancedOptionsToggle.textContent = isHidden ? 'Advanced options ▲' : 'Advanced options ▼';
     });
   }

  document.getElementById('batch-select-toggle-btn')?.addEventListener('click', toggleBatchSelectMode);
  document.getElementById('virtual-scroll-toggle-btn')?.addEventListener('click', toggleVirtualScrolling);
  document.getElementById('select-all-visible-btn')?.addEventListener('click', handleSelectAllVisible);
  document.getElementById('deselect-all-visible-btn')?.addEventListener('click', handleDeselectAllVisible);
  document.getElementById('delete-selected-btn')?.addEventListener('click', handleDeleteSelected);

  // Tab navigation
  const tabButtons = document.querySelectorAll('.tab-button');
  const tabContents = document.querySelectorAll('.tab-content');
  
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Remove active class from all tabs
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
      });
      tabContents.forEach(content => content.classList.remove('active'));

      // Add active class to clicked tab
      button.classList.add('active');
      button.setAttribute('aria-selected', 'true');
      const activeTabContent = document.getElementById(`${button.dataset.tab}-tab`);
      if (activeTabContent) activeTabContent.classList.add('active');

      // Load logs if logs tab is clicked
      if (button.dataset.tab === 'logs') {
        fetchAndDisplayLogsGallery();
      }
    });
  });

  // Logs functionality - matching popup exactly
  document.getElementById('refresh-logs-btn-gallery')?.addEventListener('click', fetchAndDisplayLogsGallery);
  document.querySelectorAll('.log-level-filter-gallery').forEach(checkbox => 
    checkbox.addEventListener('change', fetchAndDisplayLogsGallery));
  document.querySelectorAll('.log-source-filter-gallery').forEach(checkbox => 
    checkbox.addEventListener('change', fetchAndDisplayLogsGallery));
  document.getElementById('log-text-filter-gallery')?.addEventListener('input', 
    debounce(fetchAndDisplayLogsGallery, 300));
  document.getElementById('copy-logs-btn-gallery')?.addEventListener('click', copyFilteredLogsToClipboardGallery);
  document.getElementById('download-logs-btn-gallery')?.addEventListener('click', downloadFilteredLogsGallery);
  document.getElementById('clear-all-logs-btn-gallery')?.addEventListener('click', clearAllLogsFromGallery);

  logGalleryEntry('DEBUG', 'Gallery event listeners setup complete.');
  } catch (error) {
    logGalleryEntry('ERROR', 'Error setting up gallery event listeners', { error: error });
    showNotification('Error setting up gallery controls. Some features may not work.', 'error');
  }
}

// --- START: Folder Import Functions (Optimized for Gallery) ---
async function handleDirectoryImportGallery() {
    const directoryInput = document.getElementById('directoryImportInputGallery');
    const importButton = document.getElementById('processDirectoryImportGallery');
    const abortButton = document.getElementById('abortImportGallery');
    const folderSelectionFeedback = document.getElementById('folderSelectionFeedbackGallery');
    const progressBarFill = document.getElementById('importProgressBarFillGallery');
    const importProgressText = document.getElementById('importProgressTextGallery');
    const importProgressContainer = document.getElementById('importProgressContainerGallery');
    const startFreshCheckbox = document.getElementById('startFreshImportGallery');
    const startFreshChecked = !!(startFreshCheckbox && startFreshCheckbox.checked);

    isImportAborted = false;
    if (abortButton) {
        abortButton.classList.remove('hidden');
        abortButton.disabled = false;
        abortButton.textContent = 'Abort Import';
    }

    const files = directoryInput.files;
    logGalleryEntry('INFO', `Processing folder import from Gallery. File count: ${files ? files.length : 'N/A'}`);

    if (!files || files.length === 0) {
        if (folderSelectionFeedback) folderSelectionFeedback.textContent = "No files selected. Please choose a folder.";
        showNotification("No files to import. Select a folder.", "info");
        if (importProgressContainer) importProgressContainer.style.display = 'none';
        if (abortButton) abortButton.classList.add('hidden');
        return;
    }

    if (startFreshChecked) {
        localStorage.removeItem(IMPORT_PROGRESS_KEY);
        logGalleryEntry('INFO', "Starting fresh import. Cleared previous progress.");
        showNotification("Starting fresh import, previous progress cleared.", "info");
    }
    let completedPaths = new Set(JSON.parse(localStorage.getItem(IMPORT_PROGRESS_KEY) || '[]'));
    let skippedDueToPreviousImport = 0;

    if (folderSelectionFeedback) folderSelectionFeedback.textContent = '';
    if (importProgressContainer) importProgressContainer.style.display = 'block';
    if (progressBarFill) progressBarFill.style.width = '0%';
    if (importProgressText) importProgressText.textContent = `Analyzing folder structure (${files.length} items)...`;

    const originalButtonText = importButton.textContent;
    importButton.textContent = 'Preparing...';
    importButton.disabled = true;

    if (startFreshChecked) {
        const authorsInSelection = new Set();
        for (const file of files) {
            if (file.webkitRelativePath) {
                const pathParts = file.webkitRelativePath.split('/');
                if (pathParts.length >= 3 && pathParts[pathParts.length - 3]?.startsWith('@')) {
                    authorsInSelection.add(pathParts[pathParts.length - 3]);
                } else if (pathParts.length === 2 && pathParts[0]?.startsWith('@')) {
                    authorsInSelection.add(pathParts[0]);
                }
            }
        }

        try {
            if (importProgressText) importProgressText.textContent = `Preparing import: Clearing data for ${authorsInSelection.size} authors...`;
            await new Promise((resolvePromise, rejectPromise) => {
                chrome.runtime.sendMessage({
                    action: 'prepareAndClearAuthorsForImport',
                    authors: Array.from(authorsInSelection),
                    totalFiles: files.length
                }, (response) => {
                    if (chrome.runtime.lastError) rejectPromise(new Error(chrome.runtime.lastError.message));
                    else if (response && response.success) resolvePromise(response);
                    else rejectPromise(new Error(response?.error || 'Failed to prepare background for batch import.'));
                });
            });
        } catch (error) {
            logGalleryEntry('ERROR', 'Error preparing background (clearing authors)', { error: error });
            showNotification(`Error preparing import: ${error.message}. Please try again.`, 'error');
            importButton.textContent = originalButtonText;
            importButton.disabled = false;
            if (importProgressContainer) importProgressContainer.style.display = 'none';
            if (abortButton) abortButton.classList.add('hidden');
            return;
        }
    } else {
        if (completedPaths.size > 0) {
            logGalleryEntry('INFO', `Resuming import with ${completedPaths.size} previously completed items. Author data will not be cleared.`);
        }
    }

    importButton.textContent = 'Importing...';

    let overallItemsSentToBackground = 0;
    let overallSuccess = true;
    let filesProcessedInLocalStorageBatch = 0;
    const totalFilesToProcess = files.length;

    for (let i = 0; i < totalFilesToProcess; i++) {
        if (isImportAborted) break;

        const file = files[i];
        const currentFileProgressDisplay = i + 1;

        const analysisPhaseProgressPercentage = (currentFileProgressDisplay / totalFilesToProcess) * 50;
        if (progressBarFill) progressBarFill.style.width = `${analysisPhaseProgressPercentage}%`;
        if (importProgressText) importProgressText.textContent = `Analyzing ${currentFileProgressDisplay}/${totalFilesToProcess}: ${file.name.substring(0,20)}...`;

        await new Promise(resolve => setTimeout(resolve, 1));

        if (!file.webkitRelativePath) {
            logGalleryEntry('WARN', `Skipping file without webkitRelativePath: ${file.name}.`, { additionalDetails: { filename: file.name, type: file.type } });
            continue;
        }

        if (completedPaths.has(file.webkitRelativePath)) {
            skippedDueToPreviousImport++;
            continue;
        }

        const pathParts = file.webkitRelativePath.split('/');
        let authorName = '@unknown_import';
        let mediaTypeFromFile = file.type.startsWith('image/') ? 'image' : (file.type.startsWith('video/') ? 'video' : null);
        let typeFolder = null;

        if (pathParts.length >= 3) {
            if (pathParts[pathParts.length - 3]?.startsWith('@')) authorName = pathParts[pathParts.length - 3];
            const typePart = pathParts[pathParts.length - 2].toLowerCase();
            if (typePart === 'images') typeFolder = 'image';
            else if (typePart === 'videos') typeFolder = 'video';
        } else if (pathParts.length === 2) {
            if (pathParts[0]?.startsWith('@')) authorName = pathParts[0];
        }

        let actualMediaType = mediaTypeFromFile;
        if (typeFolder) actualMediaType = typeFolder;

        const validImageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        const validVideoExtensions = ['.mp4', '.webm', '.mov', '.ogv', '.mkv'];
        const fileNameLower = file.name.toLowerCase();

        if (!actualMediaType) {
            if (validImageExtensions.some(ext => fileNameLower.endsWith(ext))) actualMediaType = 'image';
            else if (validVideoExtensions.some(ext => fileNameLower.endsWith(ext))) actualMediaType = 'video';
            else continue;
        } else {
            if (actualMediaType === 'image' && !validImageExtensions.some(ext => fileNameLower.endsWith(ext)) && !file.type.startsWith('image/')) continue;
            if (actualMediaType === 'video' && !validVideoExtensions.some(ext => fileNameLower.endsWith(ext)) && !file.type.startsWith('video/')) continue;
        }


        let itemToSend = null;
        try {
            const mediaElementProperties = await getMediaPropertiesFromBlobGallery(file, actualMediaType === 'video');

            itemToSend = {
                id: file.name,
                originalFilename: file.name,
                url: file, // send Blob directly to avoid huge base64 strings
                localDataUrl: null,
                thumbnailUrl: null,
                author: authorName,
                date: new Date(file.lastModified).toISOString(),
                type: actualMediaType,
                isGif: file.type === 'image/gif' || (actualMediaType === 'video' && fileNameLower.endsWith('.gif')),
                savedAsMetadata: false,
                imported: true,
                favorite: false,
                width: mediaElementProperties.width,
                height: mediaElementProperties.height,
                duration: mediaElementProperties.duration,
                tweetId: null,
                _import_webkitRelativePath: file.webkitRelativePath,
                originalRemoteUrlIfUrlIsBlob: null,
                mimeType: file.type
            };
        } catch (error) {
            logGalleryEntry('ERROR', `Error processing file content for import: ${file.webkitRelativePath}`, { error: error });
            continue;
        }

        if (itemToSend) {
            const sendResponse = await sendBatchImportMessageGallery(
                [itemToSend], progressBarFill, importProgressText,
                overallItemsSentToBackground, totalFilesToProcess - skippedDueToPreviousImport,
                analysisPhaseProgressPercentage, itemToSend.originalFilename
            );

            if (sendResponse.success && sendResponse.itemReceivedCountForProgress > 0) {
                overallItemsSentToBackground += sendResponse.itemReceivedCountForProgress;
                const sentPaths = sendResponse.successfullySentPathsInCurrentBatch || sendResponse.successfullySentPathsInBatch || [];
                if (sentPaths.length > 0) {
                    sentPaths.forEach(path => completedPaths.add(path));
                    filesProcessedInLocalStorageBatch++;
                }
            } else if (!sendResponse.success) {
                overallSuccess = false;
            }
        }

        if (filesProcessedInLocalStorageBatch >= IMPORT_COMPLETED_PATHS_SAVE_INTERVAL || i === totalFilesToProcess - 1) {
            localStorage.setItem(IMPORT_PROGRESS_KEY, JSON.stringify(Array.from(completedPaths)));
            filesProcessedInLocalStorageBatch = 0;
        }

        if (i % 10 === 0) await new Promise(resolve => setTimeout(resolve, 5));
    }

    if (abortButton) { abortButton.classList.add('hidden'); abortButton.disabled = true; }

    // Always ask background to flush any buffered items before final status
    try {
        await new Promise((resolvePromise, rejectPromise) => {
            chrome.runtime.sendMessage({ action: 'finalizeImport' }, (response) => {
                if (chrome.runtime.lastError) rejectPromise(new Error(chrome.runtime.lastError.message));
                else if (response && response.success) resolvePromise(response);
                else rejectPromise(new Error(response?.error || 'Failed to finalize import.'));
            });
        });
    } catch (finalizeError) {
        overallSuccess = false;
        logGalleryEntry('ERROR', 'Error finalizing import (flush buffer)', { error: finalizeError });
    }
    const finalItemsSent = overallItemsSentToBackground;

    if (isImportAborted) {
        showNotification(`Import aborted. ${finalItemsSent} files sent. ${skippedDueToPreviousImport} skipped. Progress saved.`, 'warn');
        if (importProgressText) importProgressText.textContent = `Import aborted. ${finalItemsSent} files sent.`;
    } else if (overallSuccess && (finalItemsSent > 0 || skippedDueToPreviousImport > 0)) {
        let successMsg = `${finalItemsSent} new files sent for import.`;
        if (skippedDueToPreviousImport > 0) successMsg += ` ${skippedDueToPreviousImport} files were already processed.`;
        showNotification(successMsg, 'success');
        if (importProgressText) importProgressText.textContent = `Import complete: ${finalItemsSent} new items.`;
        if (progressBarFill) progressBarFill.style.width = '100%';
        localStorage.removeItem(IMPORT_PROGRESS_KEY);
    } else if (finalItemsSent > 0 && !overallSuccess) {
        showNotification(`Import partially completed. ${finalItemsSent} files sent. Some errors. Progress saved.`, 'warn');
        if (importProgressText) importProgressText.textContent = `Import partially complete. ${finalItemsSent} items.`;
    } else if (!overallSuccess && finalItemsSent === 0 && skippedDueToPreviousImport === 0) {
        showNotification('Import failed. No files processed. Please check logs. Progress saved.', 'error');
        if (importProgressText) importProgressText.textContent = `Import failed.`;
    } else {
        showNotification('No new media files found or all files were skipped.', 'info');
        if (importProgressText) importProgressText.textContent = `No new media for import. ${skippedDueToPreviousImport} skipped.`;
        if (skippedDueToPreviousImport > 0 && totalFilesToProcess === skippedDueToPreviousImport) localStorage.removeItem(IMPORT_PROGRESS_KEY);
    }

    if (directoryInput) directoryInput.value = '';
    importButton.textContent = originalButtonText;
    importButton.disabled = false;
    if (importProgressContainer) {
        setTimeout(() => {
            importProgressContainer.style.display = 'none';
            if (progressBarFill) progressBarFill.style.width = '0%';
        }, isImportAborted ? 2000 : 5000);
    }
}


function readFileAsDataURLGallery(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => {
        logGalleryEntry('ERROR', `FileReader error for ${file.name}`, { error: reader.error, additionalDetails: { filename: file.name, type: file.type } });
        reject(reader.error);
    }
    reader.readAsDataURL(file);
  });
}

function getMediaPropertiesGallery(fileUrl, isVideo) {
  return new Promise((resolve) => {
    const mediaElement = isVideo ? document.createElement('video') : new Image();
    const handleSuccess = () => {
      resolve({
        width: isVideo ? mediaElement.videoWidth : mediaElement.naturalWidth,
        height: isVideo ? mediaElement.videoHeight : mediaElement.naturalHeight,
        duration: isVideo ? mediaElement.duration : 0,
      });
      mediaElement.onloadedmetadata = null; mediaElement.onload = null; mediaElement.onerror = null;
      if (isVideo) { mediaElement.src = ''; mediaElement.removeAttribute('src'); }
    };
    const handleError = (e) => {
      logGalleryEntry('WARN', `Failed to load media for properties (Gallery): ${e.type || 'Unknown'}`, { additionalDetails: { fileUrlStart: fileUrl.substring(0,50)+'...', isVideo } });
      resolve({ width: 0, height: 0, duration: 0 });
      mediaElement.onloadedmetadata = null; mediaElement.onload = null; mediaElement.onerror = null;
      if (isVideo) { mediaElement.src = ''; mediaElement.removeAttribute('src'); }
    };
    mediaElement.onloadedmetadata = handleSuccess; mediaElement.onload = handleSuccess; mediaElement.onerror = handleError;
    mediaElement.src = fileUrl;
    if (isVideo) mediaElement.load();
  });
}

function getMediaPropertiesFromBlobGallery(fileBlob, isVideo) {
  return new Promise((resolve) => {
    try {
      const objectUrl = URL.createObjectURL(fileBlob);
      const mediaElement = isVideo ? document.createElement('video') : new Image();

      const cleanup = () => {
        try { URL.revokeObjectURL(objectUrl); } catch(_) {}
        if (isVideo) { mediaElement.src = ''; mediaElement.removeAttribute('src'); }
      };

      const handleSuccess = () => {
        const width = isVideo ? mediaElement.videoWidth : mediaElement.naturalWidth;
        const height = isVideo ? mediaElement.videoHeight : mediaElement.naturalHeight;
        const duration = isVideo ? (Number.isFinite(mediaElement.duration) ? mediaElement.duration : 0) : 0;
        cleanup();
        resolve({ width, height, duration });
      };
      const handleError = (e) => {
        logGalleryEntry('WARN', `Failed to load media for properties from Blob (Gallery): ${e?.type || 'Unknown'}`, { additionalDetails: { isVideo, size: fileBlob && fileBlob.size } });
        cleanup();
        resolve({ width: 0, height: 0, duration: 0 });
      };

      mediaElement.onloadedmetadata = handleSuccess;
      mediaElement.onload = handleSuccess;
      mediaElement.onerror = handleError;
      mediaElement.src = objectUrl;
      if (isVideo) mediaElement.load();
    } catch (error) {
      logGalleryEntry('WARN', 'Exception getting media properties from Blob', { error: error });
      resolve({ width: 0, height: 0, duration: 0 });
    }
  });
}

async function sendBatchImportMessageGallery(
    mediaItemsChunkToSend, progressBarFill, importProgressText,
    itemsSuccessfullySentToBgBeforeThisChunk, totalFilesToActuallySendInSession,
    currentAnalysisPhaseProgressPercentage,
    originalFilenameForDisplay
) {
  if (isImportAborted) {
    return { success: true, aborted: true, successfullySentPathsInBatch: [], itemReceivedCountForProgress: 0 };
  }

  const successfullySentPathsInCurrentBatch = [];
  let anyItemFailedToSendThisChunk = false;
  let itemsAcknowledgedByBgThisChunk = 0;

  for (let i = 0; i < mediaItemsChunkToSend.length; i++) {
    if (isImportAborted) break;
    const singleMediaItem = mediaItemsChunkToSend[i];

    const itemsConsideredOrSentThisSendingPhase = itemsSuccessfullySentToBgBeforeThisChunk + itemsAcknowledgedByBgThisChunk + 1;
    let sendingPhaseProgressContribution = 0;
    if (totalFilesToActuallySendInSession > 0) {
        sendingPhaseProgressContribution = (1 / totalFilesToActuallySendInSession) * 50;
    }

    const currentOverallProgress = currentAnalysisPhaseProgressPercentage +
                                 ((itemsSuccessfullySentToBgBeforeThisChunk + itemsAcknowledgedByBgThisChunk) / totalFilesToActuallySendInSession * 50) +
                                 sendingPhaseProgressContribution;

    if (progressBarFill) progressBarFill.style.width = `${Math.min(100, currentOverallProgress)}%`;
    if (importProgressText) {
        const displayFilename = originalFilenameForDisplay || singleMediaItem.id.substring(0,15);
        importProgressText.textContent = `Sending to BG ${itemsConsideredOrSentThisSendingPhase} of ${totalFilesToActuallySendInSession} (Item: ${displayFilename})...`;
    }

    try {
      const messagePayload = {
          action: 'batchImportAuthorMedia',
          mediaItems: [singleMediaItem],
          originalFilename: singleMediaItem.originalFilename
      };
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage(messagePayload, (res) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (res && res.success !== undefined) resolve(res);
          else reject(new Error(res?.error || 'Malformed response from background.'));
        });
      });

      if (response.success && response.itemReceived) {
        itemsAcknowledgedByBgThisChunk++;
        if (singleMediaItem._import_webkitRelativePath) {
           successfullySentPathsInCurrentBatch.push(singleMediaItem._import_webkitRelativePath);
        }
      } else {
        anyItemFailedToSendThisChunk = true;
        logGalleryEntry('ERROR', `Background script reported failure for item ${singleMediaItem.id} (Path: ${singleMediaItem._import_webkitRelativePath})`, {additionalDetails: {error: response.error}});
         if (importProgressText) importProgressText.textContent = `Error for item ${singleMediaItem.id}: ${response.error?.substring(0,30)||"Unknown"}...`;
      }

    } catch (error) {
      anyItemFailedToSendThisChunk = true;
      logGalleryEntry('ERROR', `Error sending item ${singleMediaItem.id} (Path: ${singleMediaItem._import_webkitRelativePath}) to background`, { error: error });
      if (importProgressText) importProgressText.textContent = `Error sending item ${singleMediaItem.id}: ${error.message.substring(0,30)}...`;
    }
  }

  return {
    success: !anyItemFailedToSendThisChunk,
    aborted: isImportAborted,
    successfullySentPathsInCurrentBatch: successfullySentPathsInCurrentBatch,
    itemReceivedCountForProgress: itemsAcknowledgedByBgThisChunk
  };
}


// --- END: Folder Import Functions ---

function updateFilterOptions() {
    const authorSelect = document.getElementById('author-filter');
    if (!authorSelect) return;

    const currentSelectedValue = authorSelect.value;
    const firstOptionValue = 'all', firstOptionText = 'All Authors';
    authorSelect.innerHTML = `<option value="${firstOptionValue}">${firstOptionText}</option>`;

    const allAuthorsSet = new Set(galleryData.map(item => item.author).filter(Boolean));
    const sortedAllAuthors = Array.from(allAuthorsSet).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const favoriteAuthorsGroup = favoriteAuthorsList
        .filter(favAuthor => allAuthorsSet.has(favAuthor))
        .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

    const otherAuthorsGroup = sortedAllAuthors.filter(author => !favoriteAuthorsList.includes(author));

    const createOptgroup = (label, authors) => {
        if (authors.length === 0) return null;
        const optgroup = document.createElement('optgroup');
        optgroup.label = label;
        authors.forEach(author => {
            const option = document.createElement('option');
            option.value = author;
            option.textContent = author;
            optgroup.appendChild(option);
        });
        return optgroup;
    };

    const favOptgroup = createOptgroup('⭐ Favorite Authors', favoriteAuthorsGroup);
    if (favOptgroup) authorSelect.appendChild(favOptgroup);

    const otherOptgroupLabel = favoriteAuthorsGroup.length > 0 ? 'Other Authors' : (allAuthorsSet.size > 0 ? 'Authors' : 'All Authors (None found)');
    const otherOptgroup = createOptgroup(otherOptgroupLabel, otherAuthorsGroup);
    if (otherOptgroup) authorSelect.appendChild(otherOptgroup);

    let valueToSet = 'all';
    if (Array.from(authorSelect.options).some(opt => opt.value === currentSelectedValue)) {
      valueToSet = currentSelectedValue;
    } else if (currentAuthor !== 'all' && Array.from(authorSelect.options).some(opt => opt.value === currentAuthor)) {
      valueToSet = currentAuthor;
    }
    authorSelect.value = valueToSet;
    currentAuthor = authorSelect.value;
}

function updateCollectionFilterOptions() {
    const collectionSelect = document.getElementById('collection-filter');
    if (!collectionSelect) return;
    const currentSelectedValue = collectionSelect.value;

    collectionSelect.innerHTML = '<option value="all">All Media</option>';

    collectionsList.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    collectionsList.forEach(collection => {
        const option = document.createElement('option');
        option.value = collection.id.toString();
        option.textContent = `${collection.name} (${collection.mediaIds.length})`;
        collectionSelect.appendChild(option);
    });

    if (Array.from(collectionSelect.options).some(opt => opt.value === currentSelectedValue)) {
        collectionSelect.value = currentSelectedValue;
    } else {
        collectionSelect.value = 'all';
        currentCollectionFilter = 'all';
    }
}

function applyFilters() {
    let dataToFilter = [...galleryData];

    if (currentAuthor !== 'all') {
        dataToFilter = dataToFilter.filter(item => item.author === currentAuthor);
    }
    if (currentCollectionFilter !== 'all') {
        const collection = collectionsList.find(c => c.id.toString() === currentCollectionFilter);
        if (collection) {
            const mediaIdsInCollection = new Set(collection.mediaIds);
            dataToFilter = dataToFilter.filter(item => mediaIdsInCollection.has(item.id));
        } else {
            dataToFilter = [];
        }
    }
    if (currentTypeFilter === 'favorites') {
        dataToFilter = dataToFilter.filter(item => item.favorite === true);
    } else if (currentTypeFilter === 'gif') {
        // GIFs: explicitly flagged, URL suggests gif-like MP4, MIME hints, or imported short looping videos without remote URL
        dataToFilter = dataToFilter.filter(item => {
            if (item.isGif === true) return true;
            const urlStr = typeof item.url === 'string' ? item.url : '';
            const thumbStr = typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : '';
            const localStr = (typeof item.localDataUrl === 'string') ? item.localDataUrl : '';
            const mime = (item.mimeType || '').toLowerCase();
            const looksLikeGifUrl = urlStr.toLowerCase().includes('.gif') || urlStr.includes('/tweet_video/');
            const looksLikeGifThumb = thumbStr.toLowerCase().includes('.gif') || thumbStr.includes('/tweet_video/');
            const looksLikeGifLocal = localStr.startsWith('data:image/gif');
            const mimeSuggestsGif = mime === 'image/gif' || mime === 'video/gif';
            const importedShortVideo = (item.imported === true && item.type === 'video' && (item.duration || 0) > 0 && (item.duration || 0) <= 8 && !item.originalRemoteUrl && !item.originalRemoteUrlIfUrlIsBlob && (!item.url || typeof item.url !== 'string'));
            return looksLikeGifUrl || looksLikeGifThumb || looksLikeGifLocal || mimeSuggestsGif || importedShortVideo;
        });
    } else if (currentTypeFilter !== 'all') {
        if (currentTypeFilter === 'video') {
            // Video section: exclude GIFs
            dataToFilter = dataToFilter.filter(item => 
                item.type === 'video' && 
                item.isGif !== true &&
                !(item.url && typeof item.url === 'string' && 
                  (item.url.toLowerCase().includes('.gif') || item.url.includes('/tweet_video/')))
            );
        } else if (currentTypeFilter === 'image') {
            // Image section: exclude GIFs (they have their own section)
            dataToFilter = dataToFilter.filter(item => {
                if (item.type !== 'image') return false;
                if (item.isGif === true) return false;
                const urlStr = typeof item.url === 'string' ? item.url : '';
                const thumbStr = typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : '';
                const localStr = (typeof item.localDataUrl === 'string') ? item.localDataUrl : '';
                const mime = (item.mimeType || '').toLowerCase();
                const isGifish = urlStr.toLowerCase().includes('.gif') || urlStr.includes('/tweet_video/') ||
                                 thumbStr.toLowerCase().includes('.gif') || thumbStr.includes('/tweet_video/') ||
                                 localStr.startsWith('data:image/gif') || mime === 'image/gif' || mime === 'video/gif';
                return !isGifish;
            });
        } else {
            dataToFilter = dataToFilter.filter(item => item.type === currentTypeFilter);
        }
    }
    if (currentDateFilter !== 'all') {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        dataToFilter = dataToFilter.filter(item => {
            const itemDate = new Date(item.date);
            switch (currentDateFilter) {
                case 'today': return itemDate >= today;
                case 'yesterday': return itemDate >= new Date(today.getTime() - 86400000) && itemDate < today;
                case 'week':
                    const firstDayOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
                    return itemDate >= firstDayOfWeek;
                case 'last_7_days':
                    return itemDate >= new Date(now.getTime() - 7 * 86400000);
                case 'month':
                    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    return itemDate >= firstDayOfMonth;
                case 'last_30_days':
                     return itemDate >= new Date(now.getTime() - 30 * 86400000);
                default: return true;
            }
        });
    }
    if (searchQuery) {
        dataToFilter = dataToFilter.filter(item =>
            (item.author && item.author.toLowerCase().includes(searchQuery)) ||
            (item.tweetId && item.tweetId.includes(searchQuery)) ||
            (item.id && item.id.toLowerCase().includes(searchQuery)) ||
            (item.originalFilename && item.originalFilename.toLowerCase().includes(searchQuery))
        );
    }

    const sortFunctions = {
        'newest': (a,b) => new Date(b.date) - new Date(a.date),
        'oldest': (a,b) => new Date(a.date) - new Date(b.date),
        'author_az': (a,b) => (a.author || '').toLowerCase().localeCompare((b.author || '').toLowerCase()) || (new Date(b.date) - new Date(a.date)),
        'author_za': (a,b) => (b.author || '').toLowerCase().localeCompare((a.author || '').toLowerCase()) || (new Date(b.date) - new Date(a.date)),
        'random': () => 0.5 - Math.random()
    };

    if (sortFunctions[currentSort]) {
        dataToFilter.sort(sortFunctions[currentSort]);
    }

    filteredData = dataToFilter;
    logGalleryEntry('INFO', `Applied filters. Filtered items: ${filteredData.length}`);
}

function renderGallery() {
    if (isRendering) {
        logGalleryEntry('DEBUG', 'Render already in progress, skipping...');
        return;
    }
    
    isRendering = true;
    
    const mediaGrid = document.getElementById('media-grid');
    const emptyState = document.getElementById('empty-state');
    if (!mediaGrid || !emptyState) {
        logGalleryEntry('ERROR', 'Media grid or empty state element not found for rendering gallery.');
        isRendering = false;
        return;
    }

    // Clean up previous render more aggressively
    if (!virtualScrollEnabled) {
    cleanupPreviousRender(mediaGrid);
    } else {
        // For virtual mode, only clear children; URLs are managed per card
        try { mediaGrid.innerHTML = ''; } catch(_) {}
    }

    if (filteredData.length === 0) {
        emptyState.classList.remove('hidden');
        mediaGrid.classList.add('hidden');
        isRendering = false;
    } else {
        emptyState.classList.add('hidden');
        mediaGrid.classList.remove('hidden');
        
        // Use virtual scrolling as default for stability
        if (virtualScrollEnabled) {
            renderWithVirtualScrolling(mediaGrid);
        } else {
            renderWithPagination(mediaGrid);
        }
    }
}

function cleanupPreviousRender(mediaGrid) {
    try {
        // Revoke object URLs from previous render more efficiently
        const cardsToClean = Array.from(mediaGrid.children);
        
        cardsToClean.forEach(cardElement => {
            // Clear map entry to avoid growth
            try { if (cardElement.dataset && cardElement.dataset.mediaId) galleryItemById.delete(cardElement.dataset.mediaId); } catch(_) {}
            // Clean media preview elements
            const mediaPreview = cardElement.querySelector('.media-preview');
            if (mediaPreview) {
                const mediaContentElement = mediaPreview.querySelector('img, video');
                if (mediaContentElement) {
                    if (mediaContentElement.dataset.activeObjectURL && mediaContentElement.dataset.activeObjectURL.startsWith('blob:')) {
                        URL.revokeObjectURL(mediaContentElement.dataset.activeObjectURL);
                        mediaContentElement.dataset.activeObjectURL = '';
                    }
                    if (mediaContentElement.dataset.posterObjectURL && mediaContentElement.dataset.posterObjectURL.startsWith('blob:')) {
                        URL.revokeObjectURL(mediaContentElement.dataset.posterObjectURL);
                        mediaContentElement.dataset.posterObjectURL = '';
                    }
                }
            }
            // Clean video metadata thumbnails per card
            const videoMetadataThumb = cardElement.querySelector('.video-metadata-only .video-thumbnail img');
            if (videoMetadataThumb && typeof videoMetadataThumb.src === 'string' && videoMetadataThumb.src.startsWith('blob:')) {
                URL.revokeObjectURL(videoMetadataThumb.src);
            }
        });
        
    mediaGrid.innerHTML = '';

        // Force garbage collection after cleanup
        if (window.gc) {
            window.gc();
        }
        
        console.log(`Cleaned up ${cardsToClean.length} media cards`);
    } catch (e) {
        logGalleryEntry('WARN', 'cleanupPreviousRender error', { error: e });
        try { mediaGrid.innerHTML = ''; } catch(_) {}
    }
}

function renderWithPagination(mediaGrid) {
    // Remove virtual scroll class for regular pagination
    mediaGrid.classList.remove('virtual-scroll');
    mediaGrid.style.height = ''; // Reset height
    
        // Force exactly two rows per page by computing how many items fit per row
        const gridWidth = mediaGrid.clientWidth || mediaGrid.offsetWidth || 1200;
        const gap = 15; // match CSS
        const minCardWidth = 180; // compact cards
        const perRow = Math.max(1, Math.floor((gridWidth + gap) / (minCardWidth + gap)));
        imagesPerPage = perRow * 2; // exactly two rows
    
        const startIndex = (currentPage - 1) * imagesPerPage;
        const endIndex = Math.min(startIndex + imagesPerPage, filteredData.length);
        const paginatedItems = filteredData.slice(startIndex, endIndex);

        // Use requestAnimationFrame for smooth rendering
        requestAnimationFrame(() => {
            const fragment = document.createDocumentFragment();
            paginatedItems.forEach(item => {
            const card = createMediaCardOptimized(item);
            // Reset any virtual scroll styles
            card.style.position = '';
            card.style.top = '';
            card.style.left = '';
            card.style.width = '';
            card.style.height = '';
            card.style.margin = '';
            fragment.appendChild(card);
            });
            mediaGrid.appendChild(fragment);
            
            // Observe new elements for lazy loading
        observeElementsForLazyLoading(mediaGrid);
        // Do not eagerly kickstart all; only near-viewport
        kickstartVisibleLazyLoads(mediaGrid);
        
        // Show pagination only in pagination mode
        try { const pag = document.querySelector('.pagination'); if (pag) pag.style.display = ''; } catch(_) {}
        updatePagination();
        isRendering = false;
    });
}

function renderWithVirtualScrolling(mediaGrid) {
    // Absolute-positioned virtualization to stabilize scroll height
    mediaGrid.style.position = 'relative';
    
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const windowHeight = window.innerHeight;

    const containerWidth = mediaGrid.clientWidth;
    const gap = 15;
    const minCardWidth = 240; // target larger thumbnails
    const itemsPerRow = Math.max(1, Math.floor((containerWidth + gap) / (minCardWidth + gap)));
    const cardWidth = Math.floor((containerWidth - (itemsPerRow - 1) * gap) / itemsPerRow);
    const cardHeight = cardWidth; // keep square thumbnail area
    const rowHeight = cardHeight + gap;

    const bufferRows = 2;
    const gridTop = mediaGrid.getBoundingClientRect().top + scrollTop;
    const firstVisibleRow = Math.max(0, Math.floor((scrollTop - gridTop) / rowHeight) - bufferRows);
    const visibleRowCount = Math.ceil(windowHeight / rowHeight) + bufferRows * 2;
    const startIndex = firstVisibleRow * itemsPerRow;
    const endIndex = Math.min(filteredData.length, startIndex + visibleRowCount * itemsPerRow);
    
    visibleRange = { start: startIndex, end: endIndex };
    
    // Set container height to the total number of rows
    const totalRows = Math.ceil(filteredData.length / itemsPerRow);
    const totalHeight = Math.max(0, totalRows * rowHeight);
    mediaGrid.style.height = `${totalHeight}px`;
    
    // Clear previous children to keep DOM small
    mediaGrid.innerHTML = '';
        
    const fragment = document.createDocumentFragment();
    for (let i = startIndex; i < endIndex; i++) {
        const item = filteredData[i];
        if (!item) continue;
            const card = createMediaCardOptimized(item);
        const row = Math.floor(i / itemsPerRow);
        const col = i % itemsPerRow;
        card.style.position = 'absolute';
        card.style.width = `${cardWidth}px`;
        card.style.height = `${cardHeight}px`;
        card.style.top = `${row * rowHeight}px`;
        card.style.left = `${col * (cardWidth + gap)}px`;
            fragment.appendChild(card);
    }
        
        mediaGrid.appendChild(fragment);
        
    // Observe and kickstart only visible slice (slight delay to avoid flicker)
    setTimeout(() => {
        try {
        observeElementsForLazyLoading(mediaGrid);
        kickstartVisibleLazyLoads(mediaGrid);
        } catch(_) {}
    }, 50);

    // Hide pagination while virtual scroll is active
    try {
        const pag = document.querySelector('.pagination');
        if (pag) pag.style.display = 'none';
    } catch(_) {}

        isRendering = false;
}

function observeElementsForLazyLoading(mediaGrid) {
            if (lazyLoadObserver) {
                Array.from(mediaGrid.children).forEach(card => {
                    const mediaElement = card.querySelector('.media-preview img, .media-preview video');
                    if (mediaElement && mediaElement.dataset.lazyLoad === 'true') {
                        lazyLoadObserver.observe(card);
                    }
        });
    }
}

function kickstartVisibleLazyLoads(mediaGrid) {
    try {
        const viewportBottom = window.scrollY + window.innerHeight + 100;
        const viewportTop = Math.max(0, window.scrollY - 100);
        Array.from(mediaGrid.children).forEach(card => {
            const mediaElement = card.querySelector('.media-preview img, .media-preview video');
            if (!mediaElement || mediaElement.dataset.lazyLoad !== 'true') return;
            const rect = card.getBoundingClientRect();
            const top = rect.top + window.scrollY;
            const bottom = top + rect.height;
            if (bottom >= viewportTop && top <= viewportBottom) {
                // Visible or near-visible; enqueue immediately
                if (mediaElement.dataset.loadingQueued !== 'true') {
                    mediaElement.dataset.loadingQueued = 'true';
                    const itemObj = galleryItemById.get(card.dataset.mediaId);
                    scheduleLoadMediaElement(mediaElement, itemObj || card.dataset.itemData);
                }
            }
        });
    } catch (e) {
        logGalleryEntry('WARN', 'kickstartVisibleLazyLoads error', { error: e });
    }
}

function generatePageNumbers(totalPages, currentPage) {
    const pageNumbersContainer = document.getElementById('page-numbers-container');
    pageNumbersContainer.innerHTML = '';

    const maxPagesToShow = 5;
    let startPage, endPage;

    if (totalPages <= maxPagesToShow) {
        startPage = 1; endPage = totalPages;
    } else {
        if (currentPage <= Math.ceil(maxPagesToShow / 2)) {
            startPage = 1; endPage = maxPagesToShow;
        } else if (currentPage + Math.floor(maxPagesToShow / 2) >= totalPages) {
            startPage = totalPages - maxPagesToShow + 1; endPage = totalPages;
        } else {
            startPage = currentPage - Math.floor(maxPagesToShow / 2);
            endPage = currentPage + Math.floor(maxPagesToShow / 2);
        }
    }

    const createButton = (page, text, isActive, isDisabled, isEllipsis = false) => {
        const button = document.createElement('button');
        button.textContent = text || page;
        button.className = 'page-number-btn';
        if (isActive) button.classList.add('active');
        if (isDisabled) button.disabled = true;
        if (isEllipsis) button.classList.add('ellipsis');
        if (!isEllipsis) {
             button.addEventListener('click', () => {
                currentPage = page; renderGallery(); window.scrollTo(0,0);
            });
        }
        return button;
    };

    if (startPage > 1) {
        pageNumbersContainer.appendChild(createButton(1, '1'));
        if (startPage > 2) {
             pageNumbersContainer.appendChild(createButton(0, '...', false, true, true));
        }
    }

    for (let i = startPage; i <= endPage; i++) {
        pageNumbersContainer.appendChild(createButton(i, null, i === currentPage, false));
    }

    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            pageNumbersContainer.appendChild(createButton(0, '...', false, true, true));
        }
        pageNumbersContainer.appendChild(createButton(totalPages, totalPages.toString()));
    }
}

function updatePagination() {
    const totalPages = Math.ceil(filteredData.length / imagesPerPage);
    document.getElementById('prev-page').disabled = currentPage === 1 || totalPages === 0;
    document.getElementById('next-page').disabled = currentPage === totalPages || totalPages === 0;
    generatePageNumbers(totalPages, currentPage);
}

// Optimized version with caching
function setAndHandleMediaPreviewGalleryOptimized(mediaElement, sourcesToTry, mediaData, cacheKey) {
    const parent = mediaElement.parentNode;

    if (mediaElement.dataset.activeObjectURL && mediaElement.dataset.activeObjectURL.startsWith('blob:')) {
        URL.revokeObjectURL(mediaElement.dataset.activeObjectURL);
    }
    mediaElement.dataset.activeObjectURL = '';

    if (mediaElement.tagName === 'VIDEO' && mediaElement.dataset.posterObjectURL && mediaElement.dataset.posterObjectURL.startsWith('blob:')) {
        URL.revokeObjectURL(mediaElement.dataset.posterObjectURL);
    }

    const originalOnError = mediaElement.onerror;
    const originalOnLoad = mediaElement.onload;
    const originalOnLoadedData = mediaElement.onloadeddata;

    const cleanupListeners = () => {
        mediaElement.onload = originalOnLoad;
        mediaElement.onerror = originalOnError;
        mediaElement.onloadeddata = originalOnLoadedData;
    };

    const generateFrameFromVideoSource = (source) => {
        return new Promise((resolve, reject) => {
            try {
                const video = document.createElement('video');
                video.preload = 'metadata';
                video.muted = true; video.playsInline = true; video.crossOrigin = 'anonymous';
                let tempObjUrl = null;
                const cleanup = () => { if (tempObjUrl) { URL.revokeObjectURL(tempObjUrl); tempObjUrl = null; } video.src = ''; };

                const drawAndCheck = () => {
                    const canvas = document.createElement('canvas');
                    const w = Math.max(1, video.videoWidth || 160);
                    const h = Math.max(1, video.videoHeight || 90);
                    canvas.width = w; canvas.height = h;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(video, 0, 0, w, h);
                    // Downsample and check brightness to avoid pure black frames
                    const sample = ctx.getImageData(0, 0, Math.min(32, w), Math.min(18, h));
                    let sum = 0; const data = sample.data; const len = data.length;
                    for (let i = 0; i < len; i += 4) { sum += (data[i] + data[i+1] + data[i+2]) / 3; }
                    const avg = sum / (len / 4);
                    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
                    return { avg, dataUrl };
                };

                const trySeekTimes = () => {
                    const duration = isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
                    const candidates = [];
                    if (duration > 0) {
                        candidates.push(Math.max(0.05, duration * 0.05));
                        candidates.push(Math.max(0.1, duration * 0.15));
                        candidates.push(Math.min(duration - 0.05, Math.max(0.2, duration * 0.3)));
                        candidates.push(Math.min(duration - 0.05, Math.max(0.3, duration * 0.5)));
                    } else {
                        candidates.push(0.2, 0.5, 1.0);
                    }

                    let idx = 0;
                    const seekNext = () => {
                        if (idx >= candidates.length) {
                            // Last resort: draw whatever we have
                            try {
                                const res = drawAndCheck();
                                cleanup();
                                resolve(res.dataUrl);
                            } catch (e) { cleanup(); reject(e); }
                            return;
                        }
                        const t = candidates[idx++];
                        let timeoutId;
                        const onSeeked = () => {
                            clearTimeout(timeoutId);
                            try {
                                const res = drawAndCheck();
                                if (res.avg > 10) { // not too dark
                                    cleanup();
                                    resolve(res.dataUrl);
                                } else {
                                    seekNext();
                                }
                            } catch (e) { seekNext(); }
                        };
                        const onFail = () => { clearTimeout(timeoutId); seekNext(); };
                        try { video.currentTime = Math.max(0, Math.min(t, Math.max(0, duration - 0.05))); } catch(_) {}
                        video.onseeked = onSeeked; video.onerror = onFail;
                        timeoutId = setTimeout(onFail, 1200);
                    };
                    seekNext();
                };

                const onLoadedMeta = () => { trySeekTimes(); };
                const onError = (e) => { cleanup(); reject(e instanceof Event ? new Error('Video load error for thumbnail') : e); };
                video.onloadedmetadata = onLoadedMeta; video.onerror = onError;
                if (source instanceof Blob) { tempObjUrl = URL.createObjectURL(source); video.src = tempObjUrl; }
                else if (typeof source === 'string') { video.src = source; }
                else { reject(new Error('Unsupported video source type for thumbnail')); }
                try { video.load(); } catch(_) {}
                setTimeout(() => { onError(new Error('Thumbnail generation timeout')); }, 4000);
            } catch (err) { reject(err); }
        });
    };

    const attemptLoad = (sources) => {
        if (!Array.isArray(sources) || sources.length === 0) {
            cleanupListeners();
            const placeholderSvg = mediaData.type === 'video' ? VIDEO_UNPLAYABLE_ICON_SVG : IMAGE_ERROR_ICON_SVG;
            mediaElement.src = placeholderSvg;
            mediaElement.style.objectFit = "contain";
            mediaElement.dataset.lazyLoad = 'false';
            return;
        }

        const currentSource = sources[0];
        const remainingSources = sources.slice(1);
        let objectUrlForThisSrcAttempt = null;
        let loadTimeoutId = null;

        const clearLoadTimeout = () => { if (loadTimeoutId) { clearTimeout(loadTimeoutId); loadTimeoutId = null; } };

        const sourceIsVideoBlob = currentSource instanceof Blob && typeof currentSource.type === 'string' && currentSource.type.startsWith('video');
        const sourceIsVideoString = (typeof currentSource === 'string') && currentSource.startsWith('data:video');

        if (currentSource instanceof Blob) {
            if (sourceIsVideoBlob && mediaElement.tagName === 'IMG') {
                // Generate a static frame for IMG from video blob
                generateFrameFromVideoSource(currentSource).then((dataUrl) => {
                    try { mediaElement.crossOrigin = 'anonymous'; mediaElement.referrerPolicy = 'no-referrer'; mediaElement.decoding = 'async'; } catch(_) {}
                    mediaElement.src = dataUrl;
                }).catch(() => {
                    attemptLoad(remainingSources);
                });
                return;
            }
            objectUrlForThisSrcAttempt = URL.createObjectURL(currentSource);
            if (mediaElement.tagName === 'VIDEO') {
                // Avoid loading full video data into memory; set poster only
                generateFrameFromVideoSource(currentSource).then((dataUrl) => {
                    mediaElement.poster = dataUrl;
                }).catch(() => {
                    // Fallback to using object URL as poster
                    mediaElement.poster = objectUrlForThisSrcAttempt;
                }).finally(() => {
                    if (objectUrlForThisSrcAttempt) { URL.revokeObjectURL(objectUrlForThisSrcAttempt); objectUrlForThisSrcAttempt = null; }
                });
            } else {
                try { mediaElement.crossOrigin = 'anonymous'; mediaElement.referrerPolicy = 'no-referrer'; mediaElement.decoding = 'async'; } catch(_) {}
                mediaElement.src = objectUrlForThisSrcAttempt;
                mediaElement.dataset.activeObjectURL = objectUrlForThisSrcAttempt;
            }
        } else if (typeof currentSource === 'string') {
            if (mediaElement.tagName === 'VIDEO') {
                if (sourceIsVideoString) {
                    // Always generate poster if the source is a video data URL
                    generateFrameFromVideoSource(currentSource).then((dataUrl) => {
                        mediaElement.poster = dataUrl;
                    }).catch(() => {
                        mediaElement.poster = currentSource;
                    });
                } else {
                    mediaElement.poster = currentSource;
                }
            } else if (sourceIsVideoString) {
                // IMG element but source is a video data URL; generate frame
                generateFrameFromVideoSource(currentSource).then((dataUrl) => {
                    try { mediaElement.crossOrigin = 'anonymous'; mediaElement.referrerPolicy = 'no-referrer'; mediaElement.decoding = 'async'; } catch(_) {}
                    mediaElement.src = dataUrl;
                }).catch(() => {
                    attemptLoad(remainingSources);
                });
                return;
            } else {
                try { mediaElement.crossOrigin = 'anonymous'; mediaElement.referrerPolicy = 'no-referrer'; mediaElement.decoding = 'async'; } catch(_) {}
                mediaElement.src = currentSource;
            }
        } else {
            attemptLoad(remainingSources);
            return;
        }

        const handleLoadSuccess = () => {
            clearLoadTimeout();
            try {
                cleanupListeners();
                mediaElement.dataset.lazyLoad = 'false';
                mediaElement.style.willChange = 'auto';
                mediaElement.style.backfaceVisibility = 'hidden'; // reduce flicker
                mediaElement.style.backgroundImage = '';
            } catch(_) {}
        };

        const handleError = () => {
            clearLoadTimeout();
            cleanupListeners();
            if (objectUrlForThisSrcAttempt) { 
                URL.revokeObjectURL(objectUrlForThisSrcAttempt); 
                mediaElement.dataset.activeObjectURL = ''; 
            }
            attemptLoad(remainingSources);
        };

        // If the network/device stalls, proceed after timeout
        loadTimeoutId = setTimeout(handleError, 2500);

        if (mediaElement.tagName === 'IMG') {
            mediaElement.onload = handleLoadSuccess;
            mediaElement.onerror = () => {
                // If an image fails to load and we still have video-like sources, try to synthesize a frame
                if (sources.some(s => (s instanceof Blob && s.type?.startsWith('video')) || (typeof s === 'string' && s.startsWith('data:video')))) {
                    const vidSource = sources.find(s => (s instanceof Blob && s.type?.startsWith('video')) || (typeof s === 'string' && s.startsWith('data:video')));
                    generateFrameFromVideoSource(vidSource).then((dataUrl) => {
                        try { mediaElement.crossOrigin = 'anonymous'; mediaElement.referrerPolicy = 'no-referrer'; mediaElement.decoding = 'async'; } catch(_) {}
                        mediaElement.src = dataUrl;
                        handleLoadSuccess();
                    }).catch(handleError);
                } else {
                    handleError();
                }
            };
        } else if (mediaElement.tagName === 'VIDEO') {
            if (mediaElement.poster) {
                const testImg = new Image();
                testImg.referrerPolicy = 'no-referrer';
                testImg.crossOrigin = 'anonymous';
                testImg.onload = handleLoadSuccess;
                testImg.onerror = handleError;
                testImg.src = mediaElement.poster;
            } else {
                mediaElement.onloadeddata = handleLoadSuccess;
                mediaElement.onerror = handleError;
                if (mediaElement.src.startsWith('blob:')) {
                    if(mediaElement.readyState < HTMLMediaElement.HAVE_METADATA) mediaElement.load();
                }
            }
        }
    };

    attemptLoad(sourcesToTry);
}

function setAndHandleMediaPreviewGallery(mediaElement, sourcesToTry, mediaData, placeholderSvg) {
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
                    imgPlaceholder.onerror = () => { imgPlaceholder.src = VIDEO_UNPLAYABLE_ICON_SVG; imgPlaceholder.style.objectFit = "contain"; };
                    parent.replaceChild(imgPlaceholder, mediaElement);
                } else {
                    logGalleryEntry('DEBUG', 'MediaElement parent not found or mediaElement already replaced (attemptLoad video thumbnail fallback).', { additionalDetails: { mediaId: mediaData.id } });
                    mediaElement.src = VIDEO_UNPLAYABLE_ICON_SVG;
                }
            } else {
                mediaElement.src = placeholderSvg;
                if (mediaElement.tagName === 'IMG' || (mediaElement.tagName === 'VIDEO' && !parent.contains(mediaElement))) {
                    mediaElement.style.objectFit = "contain";
                } else if (mediaElement.tagName === 'VIDEO') {
                     if (parent && parent.contains(mediaElement)) {
                        const imgPlaceholder = document.createElement('img');
                        imgPlaceholder.src = VIDEO_UNPLAYABLE_ICON_SVG;
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
            logGalleryEntry('WARN', `Skipping invalid source type for gallery preview ${mediaData.id}: type ${typeof currentSource}`, { additionalDetails: { mediaId: mediaData.id }});
            attemptLoad(remainingSources);
            return;
        }

        const handleLoadSuccess = () => {
            cleanupListeners();
            if (mediaElement.tagName === 'VIDEO') mediaElement.currentTime = 0.01;
        };

        const handleError = (e) => {
            cleanupListeners();
            const failedSrcType = (typeof currentSource === 'string')
                ? `String URL (${currentSource.substring(0,60)}...)`
                : `Blob (${currentSource?.type || 'unknown type'}, ${currentSource?.size || 'unknown size'}b)`;

            const mediaError = e.target?.error;
            const errorDetailsForLog = {
                mediaId: mediaData.id,
                eventType: e.type,
                failedSrcDisplay: failedSrcType,
                mediaErrorCode: mediaError?.code,
                mediaErrorMessage: mediaError?.message
            };

            logGalleryEntry('WARN', `Gallery ${mediaElement.tagName} thumbnail error for ${mediaData.id}, source: ${failedSrcType}`, {
                error: mediaError ? new Error(`Media Error (Gallery Preview): ${mediaError.message} (Code: ${mediaError.code})`) : new Error('Unknown media preview error'),
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


// Optimized version with lazy loading
function createMediaCardOptimized(item) {
    const template = document.getElementById('media-card-template');
    if (!template || !template.content) {
        logGalleryEntry('CRITICAL', 'Media card template not found.');
        return document.createElement('div');
    }
    const card = template.content.cloneNode(true).querySelector('.media-card');

    // Cache item by id to preserve Blobs
    try { galleryItemById.set(item.id, item); } catch(_) {}

    // Also attach a minimal, serializable copy as fallback (no Blobs)
    try {
        const minimal = {
            id: item.id,
            type: item.type,
            isGif: !!item.isGif,
            savedAsMetadata: !!item.savedAsMetadata,
            url: typeof item.url === 'string' ? item.url : null,
            thumbnailUrl: typeof item.thumbnailUrl === 'string' ? item.thumbnailUrl : null,
            originalRemoteUrl: typeof item.originalRemoteUrl === 'string' ? item.originalRemoteUrl : null,
            // Do not include localDataUrl if Blob; include only DataURL strings
            localDataUrl: (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:')) ? item.localDataUrl : null
        };
        card.dataset.itemData = JSON.stringify(minimal);
    } catch(_) {}

    const mediaPreviewContainer = card.querySelector('.media-preview');
    mediaPreviewContainer.innerHTML = '';

    const isVideo = item.type === 'video';
    const isGif = item.isGif === true;
    const isMetadataOnlyVideo = isVideo && item.savedAsMetadata === true;

    let mediaElement;
    let placeholderForType = isVideo ? VIDEO_UNPLAYABLE_ICON_SVG : IMAGE_ERROR_ICON_SVG;

    // Create placeholder element
    if (isMetadataOnlyVideo) {
        mediaElement = document.createElement('img');
        mediaElement.alt = `Video thumbnail: ${item.id} by ${item.author || 'Unknown'}`;
        placeholderForType = VIDEO_THUMBNAIL_ONLY_ICON_SVG;
        mediaPreviewContainer.classList.add('video-item', 'metadata-only-thumb-container');
    } else if (isGif || (isVideo && (typeof item.url === 'string' && item.url.includes('/tweet_video/')))) {
        // Prefer a static thumbnail for GIFs if available; fallback to looping video/data
        const hasStaticThumb = item.thumbnailUrl && (typeof item.thumbnailUrl === 'string' && (item.thumbnailUrl.startsWith('data:image/') || /\.(jpe?g|png|webp|gif)$/i.test(item.thumbnailUrl)));
        if (hasStaticThumb) {
            mediaElement = document.createElement('img');
            mediaElement.alt = `GIF preview: ${item.id} by ${item.author || 'Unknown'}`;
        } else {
            mediaElement = document.createElement('video');
            Object.assign(mediaElement, { 
                muted: true, playsinline: true, loop: true, autoplay: true, preload: "metadata" 
            });
            mediaElement.alt = `GIF: ${item.id} by ${item.author || 'Unknown'}`;
            // Ensure we attempt poster generation even before lazy load
            try { mediaElement.poster = GIF_PLACEHOLDER_ICON_SVG; } catch(_) {}
        }
        placeholderForType = GIF_PLACEHOLDER_ICON_SVG;
    } else if (isVideo) {
        mediaElement = document.createElement('video');
        Object.assign(mediaElement, { muted: true, playsinline: true, preload: "metadata" });
        mediaElement.alt = `Video: ${item.id} by ${item.author || 'Unknown'}`;
        placeholderForType = VIDEO_UNPLAYABLE_ICON_SVG;
    } else {
        mediaElement = document.createElement('img');
        mediaElement.alt = `Image: ${item.id} by ${item.author || 'Unknown'}`;
        placeholderForType = IMAGE_ERROR_ICON_SVG;
    }

    // Ensure suspended-account thumbnails load when available
    if (mediaElement.tagName === 'IMG') {
        mediaElement.crossOrigin = 'anonymous';
        mediaElement.referrerPolicy = 'no-referrer';
        mediaElement.decoding = 'async';
        mediaElement.loading = 'lazy';
    }

    // Set visual placeholder without setting src to avoid flicker
    mediaElement.style.width = "100%"; 
    mediaElement.style.height = "100%"; 
    mediaElement.style.objectFit = "cover";
    mediaElement.style.backgroundImage = `url(${placeholderForType})`;
    mediaElement.style.backgroundSize = 'cover';
    mediaElement.style.backgroundPosition = 'center';
    mediaElement.dataset.placeholder = placeholderForType;
    mediaElement.dataset.lazyLoad = 'true';
    
    // Store item data for lazy loading
    card.dataset.itemData = JSON.stringify(item);
    
    mediaPreviewContainer.appendChild(mediaElement);

    // Add the rest of the card elements (favorite button, etc.)
    const favoriteBtn = document.createElement('button');
    favoriteBtn.className = 'favorite-btn';
    favoriteBtn.innerHTML = `<svg class="star-icon" viewBox="0 0 24 24"><path d="${STAR_SVG_PATH}"></path></svg>`;
    updateFavoriteButtonUI(favoriteBtn, item.favorite);
    favoriteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(item.id, favoriteBtn); });
    card.querySelector('.media-thumbnail').appendChild(favoriteBtn);

    if (isMetadataOnlyVideo) {
        const metadataIndicator = document.createElement('div');
        metadataIndicator.className = 'metadata-indicator';
        metadataIndicator.innerHTML = `<img src="${VIDEO_THUMBNAIL_ONLY_ICON_SVG}" alt="Thumbnail" title="Video (Thumbnail Only)" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 2px;"> TN`;
        card.querySelector('.media-thumbnail').appendChild(metadataIndicator);
    }

    if (item.isGif === true || isGif || (typeof item.url === 'string' && item.url.includes('/tweet_video/'))) {
        const gifIndicator = document.createElement('div');
        gifIndicator.className = 'gif-indicator';
        gifIndicator.innerHTML = 'GIF';
        card.querySelector('.media-thumbnail').appendChild(gifIndicator);
    }

    // Set card data attributes and normalize gif flag for MP4-based GIFs
    const isMp4GifLike = (typeof item.url === 'string' && item.url.includes('/tweet_video/')) || (typeof item.thumbnailUrl === 'string' && item.thumbnailUrl.includes('/tweet_video/'));
    if (isMp4GifLike && item.isGif !== true) {
        try { item.isGif = true; } catch(_) {}
    }
    if (item.imported === true && item.type === 'video' && item.isGif !== true) {
        const dur = Number(item.duration || 0);
        if (!item.originalRemoteUrl && !item.originalRemoteUrlIfUrlIsBlob && (!item.url || typeof item.url !== 'string') && dur > 0 && dur <= 8) {
            try { item.isGif = true; } catch(_) {}
        }
    }
    card.dataset.mediaId = item.id;
    card.dataset.author = item.author || 'Unknown';
    card.dataset.type = item.type;
    card.dataset.favorite = item.favorite || false;

    // Set card content
    const mediaInfo = card.querySelector('.media-info');
    if (mediaInfo) {
        // Author details
        const authorDetails = document.createElement('div');
        authorDetails.className = 'author-details';
        
        const authorName = document.createElement('span');
        authorName.className = 'author-name';
        const authorDisplayName = item.author || 'Unknown';
        authorName.textContent = authorDisplayName.startsWith('@') ? authorDisplayName : `@${authorDisplayName}`;
        authorDetails.appendChild(authorName);
        
        // Add favorite button for author
        const favoriteBtn = document.createElement('button');
        favoriteBtn.className = 'media-card-author-favorite-btn';
        favoriteBtn.innerHTML = `<svg class="star-icon" viewBox="0 0 24 24"><path d="${STAR_SVG_PATH}"></path></svg>`;
        updateMediaCardAuthorFavoriteButtonUI(favoriteBtn, item.author || 'Unknown');
        favoriteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            handleMediaCardAuthorFavoriteToggle(item.author || 'Unknown', favoriteBtn);
        });
        authorDetails.appendChild(favoriteBtn);
        
        mediaInfo.appendChild(authorDetails);

        // Date
        const dateSpan = document.createElement('span');
        dateSpan.className = 'media-date';
        dateSpan.textContent = formatDate(item.date);
        mediaInfo.appendChild(dateSpan);

        // Collection indicator
        const itemCollections = collectionsList.filter(c => c.mediaIds.includes(item.id));
        if (itemCollections.length > 0) {
            const collectionIndicator = document.createElement('div');
            collectionIndicator.className = 'media-card-collection-indicator';
            collectionIndicator.innerHTML = `
                <svg viewBox="0 0 24 24"><path fill="currentColor" d="${FOLDER_ICON_SVG_PATH}"></path></svg>
                <span>${itemCollections.length} Collection${itemCollections.length > 1 ? 's' : ''}</span>
                <span class="tooltiptext">${itemCollections.map(c => c.name).join(', ')}</span>
            `;
            mediaInfo.appendChild(collectionIndicator);
        }

        // Add Action Buttons
        const actionsContainer = document.createElement('div');
        actionsContainer.className = 'media-actions';

        // Download Button
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'action-btn download-btn';
        downloadBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${DOWNLOAD_SVG_PATH}"></path></svg> Download`;
        downloadBtn.title = "Download media";
        downloadBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const originalText = downloadBtn.textContent;
            downloadBtn.disabled = true;
            downloadBtn.textContent = 'Downloading...';
            chrome.runtime.sendMessage({ action: 'downloadMediaItem', mediaId: item.id }, (response) => {
                if (chrome.runtime.lastError || !response || !response.success) {
                    showNotification(`Download failed: ${chrome.runtime.lastError?.message || response?.error || 'Unknown error'}`, 'error');
                } else {
                    showNotification('Download started.', 'success');
                }
                downloadBtn.disabled = false;
                downloadBtn.textContent = originalText;
            });
        });
        actionsContainer.appendChild(downloadBtn);

        // Open Tweet Button
        if (item.tweetId && item.author) {
            const tweetBtn = document.createElement('button');
            tweetBtn.className = 'action-btn open-btn';
            tweetBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${EXTERNAL_LINK_SVG_PATH}"></path></svg> Tweet`;
            tweetBtn.title = "View on X.com";
            tweetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const authorCleaned = item.author.startsWith('@') ? item.author.substring(1) : item.author;
                window.open(`https://x.com/${authorCleaned}/status/${item.tweetId}`, '_blank');
            });
            actionsContainer.appendChild(tweetBtn);
        }

        // Original Media Button
        if (item.originalRemoteUrl && !item.originalRemoteUrl.startsWith('data:') && !item.originalRemoteUrl.startsWith('blob:')) {
            const originalBtn = document.createElement('button');
            originalBtn.className = 'action-btn original-btn';
            originalBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${EXTERNAL_LINK_SVG_PATH}"></path></svg> Original`;
            originalBtn.title = "Open original media source";
            originalBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open(item.originalRemoteUrl, '_blank');
            });
            actionsContainer.appendChild(originalBtn);
        }

        // Delete Button
        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'action-btn delete-btn';
        deleteBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${TRASH_SVG_PATH_GALLERY}"></path></svg> Delete`;
        deleteBtn.title = "Delete media";
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (confirm(`Are you sure you want to delete this media by ${item.author || 'Unknown'}?`)) {
                card.classList.add('deleting');
                chrome.runtime.sendMessage({ action: 'deleteMedia', mediaId: item.id }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.success) {
                        showNotification(`Error deleting: ${chrome.runtime.lastError?.message || response?.error || 'Unknown'}`, 'error');
                        card.classList.remove('deleting');
                    } else {
                        showNotification('Media deleted.', 'success');
                    }
                });
            }
        });
        actionsContainer.appendChild(deleteBtn);

        // View Author's Media Button
        const authorBtn = document.createElement('button');
        authorBtn.className = 'action-btn author-btn';
        authorBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${USER_SVG_PATH}"></path></svg> Author`;
        authorBtn.title = `View all media by ${item.author || 'Unknown'}`;
        authorBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            currentAuthor = item.author;
            document.getElementById('author-filter').value = item.author;
            currentPage = 1;
            applyFilters();
            renderGallery();
        });
        actionsContainer.appendChild(authorBtn);

        // Add to Collection Button
        const collectBtn = document.createElement('button');
        collectBtn.className = 'action-btn add-to-collection-btn';
        collectBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${FOLDER_PLUS_SVG_PATH}"></path></svg> Collect`;
        collectBtn.title = "Add to/remove from collections";
        collectBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openManageCollectionsModal(item);
        });
        actionsContainer.appendChild(collectBtn);

        mediaInfo.appendChild(actionsContainer);
    }

    // Set up view button
    const viewButton = card.querySelector('.view-media');
    if (viewButton) {
        viewButton.onclick = (e) => { e.stopPropagation(); openModal(item); };
    }

    // Set up batch select checkbox
    const checkboxContainer = card.querySelector('.batch-select-checkbox-container');
    if (checkboxContainer) {
        const checkbox = checkboxContainer.querySelector('.batch-select-checkbox');
        if (checkbox) {
            checkbox.id = `batch-select-${item.id}`;
            checkbox.checked = selectedItemsForBatchDelete.has(item.id);
            checkbox.onchange = () => handleBatchItemSelect(item.id, checkbox.checked);
            checkboxContainer.querySelector('.custom-checkbox-gallery').setAttribute('aria-labelledby', `label-batch-select-${item.id}`);

            const label = document.createElement('label');
            label.htmlFor = checkbox.id;
            label.id = `label-batch-select-${item.id}`;
            label.className = 'visually-hidden';
            label.textContent = `Select item by ${item.author || 'Unknown'}`;
            checkboxContainer.appendChild(label);

            if (isSelectModeActive) {
                checkboxContainer.style.display = 'block';
                card.classList.add('select-mode');
                if(checkbox.checked) card.classList.add('selected-for-batch-delete');
            } else {
                checkboxContainer.style.display = 'none';
                card.classList.remove('select-mode', 'selected-for-batch-delete');
            }
        }
    }

    // Add click handler for preview
    card.addEventListener('click', () => {
        openModal(item);
    });

    return card;
}

function createMediaCard(item) {
    const template = document.getElementById('media-card-template');
    if (!template || !template.content) {
        logGalleryEntry('CRITICAL', 'Media card template not found.');
        return document.createElement('div');
    }
    const card = template.content.cloneNode(true).querySelector('.media-card');

    const existingMediaElementInTemplate = card.querySelector('.media-preview img, .media-preview video');
    if (existingMediaElementInTemplate) {
        if (existingMediaElementInTemplate.dataset.activeObjectURL?.startsWith('blob:')) URL.revokeObjectURL(existingMediaElementInTemplate.dataset.activeObjectURL);
        if (existingMediaElementInTemplate.dataset.posterObjectURL?.startsWith('blob:')) URL.revokeObjectURL(existingMediaElementInTemplate.dataset.posterObjectURL);
    }

    const mediaPreviewContainer = card.querySelector('.media-preview');
    mediaPreviewContainer.innerHTML = '';

    const isVideo = item.type === 'video';
    const isGif = item.isGif === true;
    const isMetadataOnlyVideo = isVideo && item.savedAsMetadata === true;

    let mediaElement;
    let placeholderForType = isVideo ? VIDEO_UNPLAYABLE_ICON_SVG : IMAGE_ERROR_ICON_SVG;
    let sourcesToTry = [];

    if (card.dataset.posterObjectURL?.startsWith('blob:')) {
        URL.revokeObjectURL(card.dataset.posterObjectURL);
    }
    card.dataset.posterObjectURL = '';

    if (isMetadataOnlyVideo) {
        mediaElement = document.createElement('img');
        mediaElement.alt = `Video thumbnail: ${item.id} by ${item.author || 'Unknown'}`;
        placeholderForType = VIDEO_THUMBNAIL_ONLY_ICON_SVG;
        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string' && !sourcesToTry.includes(item.thumbnailUrl)) sourcesToTry.push(item.thumbnailUrl);
        if (item.url && typeof item.url === 'string' && !sourcesToTry.includes(item.url) && !item.url.startsWith('blob:')) sourcesToTry.push(item.url);
        mediaPreviewContainer.classList.add('video-item', 'metadata-only-thumb-container');
    } else if (isGif) {
        let preferredStaticThumbnail = null;
        if (item.thumbnailUrl && (typeof item.thumbnailUrl === 'string' && (item.thumbnailUrl.startsWith('data:image/') || /\.(jpe?g|png|webp)$/i.test(item.thumbnailUrl)))) {
            preferredStaticThumbnail = item.thumbnailUrl;
        } else if (item.localDataUrl && (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image/'))) {
             preferredStaticThumbnail = item.localDataUrl;
        } else if (item.url && (typeof item.url === 'string' && item.url.startsWith('data:image/'))) {
             preferredStaticThumbnail = item.url;
        }

        if (preferredStaticThumbnail) {
            mediaElement = document.createElement('img');
            mediaElement.alt = `GIF preview: ${item.id} by ${item.author || 'Unknown'}`;
            sourcesToTry.push(preferredStaticThumbnail);
            placeholderForType = IMAGE_ERROR_ICON_SVG; // Default for images
        } else {
            mediaElement = document.createElement('video');
            Object.assign(mediaElement, { muted: true, playsinline: true, loop: true, autoplay: true, preload: "metadata" });
            mediaElement.alt = `GIF: ${item.id} by ${item.author || 'Unknown'}`;
            if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
            if (item.url && typeof item.url === 'string' && !sourcesToTry.includes(item.url)) sourcesToTry.push(item.url);
            placeholderForType = VIDEO_UNPLAYABLE_ICON_SVG; // Default for videos
        }
    } else if (isVideo) {
        mediaElement = document.createElement('video');
        Object.assign(mediaElement, { muted: true, playsinline: true, preload: "metadata" });
        mediaElement.alt = `Video: ${item.id} by ${item.author || 'Unknown'}`;
        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
        if (item.url && typeof item.url === 'string' && !sourcesToTry.includes(item.url)) sourcesToTry.push(item.url);
        placeholderForType = VIDEO_UNPLAYABLE_ICON_SVG;

        if (item.thumbnailUrl) {
            if (item.thumbnailUrl instanceof Blob) {
                const posterObjUrl = URL.createObjectURL(item.thumbnailUrl);
                mediaElement.poster = posterObjUrl;
                mediaElement.dataset.posterObjectURL = posterObjUrl;
            } else if (typeof item.thumbnailUrl === 'string') {
                mediaElement.poster = item.thumbnailUrl;
            }
        }
    } else {
        mediaElement = document.createElement('img');
        mediaElement.alt = `Image: ${item.id} by ${item.author || 'Unknown'}`;
        if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
        else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
        if (item.url && typeof item.url === 'string' && !sourcesToTry.includes(item.url)) sourcesToTry.push(item.url);
        if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string' && !sourcesToTry.includes(item.thumbnailUrl)) sourcesToTry.push(item.thumbnailUrl);
        if (item.originalRemoteUrl && typeof item.originalRemoteUrl === 'string' && !sourcesToTry.includes(item.originalRemoteUrl)) sourcesToTry.push(item.originalRemoteUrl);
        placeholderForType = IMAGE_ERROR_ICON_SVG;
    }

    mediaElement.style.width = "100%"; mediaElement.style.height = "100%"; mediaElement.style.objectFit = "cover";
    mediaPreviewContainer.appendChild(mediaElement);
    sourcesToTry = sourcesToTry.filter(s => s);
    setAndHandleMediaPreviewGallery(mediaElement, sourcesToTry, item, placeholderForType);

    const favoriteBtn = document.createElement('button');
    favoriteBtn.className = 'favorite-btn';
    favoriteBtn.innerHTML = `<svg class="star-icon" viewBox="0 0 24 24"><path d="${STAR_SVG_PATH}"></path></svg>`;
    updateFavoriteButtonUI(favoriteBtn, item.favorite);
    favoriteBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleFavorite(item.id, favoriteBtn); });
    card.querySelector('.media-thumbnail').appendChild(favoriteBtn);

    if (isMetadataOnlyVideo) {
        const metadataIndicator = document.createElement('div');
        metadataIndicator.className = 'gif-indicator';
        metadataIndicator.style.backgroundColor = 'rgba(100, 100, 200, 0.8)';
        metadataIndicator.innerHTML = `<img src="${VIDEO_THUMBNAIL_ONLY_ICON_SVG}" alt="Thumbnail" title="Video (Thumbnail Only)" style="width: 12px; height: 12px; vertical-align: middle; margin-right: 2px;"> TN`;
        metadataIndicator.style.fontSize = '9px';
        card.querySelector('.media-thumbnail').appendChild(metadataIndicator);
    } else if (isVideo && !isGif) {
        mediaPreviewContainer.classList.add('video-item');
        const videoIndicator = document.createElement('div');
        videoIndicator.className = 'video-indicator';
        videoIndicator.innerHTML = '<span>▶</span>';
        mediaPreviewContainer.appendChild(videoIndicator);
    }
    if (item.isGif) {
        const gifIndicator = document.createElement('div');
        gifIndicator.className = 'gif-indicator';
        gifIndicator.textContent = 'GIF';
        card.querySelector('.media-thumbnail').appendChild(gifIndicator);
    }
    if (isVideo && !isMetadataOnlyVideo && item.duration > 0) {
        const durationIndicator = document.createElement('div');
        durationIndicator.className = 'video-duration';
        durationIndicator.textContent = formatDuration(item.duration);
        mediaPreviewContainer.appendChild(durationIndicator);
    }

    const mediaInfo = card.querySelector('.media-info');
    mediaInfo.innerHTML = '';

    const authorDetailsDiv = document.createElement('div');
    authorDetailsDiv.className = 'author-details';
    authorDetailsDiv.innerHTML = `<span class="author-name">${item.author || 'Unknown'}</span>`;
    const authorFavoriteBtn = document.createElement('button');
    authorFavoriteBtn.type = 'button';
    authorFavoriteBtn.className = 'media-card-author-favorite-btn';
    authorFavoriteBtn.innerHTML = `<svg class="star-icon" viewBox="0 0 24 24"><path d="${STAR_SVG_PATH}"></path></svg>`;
    updateMediaCardAuthorFavoriteButtonUI(authorFavoriteBtn, item.author);
    authorFavoriteBtn.addEventListener('click', (e) => { e.stopPropagation(); handleMediaCardAuthorFavoriteToggle(item.author, authorFavoriteBtn); });
    authorDetailsDiv.appendChild(authorFavoriteBtn);
    mediaInfo.appendChild(authorDetailsDiv);

    const dateSpan = document.createElement('span');
    dateSpan.className = 'media-date';
    dateSpan.textContent = formatDate(item.date);
    mediaInfo.appendChild(dateSpan);

    const itemCollections = collectionsList.filter(c => c.mediaIds.includes(item.id));
    if (itemCollections.length > 0) {
        const collectionIndicator = document.createElement('div');
        collectionIndicator.className = 'media-card-collection-indicator';
        collectionIndicator.innerHTML = `
            <svg viewBox="0 0 24 24"><path fill="currentColor" d="${FOLDER_ICON_SVG_PATH}"></path></svg>
            <span>${itemCollections.length} Collection${itemCollections.length > 1 ? 's' : ''}</span>
            <span class="tooltiptext">${itemCollections.map(c => c.name).join(', ')}</span>
        `;
        mediaInfo.appendChild(collectionIndicator);
    }

    // Add Action Buttons
    const actionsContainer = document.createElement('div');
    actionsContainer.className = 'media-actions';

    // Download Button
    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'action-btn download-btn';
    downloadBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${DOWNLOAD_SVG_PATH}"></path></svg> Download`;
    downloadBtn.title = "Download media";
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const originalText = downloadBtn.textContent;
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Downloading...';
        chrome.runtime.sendMessage({ action: 'downloadMediaItem', mediaId: item.id }, (response) => {
            if (chrome.runtime.lastError || !response || !response.success) {
                showNotification(`Download failed: ${chrome.runtime.lastError?.message || response?.error || 'Unknown error'}`, 'error');
            } else {
                showNotification('Download started.', 'success');
            }
            downloadBtn.disabled = false;
            downloadBtn.textContent = originalText;
        });
    });
    actionsContainer.appendChild(downloadBtn);

    // Open Tweet Button
    if (item.tweetId && item.author) {
        const tweetBtn = document.createElement('button');
        tweetBtn.className = 'action-btn open-btn';
        tweetBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${EXTERNAL_LINK_SVG_PATH}"></path></svg> Tweet`;
        tweetBtn.title = "View on X.com";
        tweetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const authorCleaned = item.author.startsWith('@') ? item.author.substring(1) : item.author;
            window.open(`https://x.com/${authorCleaned}/status/${item.tweetId}`, '_blank');
        });
        actionsContainer.appendChild(tweetBtn);
    }

    // Original Media Button
    if (item.originalRemoteUrl && !item.originalRemoteUrl.startsWith('data:') && !item.originalRemoteUrl.startsWith('blob:')) {
        const originalBtn = document.createElement('button');
        originalBtn.className = 'action-btn original-btn';
        originalBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${EXTERNAL_LINK_SVG_PATH}"></path></svg> Original`;
        originalBtn.title = "Open original media source";
        originalBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            window.open(item.originalRemoteUrl, '_blank');
        });
        actionsContainer.appendChild(originalBtn);
    }

    // Delete Button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'action-btn delete-btn';
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${TRASH_SVG_PATH_GALLERY}"></path></svg> Delete`;
    deleteBtn.title = "Delete media";
    deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (confirm(`Are you sure you want to delete this media by ${item.author || 'Unknown'}?`)) {
            card.classList.add('deleting');
            chrome.runtime.sendMessage({ action: 'deleteMedia', mediaId: item.id }, (response) => {
                // The onMessage listener will handle removal and data refresh
                if (chrome.runtime.lastError || !response || !response.success) {
                    showNotification(`Error deleting: ${chrome.runtime.lastError?.message || response?.error || 'Unknown'}`, 'error');
                    card.classList.remove('deleting');
                } else {
                     showNotification('Media deleted.', 'success');
                }
            });
        }
    });
    actionsContainer.appendChild(deleteBtn);

    // View Author's Media Button
    const authorBtn = document.createElement('button');
    authorBtn.className = 'action-btn author-btn';
    authorBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${USER_SVG_PATH}"></path></svg> Author`;
    authorBtn.title = `View all media by ${item.author || 'Unknown'}`;
    authorBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentAuthor = item.author;
        document.getElementById('author-filter').value = item.author;
        currentPage = 1;
        applyFilters();
        renderGallery();
    });
    actionsContainer.appendChild(authorBtn);

    // Add to Collection Button
    const collectBtn = document.createElement('button');
    collectBtn.className = 'action-btn add-to-collection-btn';
    collectBtn.innerHTML = `<svg viewBox="0 0 24 24"><path d="${FOLDER_PLUS_SVG_PATH}"></path></svg> Collect`;
    collectBtn.title = "Add to/remove from collections";
    collectBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openManageCollectionsModal(item);
    });
    actionsContainer.appendChild(collectBtn);

    mediaInfo.appendChild(actionsContainer);


    const viewButton = card.querySelector('.view-media');
    viewButton.onclick = (e) => { e.stopPropagation(); openModal(item); };

    const checkboxContainer = card.querySelector('.batch-select-checkbox-container');
    const checkbox = checkboxContainer.querySelector('.batch-select-checkbox');
    checkbox.id = `batch-select-${item.id}`;
    checkbox.checked = selectedItemsForBatchDelete.has(item.id);
    checkbox.onchange = () => handleBatchItemSelect(item.id, checkbox.checked);
    checkboxContainer.querySelector('.custom-checkbox-gallery').setAttribute('aria-labelledby', `label-batch-select-${item.id}`);

    const label = document.createElement('label');
    label.htmlFor = checkbox.id;
    label.id = `label-batch-select-${item.id}`;
    label.className = 'visually-hidden';
    label.textContent = `Select item by ${item.author || 'Unknown'}`;
    checkboxContainer.appendChild(label);


    if (isSelectModeActive) {
        checkboxContainer.style.display = 'block';
        card.classList.add('select-mode');
        if(checkbox.checked) card.classList.add('selected-for-batch-delete');
    } else {
        checkboxContainer.style.display = 'none';
        card.classList.remove('select-mode', 'selected-for-batch-delete');
    }

    card.dataset.mediaId = item.id;
    card.dataset.author = item.author;
    return card;
}

let currentModalItem = null;
let modalMediaObjectUrl = null;

async function openModal(item) {
  currentModalItem = item;
  const modal = document.getElementById('media-modal');
  const modalAuthor = document.getElementById('modal-author');
  const modalDate = document.getElementById('modal-date');
  const modalBody = modal.querySelector('.modal-body');

  modalAuthor.textContent = item.author || 'Unknown Author';
  modalDate.textContent = formatDate(item.date);

  if (modalMediaObjectUrl) {
    URL.revokeObjectURL(modalMediaObjectUrl);
    modalMediaObjectUrl = null;
  }
  const activePosterUrl = modal.dataset.activeModalPosterObjectUrl;
  if (activePosterUrl && activePosterUrl.startsWith('blob:')) {
      URL.revokeObjectURL(activePosterUrl);
      delete modal.dataset.activeModalPosterObjectUrl;
  }
  modalBody.innerHTML = '<div class="loading-indicator">Loading media...</div>';

  let mediaElement;
  const isVideo = item.type === 'video';
  const isGif = item.isGif === true;
  const isMetadataOnlyVideo = isVideo && item.savedAsMetadata === true;

  if (isMetadataOnlyVideo) {
    mediaElement = document.createElement('img');
    mediaElement.alt = "Video Thumbnail";
    let sourcesToTry = [];
    if (item.localDataUrl instanceof Blob) sourcesToTry.push(item.localDataUrl);
    else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) sourcesToTry.push(item.localDataUrl);
    if (item.thumbnailUrl && typeof item.thumbnailUrl === 'string' && !sourcesToTry.includes(item.thumbnailUrl)) sourcesToTry.push(item.thumbnailUrl);
    if (item.url && typeof item.url === 'string' && !sourcesToTry.includes(item.url) && !item.url.startsWith('blob:')) sourcesToTry.push(item.url);
    sourcesToTry = sourcesToTry.filter(s => s);

    const videoInfoDiv = document.createElement('div');
    videoInfoDiv.className = 'video-metadata-only';
    videoInfoDiv.innerHTML = `
      <div class="video-info">
        <h3>Video (Thumbnail Only)</h3>
        <p>Full video download is not available through the extension for this item. You may need to find the original video on X.com and use browser developer tools if you wish to download it.</p>
      </div>
      <div class="video-thumbnail"></div>`;
    videoInfoDiv.querySelector('.video-thumbnail').appendChild(mediaElement);
    modalBody.innerHTML = '';
    modalBody.appendChild(videoInfoDiv);

    if (sourcesToTry.length > 0) {
        if (sourcesToTry[0] instanceof Blob) {
            modalMediaObjectUrl = URL.createObjectURL(sourcesToTry[0]);
            mediaElement.src = modalMediaObjectUrl;
        } else {
            mediaElement.src = sourcesToTry[0];
        }
        mediaElement.onerror = () => {
             if (modalMediaObjectUrl) { URL.revokeObjectURL(modalMediaObjectUrl); modalMediaObjectUrl = null;}
             mediaElement.src = IMAGE_ERROR_ICON_SVG; mediaElement.style.objectFit = 'contain';
        };
    } else {
        mediaElement.src = IMAGE_ERROR_ICON_SVG; mediaElement.style.objectFit = 'contain';
    }

  } else if (isVideo || isGif) {
    mediaElement = document.createElement('video');
    mediaElement.className = 'modal-video';
    mediaElement.controls = true;
    mediaElement.autoplay = isGif;
    mediaElement.loop = isGif;
    mediaElement.muted = isGif;
    mediaElement.playsinline = true;

    modalBody.innerHTML = '';
    modalBody.appendChild(mediaElement);

    let sourceToUse = null;
    let cannotPlayDirectlyReason = null;

    if (item.localDataUrl instanceof Blob) {
      sourceToUse = item.localDataUrl;
      logGalleryEntry('DEBUG', `Modal: Using Blob from localDataUrl for video/gif: ${item.id}`);
    } else if (typeof item.url === 'string' && (item.url.startsWith('http:') || item.url.startsWith('https:'))) {
      sourceToUse = item.url;
      logGalleryEntry('DEBUG', `Modal: Using remote URL from item.url for video/gif: ${item.id}`);
    } else if (typeof item.originalRemoteUrl === 'string' && (item.originalRemoteUrl.startsWith('http:') || item.originalRemoteUrl.startsWith('https:'))) {
      sourceToUse = item.originalRemoteUrl;
      logGalleryEntry('DEBUG', `Modal: Using remote URL from item.originalRemoteUrl for video/gif: ${item.id}`);
    } else if (typeof item.url === 'string' && item.url.startsWith('data:video/')) {
      if (!isGif && item.url.length > 1024 * 1024 * 2) {
         cannotPlayDirectlyReason = "Direct playback of large embedded video data is not supported to prevent browser issues. Please use the download button.";
         logGalleryEntry('WARN', `Modal: Avoiding large Data URL (length: ${item.url.length}) for video playback: ${item.id}`);
      } else {
        sourceToUse = item.url;
        logGalleryEntry('DEBUG', `Modal: Attempting Data URL from item.url for ${isGif ? 'GIF' : 'video'}: ${item.id}`);
      }
    }

    // On-demand fetch for missing sources
    if (!sourceToUse) {
      try {
        const db = await new Promise((resolve, reject) => {
          const req = indexedDB.open(DB_NAME);
          req.onsuccess = e => resolve(e.target.result);
          req.onerror = e => reject(e.target.error);
        });
        if (db && db.objectStoreNames.contains(STORE_NAME)) {
          const full = await new Promise((resolve, reject) => {
            const tx = db.transaction(STORE_NAME, 'readonly');
            const store = tx.objectStore(STORE_NAME);
            const r = store.get(item.id);
            r.onsuccess = () => resolve(r.result || null);
            r.onerror = e => reject(e.target.error);
          });
          if (full) {
            if (full.localDataUrl instanceof Blob) sourceToUse = full.localDataUrl;
            else if (typeof full.url === 'string' && (full.url.startsWith('http') || full.url.startsWith('data:video/'))) sourceToUse = full.url;
            else if (typeof full.originalRemoteUrl === 'string' && full.originalRemoteUrl.startsWith('http')) sourceToUse = full.originalRemoteUrl;
          }
        }
      } catch (e) {
        logGalleryEntry('WARN', 'Modal on-demand fetch failed (video)', { error: e, additionalDetails: { id: item.id }});
      }
    }

    if (cannotPlayDirectlyReason) {
      modalBody.innerHTML = `<div class="video-error" style="padding: 20px; text-align: center; color: #fff;">${cannotPlayDirectlyReason}</div>`;
    } else if (sourceToUse) {
      if (sourceToUse instanceof Blob) {
        modalMediaObjectUrl = URL.createObjectURL(sourceToUse);
        mediaElement.src = modalMediaObjectUrl;
      } else {
        mediaElement.src = sourceToUse;
      }
      mediaElement.onloadeddata = () => {
        if (!isGif) mediaElement.play().catch(e => logGalleryEntry('DEBUG', 'Autoplay prevented in modal for video', {error: e}));
      };
      mediaElement.onerror = (e) => {
        const mediaError = mediaElement.error;
        const additionalErrorDetails = {
            srcAttempted: mediaElement.src ? (mediaElement.src.startsWith('blob:') ? 'blob URL' : mediaElement.src.substring(0,100)) : 'N/A',
            mediaErrorCode: mediaError?.code,
            mediaErrorMessage: mediaError?.message
        };
        logGalleryEntry('ERROR', `Error loading video/gif in modal for ${item.id}`, {
            error: mediaError ? new Error(`Media Error (Modal): ${mediaError.message} (Code: ${mediaError.code})`) : new Error('Unknown media error in modal'),
            additionalDetails: additionalErrorDetails
        });
        if (modalMediaObjectUrl) { URL.revokeObjectURL(modalMediaObjectUrl); modalMediaObjectUrl = null;}
        modalBody.innerHTML = '<div class="video-error" style="padding: 20px; text-align: center; color: #fff;">Could not load video. It might be corrupted or in an unsupported format.</div>';
      };
    } else {
      modalBody.innerHTML = '<div class="video-error" style="padding: 20px; text-align: center; color: #fff;">No playable video source found.</div>';
      logGalleryEntry('WARN', `Modal: No playable source found for video/gif: ${item.id}`);
    }

    if (!isGif && mediaElement.tagName === 'VIDEO' && item.thumbnailUrl) {
      if (item.thumbnailUrl instanceof Blob) {
          const posterObjUrl = URL.createObjectURL(item.thumbnailUrl);
          mediaElement.poster = posterObjUrl;
          modal.dataset.activeModalPosterObjectUrl = posterObjUrl;
      } else if (typeof item.thumbnailUrl === 'string') {
          mediaElement.poster = item.thumbnailUrl;
      }
    }
  } else { // Image
    mediaElement = document.createElement('img');
    mediaElement.alt = "Saved Image";
    let imgSrc = null;

    if (item.localDataUrl instanceof Blob) {
        imgSrc = item.localDataUrl;
    } else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) {
        imgSrc = item.localDataUrl;
    } else if (typeof item.url === 'string' && (item.url.startsWith('http:') || item.url.startsWith('https:'))) {
        imgSrc = item.url;
    } else if (typeof item.thumbnailUrl === 'string' && (item.thumbnailUrl.startsWith('http:') || item.thumbnailUrl.startsWith('https:'))) { // Prefer thumbnail if it's a direct URL
        imgSrc = item.thumbnailUrl;
    } else if (typeof item.originalRemoteUrl === 'string' && (item.originalRemoteUrl.startsWith('http:') || item.originalRemoteUrl.startsWith('https:'))) {
        imgSrc = item.originalRemoteUrl;
    } else if (typeof item.url === 'string' && item.url.startsWith('data:image')) {
        imgSrc = item.url;
    } else if (typeof item.thumbnailUrl === 'string' && item.thumbnailUrl.startsWith('data:image')) {
        imgSrc = item.thumbnailUrl;
    }

    modalBody.innerHTML = '';
    modalBody.appendChild(mediaElement);

    if (!imgSrc) {
        // On-demand fetch for missing sources
        try {
            const db = await new Promise((resolve, reject) => {
              const req = indexedDB.open(DB_NAME);
              req.onsuccess = e => resolve(e.target.result);
              req.onerror = e => reject(e.target.error);
            });
            if (db && db.objectStoreNames.contains(STORE_NAME)) {
              const full = await new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const store = tx.objectStore(STORE_NAME);
                const r = store.get(item.id);
                r.onsuccess = () => resolve(r.result || null);
                r.onerror = e => reject(e.target.error);
              });
              if (full) {
                if (full.localDataUrl instanceof Blob && full.localDataUrl.type?.startsWith('image/')) imgSrc = full.localDataUrl;
                else if (typeof full.localDataUrl === 'string' && full.localDataUrl.startsWith('data:image')) imgSrc = full.localDataUrl;
                else if (typeof full.url === 'string' && full.url.startsWith('http')) imgSrc = full.url;
                else if (typeof full.thumbnailUrl === 'string' && full.thumbnailUrl.startsWith('http')) imgSrc = full.thumbnailUrl;
                else if (typeof full.originalRemoteUrl === 'string' && full.originalRemoteUrl.startsWith('http')) imgSrc = full.originalRemoteUrl;
                else if (typeof full.url === 'string' && full.url.startsWith('data:image')) imgSrc = full.url;
                else if (typeof full.thumbnailUrl === 'string' && full.thumbnailUrl.startsWith('data:image')) imgSrc = full.thumbnailUrl;
              }
            }
        } catch (e) {
            logGalleryEntry('WARN', 'Modal on-demand fetch failed (image)', { error: e, additionalDetails: { id: item.id }});
        }
    }

    if (imgSrc) {
        if (imgSrc instanceof Blob) {
            modalMediaObjectUrl = URL.createObjectURL(imgSrc);
            mediaElement.src = modalMediaObjectUrl;
        } else {
            mediaElement.src = imgSrc;
        }
        mediaElement.onerror = () => {
            logGalleryEntry('ERROR', `Error loading image in modal for ${item.id}`, { additionalDetails: { src: mediaElement.src ? (mediaElement.src.startsWith('blob:') ? 'blob URL' : mediaElement.src.substring(0,100)) : 'N/A' }});
            if (modalMediaObjectUrl) { URL.revokeObjectURL(modalMediaObjectUrl); modalMediaObjectUrl = null;}
            mediaElement.src = IMAGE_ERROR_ICON_SVG;
            mediaElement.style.objectFit = 'contain';
        };
    } else {
        mediaElement.src = IMAGE_ERROR_ICON_SVG;
        mediaElement.style.objectFit = 'contain';
        logGalleryEntry('WARN', `Modal: No displayable source found for image: ${item.id}`);
    }
  }
  modal.classList.add('active');
}


function closeModal() {
  const modal = document.getElementById('media-modal');
  if (modalMediaObjectUrl) {
    URL.revokeObjectURL(modalMediaObjectUrl);
    modalMediaObjectUrl = null;
  }
  const activePosterUrl = modal.dataset.activeModalPosterObjectUrl;
  if (activePosterUrl && activePosterUrl.startsWith('blob:')) {
      URL.revokeObjectURL(activePosterUrl);
      delete modal.dataset.activeModalPosterObjectUrl;
  }
  modal.classList.remove('active');
  modal.querySelector('.modal-body').innerHTML = '';
  currentModalItem = null;
}

function openTweetPage() {
  if (currentModalItem && currentModalItem.tweetId && currentModalItem.author) {
    const authorCleaned = currentModalItem.author.startsWith('@') ? currentModalItem.author.substring(1) : currentModalItem.author;
    window.open(`https://x.com/${authorCleaned}/status/${currentModalItem.tweetId}`, '_blank');
  } else {
    showNotification('Tweet information not available for this item.', 'info');
  }
}

async function requestModalMediaDownload() {
    if (!currentModalItem) return;

    const downloadButton = document.getElementById('download-media');
    const originalButtonText = downloadButton.textContent;
    downloadButton.disabled = true;
    downloadButton.textContent = 'Preparing...';

    try {
        const response = await new Promise((resolve, reject) => {
            chrome.runtime.sendMessage(
                { action: 'downloadMediaItem', mediaId: currentModalItem.id },
                (res) => {
                    if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                    else if (res && res.success) resolve(res);
                    else reject(new Error(res?.error || 'Unknown error starting download.'));
                }
            );
        });
        showNotification('Download started!', 'success');
    } catch (error) {
        logGalleryEntry('ERROR', `Error initiating download for media ID ${currentModalItem.id} from modal.`, { error: error });
        showNotification(`Download failed: ${error.message}`, 'error');
    } finally {
        downloadButton.disabled = false;
        downloadButton.textContent = originalButtonText;
    }
}


function formatDate(dateString) {
  if (!dateString) return 'Date Unknown';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (e) {
    return dateString;
  }
}

function formatDuration(seconds) {
  if (isNaN(seconds) || seconds < 0) return '';
  const minutes = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// Collections functions
async function loadCollections() {
    return new Promise((resolve) => {
        try {
            chrome.runtime.sendMessage({ action: 'getCollections' }, (response) => {
                if (chrome.runtime.lastError) {
                    logGalleryEntry('ERROR', 'Error loading collections', { error: chrome.runtime.lastError });
                    collectionsList = [];
                    resolve();
                } else if (response && response.success) {
                    collectionsList = response.collections || [];
                    resolve();
                } else {
                    logGalleryEntry('ERROR', 'Failed to load collections', { additionalDetails: { error: response ? response.error : "Unknown error" }});
                    collectionsList = [];
                    resolve();
                }
            });
        } catch (e) {
            logGalleryEntry('CRITICAL', 'Exception during loadCollections call', { error: e });
            collectionsList = [];
            resolve();
        }
    });
}

let currentMediaItemForCollectionModal = null;
function openManageCollectionsModal(item) {
    currentMediaItemForCollectionModal = item;
    const modal = document.getElementById('manage-collections-modal');
    const title = document.getElementById('manage-collections-modal-title');
    const mediaIdDisplay = document.getElementById('manage-collections-media-id-gallery');
    const previewContainer = document.getElementById('manage-collections-media-preview-container');
    const searchInput = document.getElementById('search-collections-modal-gallery');
    const newNameInput = document.getElementById('new-collection-name-gallery');

    title.textContent = `Manage Collections for "${item.id.substring(0,20)}..."`;
     if (mediaIdDisplay) {
        const displayId = item.id.length > 30 ? item.id.substring(0, 27) + '...' : item.id;
        mediaIdDisplay.textContent = `Item ID: ${displayId}`;
    }

    previewContainer.innerHTML = '';
    const previewImg = document.createElement('img');

    let previewSrcCandidate = null;
    if (item.localDataUrl instanceof Blob && item.localDataUrl.type.startsWith('image/')) {
        previewSrcCandidate = item.localDataUrl;
    } else if (typeof item.localDataUrl === 'string' && item.localDataUrl.startsWith('data:image')) {
        previewSrcCandidate = item.localDataUrl;
    } else if (item.thumbnailUrl && (item.thumbnailUrl instanceof Blob || (typeof item.thumbnailUrl === 'string' && item.thumbnailUrl.startsWith('data:image')))) {
        previewSrcCandidate = item.thumbnailUrl;
    } else if (typeof item.thumbnailUrl === 'string' && /\.(jpe?g|png|webp|gif)$/i.test(item.thumbnailUrl)) {
        previewSrcCandidate = item.thumbnailUrl;
    } else if (typeof item.url === 'string' && item.url.startsWith('data:image')) {
        previewSrcCandidate = item.url;
    } else {
        previewSrcCandidate = IMAGE_ERROR_ICON_SVG;
    }

    let tempObjectUrl = null;
    if (previewSrcCandidate instanceof Blob) {
        tempObjectUrl = URL.createObjectURL(previewSrcCandidate);
        previewImg.src = tempObjectUrl;
    } else {
        previewImg.src = previewSrcCandidate;
    }
    previewImg.alt = `Preview of ${item.id}`;

    const cleanupObjectURL = () => { if (tempObjectUrl) URL.revokeObjectURL(tempObjectUrl); tempObjectUrl = null; };
    if (tempObjectUrl) {
        previewImg.onload = cleanupObjectURL;
        previewImg.onerror = () => { cleanupObjectURL(); previewImg.src = IMAGE_ERROR_ICON_SVG; };
    } else {
        previewImg.onerror = () => { previewImg.src = IMAGE_ERROR_ICON_SVG; };
    }
    previewContainer.appendChild(previewImg);

    searchInput.value = '';
    newNameInput.value = '';
    populateCollectionsListInModal(item.id);
    modal.classList.add('active');
}

function closeManageCollectionsModal() {
    const modal = document.getElementById('manage-collections-modal');
    modal.classList.remove('active');
    const previewImg = document.getElementById('manage-collections-media-preview-container').querySelector('img');
    if (previewImg && previewImg.src.startsWith('blob:')) {
        URL.revokeObjectURL(previewImg.src);
    }
    currentMediaItemForCollectionModal = null;
}

function populateCollectionsListInModal(mediaItemId, searchTerm = '') {
    const listUl = document.getElementById('existing-collections-list-gallery');
    const loadingP = document.getElementById('manage-collections-loading');
    const emptyP = document.getElementById('manage-collections-empty');
    listUl.innerHTML = '';
    loadingP.style.display = 'block';
    emptyP.style.display = 'none';

    const filteredCollections = collectionsList.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase())
    ).sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));

    if (filteredCollections.length === 0) {
        loadingP.style.display = 'none';
        emptyP.style.display = 'block';
        emptyP.textContent = searchTerm ? 'No collections match search.' : 'No collections yet. Create one above!';
        return;
    }
    loadingP.style.display = 'none';
    const fragment = document.createDocumentFragment();
    filteredCollections.forEach(collection => {
        const li = document.createElement('li');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `gallery-coll-checkbox-${collection.id}`;
        checkbox.value = collection.id.toString();
        checkbox.checked = collection.mediaIds.includes(mediaItemId);
        const label = document.createElement('label');
        label.htmlFor = `gallery-coll-checkbox-${collection.id}`;
        label.textContent = `${collection.name} (${collection.mediaIds.length})`;
        li.appendChild(checkbox);
        li.appendChild(label);
        fragment.appendChild(li);
    });
    listUl.appendChild(fragment);
}

function handleSearchCollectionsInModal() {
    const searchTerm = document.getElementById('search-collections-modal-gallery').value;
    if (currentMediaItemForCollectionModal) {
        populateCollectionsListInModal(currentMediaItemForCollectionModal.id, searchTerm);
    }
}

async function handleCreateAndAddCollectionGallery() {
    const nameInput = document.getElementById('new-collection-name-gallery');
    const name = nameInput.value.trim();
    if (!name) { showNotification('Collection name cannot be empty.', 'error'); return; }
    if (!currentMediaItemForCollectionModal) return;

    const createBtn = document.getElementById('create-and-add-collection-gallery');
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
            chrome.runtime.sendMessage({ action: 'updateMediaInCollection', collectionId: newCollection.id, mediaId: currentMediaItemForCollectionModal.id, shouldBeInCollection: true }, (res) => {
                if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
                else if (res && res.success) resolve(res);
                else reject(new Error(res ? res.error : 'Failed to add media to new collection'));
            });
        });
        showNotification(`Collection "${name}" created and item added.`, 'success');
        nameInput.value = '';
        await loadCollections(); // Reload all collections
        populateCollectionsListInModal(currentMediaItemForCollectionModal.id, document.getElementById('search-collections-modal-gallery').value);
        updateCollectionFilterOptions(); // Update main filter
    } catch (error) {
        logGalleryEntry('ERROR', 'Error creating/adding collection', { error: error, additionalDetails: {name} });
        showNotification(`Error: ${error.message}`, 'error');
    } finally {
        createBtn.disabled = false; createBtn.innerHTML = originalBtnHTML;
    }
}

async function handleSaveCollectionChangesGallery() {
    if (!currentMediaItemForCollectionModal) return;
    const mediaId = currentMediaItemForCollectionModal.id;
    const checkboxes = document.getElementById('existing-collections-list-gallery').querySelectorAll('input[type="checkbox"]');
    let changesMade = 0;
    const saveBtn = document.getElementById('save-collection-changes-gallery');
    const originalBtnHTML = saveBtn.innerHTML;
    saveBtn.disabled = true; saveBtn.innerHTML = "Saving...";

    const promises = Array.from(checkboxes).map(async checkbox => {
        const collectionId = parseInt(checkbox.value);
        const shouldBeInCollection = checkbox.checked;
        const collection = collectionsList.find(c => c.id === collectionId);
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
                 logGalleryEntry('ERROR', 'Error updating collection membership', { error: error, additionalDetails: { collectionId, mediaId } });
                showNotification(`Error updating "${collection.name}": ${error.message}`, 'error');
            }
        }
    });
    await Promise.all(promises);
    saveBtn.disabled = false; saveBtn.innerHTML = originalBtnHTML;
    if (changesMade > 0) {
        showNotification('Collection memberships updated!', 'success');
        await loadCollections(); // Reload collections
        populateCollectionsListInModal(mediaId, document.getElementById('search-collections-modal-gallery').value);
        updateCollectionFilterOptions();
        renderGallery(); // Re-render gallery for indicator updates
    }
    closeManageCollectionsModal();
}

async function handleRemoveMediaFromAllCollectionsGallery() {
  if (!currentMediaItemForCollectionModal) return;
  const mediaId = currentMediaItemForCollectionModal.id;
  const collectionsContainingItem = collectionsList.filter(c => c.mediaIds.includes(mediaId));

  if (collectionsContainingItem.length === 0) {
    showNotification("Item is not in any collections.", "info");
    return;
  }

  if (!confirm(`Remove this item from all ${collectionsContainingItem.length} collections it belongs to?`)) return;

  const removeBtn = document.getElementById('remove-from-all-collections-gallery');
  const originalBtnHTML = removeBtn.innerHTML;
  removeBtn.disabled = true; removeBtn.innerHTML = "Removing...";
  let errorsOccurred = false;

  const promises = collectionsContainingItem.map(async collection => {
    try {
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'updateMediaInCollection', collectionId: collection.id, mediaId: mediaId, shouldBeInCollection: false }, (res) => {
          if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
          else if (res && res.success) resolve(res);
          else reject(new Error(res?.error || `Failed to remove from ${collection.name}`));
        });
      });
    } catch (error) {
      errorsOccurred = true;
      logGalleryEntry('ERROR', `Error removing item from collection "${collection.name}"`, { error, additionalDetails: { mediaId, collectionId: collection.id } });
      showNotification(`Error removing from "${collection.name}": ${error.message}`, 'error');
    }
  });

  await Promise.all(promises);
  removeBtn.disabled = false; removeBtn.innerHTML = originalBtnHTML;

  if (!errorsOccurred) {
    showNotification('Item removed from all its collections.', 'success');
  } else {
    showNotification('Some errors occurred while removing item from collections. Check logs.', 'warn');
  }
  await loadCollections();
  populateCollectionsListInModal(mediaId, document.getElementById('search-collections-modal-gallery').value);
  updateCollectionFilterOptions();
  renderGallery();
}


// Batch Selection Functions
function toggleBatchSelectMode() {
    isSelectModeActive = !isSelectModeActive;
    const batchActionsContainer = document.getElementById('batch-actions-container');
    const toggleBtn = document.getElementById('batch-select-toggle-btn');

    if (isSelectModeActive) {
        batchActionsContainer.classList.remove('hidden');
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:1em;height:1em;margin-right:4px;"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"></path></svg>Cancel Select`;
        toggleBtn.classList.add('danger-button');
        toggleBtn.classList.remove('secondary-button');
    } else {
        batchActionsContainer.classList.add('hidden');
        selectedItemsForBatchDelete.clear();
        toggleBtn.innerHTML = `<svg viewBox="0 0 24 24" style="width:1em;height:1em;margin-right:4px;"><path fill="currentColor" d="M7 14H5v5h5v-2H7v-3zm0-8h3V4H5v5h2V6zm12 8h-3v4h5v-5h-2v3zM14 4v2h3v3h2V4h-5z"></path></svg>Select Items`;
        toggleBtn.classList.remove('danger-button');
        toggleBtn.classList.add('secondary-button');
    }
    renderGallery(); // Re-render to show/hide checkboxes
    updateSelectionCounter();
}

function handleBatchItemSelect(mediaId, isSelected) {
    if (isSelected) {
        selectedItemsForBatchDelete.add(mediaId);
    } else {
        selectedItemsForBatchDelete.delete(mediaId);
    }
    const card = document.querySelector(`.media-card[data-media-id="${mediaId}"]`);
    if(card) card.classList.toggle('selected-for-batch-delete', isSelected);
    updateSelectionCounter();
}

function updateSelectionCounter() {
    const count = selectedItemsForBatchDelete.size;
    document.getElementById('selection-counter').textContent = `${count} item${count === 1 ? '' : 's'} selected`;
    document.getElementById('delete-selected-btn').disabled = count === 0;
}

function handleSelectAllVisible() {
    const mediaGrid = document.getElementById('media-grid');
    mediaGrid.querySelectorAll('.media-card').forEach(card => {
        const mediaId = card.dataset.mediaId;
        if (mediaId && !selectedItemsForBatchDelete.has(mediaId)) {
            selectedItemsForBatchDelete.add(mediaId);
            const checkbox = card.querySelector('.batch-select-checkbox');
            if (checkbox) checkbox.checked = true;
            card.classList.add('selected-for-batch-delete');
        }
    });
    updateSelectionCounter();
}

function handleDeselectAllVisible() {
    const mediaGrid = document.getElementById('media-grid');
    mediaGrid.querySelectorAll('.media-card').forEach(card => {
        const mediaId = card.dataset.mediaId;
        if (mediaId && selectedItemsForBatchDelete.has(mediaId)) {
            selectedItemsForBatchDelete.delete(mediaId);
            const checkbox = card.querySelector('.batch-select-checkbox');
            if (checkbox) checkbox.checked = false;
            card.classList.remove('selected-for-batch-delete');
        }
    });
    updateSelectionCounter();
}

async function handleDeleteSelected() {
    const itemsToDelete = Array.from(selectedItemsForBatchDelete);
    if (itemsToDelete.length === 0) {
        showNotification("No items selected for deletion.", "info");
        return;
    }
    if (!confirm(`Are you sure you want to delete ${itemsToDelete.length} item(s)? This cannot be undone.`)) {
        return;
    }

    const deleteBtn = document.getElementById('delete-selected-btn');
    const originalBtnText = deleteBtn.innerHTML;
    deleteBtn.disabled = true;
    deleteBtn.innerHTML = `<svg viewBox="0 0 24 24" class="spin" style="width:1em;height:1em;margin-right:4px;"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"></path></svg>Deleting...`;

    let successCount = 0;
    let errorCount = 0;

    for (const mediaId of itemsToDelete) {
        try {
            await new Promise((resolve, reject) => {
                chrome.runtime.sendMessage({ action: 'deleteMedia', mediaId: mediaId }, (response) => {
                    if (chrome.runtime.lastError || !response || !response.success) {
                        reject(chrome.runtime.lastError?.message || response?.error || "Unknown error");
                    } else {
                        resolve();
                    }
                });
            });
            successCount++;
            const card = document.querySelector(`.media-card[data-media-id="${mediaId}"]`);
            if (card) card.classList.add('deleting');
        } catch (error) {
            errorCount++;
            logGalleryEntry('ERROR', `Failed to delete media ID ${mediaId} during batch delete.`, { error });
        }
    }

    deleteBtn.disabled = false;
    deleteBtn.innerHTML = originalBtnText;

    if (errorCount > 0) {
        showNotification(`Deleted ${successCount} items. ${errorCount} items failed to delete.`, "warn");
    } else {
        showNotification(`${successCount} items deleted successfully.`, "success");
    }

    selectedItemsForBatchDelete.clear();
    updateSelectionCounter();

    // Full reload can be disruptive but ensures data consistency
    await guardedLoadMediaDataFromBackground();
    if (isSelectModeActive) { // Keep select mode if it was active
       renderGallery(); // Will re-apply select mode styles
    } else {
       toggleBatchSelectMode(); // This will call renderGallery and clear styles
    }
}

// --- START: Gallery Logs Functions - Exact Popup Match ---
async function fetchAndDisplayLogsGallery() {
  const container = document.getElementById('logs-display-container-gallery');
  if (!container) return;
  
  container.innerHTML = '<div class="loading-indicator">Fetching logs...</div>';

  chrome.runtime.sendMessage({ action: 'getBackgroundLogs' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      container.textContent = 'Error fetching logs: ' + (chrome.runtime.lastError?.message || response?.error || 'Unknown error');
      logGalleryEntry('ERROR', 'Failed to fetch logs for gallery display', { error: chrome.runtime.lastError || new Error(response?.error) });
    } else {
      displayLogsInGallery(response.logs || []);
    }
  });
}

function displayLogsInGallery(logs) {
  const container = document.getElementById('logs-display-container-gallery');
  if (!container) return;

  const selectedLevels = Array.from(document.querySelectorAll('.log-level-filter-gallery'))
                             .filter(cb => cb.checked)
                             .map(cb => cb.value.toUpperCase());
  const selectedSources = Array.from(document.querySelectorAll('.log-source-filter-gallery'))
                               .filter(cb => cb.checked)
                               .map(cb => cb.value.toUpperCase());
  const searchText = document.getElementById('log-text-filter-gallery')?.value.toLowerCase() || '';

  const filteredLogs = logs.filter(log => {
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
      <span class="log-entry-level level-${log.level.toLowerCase()}">${log.level}</span>
      <span class="log-entry-source">${log.source}</span>
      <span class="log-entry-timestamp">${ts}</span>
      ${log.contextUrl ? `<span class="log-entry-context">${log.contextUrl}</span>` : ''}
      ${log.id ? `<span class="log-entry-id">${log.id}</span>` : ''}
    `;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'log-entry-message';
    messageDiv.textContent = log.message;

    entryDiv.appendChild(summaryDiv);
    entryDiv.appendChild(messageDiv);

    if (log.stack && (log.level === 'ERROR' || log.level === 'CRITICAL')) {
      const stackDiv = document.createElement('div');
      stackDiv.className = 'log-entry-stack';
      stackDiv.textContent = log.stack;
      entryDiv.appendChild(stackDiv);
    }

    if (log.details && Object.keys(log.details).length > 0) {
      const detailsDiv = document.createElement('div');
      detailsDiv.className = 'log-entry-details';
      detailsDiv.textContent = JSON.stringify(log.details, null, 2);
      entryDiv.appendChild(detailsDiv);
    }

    fragment.appendChild(entryDiv);
  });

  container.innerHTML = '';
  container.appendChild(fragment);
}

function copyFilteredLogsToClipboardGallery() {
  const container = document.getElementById('logs-display-container-gallery');
  if (!container) return;

  const logEntries = container.querySelectorAll('.log-entry');
  const importantLevels = new Set(['critical','error','warn']);
  const important = Array.from(logEntries).filter(entry => {
    const level = entry.querySelector('.log-entry-level')?.textContent?.toLowerCase() || '';
    const hasDetails = !!entry.querySelector('.log-entry-details');
    const hasStack = !!entry.querySelector('.log-entry-stack');
    return importantLevels.has(level) || hasDetails || hasStack;
  });

  const logText = important.map(entry => {
    const level = entry.querySelector('.log-entry-level')?.textContent || '';
    const source = entry.querySelector('.log-entry-source')?.textContent || '';
    const timestamp = entry.querySelector('.log-entry-timestamp')?.textContent || '';
    const context = entry.querySelector('.log-entry-context')?.textContent || '';
    const id = entry.querySelector('.log-entry-id')?.textContent || '';
    const message = entry.querySelector('.log-entry-message')?.textContent || '';
    const details = entry.querySelector('.log-entry-details')?.textContent || '';
    const stack = entry.querySelector('.log-entry-stack')?.textContent || '';

    let block = `[${timestamp}] ${level} [${source}] ${message}`;
    if (context) block += `\nContext: ${context}`;
    if (id) block += `\nID: ${id}`;
    if (details) block += `\nDetails: ${details}`;
    if (stack) block += `\nStack: ${stack}`;
    return block;
  }).join('\n\n');

  navigator.clipboard.writeText(logText).then(() => {
    showNotification('Important logs copied to clipboard', 'success');
  }).catch(err => {
    logGalleryEntry('ERROR', 'Failed to copy logs to clipboard', { error: err });
    showNotification('Failed to copy logs', 'error');
  });
}

function downloadFilteredLogsGallery() {
  const container = document.getElementById('logs-display-container-gallery');
  if (!container) return;

  const logEntries = container.querySelectorAll('.log-entry');
  const logText = Array.from(logEntries).map(entry => {
    const level = entry.querySelector('.log-entry-level').textContent;
    const source = entry.querySelector('.log-entry-source').textContent;
    const timestamp = entry.querySelector('.log-entry-timestamp').textContent;
    const message = entry.querySelector('.log-entry-message').textContent;
    const details = entry.querySelector('.log-entry-details')?.textContent || '';
    
    return `[${timestamp}] ${level} [${source}] ${message}${details ? '\n' + details : ''}`;
  }).join('\n\n');

  const blob = new Blob([logText], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `x-media-saver-logs-${new Date().toISOString().split('T')[0]}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showNotification('Logs downloaded', 'success');
}

function clearAllLogsFromGallery() {
  if (confirm("Are you sure you want to clear all background logs? This action cannot be undone.")) {
    chrome.runtime.sendMessage({ action: 'clearBackgroundLogs' }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        showNotification("Error clearing logs: " + (chrome.runtime.lastError?.message || response?.error || 'Unknown'), "error");
      } else {
        showNotification("Background logs cleared successfully.", "success");
        fetchAndDisplayLogsGallery(); // Refresh display
      }
    });
  }
}
// --- END: Gallery Logs Functions - Exact Popup Match ---