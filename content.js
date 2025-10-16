// Global constants and variables
const DEBUG = false;
const debugLog = DEBUG ? (...args) => console.log("X.com Media Saver:", ...args) : () => {};

const processedContainers = new Set();
const processedVideoContainers = new Set();
let isProcessing = false; // Prevents concurrent full scans

window.lastKnownPath = ''; // Initialize

const SELECTOR_CACHE = {
  tweetPhoto: '[data-testid="tweetPhoto"], [data-testid="tweetPhotoContainer"]',
  mediaImg: 'img[src*="twimg.com/media"]',
  modalImg: 'div[role="dialog"] img[src*="twimg.com"]',
  attachments: '[data-testid="attachments"] img[src*="twimg.com/media"]',
  photoLinks: 'a[href*="/photo/"] img[src*="twimg.com/media"]',
  gallery: '[data-testid="cellInnerDiv"] [role="group"]',
  carousel: '[aria-label="Carousel"]',
  grid: '[aria-label="Image grid"]',
  videoPlayerWrappers: '[data-testid="videoPlayer"]',
  videoContainers: 'article [data-testid*="video"], [role="dialog"] [data-testid*="video"], [data-testid="videoPlayer"], [data-testid="videoComponent"], [data-testid="tweetDetail"] [data-testid*="video"]',
  videoTag: 'video',
  embeddedVideo: 'div[data-testid="tweetEmbed"] video',
  forYouVideos: '[data-testid="cellInnerDiv"] video, article video',
  tweetParents: 'article[data-testid="tweet"], [data-testid="cellInnerDiv"], [role="dialog"]',
  // Added for specific handling of full-size images in modals
  modalLargeImage: 'div[role="dialog"] img[src*="twimg.com"][src*="name="]',
};

const specificButtonClassName = 'x-media-save-button';

// --- START: Enhanced Content Script Logging ---

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
            if (value instanceof Element) return `[DOM Element: ${value.tagName}]`;
            
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

function logContentScriptEntry(level, message, details = {}) {
  let logEntry;
  
  try {
    // Create robust log entry
    const sanitizedMessage = sanitizeInput(message);
    const sanitizedSource = 'CONTENT_SCRIPT';
    
    logEntry = {
      id: `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: new Date().toISOString(),
      source: sanitizedSource,
      level: level.toUpperCase(),
      message: sanitizedMessage,
      stack: null,
      contextUrl: details.contextUrl || window.location.href,
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
      source: 'CONTENT_SCRIPT_LOGGING_SYSTEM',
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
    const consoleArgs = [`XMS CS [${logEntry.level}] (${logEntry.id}):`, logEntry.message];
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
            // console.debug(...consoleArgs);
            break;
        default: // INFO
            console.log(...consoleArgs);
            break;
    }
  } catch (consoleError) {
    // Ultimate fallback - direct console output
    console.error(`XMS CS CONSOLE OUTPUT ERROR: ${consoleError.message}`);
    console.error(`Original log: ${logEntry.message}`);
  }

  // Send to background with enhanced error handling
  if (isContextValid()) {
    try {
      chrome.runtime.sendMessage(
        { action: 'logExternalEntry', logEntry: logEntry },
        (response) => {
          if (chrome.runtime.lastError) {
            // Try localStorage fallback
            try {
              const fallbackKey = `xms_cs_log_${logEntry.id}`;
              const fallbackData = {
                timestamp: logEntry.timestamp,
                level: logEntry.level,
                message: logEntry.message,
                source: logEntry.source,
                error: chrome.runtime.lastError.message
              };
              localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
            } catch (localStorageError) {
              console.error(`XMS CS: localStorage fallback failed: ${localStorageError.message}`);
            }
          } else if (response && !response.success) {
            // Try localStorage fallback for failed response
            try {
              const fallbackKey = `xms_cs_log_${logEntry.id}`;
              const fallbackData = {
                timestamp: logEntry.timestamp,
                level: logEntry.level,
                message: logEntry.message,
                source: logEntry.source,
                error: response.error || 'Unknown response error'
              };
              localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
            } catch (localStorageError) {
              console.error(`XMS CS: localStorage fallback failed: ${localStorageError.message}`);
            }
          }
        }
      );
    } catch (messageError) {
      // Ultimate fallback - localStorage only
      try {
        const fallbackKey = `xms_cs_log_${logEntry.id}`;
        const fallbackData = {
          timestamp: logEntry.timestamp,
          level: logEntry.level,
          message: logEntry.message,
          source: logEntry.source,
          error: messageError.message
        };
        localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
      } catch (localStorageError) {
        console.error(`XMS CS: All logging methods failed: ${localStorageError.message}`);
      }
    }
  } else if (logEntry.level !== 'DEBUG') {
    // Context invalid, try localStorage fallback
    try {
      const fallbackKey = `xms_cs_log_${logEntry.id}`;
      const fallbackData = {
        timestamp: logEntry.timestamp,
        level: logEntry.level,
        message: logEntry.message,
        source: logEntry.source,
        error: 'Context invalid'
      };
      localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
    } catch (localStorageError) {
      console.error(`XMS CS: localStorage fallback failed: ${localStorageError.message}`);
    }
  }
}

window.onerror = function(message, sourceURL, lineno, colno, error) {
  try {
    // Suppress noisy errors from X blob contexts and trivial minified refs
    const src = String(sourceURL || '');
    const msg = String(message || '').toLowerCase();
    if (src.startsWith('blob:https://x.com/') || src.startsWith('blob:https://twitter.com/')) {
      return false; // ignore third-party blob frame errors
    }
    if (msg.includes('t is not defined') || msg.includes('undefined is not a function')) {
      return false; // ignore common minified noise
    }
    const errorDetails = {
      lineno: lineno || 'N/A',
      colno: colno || 'N/A',
      source: 'window.onerror'
    };

    logContentScriptEntry(
      'CRITICAL',
      `Content Uncaught: ${message}`,
      {
        error: error instanceof Error ? error : new Error(message),
        stack: error?.stack || 'No stack available',
        contextUrl: sourceURL,
        additionalDetails: errorDetails
      }
    );
  } catch (logError) {
    console.error("XMS CS: Error in window.onerror handler:", logError);
    console.error("Original error:", message, sourceURL, lineno, colno, error);
  }
  return false;
};

window.addEventListener('unhandledrejection', function(event) {
  const reason = event.reason;
  logContentScriptEntry(
    'CRITICAL',
    `Content Unhandled Rejection: ${reason?.message || String(reason)}`,
    {
      error: reason instanceof Error ? reason : new Error(String(reason)),
      stack: reason?.stack,
      contextUrl: window.location.href,
      additionalDetails: {
        reasonRaw: String(reason),
        source: 'window.onunhandledrejection'
      }
    }
  );
});

// --- END: Content Script Logging ---

// Utility Functions
function isContextValid() {
  return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id;
}

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

function getOriginalImageUrl(imageUrl) {
    if (!imageUrl || typeof imageUrl !== 'string') return '';
    if (imageUrl.startsWith('blob:')) return imageUrl;

    try {
        const url = new URL(imageUrl);
        url.searchParams.set('name', 'orig');

        let format = url.searchParams.get('format');
        if (!format) {
            const pathParts = url.pathname.split('/');
            const filename = pathParts[pathParts.length - 1];
            const extMatch = filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
            if (extMatch && extMatch[1]) {
                format = extMatch[1].toLowerCase();
            }
        }

        if (format === 'jpeg') format = 'jpg';

        if (format && ['jpg', 'png', 'webp', 'gif'].includes(format)) {
            url.searchParams.set('format', format);
        } else {
            if (!url.searchParams.has('format') || !['jpg', 'png', 'webp', 'gif'].includes(url.searchParams.get('format'))) {
                 url.searchParams.set('format', 'jpg');
            }
        }
        return url.toString();
    } catch (e) {
        logContentScriptEntry('DEBUG', "Using fallback in getOriginalImageUrl due to URL parsing error.", { error: e, additionalDetails: { input: imageUrl }});
        let originalUrl = imageUrl;
        if (!originalUrl.includes('name=')) {
            originalUrl += (originalUrl.includes('?') ? '&' : '?') + 'name=orig';
        } else if (!originalUrl.includes('name=orig')) {
            originalUrl = originalUrl.replace(/name=\w+/g, 'name=orig');
        }
        const formatRegex = /[?&]format=(\w+)/i;
        const formatMatch = originalUrl.match(formatRegex);
        let currentFormat = formatMatch ? formatMatch[1].toLowerCase() : null;
        const pathParts = originalUrl.split('?')[0].split('/');
        const filename = pathParts.length > 0 ? pathParts[pathParts.length - 1] : '';
        const extMatchPath = filename.match(/\.(jpg|jpeg|png|gif|webp)$/i);
        const pathFormat = extMatchPath ? (extMatchPath[1].toLowerCase() === 'jpeg' ? 'jpg' : extMatchPath[1].toLowerCase()) : null;
        const validFormats = ['jpg', 'png', 'webp', 'gif'];
        let finalFormat = 'jpg';
        if (currentFormat && validFormats.includes(currentFormat)) {
            finalFormat = currentFormat;
        } else if (pathFormat && validFormats.includes(pathFormat)) {
            finalFormat = pathFormat;
        }
        if (formatMatch) {
            originalUrl = originalUrl.replace(formatRegex, `format=${finalFormat}`);
        } else {
            originalUrl += (originalUrl.includes('?') ? '&' : '?') + `format=${finalFormat}`;
        }
        originalUrl = originalUrl.replace('?&', '?').replace('&&', '&');
        if (originalUrl.endsWith('?') || originalUrl.endsWith('&')) {
            originalUrl = originalUrl.slice(0, -1);
        }
        return originalUrl;
    }
}


function findAuthorUsername(element) {
  try {
    let authorUsername = 'unknown';
    const tweetElement = element.closest(SELECTOR_CACHE.tweetParents);
    if (tweetElement) {
      const usernameElement = tweetElement.querySelector('[data-testid="User-Name"] span');
      if (usernameElement && usernameElement.textContent) {
        const spans = tweetElement.querySelectorAll('[data-testid="User-Name"] span');
        for (const span of spans) {
          const text = span.textContent.trim();
          if (text.startsWith('@')) {
            authorUsername = text.substring(1); break;
          }
        }
      }
      if (authorUsername === 'unknown') {
        const statusLink = tweetElement.querySelector('a[href*="/status/"]');
        if (statusLink) {
          const match = statusLink.getAttribute('href').match(/\/([^\/]+)\/status\//);
          if (match && match[1]) authorUsername = match[1];
        }
      }
       if (authorUsername === 'unknown') {
        const userLinks = tweetElement.querySelectorAll('a[href^="/"][role="link"]');
        for(const userLink of userLinks){
            if(userLink.offsetParent !== null) {
                const href = userLink.getAttribute('href');
                if (href && href.startsWith('/') && !href.includes('/status/')) {
                    const usernameParts = href.split('/');
                    if(usernameParts.length > 1 && usernameParts[1] && !['i', 'notifications', 'messages', 'explore', 'home', 'search'].includes(usernameParts[1])) {
                        authorUsername = usernameParts[1];
                        break;
                    }
                }
            }
        }
      }
    }
    if (authorUsername === 'unknown') {
      const profileMatch = window.location.href.match(/https:\/\/(x|twitter)\.com\/([^\/\?]+)/);
      if (profileMatch && profileMatch[2] && !['home', 'explore', 'notifications', 'messages', 'settings', 'i', 'search', 'compose', 'communities'].includes(profileMatch[2]) && !profileMatch[2].includes('status')) {
        authorUsername = profileMatch[2];
      }
    }
    if (authorUsername === 'unknown') {
      const container = element.closest('[data-testid="cellInnerDiv"]');
      if (container) {
        const match = container.textContent.match(/@(\w{1,15})/);
        if (match && match[1]) authorUsername = match[1];
      }
    }
    if (authorUsername === 'unknown') {
      const dialog = element.closest('div[role="dialog"]');
      if (dialog) {
        const usernameElements = dialog.querySelectorAll('span');
        for (let el of usernameElements) {
          if (el.textContent.trim().startsWith('@')) {
            authorUsername = el.textContent.trim().substring(1); break;
          }
        }
      }
    }
    return '@' + authorUsername.replace('@','');
  } catch (err) {
    logContentScriptEntry('ERROR', "Error finding username", { error: err, additionalDetails: { elementOuterHTML: element?.outerHTML?.substring(0, 100) } });
    return '@unknown';
  }
}

function findTweetId(element) {
  try {
    const statusLink = element.closest(SELECTOR_CACHE.tweetParents)?.querySelector('a[href*="/status/"]');
    if (statusLink) {
      const href = statusLink.getAttribute('href');
      const match = href.match(/\/status\/(\d+)/);
      if (match && match[1]) return match[1];
    }
    const currentUrl = window.location.href;
    const urlMatch = currentUrl.match(/\/status\/(\d+)/);
    if (urlMatch && urlMatch[1]) return urlMatch[1];
    let parent = element.parentElement;
    for(let i=0; i < 10 && parent; i++){
        const links = parent.querySelectorAll('a[href*="/status/"]');
        for(const link of links){
            const href = link.getAttribute('href');
            const match = href.match(/\/status\/(\d+)/);
            if (match && match[1]) return match[1];
        }
        parent = parent.parentElement;
    }
    return null;
  } catch (err) {
    logContentScriptEntry('ERROR', "Error finding tweet ID", { error: err, additionalDetails: { elementOuterHTML: element?.outerHTML?.substring(0,100) } });
    return null;
  }
}

function getVideoSourceUrl(video) {
  try {
    let videoUrl = video.src || (video.querySelector('source') && video.querySelector('source').src) || video.currentSrc;
    if (!videoUrl && video.poster) {
        if (video.poster.includes('ext_tw_video_thumb')) {
            videoUrl = video.poster.replace('ext_tw_video_thumb', 'vid').replace(/\.(jpg|png|jpeg|webp)(\?|$)/, '.mp4$2');
        } else if (video.poster.includes('/tweet_video_thumb/')) {
             videoUrl = video.poster.replace('/tweet_video_thumb/', '/tweet_video/').replace(/\.(jpg|png|jpeg|webp)(\?|$)/, '.mp4$2');
        } else {
             const potentialUrl = video.poster.replace(/\.(jpg|png|jpeg|webp)(\?|$)/, '.mp4$2');
             if(potentialUrl !== video.poster) videoUrl = potentialUrl;
        }
    }
    if (videoUrl && videoUrl.startsWith('//')) videoUrl = 'https:' + videoUrl;
    return videoUrl;
  } catch (err) {
    logContentScriptEntry('WARN', "Error getting video source URL", {error: err, additionalDetails: {videoPoster: video?.poster}});
    return null;
  }
}

function getFilenameFromVideoUrl(url) {
  try {
    if (!url) return `video_${Date.now()}`;
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/');
    return pathParts[pathParts.length - 1] || `video_${Date.now()}`;
  } catch (e) {
    if (typeof url === 'string' && (url.startsWith('data:') || url.startsWith('blob:'))) {
        const typeMatch = url.match(/^data:.+\/(.+);base64/);
        if (typeMatch && typeMatch[1]) {
            return `video_${Date.now()}.${typeMatch[1].split('+')[0]}`;
        }
        return `video_${Date.now()}`;
    }
    return `video_${Date.now()}`;
  }
}

function getImageIdFromUrl(url) {
  try {
    const baseUrl = url.split('?')[0];
    const parts = baseUrl.split('/');
    return parts[parts.length - 1] || url;
  } catch (e) { return url; }
}

function ensureVideoElementHasUniqueId(videoElement) {
    if (!videoElement.dataset.xmsUniqueVideoId) {
        videoElement.dataset.xmsUniqueVideoId = `xms-video-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }
    return videoElement.dataset.xmsUniqueVideoId;
}


function getVideoIdFromElement(video) {
  try {
    const uniqueIdAttr = video.dataset.xmsUniqueVideoId;
    if (uniqueIdAttr) return uniqueIdAttr;

    const sourceUrl = getVideoSourceUrl(video);
    if (sourceUrl) {
      if(sourceUrl.startsWith('blob:')) {
        const parts = sourceUrl.split('/');
        return `video-${parts[parts.length -1]}`;
      }
      const match = sourceUrl.match(/\/([^\/]+)\.(mp4|webm|mov|m3u8|gif)/);
      if (match && match[1]) return `video-${match[1]}`;
      return `video-${String(sourceUrl).split('').reduce((hash, char) => (hash * 31 + char.charCodeAt(0)) & 0xFFFFFFFF, 0).toString(16)}`;
    }
    if (video.poster) {
        const posterBase = video.poster.substring(video.poster.lastIndexOf('/') + 1).split('.')[0];
        return `video-poster-${posterBase}`;
    }
    return 'video-' + Math.random().toString(36).substring(2, 15);
  } catch (err) {
    logContentScriptEntry('WARN', "Error generating video ID from element, using random.", { error: err, additionalDetails: { videoSrc: video?.src } });
    return 'video-' + Math.random().toString(36).substring(2, 15);
  }
}

function handleSaveError(saveButton, errorMessage, errorDetails = {}) {
  if (saveButton) {
    saveButton.textContent = saveButton.title.includes('GIF') ? 'Save GIF' : 'Save Video';
    if (errorMessage && errorMessage.toLowerCase().includes("context")) {
        saveButton.textContent = 'Extn Error';
        saveButton.disabled = true;
    } else {
        saveButton.disabled = false;
    }
    saveButton.classList.remove('saving', 'saved', 'retryable');
    delete saveButton.dataset.recordingState;
  }
  showNotification(errorMessage || "An unknown error occurred.", 'error');
  logContentScriptEntry('WARN', `X.com Media Saver user-facing error: ${errorMessage}`, { additionalDetails: errorDetails });
}

function updateButtonForRetry(saveButton, mediaElement, mediaType, errorMessage) {
    if (!saveButton || !mediaElement) return;

    saveButton.textContent = 'Retry';
    saveButton.classList.add('retryable');
    saveButton.classList.remove('saving', 'saved');
    saveButton.disabled = false;
    delete saveButton.dataset.recordingState;

    saveButton.onclick = (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (mediaType === 'image') {
            saveImage(mediaElement, saveButton);
        } else if (mediaType === 'video') {
            saveVideo(mediaElement, saveButton);
        }
    };
    if(errorMessage) showNotification(errorMessage, 'error');
}


function showNotification(message, type = 'info') {
  try {
    const existingNotifications = document.querySelectorAll('.x-image-saver-notification');
    existingNotifications.forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `x-image-saver-notification ${type}`;
    notification.textContent = message;
    document.body.appendChild(notification);

    requestAnimationFrame(() => notification.classList.add('show'));

    setTimeout(() => {
      notification.classList.remove('show');
      notification.addEventListener('transitionend', () => {
        if (notification.parentNode) notification.remove();
      }, { once: true });
    }, type === 'error' ? 4000 : 2000);
  } catch (err) {
    logContentScriptEntry('ERROR', "Error showing notification", { error: err, additionalDetails: { messageContent: message, type: type } });
    if (type === 'error') alert("X.com Media Saver: " + message);
  }
}

function updateAllSaveButtons(originalImageUrl) {
  try {
    const imageId = getImageIdFromUrl(getOriginalImageUrl(originalImageUrl));
    const buttons = document.querySelectorAll(`.x-image-save-button[data-img-id="${imageId}"]:not(.${specificButtonClassName})`);
    buttons.forEach(button => {
        button.textContent = 'Saved';
        button.classList.remove('saving', 'retryable');
        button.classList.add('saved');
        button.disabled = false;
        const imgElement = button.closest(SELECTOR_CACHE.tweetPhoto)?.querySelector('img[src*="twimg.com"]');
        if (imgElement) {
             button.onclick = (event) => {
                event.stopPropagation(); event.preventDefault();
                if (!button.classList.contains('saving')) {
                    saveImage(imgElement, button);
                }
            };
        }
    });
  } catch (err) {
    logContentScriptEntry('ERROR', "Error updating save buttons for images", { error: err, additionalDetails: { imageUrl: originalImageUrl } });
  }
}

function updateAllVideoSaveButtons(videoData) {
  try {
    const videoElementId = videoData.uniqueVideoElementId || getVideoIdFromElement({ src: videoData.originalVideoUrl || videoData.videoUrl, poster: videoData.poster });
    const buttons = document.querySelectorAll(`.${specificButtonClassName}[data-video-element-id="${videoElementId}"], .${specificButtonClassName}[data-video-id="${videoElementId}"]`);

    buttons.forEach(button => {
        if (videoData.isGif) {
            button.textContent = 'GIF Saved';
        } else {
            button.textContent = 'Video Saved';
        }
        button.classList.remove('saving', 'retryable');
        button.classList.add('saved');
        button.disabled = false;
        delete button.dataset.recordingState;
    });
  } catch (err) {
    logContentScriptEntry('ERROR', "Error in updateAllVideoSaveButtons", { error: err, additionalDetails: { videoData: videoData ? JSON.stringify(videoData).substring(0,100) : "N/A" } });
  }
}


// Media Identification and Processing Helpers
function isRelevantImage(img) {
  try {
    if (!img || !img.src || typeof img.src !== 'string' || !img.src.includes('twimg.com/media')) return false;
    if (img.src.includes('profile_images') || img.alt === "Profile picture" || img.closest('[data-testid="UserAvatar"], [data-testid="Tweet-User-Avatar"]')) return false;
    // New: If the image is a poster for a video element, it's not a relevant image for saving.
    if (img.parentElement && img.parentElement.querySelector('video')) {
        // Further check: ensure this image is actually the poster of that video
        const videoSibling = img.parentElement.querySelector('video');
        if (videoSibling && videoSibling.poster === img.src) {
            return false;
        }
    }
    // New: Allow images in dialogs to be relevant even if not in a tweet context directly
    if (img.closest('div[role="dialog"]') && (img.src.includes('name=large') || img.src.includes('name=orig'))) return true; // Ensure these are large/original quality
    // Only consider images within tweet structures for non-modal cases.
    if (!img.closest(SELECTOR_CACHE.tweetPhoto) && !img.closest(SELECTOR_CACHE.attachments) && !img.closest(SELECTOR_CACHE.photoLinks) && !img.closest(SELECTOR_CACHE.mediaImg)) return false;
    const imgWidth = img.naturalWidth || img.width || parseInt(img.style.width, 10) || 0;
    const imgHeight = img.naturalHeight || img.height || parseInt(img.style.height, 10) || 0;
    if (imgWidth > 0 && imgHeight > 0 && (imgWidth < 50 || imgHeight < 50)) return false;
    return !!img.closest(SELECTOR_CACHE.tweetParents);
  } catch (err) { return false; }
}

function isRelevantVideo(video) {
  try {
    if (!video || video.tagName.toLowerCase() !== 'video') return false;
    let hasValidSource = !!(video.src || video.currentSrc);
    if (!hasValidSource) {
      const sourceEl = video.querySelector('source');
      hasValidSource = sourceEl && !!sourceEl.src;
    }
    if (!hasValidSource && !video.poster) return false;
    const width = video.videoWidth || video.clientWidth || 0;
    const height = video.videoHeight || video.clientHeight || 0;
    if (width > 0 && height > 0 && (width < 30 || height < 30)) return false;
    if (video.closest('[data-testid*="icon"], [role="button"][data-testid*="icon"]')) return false;
    return !!video.closest(SELECTOR_CACHE.tweetParents);
  } catch (err) { return false; }
}

function findNearestContainer(img) {
  return img.closest(SELECTOR_CACHE.tweetPhoto) ||
    img.closest('div[aria-label*="Image"]') ||
    img.closest('a[href*="/photo/"]') ||
    img.closest('div[role="link"][data-testid*="tweetPhotoContainer"]') ||
    img.parentElement;
}

async function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.error) {
                logContentScriptEntry("ERROR", "FileReader error in content.js blobToDataURL", { error: reader.error });
                reject(reader.error);
            } else {
                resolve(reader.result);
            }
        };
        reader.onerror = (err) => {
            logContentScriptEntry("ERROR", "FileReader critical error in content.js blobToDataURL", { error: err });
            reject(err);
        };
        reader.readAsDataURL(blob);
    });
}

async function getCheckableUrl(url, mediaTypeForLog = 'media') {
  if (typeof url === 'string' && url.startsWith('blob:')) {
    logContentScriptEntry('DEBUG', `getCheckableUrl: blob URL detected for ${mediaTypeForLog}. Hashing will be skipped as background can't resolve it.`, { additionalDetails: { blobUrl: url.substring(0,100) } });
    return null;
  }
  return url;
}

async function getMediaDimensionsFromBlob(blob) {
    return new Promise((resolve) => {
        const isVideo = blob.type.startsWith('video/');
        const mediaElement = isVideo ? document.createElement('video') : new Image();
        const objectUrl = URL.createObjectURL(blob);

        const cleanupAndResolve = (result) => {
            URL.revokeObjectURL(objectUrl);
            mediaElement.onload = null;
            mediaElement.onerror = null;
            mediaElement.onloadedmetadata = null;
            if (mediaElement.parentNode) mediaElement.parentNode.removeChild(mediaElement);
            resolve(result);
        };

        mediaElement.onloadedmetadata = mediaElement.onload = () => {
            cleanupAndResolve({
                width: isVideo ? mediaElement.videoWidth : mediaElement.naturalWidth,
                height: isVideo ? mediaElement.videoHeight : mediaElement.naturalHeight,
                duration: isVideo ? mediaElement.duration : 0
            });
        };
        mediaElement.onerror = (errEvent) => {
            logContentScriptEntry('WARN', 'Error loading media blob for dimensions in content script.', {
                error: new Error(`Media element error: ${errEvent.type}`),
                additionalDetails: { blobType: blob.type, srcLength: mediaElement.src ? mediaElement.src.length : 'N/A' }
            });
            cleanupAndResolve({ width: 0, height: 0, duration: 0 });
        };
        mediaElement.src = objectUrl;
        if(isVideo) {
          mediaElement.preload = 'metadata';
          mediaElement.load();
        }
    });
}


async function addSaveButton(container, img) {
  try {
    if (img.dataset.xmsButtonAdded === 'true') {
      return false;
    }
    const mediaElement = img;
    const buttonClassName = 'x-image-save-button';
    const imgId = getImageIdFromUrl(img.src);

    // Determine buttonHost first for more targeted cleanup and creation
    let buttonHost = img.closest(SELECTOR_CACHE.tweetPhoto);
    if (!buttonHost) {
        const dialog = img.closest('div[role="dialog"]');
        if (dialog) {
            // In modal, anchor the button to the image's immediate container, not the whole dialog
            buttonHost = img.parentElement || dialog;
            logContentScriptEntry('DEBUG', `Identified modal image container as buttonHost for imgId ${imgId}.`);
        } else {
            buttonHost = img.parentElement;
        }
    }

    if (!buttonHost) {
        logContentScriptEntry('DEBUG', `No suitable button host found for image ID ${imgId}.`);
        return false;
    }

    // If another scan already placed or is placing a button in this host, skip to avoid races
    if (buttonHost.dataset.xmsHasSaveButton === 'true' || buttonHost.dataset.xmsHasSaveButton === 'pending') {
        logContentScriptEntry('DEBUG', `Host already has a save button; skipping image button for ${imgId}.`);
        return false;
    }
    // Set pending lock early to avoid concurrent insertions
    try { buttonHost.dataset.xmsHasSaveButton = 'pending'; } catch (_) {}

    // Aggressive cleanup: remove any existing buttons for this image ID from the document and specifically from the host
    document.querySelectorAll(`.${buttonClassName}[data-img-id="${imgId}"]`).forEach(oldBtn => {
        logContentScriptEntry('DEBUG', `Global Cleanup: Removing existing image button for imgId ${imgId} (text: "${oldBtn.textContent}") from document.`);
        oldBtn.remove();
    });
    buttonHost.querySelectorAll(`.${buttonClassName}[data-img-id="${imgId}"]`).forEach(btn => {
        logContentScriptEntry('DEBUG', `Local Host Cleanup: Removing existing image button (text: "${btn.textContent}") from host ${buttonHost.tagName} for image ID ${imgId}.`);
        btn.remove();
    });

    // After cleanup, ensure host has no other save buttons of any type; enforce single button per host
    buttonHost.querySelectorAll('.x-image-save-button').forEach(btn => btn.remove());

    // Ensure the buttonHost has relative positioning for absolute child buttons
    if (getComputedStyle(buttonHost).position === 'static') {
        buttonHost.style.position = 'relative';
        logContentScriptEntry('DEBUG', `Set position:relative on image buttonHost for imgId ${imgId}`, { additionalDetails: { hostTag: buttonHost.tagName, hostClasses: buttonHost.className }});
    }

    const saveButton = document.createElement('button');
    saveButton.className = buttonClassName;
    saveButton.textContent = 'Save';
    saveButton.title = 'Save Image';
    saveButton.dataset.imgId = imgId;

    if (img.src) {
        if (!isContextValid()) {
          logContentScriptEntry('WARN', "Extension context invalid. Cannot check image status.", { additionalDetails: { imgSrc: img.src.substring(0,50) } });
          saveButton.textContent = 'Extn Error';
          saveButton.disabled = true;
        } else {
          const authorUsername = findAuthorUsername(img);
          const tweetId = findTweetId(img);
          const checkableMediaUrl = await getCheckableUrl(img.src, 'image');

          chrome.runtime.sendMessage(
            {
              action: 'checkSavedStatus',
              mediaUrl: checkableMediaUrl,
              type: 'image',
              author: authorUsername,
              tweetId: tweetId,
              originalUrlForId: img.src
            },
            (response) => {
              if (chrome.runtime.lastError) {
                logContentScriptEntry('WARN', "chrome.runtime.lastError in checkSavedStatus (image) callback: " + chrome.runtime.lastError.message, { error: chrome.runtime.lastError, additionalDetails: { imgSrc: img.src.substring(0,50) } });
                return;
              }
              if (!isContextValid() || !saveButton.isConnected) {
                logContentScriptEntry('WARN', "Context invalidated during checkSavedStatus (image) callback.", { additionalDetails: { imgSrc: img.src.substring(0,50) } });
                if (saveButton.isConnected) {
                    saveButton.textContent = 'Extn Error';
                    saveButton.disabled = true;
                }
                return;
              }
              if (response && response.isSaved) {
                saveButton.textContent = 'Saved';
                saveButton.classList.add('saved');
              }
            }
          );
        }
    }

    saveButton.addEventListener('click', (event) => {
      event.stopPropagation(); event.preventDefault();
      if (!saveButton.classList.contains('saving') && !saveButton.disabled) {
        saveImage(img, saveButton);
      }
      return false;
    });

    buttonHost.appendChild(saveButton);
    try { buttonHost.dataset.xmsHasSaveButton = 'true'; } catch (_) {}
    // Mark image to prevent repeated insertions on subsequent scans
    try { img.dataset.xmsButtonAdded = 'true'; } catch (_) {}
    return true;
  } catch (err) {
    logContentScriptEntry('ERROR', "Error adding save button for image", { error: err, additionalDetails: { imgSrc: img?.src?.substring(0,50) } });
    return false;
  }
}

async function addSaveButtonToVideo(container, videoElement) {
  try {
    if (videoElement.dataset.xmsButtonAdded === 'true') {
      return false;
    }
    const buttonClassNameBase = 'x-image-save-button';
    const uniqueVideoElementId = ensureVideoElementHasUniqueId(videoElement);

    // Determine buttonHost first for more targeted cleanup and creation
    let buttonHost = videoElement.closest(SELECTOR_CACHE.videoPlayerWrappers);
    if (!buttonHost) {
        const dialog = videoElement.closest('div[role="dialog"]');
        if (dialog) {
            // In modal, anchor to the video's immediate container
            buttonHost = videoElement.parentElement || dialog;
            logContentScriptEntry('DEBUG', `Identified modal video container as buttonHost for videoElementId ${uniqueVideoElementId}.`);
        } else {
            buttonHost = videoElement.parentElement;
        }
    }

    if (!buttonHost) {
        logContentScriptEntry('DEBUG', `No suitable button host found for videoElementId ${uniqueVideoElementId}.`);
        return false;
    }

    // If another scan already placed or is placing a button in this host, skip to avoid races
    if (buttonHost.dataset.xmsHasSaveButton === 'true' || buttonHost.dataset.xmsHasSaveButton === 'pending') {
        logContentScriptEntry('DEBUG', `Host already has a save button; skipping video button for ${uniqueVideoElementId}.`);
        return false;
    }
    // Set pending lock early to avoid concurrent insertions
    try { buttonHost.dataset.xmsHasSaveButton = 'pending'; } catch (_) {}

    // Aggressive cleanup: remove any existing buttons for this video ID from the document and specifically from the host
    document.querySelectorAll(`.${buttonClassNameBase}.${specificButtonClassName}[data-video-element-id="${uniqueVideoElementId}"]`).forEach(oldBtn => {
      logContentScriptEntry('DEBUG', `Global Cleanup: Removing existing video button for uniqueVideoElementId ${uniqueVideoElementId} (text: "${oldBtn.textContent}")`);
      oldBtn.remove();
    });
    buttonHost.querySelectorAll(`.${buttonClassNameBase}.${specificButtonClassName}[data-video-element-id="${uniqueVideoElementId}"]`).forEach(btn => {
      logContentScriptEntry('DEBUG', `Local Host Cleanup: Removing existing video button (text: "${btn.textContent}") from host ${buttonHost.tagName} for video ${uniqueVideoElementId}.`);
      btn.remove();
    });

    // After cleanup, enforce single button per host by removing any save buttons of any type
    buttonHost.querySelectorAll('.x-image-save-button').forEach(btn => btn.remove());

    if (getComputedStyle(buttonHost).position === 'static') {
        buttonHost.style.position = 'relative';
        logContentScriptEntry('DEBUG', `Set position:relative on video buttonHost for videoId ${uniqueVideoElementId}`, { additionalDetails: { hostTag: buttonHost.tagName, hostClasses: buttonHost.className }});
    }

    const saveButton = document.createElement('button');
    saveButton.className = `${buttonClassNameBase} ${specificButtonClassName}`;
    saveButton.dataset.videoElementId = uniqueVideoElementId;

    const videoUrl = getVideoSourceUrl(videoElement);
    const isPotentialGif = (videoUrl && (videoUrl.toLowerCase().endsWith('.gif') || videoUrl.includes('/tweet_video/'))) ||
                           videoElement.closest('[data-testid="tweetGifContainer"]') !== null ||
                           (videoUrl && videoUrl.includes('video.twimg.com') && videoElement.loop);

    saveButton.textContent = isPotentialGif ? 'Save GIF' : 'Save Video';
    saveButton.title = isPotentialGif ? 'Save GIF' : 'Save Video';

    saveButton.style.top = '8px'; saveButton.style.right = '8px';

    if (videoUrl || videoElement.poster) {
        if (!isContextValid()) {
          logContentScriptEntry('WARN', "Extension context invalid. Cannot check video status.", { additionalDetails: { videoId: uniqueVideoElementId } });
          saveButton.textContent = 'Extn Error';
          saveButton.disabled = true;
        } else {
          const authorUsername = findAuthorUsername(videoElement);
          const tweetId = findTweetId(videoElement);
          const checkableMediaUrl = await getCheckableUrl(videoUrl || videoElement.poster, 'video');

          chrome.runtime.sendMessage(
            {
              action: 'checkSavedStatus',
              mediaUrl: checkableMediaUrl,
              type: 'video',
              author: authorUsername,
              tweetId: tweetId,
              originalUrlForId: videoUrl || getFilenameFromVideoUrl(videoElement.poster || `video_${uniqueVideoElementId}`)
            },
            (response) => {
              if (chrome.runtime.lastError) {
                logContentScriptEntry('WARN', `chrome.runtime.lastError in checkSavedStatus (video) callback: ${chrome.runtime.lastError.message}`, { error: chrome.runtime.lastError, additionalDetails: { videoId: uniqueVideoElementId } });
                return;
              }
              if (!isContextValid() || !saveButton.isConnected) { return; }
              if (response && response.isSaved) {
                if (response.item && response.item.isGif) {
                     saveButton.textContent = 'GIF Saved';
                } else if (response.item && !response.item.isGif && response.item.savedAsMetadata){
                     saveButton.textContent = 'Video Saved';
                } else { // It's an old full video save, treat as unsaved for frame context
                     saveButton.textContent = isPotentialGif ? 'Save GIF' : 'Save Video';
                }
                saveButton.classList.add('saved');
              }
            }
          );
        }
    }

    saveButton.addEventListener('click', (event) => {
      event.stopPropagation(); event.preventDefault();
      if (saveButton.disabled) return;
      saveVideo(videoElement, saveButton); // Will now save frame or GIF
      return false;
    });

    buttonHost.appendChild(saveButton);
    try { buttonHost.dataset.xmsHasSaveButton = 'true'; } catch (_) {}
    try { videoElement.dataset.xmsButtonAdded = 'true'; } catch (_) {}
    return true;
  } catch (err) {
    logContentScriptEntry('ERROR', "Error adding save button to video", { error: err, additionalDetails: { videoId: videoElement?.dataset?.xmsUniqueVideoId, videoSrc: videoElement?.src?.substring(0,50) } });
    return false;
  }
}


// --- START: Media Processing Functions ---
function processImageContainer(container) {
  try {
    if (!container || !container.nodeType) return;
    const images = container.querySelectorAll('img[src*="twimg.com"]');
    if (images.length === 0) return;
    for (const img of images) {
      if (isRelevantImage(img)) {
        addSaveButton(container, img).catch(err => {
          logContentScriptEntry('ERROR', "Error from async addSaveButton in processImageContainer", { error: err });
        });
      }
    }
  } catch (err) { logContentScriptEntry('ERROR', "Error processing image container", { error: err }); }
}

function processVideoContainer(container) {
  try {
    if (!container || !container.nodeType) return;
    const video = container.querySelector('video');
    if (!video || !isRelevantVideo(video)) return;
    ensureVideoElementHasUniqueId(video);
    const videoUrl = getVideoSourceUrl(video);
    if (!videoUrl && !video.poster) {
        logContentScriptEntry('DEBUG', "Skipping video container, no valid video URL or poster found.", { additionalDetails: { containerClasses: container.className } });
        return;
    }
    addSaveButtonToVideo(container, video).catch(err => {
        logContentScriptEntry('ERROR', "Error from async addSaveButtonToVideo in processVideoContainer", { error: err, additionalDetails: { videoId: video?.dataset?.xmsUniqueVideoId } });
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error processing video container", { error: err }); }
}


function findImageContainers(containers) {
  try {
    document.querySelectorAll(SELECTOR_CACHE.tweetPhoto).forEach(c => containers.add(c));
    document.querySelectorAll(SELECTOR_CACHE.attachments).forEach(img => {
       if (isRelevantImage(img)) containers.add(img.closest('[data-testid="attachments"]') || img.parentElement);
    });
    document.querySelectorAll(SELECTOR_CACHE.photoLinks).forEach(img => {
       if (isRelevantImage(img)) containers.add(img.closest('a[href*="/photo/"]') || img.parentElement);
    });
    document.querySelectorAll(SELECTOR_CACHE.modalImg).forEach(img => {
      if (isRelevantImage(img)) containers.add(img.parentElement || img.closest('div[role="dialog"]'));
    });
    document.querySelectorAll(`${SELECTOR_CACHE.gallery} ${SELECTOR_CACHE.tweetPhoto}, ${SELECTOR_CACHE.carousel} [role="group"] > div, ${SELECTOR_CACHE.grid} div[role="button"]`)
        .forEach(c => containers.add(c));
    document.querySelectorAll(SELECTOR_CACHE.mediaImg).forEach(img => {
      if (isRelevantImage(img)) {
        containers.add(findNearestContainer(img));
      }
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error finding image containers", { error: err }); }
}

function findVideoContainers(videoContainersSet) {
  try {
    document.querySelectorAll(SELECTOR_CACHE.videoContainers).forEach(container => {
      const videoInContainer = container.querySelector('video');
      if (videoInContainer && isRelevantVideo(videoInContainer)) {
         videoContainersSet.add(container);
      }
    });
    document.querySelectorAll(SELECTOR_CACHE.videoTag).forEach(video => {
        if (isRelevantVideo(video)) {
            const parentContainer = video.closest(SELECTOR_CACHE.tweetParents) || video.parentElement;
            if (parentContainer) videoContainersSet.add(parentContainer);
        }
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error finding video containers", { error: err }); }
}


// Save Action Functions
async function saveImage(img, saveButton) {
  try {
    let imageUrl = getOriginalImageUrl(img.src);
    const authorUsername = findAuthorUsername(img);
    const tweetId = findTweetId(img);

    const isRetry = saveButton.classList.contains('retryable');
    const isAlreadySaved = saveButton.classList.contains('saved');

    saveButton.textContent = (isAlreadySaved || isRetry) ? 'Updating...' : 'Saving...';
    saveButton.classList.add('saving');
    saveButton.classList.remove('saved', 'retryable');
    saveButton.disabled = true;

    let dimensions = { width: img.naturalWidth, height: img.naturalHeight };
    if ((dimensions.width === 0 || dimensions.height === 0) && imageUrl) {
        try {
            dimensions = await new Promise((resolve) => {
                const tempImg = new Image();
                tempImg.onload = () => resolve({ width: tempImg.naturalWidth, height: tempImg.naturalHeight });
                tempImg.onerror = (errEvent) => {
                    logContentScriptEntry('WARN', 'Temporary image load for dimensions failed in content script.', {
                        additionalDetails: { src: imageUrl.substring(0,100), errorEventType: errEvent.type }
                    });
                    resolve({ width: 0, height: 0 });
                };
                tempImg.src = imageUrl;
            });
        } catch (dimError) {
            logContentScriptEntry('WARN', 'Error getting dimensions via temporary image in content script.', { error: dimError, additionalDetails: { src: imageUrl.substring(0,100) }});
            dimensions = { width: 0, height: 0 };
        }
    }

    if (imageUrl.startsWith('blob:')) {
        logContentScriptEntry('INFO', `Handling blob: image URL.`, { additionalDetails: { author: authorUsername, tweetId: tweetId } });
        try {
            const response = await fetch(imageUrl);
            const blob = await response.blob();
            imageUrl = await blobToDataURL(blob);
        } catch (error) {
            logContentScriptEntry('ERROR', "Failed to fetch and convert blob: image URL.", { error: error });
            handleSaveError(saveButton, "Could not process blob image.");
            return;
        }
    }

    if (!isContextValid()) {
      handleSaveError(saveButton, "Extension context invalid. Refresh page.", { additionalDetails: { imageUrl: imageUrl, author: authorUsername, tweetId: tweetId } });
      return;
    }

    const saveArgs = {
        imageUrl: imageUrl,
        author: authorUsername,
        tweetId: tweetId,
        forceUpdate: isRetry || isAlreadySaved,
        width: dimensions.width,
        height: dimensions.height
    };

    chrome.runtime.sendMessage({action: 'ping'}, response => {
      if (!isContextValid() || !saveButton.isConnected) {
        handleSaveError(saveButton, "Extension context lost during ping. Refresh page.", { additionalDetails: { imageUrl: imageUrl } });
        return;
      }
      if (chrome.runtime.lastError) {
        logContentScriptEntry('ERROR', "Background connection error (ping):" + chrome.runtime.lastError.message, { error: chrome.runtime.lastError, additionalDetails: { imageUrl: imageUrl } });
        handleSaveError(saveButton, "Connection to extension failed. Refresh page.", { additionalDetails: { error: chrome.runtime.lastError.message } });
        return;
      }
      if (response && response.success) {
         sendSaveImageMessage(saveArgs, saveButton, img);
      } else {
        handleSaveError(saveButton, "Background script not responding.", { additionalDetails: { response: response } });
      }
    });
  } catch (err) {
    logContentScriptEntry('ERROR', "Error in saveImage", { error: err, additionalDetails: { imgSrc: img?.src?.substring(0,50) } });
    handleSaveError(saveButton, "Error preparing to save image");
  }
}

function sendSaveImageMessage(saveArgs, saveButton, imgElement){
    if (!isContextValid() || (saveButton && !saveButton.isConnected)) {
      if(saveButton && saveButton.isConnected) handleSaveError(saveButton, "Extension context invalid before sending message. Refresh page.", { additionalDetails: { imageUrl: saveArgs.imageUrl } });
      return;
    }
    chrome.runtime.sendMessage({
      action: 'saveImage',
      ...saveArgs
    }, (response) => {
      if (!isContextValid() || (saveButton && !saveButton.isConnected)) {
        logContentScriptEntry('WARN', "Context invalidated during saveImage callback.", { additionalDetails: { imageUrl: saveArgs.imageUrl } });
        if (saveButton && saveButton.isConnected) handleSaveError(saveButton, "Extension context lost. Refresh.");
        return;
      }
      if (chrome.runtime.lastError) {
        logContentScriptEntry('ERROR', "Save image/video message error:" + chrome.runtime.lastError.message, { error: chrome.runtime.lastError, additionalDetails: { imageUrl: saveArgs.imageUrl } });
        handleSaveError(saveButton, chrome.runtime.lastError.message, { additionalDetails: { error: chrome.runtime.lastError.message } });
        return;
      }

      if (response && response.success) {
        const isVideoPlaceholder = response.item && response.item.savedAsMetadata === true && response.item.type === 'video';
        saveButton.textContent = isVideoPlaceholder ? 'Video Saved' : 'Saved';
        saveButton.classList.add('saved'); // Always add 'saved' class for success
        saveButton.classList.remove('saving', 'retryable');
        saveButton.disabled = false;

        if (isVideoPlaceholder) {
            updateAllVideoSaveButtons({ ...response.item, uniqueVideoElementId: imgElement?.dataset?.xmsUniqueVideoId });
        } else {
            updateAllSaveButtons(saveArgs.imageUrl);
        }
        const message = response.updated ? '✓ Item position updated!' : (response.cached ? '✓ Item already saved!' : `✓ ${isVideoPlaceholder ? 'Video' : 'Image'} saved!`);
        const notifType = response.warning ? 'info' : 'success';
        showNotification(response.warning || message, notifType);
      } else {
        const errorMsg = (response && response.error) ? response.error : 'Failed to save image/video';
        updateButtonForRetry(saveButton, imgElement, saveArgs.isPlaceholderForVideo ? 'video' : 'image', errorMsg);
        logContentScriptEntry('WARN', `Image/Video save failed: ${errorMsg}`, { additionalDetails: { response: response, args: saveArgs } });
      }
    });
}

async function saveVideo(videoElement, saveButton) { // "Save Video" or "Save GIF"
    const originalVideoUrl = getVideoSourceUrl(videoElement);
    if (!originalVideoUrl && !videoElement.poster && !videoElement.src) {
        handleSaveError(saveButton, "Could not find video source or poster.");
        return;
    }

    const authorUsername = findAuthorUsername(videoElement);
    const tweetId = findTweetId(videoElement);
    const posterUrl = videoElement.poster || '';
    const originalFilenameForId = getFilenameFromVideoUrl(originalVideoUrl || videoElement.poster || `video_${Date.now()}`);
    const isGif = videoElement.loop;

    if (!isContextValid()) {
        handleSaveError(saveButton, "Extension context invalid. Refresh page.");
        return;
    }

    // Change button text and state for frame capture
    saveButton.textContent = 'Saving…';
    saveButton.classList.add('saving');
    saveButton.classList.remove('saved', 'retryable');
    saveButton.disabled = true;

    try {
        const sourceWidth = Math.max(1, videoElement.videoWidth || videoElement.clientWidth || 0);
        const sourceHeight = Math.max(1, videoElement.videoHeight || videoElement.clientHeight || 0);
        const targetWidth = sourceWidth;
        const targetHeight = sourceHeight;

        const wasPaused = videoElement.paused;
        try { videoElement.pause(); } catch(_) {}

        const captureAtTime = async (timeSeconds) => {
            return new Promise((resolve) => {
                const draw = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        canvas.width = targetWidth;
                        canvas.height = targetHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(videoElement, 0, 0, targetWidth, targetHeight);
                        const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                        resolve({ dataUrl, width: canvas.width, height: canvas.height });
                    } catch (_) {
                        resolve({ dataUrl: 'data:,', width: 0, height: 0 });
                    }
                };

                try {
                    const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : 0;
                    if (duration > 0 && typeof timeSeconds === 'number') {
                        const clamped = Math.max(0, Math.min(duration - 0.05, timeSeconds));
                        let timeoutId;
                        const onSeeked = () => { clearTimeout(timeoutId); videoElement.removeEventListener('seeked', onSeeked); draw(); };
                        videoElement.addEventListener('seeked', onSeeked);
                        try { videoElement.currentTime = clamped; } catch(_) { setTimeout(onSeeked, 50); }
                        timeoutId = setTimeout(() => { videoElement.removeEventListener('seeked', onSeeked); draw(); }, 800);
                    } else { draw(); }
                } catch(_) { draw(); }
            });
        };

        const duration = Number.isFinite(videoElement.duration) ? videoElement.duration : 0;
        const captureTimes = [];
        if (duration > 0.5) {
            captureTimes.push(Math.max(0.05, duration * 0.1));
            captureTimes.push(Math.max(0.1, duration * 0.5));
            captureTimes.push(Math.min(duration - 0.05, Math.max(0.2, duration * 0.9)));
        } else {
            captureTimes.push(0);
        }

        const baseFilename = getFilenameFromVideoUrl(originalVideoUrl || videoElement.poster || 'video');
        for (let i = 0; i < captureTimes.length; i++) {
            saveButton.textContent = `Saving ${i+1}/${captureTimes.length}…`;
            // eslint-disable-next-line no-await-in-loop
            const { dataUrl, width, height } = await captureAtTime(captureTimes[i]);
            if (!dataUrl || dataUrl === 'data:,') continue;
            const saveArgs = {
                imageUrl: dataUrl,
                author: authorUsername,
                tweetId: tweetId,
                forceUpdate: false,
                width: width,
                height: height,
                isPlaceholderForVideo: true,
                originalVideoUrl: originalVideoUrl,
                videoOriginalFilename: `${baseFilename}-frame-${i+1}`,
                uniqueVideoElementId: videoElement.dataset.xmsUniqueVideoId
            };
            // Fire-and-forget; background handles DB writes sequentially
            sendSaveImageMessage(saveArgs, saveButton, videoElement);
            // Small delay to avoid flooding messages
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 60));
        }

        if (!wasPaused) { try { videoElement.play(); } catch(_) {} }

        saveButton.textContent = 'Video Saved';
        saveButton.classList.add('saved');
        saveButton.classList.remove('saving', 'retryable');
        saveButton.disabled = false;

    } catch (error) {
        logContentScriptEntry('ERROR', "Error capturing or saving video frame.", { error: error, additionalDetails: { videoId: videoElement?.dataset?.xmsUniqueVideoId } });
        handleSaveError(saveButton, "Could not capture video frame. Try again.");
    }
}


// Main Scanning Functions
function mediaTabGridScan() {
  try {
    const gridContainers = document.querySelectorAll('[data-testid="cellInnerDiv"] div[role="group"]');
    gridContainers.forEach(container => {
      if (processedContainers.has(container)) return;
      processedContainers.add(container);
      const mediaLinks = container.querySelectorAll('a[href*="/photo/"]');
      mediaLinks.forEach(link => {
        const img = link.querySelector('img[src*="twimg.com/media"]');
        if (img && isRelevantImage(img) && !img.dataset.xmsButtonAdded) {
          addSaveButton(container, img);
        }
      });
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error in mediaTabGridScan", { error: err }); }
}
function directVideoScan() {
  try {
    document.querySelectorAll('video').forEach(video => {
      if (isRelevantVideo(video) && !video.dataset.xmsButtonAdded) {
        const parentContainer = video.closest(SELECTOR_CACHE.tweetParents) || video.parentElement;
        if (parentContainer && !processedVideoContainers.has(parentContainer)) {
           processVideoContainer(parentContainer);
           processedVideoContainers.add(parentContainer);
        }
      }
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error in directVideoScan", { error: err }); }
}
function scanForImages() {
  if (scanForImages.isScanning) return;
  scanForImages.isScanning = true;
  try {
    const uniqueContainers = new Set();
    findImageContainers(uniqueContainers);
    uniqueContainers.forEach(container => {
      if (!container.dataset.xmsImageProcessed) {
         processImageContainer(container);
         container.dataset.xmsImageProcessed = 'true';
      }
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error scanning for images", { error: err }); }
  finally { scanForImages.isScanning = false; }
}
scanForImages.isScanning = false;
function scanForVideos() {
  if (scanForVideos.isScanning) return;
  scanForVideos.isScanning = true;
  try {
    const uniqueVideoContainers = new Set();
    findVideoContainers(uniqueVideoContainers);
    uniqueVideoContainers.forEach(container => {
      if (!container.dataset.xmsVideoProcessed) {
        processVideoContainer(container);
        container.dataset.xmsVideoProcessed = 'true';
      }
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error scanning for videos", { error: err }); }
  finally { scanForVideos.isScanning = false; }
}
scanForVideos.isScanning = false;
function processGalleryPosts() {
  try {
    document.querySelectorAll('[data-testid="cellInnerDiv"]').forEach(cell => {
      if (processedContainers.has(cell)) return;
      const hasVideo = cell.querySelector(SELECTOR_CACHE.videoTag);
      const hasImageGrid = cell.querySelector(SELECTOR_CACHE.grid);
      if (hasVideo && !hasImageGrid) {
          processVideoContainer(cell);
      } else if (hasImageGrid || cell.querySelector(SELECTOR_CACHE.tweetPhoto)) {
          processImageContainer(cell);
      }
      processedContainers.add(cell);
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error processing gallery posts", { error: err }); }
}
function processEmbeddedVideos() {
  try {
    document.querySelectorAll(SELECTOR_CACHE.embeddedVideo).forEach(video => {
      if (isRelevantVideo(video)) {
        const parentContainer = video.closest('div[data-testid="tweetEmbed"]') || video.parentElement;
        if (parentContainer) processVideoContainer(parentContainer);
      }
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error processing embedded videos", { error: err }); }
}
function processDirectImages() {
  try {
    const images = document.querySelectorAll('img[src*="twimg.com/media"][loading="lazy"][draggable="true"]');
    images.forEach(img => {
      if (isRelevantImage(img)) {
        const parentContainer = findNearestContainer(img);
        if (parentContainer) addSaveButton(parentContainer, img);
      }
    });
  } catch (err) { logContentScriptEntry('ERROR', "Error processing direct images", { error: err }); }
}
function checkForMediaTab() {
  try {
    const mediaTab = document.querySelector('[role="tablist"] [href$="/media"], [role="tablist"] [href$="/likes"]');
    if (mediaTab && mediaTab.getAttribute('aria-selected') === 'true') {
        mediaTabGridScan();
    }
  } catch (err) { logContentScriptEntry('ERROR', "Error checking for media tab", { error: err }); }
}
// --- END: Media Processing Functions ---
// --- START: Main Scan and Initialization ---
function scanPage() {
  if (!isContextValid()) {
    logContentScriptEntry('WARN', "X.com Media Saver: Extension context is invalid. Halting scanPage.", { additionalDetails: { path: window.location.pathname }});
    return;
  }
  if (isProcessing) return;
  isProcessing = true;

  try {
    checkForMediaTab();
    scanForImages();
    scanForVideos();
    processGalleryPosts();
    processEmbeddedVideos();
    directVideoScan();
    processDirectImages();
  } catch (err) {
    logContentScriptEntry('ERROR', "General error during scanPage", { error: err });
  } finally {
    isProcessing = false;
  }
}
function initializeExtension() {
  logContentScriptEntry('INFO', "X.com Media Saver content script initializing.");
  window.lastKnownPath = window.location.pathname + window.location.search;
  scanPage();
  const observer = new MutationObserver(debounce(scanPage, 500));
  observer.observe(document.body, { childList: true, subtree: true });
}

function monitorPathChanges() {
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== window.lastKnownPath) {
        logContentScriptEntry('INFO', `Path changed from ${window.lastKnownPath || '(not set)'} to ${currentPath}. Clearing processed containers and re-scanning.`);
        processedContainers.clear();
        processedVideoContainers.clear();

        document.querySelectorAll('[data-xms-image-processed], [data-xms-video-processed], [data-xms-grid-processed], [data-xms-button-added]').forEach(el => {
            delete el.dataset.xmsImageProcessed;
            delete el.dataset.xmsVideoProcessed;
            delete el.dataset.xmsGridProcessed;
            delete el.dataset.xmsButtonAdded;
        });
        window.lastKnownPath = currentPath;
        scanPage();
    }
}

setInterval(monitorPathChanges, 1000);

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension, { once: true });
} else {
    initializeExtension();
}
// --- END: Main Scan and Initialization ---
