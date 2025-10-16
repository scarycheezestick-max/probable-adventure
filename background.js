/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const DB_NAME = 'XMediaGalleryDB';
const MEDIA_STORE_NAME = 'mediaItems';
const COLLECTIONS_STORE_NAME = 'collections';
const LOG_STORE_NAME = 'logStore'; // New store for logs
const DB_VERSION = 4; // Incremented DB version

let dbPromise;
let clearedAuthorsThisSession = new Set();

// --- START: Enhanced Background Logging ---
const MAX_DB_LOG_ENTRIES = 1000; // Max logs to keep in DB

function generateLogId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

async function addLogToDB(logEntry) {
  try {
    const db = await openDB();
    const transaction = db.transaction(LOG_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOG_STORE_NAME);

    store.put(logEntry);

    const countRequest = store.count();
    countRequest.onsuccess = () => {
      const count = countRequest.result;
      if (count > MAX_DB_LOG_ENTRIES) {
        const itemsToDelete = count - MAX_DB_LOG_ENTRIES;
        let itemsDeletedCount = 0;
        // Open cursor on the primary key 'id'. Since 'id' is generated with Date.now(),
        // 'next' will give oldest items first.
        const cursorRequest = store.openCursor(null, 'next');
        cursorRequest.onsuccess = (e) => {
          const cursor = e.target.result;
          if (cursor && itemsDeletedCount < itemsToDelete) {
            store.delete(cursor.primaryKey);
            itemsDeletedCount++;
            cursor.continue();
          }
        };
        cursorRequest.onerror = (e_cursor) => {
          // Use console.error directly for logging system's own errors
          console.error(`XMS BG [CRITICAL]: Error deleting old logs during pruning: ${e_cursor.target.error ? e_cursor.target.error.name : 'Unknown error'}`, e_cursor.target.error);
        }
      }
    };
    countRequest.onerror = (e_count) => {
       console.error(`XMS BG [CRITICAL]: Error counting logs for pruning: ${e_count.target.error ? e_count.target.error.name : 'Unknown error'}`, e_count.target.error);
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = resolve;
      transaction.onerror = (e_tx) => {
          console.error(`XMS BG [CRITICAL]: Transaction error in addLogToDB: ${e_tx.target.error ? e_tx.target.error.name : 'Unknown error'}`, e_tx.target.error);
          reject(e_tx.target.error);
      };
      transaction.onabort = (e_abort) => { // Handle abort specifically
        console.error(`XMS BG [CRITICAL]: Transaction aborted in addLogToDB: ${e_abort.target.error ? e_abort.target.error.name : 'TransactionAborted'}`, e_abort.target.error);
        reject(new Error('Transaction aborted while adding log to DB.'));
      };
    });
  } catch (openDbError) {
      console.error("XMS BG [CRITICAL]: Could not open DB to add log. Log entry:", logEntry, "Error:", openDbError);
      // Cannot use logBackgroundEntry here as it would cause a loop.
  }
}


// Enhanced logging configuration
const LOGGING_CONFIG = {
    MAX_MESSAGE_LENGTH: 10000,
    MAX_DETAILS_SIZE: 50000,
    MAX_STACK_LENGTH: 20000,
    MAX_RETRIES: 3,
    RETRY_DELAY: 100,
    ENABLE_CONSOLE_FALLBACK: true,
    ENABLE_LOCAL_STORAGE_FALLBACK: true,
    SANITIZE_INPUTS: true,
    COMPRESS_LARGE_LOGS: true
};

// Sanitize input to prevent logging issues
function sanitizeInput(input, maxLength = LOGGING_CONFIG.MAX_MESSAGE_LENGTH) {
    if (!LOGGING_CONFIG.SANITIZE_INPUTS) return input;
    
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
function safeSerialize(obj, maxSize = LOGGING_CONFIG.MAX_DETAILS_SIZE) {
    try {
        if (obj === null || obj === undefined) return String(obj);
        // Fast path
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

// Validate log entry structure
function validateLogEntry(logEntry) {
    try {
        if (!logEntry || typeof logEntry !== 'object') {
            return { valid: false, error: 'Log entry is not an object' };
        }
        
        const required = ['id', 'timestamp', 'source', 'level', 'message'];
        for (const field of required) {
            if (!logEntry[field]) {
                return { valid: false, error: `Missing required field: ${field}` };
            }
        }
        
        const validLevels = ['DEBUG', 'INFO', 'WARN', 'ERROR', 'CRITICAL'];
        if (!validLevels.includes(logEntry.level)) {
            return { valid: false, error: `Invalid log level: ${logEntry.level}` };
        }
        
        return { valid: true };
    } catch (error) {
        return { valid: false, error: `Validation error: ${error.message}` };
    }
}

// Core logging function for background context or processed external logs
async function logBackgroundEntry(level, message, details = {}) {
    let logEntry;
    
    try {
        // Create robust log entry
        const sanitizedMessage = sanitizeInput(message);
        const sanitizedSource = sanitizeInput(details.source || 'BACKGROUND', 50);
        
        logEntry = {
            id: generateLogId(),
            timestamp: new Date().toISOString(),
            source: sanitizedSource,
            level: level.toUpperCase(),
            message: sanitizedMessage,
            stack: null,
            contextUrl: details.contextUrl || (details.source === 'BACKGROUND' || !details.source || details.source === 'BACKGROUND_SYSTEM' ? 'N/A (Background)' : 'N/A'),
            details: {}
        };
        
        // Handle stack trace safely
        try {
            if (details.error && details.error.stack) {
                logEntry.stack = sanitizeInput(details.error.stack, LOGGING_CONFIG.MAX_STACK_LENGTH);
            } else if (details.stack) {
                logEntry.stack = sanitizeInput(details.stack, LOGGING_CONFIG.MAX_STACK_LENGTH);
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
            id: generateLogId(),
            timestamp: new Date().toISOString(),
            source: 'BACKGROUND_LOGGING_SYSTEM',
            level: 'CRITICAL',
            message: `Failed to create log entry: ${entryCreationError.message}`,
            stack: entryCreationError.stack,
            contextUrl: 'N/A',
            details: { 
                originalMessage: String(message), 
                originalLevel: String(level),
                creationError: entryCreationError.message
            }
        };
    }
    
    // Validate log entry
    const validation = validateLogEntry(logEntry);
    if (!validation.valid) {
        console.error(`XMS BG LOGGING VALIDATION FAILED: ${validation.error}`);
        console.error(`Original message: ${message}`);
        return;
    }
    
    // Console output with enhanced error handling
    try {
        let consoleOutput = `XMS BG [${logEntry.level}] (${logEntry.id}): ${logEntry.message}`;
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
                // console.debug(consoleOutput); // Optionally disable for less noise
                break;
            default: // INFO
                console.log(consoleOutput);
                break;
        }
    } catch (consoleError) {
        // Ultimate fallback - direct console output
        console.error(`XMS BG CONSOLE OUTPUT ERROR: ${consoleError.message}`);
        console.error(`Original log: ${logEntry.message}`);
    }

    // Persist to DB with enhanced error handling
    try {
        await addLogToDB(logEntry);
    } catch (dbError) {
        // Enhanced fallback logging
        try {
            console.error("XMS BG [CRITICAL]: FATAL - Failed to write log to DB.");
            console.error(`Log entry ID: ${logEntry.id}`);
            console.error(`Log level: ${logEntry.level}`);
            console.error(`Log message: ${logEntry.message}`);
            console.error(`DB Error: ${dbError.message || String(dbError)}`);
            
            // Try to save to localStorage as ultimate fallback
            try {
                const fallbackKey = `xms_log_fallback_${logEntry.id}`;
                const fallbackData = {
                    timestamp: logEntry.timestamp,
                    level: logEntry.level,
                    message: logEntry.message,
                    source: logEntry.source,
                    error: dbError.message || String(dbError)
                };
                localStorage.setItem(fallbackKey, JSON.stringify(fallbackData));
            } catch (localStorageError) {
                console.error(`XMS BG: Even localStorage fallback failed: ${localStorageError.message}`);
            }
        } catch (fallbackError) {
            console.error(`XMS BG: Fallback logging failed: ${fallbackError.message}`);
        }
    }
}

self.onerror = function(message, source, lineno, colno, error) {
  logBackgroundEntry(
    'CRITICAL',
    `Background Uncaught: ${message}`,
    {
      source: 'BACKGROUND_GLOBAL',
      error: error,
      stack: error?.stack,
      contextUrl: source,
      additionalDetails: { lineno, colno }
    }
  );
  return false;
};

self.onunhandledrejection = function(event) {
  const reason = event.reason;
  logBackgroundEntry(
    'CRITICAL',
    `Background Unhandled Rejection: ${reason?.message || String(reason)}`,
    {
      source: 'BACKGROUND_GLOBAL',
      error: reason instanceof Error ? reason : new Error(String(reason)),
      stack: reason?.stack,
      additionalDetails: {
        reasonRaw: String(reason)
      }
    }
  );
};
// --- END: Enhanced Background Logging ---


// --- START: Import Buffering ---
let mediaImportBuffer = [];
const IMPORT_DB_WRITE_BATCH_SIZE = 5;
const BUFFER_FLUSH_TIMEOUT_MS = 3000;
let bufferFlushTimer = null;

async function dataURLtoBlob(dataurl, mimeTypeOverride = null) {
    if (dataurl instanceof Blob) return dataurl;
    if (!dataurl || typeof dataurl !== 'string') {
        logBackgroundEntry('WARN', 'dataURLtoBlob received invalid input', { additionalDetails: { inputType: typeof dataurl } });
        return null;
    }

    if (dataurl.startsWith('http:') || dataurl.startsWith('https:')) {
        try {
            const response = await fetch(dataurl);
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            const fetchedBlob = await response.blob();
            if (mimeTypeOverride && fetchedBlob.type !== mimeTypeOverride) {
                logBackgroundEntry('DEBUG', `dataURLtoBlob (fetch HTTP/S): Fetched type '${fetchedBlob.type}', but override is '${mimeTypeOverride}'. Re-blobbing.`);
                return new Blob([fetchedBlob], { type: mimeTypeOverride });
            }
            return fetchedBlob;
        } catch (fetchError) {
            logBackgroundEntry('ERROR', 'Error fetching remote URL in dataURLtoBlob (direct URL input)', { error: fetchError, additionalDetails: { url: dataurl } });
            return null;
        }
    }

    if (!dataurl.startsWith('data:')) {
        logBackgroundEntry('WARN', 'dataURLtoBlob received non-dataURL string input and not HTTP/S.', { additionalDetails: { firstChars: dataurl.substring(0,30) } });
        return null;
    }

    const dataUrlParts = dataurl.match(/^data:((.*?)(;base64)?)?,(.*)$/s);
    if (!dataUrlParts || dataUrlParts.length < 5) {
      logBackgroundEntry('WARN', 'Invalid DataURL format in dataURLtoBlob.', { additionalDetails: { dataUrlStart: dataurl.substring(0,80) }});
      return null;
    }

    const declaredMime = dataUrlParts[2] || 'application/octet-stream';
    const base64Encoded = dataUrlParts[3] === ';base64';
    const payload = dataUrlParts[4];
    const actualMimeType = mimeTypeOverride || declaredMime;

    // For ANY base64 encoded data, manual decoding is more reliable for Blobs
    if (base64Encoded) {
        logBackgroundEntry('DEBUG', `dataURLtoBlob: Attempting manual base64 decoding. Target MIME: ${actualMimeType}`, { additionalDetails: { declaredMime: declaredMime }});
        try {
            const binaryString = atob(payload);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }
            return new Blob([bytes], {type: actualMimeType});
        } catch (manualError) {
            logBackgroundEntry('WARN', 'Manual base64 conversion failed, falling back to fetch.', { error: manualError, additionalDetails: { targetMime: actualMimeType, dataUrlStart: dataurl.substring(0,80) } });
            // Fall through to fetch method if manual fails
        }
    }


    // Standard fetch method (used for non-base64, or if manual base64 failed)
    try {
        logBackgroundEntry('DEBUG', `dataURLtoBlob: Using fetch for DataURL. Target MIME: ${actualMimeType}`, { additionalDetails: { declaredMime: declaredMime }});
        const response = await fetch(dataurl); // Fetch the original DataURL
        if (!response.ok) {
            throw new Error(`Failed to fetch data URL: ${response.status} ${response.statusText}`);
        }
        const fetchedBlob = await response.blob();

        if (actualMimeType && fetchedBlob.type !== actualMimeType &&
            !(fetchedBlob.type.startsWith(actualMimeType.split(';')[0]) && actualMimeType === 'application/octet-stream') &&
            !(actualMimeType.startsWith(fetchedBlob.type.split(';')[0]) && actualMimeType.includes('codecs='))
        ) {
            logBackgroundEntry('DEBUG', `dataURLtoBlob (fetch DataURL): Fetched type '${fetchedBlob.type}', but target actualMimeType is '${actualMimeType}'. Re-blobbing.`);
            return new Blob([fetchedBlob], { type: actualMimeType });
        }
        return fetchedBlob;
    } catch (e) {
        logBackgroundEntry('ERROR', 'Error in dataURLtoBlob using fetch method.', { error: e, additionalDetails: { dataUrlStart: dataurl.substring(0,50), targetActualMimeType: actualMimeType } });
        return null;
    }
}


async function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = (err) => {
            logBackgroundEntry('ERROR', 'FileReader error in blobToDataURL background util', { error: err });
            reject(err);
        };
        reader.readAsDataURL(blob);
    });
}


async function flushMediaImportBufferToDB() {
    if (bufferFlushTimer) {
        clearTimeout(bufferFlushTimer);
        bufferFlushTimer = null;
    }
    if (mediaImportBuffer.length === 0) {
        return { success: true, flushedCount: 0, items: [] };
    }

    const itemsToFlush = [...mediaImportBuffer];
    mediaImportBuffer = [];

    logBackgroundEntry('INFO', `Flushing ${itemsToFlush.length} items from import buffer to DB.`);

    try {
        const db = await openDB();
        const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(MEDIA_STORE_NAME);
        let successfullyAddedCount = 0;
        const leanItemsForMessage = [];

        for (const item of itemsToFlush) {
            try {
                if (item.contentHash) {
                    const existingByHash = await new Promise((resolveHash, rejectHash) => {
                        const hashIndex = store.index('contentHash');
                        const req = hashIndex.get(item.contentHash);
                        req.onsuccess = () => resolveHash(req.result);
                        req.onerror = (e) => {
                            logBackgroundEntry('WARN', `Error checking for existing item by hash during import flush for item ${item.id}`, { error: e.target.error });
                            resolveHash(null);
                        };
                    });

                    if (existingByHash) {
                        logBackgroundEntry('INFO', `Skipping import of item ${item.id} (filename: ${item.originalFilename}), content hash ${item.contentHash} already exists as ID ${existingByHash.id}.`);
                        continue;
                    }
                }

                // Fallback dedupe: if we don't have a contentHash (or hashing failed), avoid duplicates by author + filename
                if (!item.contentHash) {
                    const normalizedAuthor = (item.author || '').toLowerCase();
                    const normalizedFilename = (item.originalFilename || '').trim().toLowerCase();
                    if (normalizedAuthor && normalizedFilename) {
                        const possibleDuplicates = await new Promise((resolveAuthor, rejectAuthor) => {
                            try {
                                const authorIdx = store.index('author');
                                const req = authorIdx.getAll(item.author);
                                req.onsuccess = () => resolveAuthor(req.result || []);
                                req.onerror = (e) => {
                                    logBackgroundEntry('WARN', `Error checking duplicates by author during import flush for item ${item.id}`, { error: e.target.error });
                                    resolveAuthor([]);
                                };
                            } catch (e) {
                                logBackgroundEntry('WARN', `Exception checking duplicates by author during import flush for item ${item.id}`, { error: e });
                                resolveAuthor([]);
                            }
                        });
                        const foundByName = possibleDuplicates.find(existing => (existing?.originalFilename || '').trim().toLowerCase() === normalizedFilename);
                        if (foundByName) {
                            logBackgroundEntry('INFO', `Skipping import of item ${item.id} (filename: ${item.originalFilename}) for author ${item.author}, a file with the same name already exists as ID ${foundByName.id}.`);
                            continue;
                        }
                    }
                }

                await new Promise((resolveItem, rejectItem) => {
                    const request = store.put(item);
                    request.onsuccess = () => {
                        successfullyAddedCount++;
                        const metadataItem = { ...item };
                        delete metadataItem.localDataUrl;
                        leanItemsForMessage.push(metadataItem);
                        resolveItem();
                    };
                    request.onerror = (event) => {
                        logBackgroundEntry('ERROR', 'Error adding buffered item (Blob/Data) to DB', { additionalDetails: { itemId: item?.id }, error: event.target.error });
                        rejectItem(event.target.error);
                    };
                });
            } catch (itemError) {
                logBackgroundEntry('WARN', `An item failed in DB write batch for ID: ${item?.id}. Transaction will attempt to commit other items.`, { error: itemError });
            }
        }

        return new Promise((resolve, reject) => {
            transaction.oncomplete = () => {
                logBackgroundEntry('INFO', `Successfully flushed ${successfullyAddedCount} of ${itemsToFlush.length} attempted items to DB.`);
                if (leanItemsForMessage.length > 0) {
                     chrome.runtime.sendMessage({ action: 'mediaStoreUpdatedBatch', items: leanItemsForMessage, imported: true })
                     .catch(e => {
                        if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                           logBackgroundEntry("DEBUG", "Error sending mediaStoreUpdatedBatch (popup likely closed for BG Import Flush)", { error: e, additionalDetails: { context: "BG Import Flush" }});
                        } else {
                           logBackgroundEntry("WARN", "Error sending mediaStoreUpdatedBatch (BG Import Flush)", { error: e });
                        }
                     });
                }
                resolve({ success: true, flushedCount: successfullyAddedCount, items: leanItemsForMessage });
            };
            transaction.onerror = (event) => {
                logBackgroundEntry('ERROR', 'Transaction error during import buffer flush', { error: event.target.error });
                reject({ success: false, error: event.target.error, flushedCount: successfullyAddedCount, items: leanItemsForMessage });
            };
            transaction.onabort = (event) => {
                logBackgroundEntry('WARN', 'Transaction aborted during import buffer flush', { error: event.target.error });
                reject({ success: false, error: new Error('Transaction aborted'), flushedCount: successfullyAddedCount, items: leanItemsForMessage });
            };
        });
    } catch (error) {
        logBackgroundEntry('CRITICAL', 'Critical error during flushMediaImportBufferToDB', { error: error });
        return { success: false, error: error, flushedCount: 0, items: [] };
    }
}
// --- END: Import Buffering ---

async function generateContentHash(blobOrDataUrl) {
  if (!blobOrDataUrl) return null;

  let blob;
  if (blobOrDataUrl instanceof Blob) {
    blob = blobOrDataUrl;
  } else if (typeof blobOrDataUrl === 'string') {
    if (blobOrDataUrl.startsWith('data:')) {
      blob = await dataURLtoBlob(blobOrDataUrl);
    } else if (blobOrDataUrl.startsWith('http:') || blobOrDataUrl.startsWith('https:')) {
      try {
        const response = await fetch(blobOrDataUrl);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        blob = await response.blob();
      } catch (fetchError) {
        logBackgroundEntry('ERROR', 'Error fetching remote URL for hashing', { error: fetchError, additionalDetails: { url: blobOrDataUrl.substring(0, 100) } });
        return null;
      }
    } else if (blobOrDataUrl.startsWith('blob:')) {
      logBackgroundEntry('DEBUG', 'generateContentHash received unresolvable string blob: URL. Returning null.', { additionalDetails: { start: blobOrDataUrl.substring(0, 50) } });
      return null; // Cannot resolve blob: URLs in background
    } else {
      logBackgroundEntry('WARN', 'Invalid string input for generateContentHash, not a Data URL, fetchable HTTP/S URL, or resolvable blob URL.', { additionalDetails: { start: blobOrDataUrl.substring(0, 50) } });
      return null;
    }
  } else {
    logBackgroundEntry('WARN', 'Invalid input type for generateContentHash.', { additionalDetails: { type: typeof blobOrDataUrl } });
    return null;
  }

  if (!blob) {
    logBackgroundEntry('WARN', 'Blob could not be obtained in generateContentHash for input.', { additionalDetails: { inputType: typeof blobOrDataUrl } });
    return null;
  }

  try {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
  } catch (error) {
    logBackgroundEntry('ERROR', 'Error generating content hash', { error: error });
    return null;
  }
}


function openDB() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      let mediaStore;
      if (!db.objectStoreNames.contains(MEDIA_STORE_NAME)) {
        mediaStore = db.createObjectStore(MEDIA_STORE_NAME, { keyPath: 'id' });
      } else {
        mediaStore = event.target.transaction.objectStore(MEDIA_STORE_NAME);
      }
      if (!mediaStore.indexNames.contains('author')) mediaStore.createIndex('author', 'author', { unique: false });
      if (!mediaStore.indexNames.contains('date')) mediaStore.createIndex('date', 'date', { unique: false });
      if (!mediaStore.indexNames.contains('type')) mediaStore.createIndex('type', 'type', { unique: false });
      if (!mediaStore.indexNames.contains('tweetId')) mediaStore.createIndex('tweetId', 'tweetId', { unique: false });
      if (!mediaStore.indexNames.contains('contentHash')) mediaStore.createIndex('contentHash', 'contentHash', { unique: false });
      if (!mediaStore.indexNames.contains('savedAsMetadata')) mediaStore.createIndex('savedAsMetadata', 'savedAsMetadata', {unique: false});


      if (!db.objectStoreNames.contains(COLLECTIONS_STORE_NAME)) {
        const collectionStore = db.createObjectStore(COLLECTIONS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
        collectionStore.createIndex('name', 'name', { unique: true });
        collectionStore.createIndex('dateCreated', 'dateCreated', { unique: false });
      }

      // Create log store if it doesn't exist
      let logStoreInstance;
      if (!db.objectStoreNames.contains(LOG_STORE_NAME)) {
        logStoreInstance = db.createObjectStore(LOG_STORE_NAME, { keyPath: 'id' });
      } else {
        logStoreInstance = event.target.transaction.objectStore(LOG_STORE_NAME);
      }
      if (!logStoreInstance.indexNames.contains('timestamp')) logStoreInstance.createIndex('timestamp', 'timestamp', { unique: false });
      if (!logStoreInstance.indexNames.contains('level')) logStoreInstance.createIndex('level', 'level', { unique: false });
      if (!logStoreInstance.indexNames.contains('source')) logStoreInstance.createIndex('source', 'source', { unique: false });

    };

    request.onsuccess = (event) => {
      resolve(event.target.result);
    };

    request.onerror = (event) => {
      logBackgroundEntry('ERROR', 'IndexedDB error during openDB', { error: event.target.error });
      dbPromise = null;
      reject(event.target.error);
    };
  });
  return dbPromise;
}

function getImageIdFromUrl(url) {
  try {
    const baseUrl = url.split('?')[0];
    const parts = baseUrl.split('/');
    return parts[parts.length - 1] || url;
  } catch (e) { return url; }
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

async function addMediaItemToDB(mediaItem) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MEDIA_STORE_NAME);
    const request = store.put(mediaItem);

    request.onsuccess = () => resolve();
    request.onerror = (event) => {
      logBackgroundEntry('ERROR', 'Error adding/updating media item to DB', { additionalDetails: { itemId: mediaItem?.id }, error: event.target.error });
      reject(event.target.error);
    };
  });
}

async function deleteMediaItemFromDB(mediaId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(MEDIA_STORE_NAME);
    const request = store.delete(mediaId);

    request.onsuccess = () => resolve(true);
    request.onerror = (event) => {
      logBackgroundEntry('ERROR', 'Error deleting media item from DB', { additionalDetails: { mediaId: mediaId }, error: event.target.error });
      reject(event.target.error);
    };
  });
}

async function getMediaItemFromDB(mediaId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const store = transaction.objectStore(MEDIA_STORE_NAME);
    const request = store.get(mediaId);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => {
      logBackgroundEntry('ERROR', 'Error getting media item from DB', { additionalDetails: { mediaId: mediaId }, error: event.target.error });
      reject(event.target.error);
    };
  });
}

async function getMediaItemByContentHashFromDB(contentHash) {
    if (!contentHash) return null;
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
        const store = transaction.objectStore(MEDIA_STORE_NAME);
        const hashIndex = store.index('contentHash');
        const request = hashIndex.get(contentHash);

        request.onsuccess = () => resolve(request.result);
        request.onerror = (event) => {
            logBackgroundEntry('ERROR', 'Error getting media item by content hash', { additionalDetails: { contentHash }, error: event.target.error });
            reject(event.target.error);
        };
    });
}


async function getAllMediaByAuthorFromDB(author) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(MEDIA_STORE_NAME, 'readonly');
    const store = transaction.objectStore(MEDIA_STORE_NAME);
    const authorIndex = store.index('author');
    const request = authorIndex.getAll(author);

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (event) => {
      logBackgroundEntry('ERROR', `Error getting media by author ${author} from DB`, { additionalDetails: { author: author }, error: event.target.error });
      reject(event.target.error);
    };
  });
}


// --- START: Collection Management Functions ---
async function getAllCollectionsFromDB() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(COLLECTIONS_STORE_NAME, 'readonly');
        const store = transaction.objectStore(COLLECTIONS_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => resolve(request.result || []);
        request.onerror = (event) => {
            logBackgroundEntry('ERROR', `Error getting all collections from DB`, { error: event.target.error });
            reject(event.target.error);
        };
    });
}

async function createCollectionInDB(name) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(COLLECTIONS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(COLLECTIONS_STORE_NAME);
        const newCollection = {
            name: name,
            dateCreated: new Date().toISOString(),
            mediaIds: []
        };
        const request = store.add(newCollection);
        request.onsuccess = (event) => {
            newCollection.id = event.target.result;
            resolve(newCollection);
        };
        request.onerror = (event) => {
            logBackgroundEntry('ERROR', 'Error creating collection in DB', { additionalDetails: { name: name }, error: event.target.error });
            reject(event.target.error);
        };
    });
}

async function updateMediaInCollectionInDB(collectionId, mediaId, shouldBeInCollection) {
    const db = await openDB();
    return new Promise(async (resolve, reject) => {
        const transaction = db.transaction(COLLECTIONS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(COLLECTIONS_STORE_NAME);
        const request = store.get(collectionId);

        request.onerror = event => {
            logBackgroundEntry('ERROR', 'Error getting collection for update', { additionalDetails: { collectionId }, error: event.target.error });
            reject(event.target.error);
        };
        request.onsuccess = event => {
            const collection = event.target.result;
            if (!collection) {
                reject(new Error(`Collection with ID ${collectionId} not found.`));
                return;
            }
            collection.mediaIds = collection.mediaIds || [];
            const mediaIndex = collection.mediaIds.indexOf(mediaId);
            if (shouldBeInCollection && mediaIndex === -1) {
                collection.mediaIds.push(mediaId);
            } else if (!shouldBeInCollection && mediaIndex > -1) {
                collection.mediaIds.splice(mediaIndex, 1);
            } else {
                resolve(collection);
                return;
            }
            const updateRequest = store.put(collection);
            updateRequest.onsuccess = () => resolve(collection);
            updateRequest.onerror = e => {
                logBackgroundEntry('ERROR', 'Error updating collection media list', { additionalDetails: { collectionId, mediaId }, error: e.target.error });
                reject(e.target.error);
            };
        };
    });
}

async function deleteCollectionFromDB(collectionId) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(COLLECTIONS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(COLLECTIONS_STORE_NAME);
        const request = store.delete(collectionId);
        request.onsuccess = () => resolve();
        request.onerror = event => {
            logBackgroundEntry('ERROR', 'Error deleting collection', { additionalDetails: { collectionId }, error: event.target.error });
            reject(event.target.error);
        };
    });
}

async function renameCollectionInDB(collectionId, newName) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(COLLECTIONS_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(COLLECTIONS_STORE_NAME);
        const request = store.get(collectionId);
        request.onerror = event => reject(event.target.error);
        request.onsuccess = event => {
            const collection = event.target.result;
            if (!collection) {
                reject(new Error(`Collection with ID ${collectionId} not found for rename.`));
                return;
            }
            collection.name = newName;
            const updateRequest = store.put(collection);
            updateRequest.onsuccess = () => resolve(collection);
            updateRequest.onerror = e => {
                logBackgroundEntry('ERROR', 'Error renaming collection', { additionalDetails: { collectionId, newName }, error: e.target.error });
                reject(e.target.error);
            };
        };
    });
}
// --- END: Collection Management Functions ---

// --- Helper function to generate download filename ---
async function generateDownloadFilename(item) {
    const settings = await new Promise(resolve => {
        chrome.storage.sync.get({ downloadFolder: 'X_Media' }, result => {
            if (chrome.runtime.lastError) {
                logBackgroundEntry('WARN', 'Error getting downloadFolder setting, using default.', { error: chrome.runtime.lastError });
                resolve({ downloadFolder: 'X_Media' });
            } else {
                resolve(result);
            }
        });
    });
    const baseDownloadFolder = settings.downloadFolder || 'X_Media';

    let authorName = item.author || '@unknown';
    if (!authorName.startsWith('@')) authorName = '@' + authorName;

    const subfolder = (item.type === 'video' && item.savedAsMetadata !== true && !item.isGif) ? 'videos' : 'images'; // GIFs and frames go to images
    const timestamp = Date.now();
    let fileExtension = 'dat';

    const mimeToExtMap = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/gif': 'gif',
        'image/webp': 'webp',
        'image/svg+xml': 'svg',
        'video/mp4': 'mp4',
        'video/webm': 'webm',
        'video/quicktime': 'mov',
        'video/x-matroska': 'mkv',
        'video/ogg': 'ogv'
    };

    let itemMimeType = item.mimeType;
    if (!itemMimeType && item.localDataUrl instanceof Blob && item.localDataUrl.type) {
        itemMimeType = item.localDataUrl.type;
    }

    if (item.isGif && item.type === 'video') { // True GIFs (often MP4s treated as GIF)
        fileExtension = 'gif';
    } else if (item.type === 'video' && item.savedAsMetadata === true) { // Video frames (saved as images)
        fileExtension = mimeToExtMap[itemMimeType?.split(';')[0]] || 'jpg';
    } else if (itemMimeType) {
        fileExtension = mimeToExtMap[itemMimeType.split(';')[0]];
        if (!fileExtension) { // If not in map, try to parse subtype
            const typeParts = itemMimeType.split('/');
            if (typeParts.length === 2) {
                let subType = typeParts[1].split(';')[0];
                // Basic sanitization for unknown subtypes
                subType = subType.replace(/[^a-z0-9.-]/gi, '_').substring(0,10);
                if (subType) fileExtension = subType;
            }
        }
    }

    // Fallback if extension is still 'dat' or unresolved
    if (fileExtension === 'dat' || !fileExtension || fileExtension.length > 5) {
      if (item.type === 'video' && item.savedAsMetadata === true) fileExtension = 'jpg'; // Frame
      else if (item.type === 'image' || item.isGif) fileExtension = 'jpg'; // Default image or GIF if complex
      else if (item.type === 'video') fileExtension = 'mp4'; // Default video
      else fileExtension = 'dat';
    }

    if (fileExtension === 'jpeg') fileExtension = 'jpg'; // Normalize jpeg to jpg


    let baseFilename = item.id ? item.id.replace(/[^\w.-]/g, '_').replace(/^(image-|video-|gif-)/, '') : `media_${timestamp}`;
    if (item.originalFilename && typeof item.originalFilename === 'string' && !baseFilename.includes(item.originalFilename.split('.')[0])) {
        baseFilename = item.originalFilename.split('.')[0].replace(/[^\w.-]/g, '_') + "_" + baseFilename;
    }
    if (item.savedAsMetadata && item.type === 'video') {
        baseFilename += '-frame'; // Indicate it's a frame
    }
    const finalFilename = `${baseDownloadFolder}/${authorName}/${subfolder}/${baseFilename}_${timestamp}.${fileExtension}`;
    logBackgroundEntry('DEBUG', `Generated download filename: ${finalFilename}`, {
        additionalDetails: {
            itemId: item.id, itemMimeType: item.mimeType, itemType: item.type, isGif: item.isGif,
            savedAsMetadata: item.savedAsMetadata, derivedExt: fileExtension
        }
    });
    return finalFilename;
}


// --- Message Listener ---
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'logExternalEntry') {
    const entry = message.logEntry;
    if (entry && entry.level && entry.message && entry.source) {
      const contextUrl = entry.contextUrl || sender.url || (sender.tab ? sender.tab.url : 'N/A');
      logBackgroundEntry(entry.level, entry.message, {
        source: entry.source,
        stack: entry.stack,
        contextUrl: contextUrl,
        error: entry.details && (entry.details.errorName || entry.details.errorMessage) ? { name: entry.details.errorName, message: entry.details.errorMessage } : null,
        additionalDetails: entry.details && !(entry.details.errorName || entry.details.errorMessage) ? entry.details : (entry.additionalDetails || {})
      });
      sendResponse({ success: true, message: "Log received by background." });
    } else {
      logBackgroundEntry('WARN', "Received incomplete external log entry", {
        additionalDetails: {
            receivedMessage: message,
            senderId: sender.id,
            senderUrl: sender.url
        }
      });
      sendResponse({ success: false, error: "Incomplete log entry" });
    }
    return true;
  }

  if (message.action === 'getBackgroundLogs') {
    (async () => {
        try {
            const db = await openDB();
            const transaction = db.transaction(LOG_STORE_NAME, 'readonly');
            const store = transaction.objectStore(LOG_STORE_NAME);
            const request = store.getAll();
            request.onsuccess = () => {
                // Sort logs by timestamp descending (newest first)
                const sortedLogs = (request.result || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
                sendResponse({ success: true, logs: sortedLogs });
            };
            request.onerror = (event) => {
                logBackgroundEntry('ERROR', 'Failed to get logs from DB', { error: event.target.error });
                sendResponse({ success: false, error: 'Failed to retrieve logs from DB', logs: [] });
            };
        } catch (error) {
            logBackgroundEntry('ERROR', 'Exception in getBackgroundLogs', { error: error });
            sendResponse({ success: false, error: error.message, logs: [] });
        }
    })();
    return true;
  }

  if (message.action === 'clearBackgroundLogs') {
    (async () => {
        try {
            const db = await openDB();
            const transaction = db.transaction(LOG_STORE_NAME, 'readwrite');
            const store = transaction.objectStore(LOG_STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => {
                logBackgroundEntry('INFO', "Background logs (DB) cleared by user action.");
                sendResponse({ success: true, message: "Background logs cleared." });
            };
            request.onerror = (event) => {
                logBackgroundEntry('ERROR', 'Failed to clear logs from DB', { error: event.target.error });
                sendResponse({ success: false, error: 'Failed to clear logs from DB' });
            };
        } catch (error) {
            logBackgroundEntry('ERROR', 'Exception in clearBackgroundLogs', { error: error });
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }

  if (message.action === 'ping') {
    logBackgroundEntry('DEBUG', 'Received ping.', { additionalDetails: { senderUrl: sender.tab ? sender.tab.url : sender.url } });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === 'checkSavedStatus') {
    (async () => {
      try {
        const { mediaUrl, type, originalUrlForId: OGI } = message;
        const id = getMediaIdFromUrl(OGI || mediaUrl || "fallback-id-check", type);
        let item = await getMediaItemFromDB(id);

        if (item) {
          // For videos, if it's saved but not as metadata (old full video), treat as not saved for frame context
          if (type === 'video' && item.type === 'video' && item.savedAsMetadata !== true) {
             logBackgroundEntry('DEBUG', `checkSavedStatus: Video ${id} exists as full video, but frame save is requested. Treating as not saved for frame.`);
             sendResponse({ success: true, isSaved: false });
             return;
          }
          sendResponse({ success: true, isSaved: true, item: item });
          return;
        }

        if (mediaUrl) {
            const contentHash = await generateContentHash(mediaUrl);
            if (contentHash) {
              item = await getMediaItemByContentHashFromDB(contentHash);
              if (item) {
                 if (type === 'video' && item.type === 'video' && item.savedAsMetadata !== true) {
                     logBackgroundEntry('DEBUG', `checkSavedStatus (hash): Video ${item.id} exists as full video (hash match), but frame save is requested. Treating as not saved for frame.`);
                     sendResponse({ success: true, isSaved: false });
                     return;
                 }
                sendResponse({ success: true, isSaved: true, item: item });
                return;
              }
            } else {
                logBackgroundEntry('DEBUG', 'checkSavedStatus: Content hash was null, cannot check by hash.', { additionalDetails: { mediaUrl: mediaUrl ? mediaUrl.substring(0,50) + '...' : 'N/A' }});
            }
        } else {
            logBackgroundEntry('DEBUG', 'checkSavedStatus: mediaUrl was null, skipping content hash check.');
        }
        sendResponse({ success: true, isSaved: false });
      } catch (error) {
        logBackgroundEntry('ERROR', 'Error in checkSavedStatus', { error: error, additionalDetails: { mediaUrl: message.mediaUrl, originalUrlForId: message.originalUrlForId } });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'saveImage') {
    (async () => {
        const {
            imageUrl, author, tweetId, forceUpdate, width, height,
            isPlaceholderForVideo, originalVideoUrl, videoDuration, videoOriginalFilename
        } = message;

        const logActionType = isPlaceholderForVideo ? 'Video Frame' : 'Image';
        logBackgroundEntry('INFO', `Received save request for ${logActionType}. URL/DataURL start: ${imageUrl ? imageUrl.substring(0,100) : 'N/A'}`, {additionalDetails: {author, tweetId, isPlaceholderForVideo, originalVideoUrl: originalVideoUrl?.substring(0,60)}});

        try {
            let blobToSave;
            let urlForDownload = imageUrl;

            if (imageUrl.startsWith('data:')) {
                blobToSave = await dataURLtoBlob(imageUrl);
                if (!blobToSave) throw new Error('Failed to convert DataURL to Blob for saving.');
            } else if (imageUrl.startsWith('http:') || imageUrl.startsWith('https:')) {
                const response = await fetch(imageUrl);
                if (!response.ok) throw new Error(`HTTP error fetching image/frame! status: ${response.status}`);
                blobToSave = await response.blob();
            } else if (imageUrl === '' && isPlaceholderForVideo) {
                logBackgroundEntry('WARN', `saveImage: Received empty imageUrl for video placeholder (frame). Storing metadata without a downloadable frame.`, { additionalDetails: { originalVideoUrl, videoOriginalFilename }});
                blobToSave = null;
            } else {
                logBackgroundEntry('ERROR', `saveImage received unsupported imageUrl scheme or empty for non-video-frame: ${imageUrl.substring(0,30)}`);
                throw new Error(`Unsupported imageUrl scheme: ${imageUrl.substring(0,30)}`);
            }

            const contentHash = blobToSave ? await generateContentHash(blobToSave) : null;

            const mediaId = isPlaceholderForVideo
                ? getMediaIdFromUrl(videoOriginalFilename || originalVideoUrl, 'video')
                : getMediaIdFromUrl(imageUrl, 'image');

            let existingItem = await getMediaItemFromDB(mediaId);
            if (!existingItem && contentHash) {
                 existingItem = await getMediaItemByContentHashFromDB(contentHash);
                 if (existingItem && existingItem.id !== mediaId) {
                     logBackgroundEntry('INFO', `Found existing item by hash ${contentHash} (ID ${existingItem.id}), but current request ID is ${mediaId}. Will treat as new if IDs differ, or update if ID matches later (unlikely path).`);
                     if (isPlaceholderForVideo && existingItem.type === 'video' && existingItem.savedAsMetadata === true) {
                        // This is a frame, and we found an existing frame by hash.
                     } else if (!isPlaceholderForVideo && existingItem.type === 'image') {
                        // This is an image, and we found an existing image by hash.
                     } else {
                        existingItem = null; // Don't use if types mismatch for content hash
                     }
                 }
            }

            if (existingItem && !forceUpdate) {
                if (isPlaceholderForVideo && existingItem.type === 'video' && existingItem.savedAsMetadata !== true) {
                     logBackgroundEntry('INFO', `Existing full video found for ${mediaId}. Allowing frame to be saved as new/updated metadata entry.`);
                } else {
                    logBackgroundEntry('INFO', `Media ${mediaId} (hash: ${contentHash}) already exists as ID ${existingItem.id}. Not re-saving.`, { additionalDetails: { imageUrl } });
                    chrome.runtime.sendMessage({ action: 'mediaStoreUpdated', item: existingItem, id: mediaId, cached: true })
                    .catch(e => {
                        if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                            logBackgroundEntry("DEBUG", `Error sending mediaStoreUpdated (popup likely closed for cached ${logActionType})`, { error: e });
                        } else {
                            logBackgroundEntry("WARN", `Error sending mediaStoreUpdated (cached ${logActionType})`, { error: e });
                        }
                    });
                    sendResponse({ success: true, cached: true, item: existingItem });
                    return;
                }
            }

            const itemToSave = {
                id: mediaId,
                originalRemoteUrl: isPlaceholderForVideo ? originalVideoUrl : (imageUrl.startsWith('data:') ? null : imageUrl),
                url: isPlaceholderForVideo ? (blobToSave ? imageUrl : null) : (imageUrl.startsWith('data:') ? null : imageUrl),
                localDataUrl: blobToSave,
                mimeType: blobToSave ? blobToSave.type : (isPlaceholderForVideo ? 'image/jpeg' : 'application/octet-stream'),
                thumbnailUrl: isPlaceholderForVideo ? (blobToSave ? imageUrl : null) : (imageUrl.startsWith('data:') ? null : imageUrl),
                author: author,
                date: new Date().toISOString(),
                type: isPlaceholderForVideo ? 'video' : 'image',
                isGif: !isPlaceholderForVideo && (blobToSave ? (blobToSave.type === 'image/gif' || imageUrl.toLowerCase().endsWith('.gif')) : imageUrl.toLowerCase().endsWith('.gif')),
                tweetId: tweetId,
                contentHash: contentHash,
                width: width || 0,
                height: height || 0,
                duration: isPlaceholderForVideo ? (videoDuration || 0) : 0,
                favorite: existingItem?.favorite || false,
                collections: existingItem?.collections || [],
                savedAsMetadata: isPlaceholderForVideo === true,
                originalFilename: isPlaceholderForVideo ? videoOriginalFilename : (getImageIdFromUrl(imageUrl).split('?')[0] || mediaId)
            };

            await addMediaItemToDB(itemToSave);
            logBackgroundEntry('INFO', `${logActionType} saved to DB: ${mediaId}`, { additionalDetails: { imageUrl: imageUrl ? imageUrl.substring(0,100) : "N/A", blobSize: blobToSave?.size, blobType: blobToSave?.type } });

            if (blobToSave) {
                const downloadFilename = await generateDownloadFilename(itemToSave);
                let finalDownloadUrl = urlForDownload;
                if (imageUrl.startsWith('data:')) {
                     finalDownloadUrl = await blobToDataURL(blobToSave);
                }
                logBackgroundEntry('INFO', `Attempting download for ${logActionType} ${mediaId}. Filename: ${downloadFilename}. URL (start): ${finalDownloadUrl.substring(0,100)}`);
                chrome.downloads.download({
                    url: finalDownloadUrl,
                    filename: downloadFilename,
                    saveAs: false
                }, (downloadId) => {
                    if (chrome.runtime.lastError) {
                        logBackgroundEntry('ERROR', `Error starting download for ${logActionType} ${mediaId}`, { error: chrome.runtime.lastError, additionalDetails: { filename: downloadFilename, downloadUrlStart: finalDownloadUrl.substring(0,100) } });
                    } else if (downloadId === undefined) {
                         logBackgroundEntry('WARN', `Download for ${logActionType} ${mediaId} did not start (downloadId undefined, no error).`, { additionalDetails: { filename: downloadFilename, url: finalDownloadUrl.substring(0,100)} });
                    } else {
                        logBackgroundEntry('INFO', `${logActionType} download started: ${mediaId}, ID: ${downloadId}`, { additionalDetails: { filename: downloadFilename }});
                    }
                });
            } else {
                 logBackgroundEntry('INFO', `Skipping download for ${mediaId} as no content (frame/image) was provided.`);
            }


            chrome.runtime.sendMessage({ action: 'mediaStoreUpdated', item: itemToSave, id: mediaId, created: !existingItem || (isPlaceholderForVideo && existingItem?.savedAsMetadata !== true), updated: !!existingItem && !(isPlaceholderForVideo && existingItem?.savedAsMetadata !== true) })
            .catch(e => {
                if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                    logBackgroundEntry("DEBUG", `Error sending mediaStoreUpdated (popup likely closed for save ${logActionType})`, { error: e });
                } else {
                    logBackgroundEntry("WARN", `Error sending mediaStoreUpdated (save ${logActionType})`, { error: e });
                }
            });
            sendResponse({ success: true, item: itemToSave, created: !existingItem || (isPlaceholderForVideo && existingItem?.savedAsMetadata !== true), updated: !!existingItem && !(isPlaceholderForVideo && existingItem?.savedAsMetadata !== true) });

        } catch (error) {
            logBackgroundEntry('ERROR', `Error saving ${logActionType} ${imageUrl ? imageUrl.substring(0,100) : 'N/A'}...`, { error: error });
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }

  if (message.action === 'saveVideo') {
    (async () => {
        const {
            videoUrl,
            poster, author, tweetId, forceUpdate,
            filename: originalFilenameFromCS,
            originalVideoUrl,
            isGifSource
        } = message;
        const { width, height, duration } = message;

        const mediaId = getMediaIdFromUrl(originalFilenameFromCS || originalVideoUrl || `video_${Date.now()}`, isGifSource ? 'gif' : 'video');

        try {
            let existingItem = await getMediaItemFromDB(mediaId);
            if (existingItem && !forceUpdate) {
                logBackgroundEntry('INFO', `Media ${mediaId} already exists. Not re-saving.`);
                sendResponse({ success: true, cached: true, item: existingItem });
                return;
            }

            let itemToSave;
            let downloadUrlForBrowser;

            if (isGifSource) {
                logBackgroundEntry('INFO', `Processing GIF save request for ${mediaId}`);
                const blobToSave = await dataURLtoBlob(videoUrl);
                if (!blobToSave) throw new Error('Failed to convert GIF DataURL to Blob.');

                itemToSave = {
                    id: mediaId,
                    originalRemoteUrl: originalVideoUrl || null,
                    url: null,
                    localDataUrl: blobToSave,
                    mimeType: blobToSave.type,
                    thumbnailUrl: poster,
                    author: author,
                    date: new Date().toISOString(),
                    type: 'video',
                    isGif: true,
                    tweetId: tweetId,
                    contentHash: await generateContentHash(blobToSave),
                    width: width || 0,
                    height: height || 0,
                    duration: duration || 0,
                    favorite: existingItem?.favorite || false,
                    collections: existingItem?.collections || [],
                    savedAsMetadata: false,
                    originalFilename: originalFilenameFromCS || getFilenameFromVideoUrl(originalVideoUrl || videoUrl)
                };
                downloadUrlForBrowser = await blobToDataURL(blobToSave);

            } else {
                logBackgroundEntry('INFO', `Processing video save request for ${mediaId} from URL: ${videoUrl}`);
                itemToSave = {
                    id: mediaId,
                    originalRemoteUrl: videoUrl,
                    url: videoUrl,
                    localDataUrl: null, // We are not storing the blob for direct URL downloads
                    mimeType: 'video/mp4', // Assume mp4 for now
                    thumbnailUrl: poster,
                    author: author,
                    date: new Date().toISOString(),
                    type: 'video',
                    isGif: false,
                    tweetId: tweetId,
                    contentHash: null, // Cannot hash without downloading first
                    width: width || 0,
                    height: height || 0,
                    duration: duration || 0,
                    favorite: existingItem?.favorite || false,
                    collections: existingItem?.collections || [],
                    savedAsMetadata: false, // Mark as a full video download
                    originalFilename: originalFilenameFromCS
                };
                downloadUrlForBrowser = videoUrl;
            }

            await addMediaItemToDB(itemToSave);
            const downloadFilename = await generateDownloadFilename(itemToSave);

            chrome.downloads.download({
                url: downloadUrlForBrowser,
                filename: downloadFilename,
                saveAs: false
            }, (downloadId) => {
                if (chrome.runtime.lastError) {
                    logBackgroundEntry('ERROR', `Error starting download for ${itemToSave.id}`, { error: chrome.runtime.lastError });
                } else if (downloadId !== undefined) {
                    logBackgroundEntry('INFO', `Download started for ${itemToSave.id}, Download ID: ${downloadId}`);
                }
            });

            chrome.runtime.sendMessage({ action: 'mediaStoreUpdated', item: itemToSave, id: mediaId, created: !existingItem, updated: !!existingItem });
            sendResponse({ success: true, item: itemToSave, created: !existingItem, updated: !!existingItem });

        } catch (error) {
            logBackgroundEntry('ERROR', `Error in saveVideo handler for ${mediaId}`, { error });
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }


  if (message.action === 'downloadMediaItem') {
    (async () => {
        const { mediaId } = message;
        try {
            const item = await getMediaItemFromDB(mediaId);
            if (!item) {
                throw new Error(`Media item ${mediaId} not found for download.`);
            }
            if (!item.localDataUrl) {
                logBackgroundEntry('WARN', `No localDataUrl for media item ${mediaId}, cannot download.`);
                sendResponse({ success: false, error: "No downloadable content for this item."});
                return;
            }

            const blobToDownload = item.localDataUrl;
            const downloadUrl = await blobToDataURL(blobToDownload);
            const downloadFilename = await generateDownloadFilename(item);

            logBackgroundEntry('INFO', `Attempting re-download for item ${mediaId}. Filename: ${downloadFilename}. URL (start): ${downloadUrl.substring(0,100)}`);
            chrome.downloads.download({
                url: downloadUrl,
                filename: downloadFilename,
                saveAs: false
            }, (downloadId) => {
                 if (chrome.runtime.lastError) {
                    logBackgroundEntry('ERROR', `Error re-downloading item ${mediaId}`, { error: chrome.runtime.lastError, additionalDetails: { filename: downloadFilename, mediaId } });
                    sendResponse({ success: false, error: chrome.runtime.lastError.message });
                } else if (downloadId === undefined) {
                    logBackgroundEntry('WARN', `Item re-download for ${mediaId} did not start (downloadId undefined, no error).`, { additionalDetails: { filename: downloadFilename, mediaId }});
                    sendResponse({ success: false, error: "Download did not initiate (no ID)." });
                } else {
                    logBackgroundEntry('INFO', `Item re-download started: ${mediaId}, Download ID: ${downloadId}`);
                    sendResponse({ success: true, downloadId: downloadId });
                }
            });
        } catch (error) {
            logBackgroundEntry('ERROR', 'Error in downloadMediaItem handler', { error: error, additionalDetails: { mediaId } });
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }

  if (message.action === 'deleteMedia') {
    (async () => {
      try {
        await deleteMediaItemFromDB(message.mediaId);
        logBackgroundEntry('INFO', `Media deleted: ${message.mediaId}`);
        chrome.runtime.sendMessage({ action: 'mediaStoreUpdated', mediaId: message.mediaId, deleted: true })
        .catch(e => {
            if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                logBackgroundEntry("DEBUG", "Error sending mediaStoreUpdated (popup likely closed for deleteMedia)", { error: e });
            } else {
                logBackgroundEntry("WARN", "Error sending mediaStoreUpdated (deleteMedia)", { error: e });
            }
        });
        sendResponse({ success: true });
      } catch (error) {
        logBackgroundEntry('ERROR', `Error deleting media ${message.mediaId}`, { error: error });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'updateMediaFavoriteStatus') {
    (async () => {
        try {
            const item = await getMediaItemFromDB(message.mediaId);
            if (!item) {
                throw new Error(`Media item ${message.mediaId} not found for favorite update.`);
            }
            item.favorite = message.favorite;
            await addMediaItemToDB(item);
            logBackgroundEntry('INFO', `Favorite status updated for ${message.mediaId} to ${message.favorite}`);
            chrome.runtime.sendMessage({ action: 'mediaStoreUpdated', item: item, mediaId: message.mediaId, favorite: message.favorite })
            .catch(e => {
                if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                    logBackgroundEntry("DEBUG", "Error sending mediaStoreUpdated (popup likely closed for favorite)", { error: e });
                } else {
                    logBackgroundEntry("WARN", "Error sending mediaStoreUpdated (favorite)", { error: e });
                }
            });
            sendResponse({ success: true, item: item });
        } catch (error) {
            logBackgroundEntry('ERROR', 'Error updating favorite status', { error: error, additionalDetails: { mediaId: message.mediaId } });
            sendResponse({ success: false, error: error.message });
        }
    })();
    return true;
  }

  if (message.action === 'getCollections') {
    (async () => {
        try {
            const collections = await getAllCollectionsFromDB();
            sendResponse({ success: true, collections: collections });
        } catch (error) {
            logBackgroundEntry('ERROR', 'Failed to get collections in background handler', { error: error });
            sendResponse({ success: false, error: error.message || 'Failed to retrieve collections' });
        }
    })();
    return true;
  }

  if (message.action === 'createCollection') {
    (async () => {
        try {
            const collection = await createCollectionInDB(message.name);
            sendResponse({ success: true, collection: collection });
            chrome.runtime.sendMessage({ action: 'collectionsUpdated' })
            .catch(e => {
                if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                    logBackgroundEntry('DEBUG', 'Error sending collectionsUpdated (popup likely closed after create)', { error: e });
                } else {
                    logBackgroundEntry('WARN', 'Error sending collectionsUpdated after create', { error: e });
                }
            });
        } catch (error) {
            logBackgroundEntry('ERROR', `Error creating collection "${message.name}" in background handler`, { error: error });
            sendResponse({ success: false, error: error.message || 'Failed to create collection' });
        }
    })();
    return true;
  }

  if (message.action === 'updateMediaInCollection') {
    (async () => {
        try {
            const collection = await updateMediaInCollectionInDB(message.collectionId, message.mediaId, message.shouldBeInCollection);
            sendResponse({ success: true, collection: collection });
            chrome.runtime.sendMessage({ action: 'collectionsUpdated', collectionId: message.collectionId })
            .catch(e => {
                if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                    logBackgroundEntry('DEBUG', 'Error sending collectionsUpdated (popup likely closed after media update)', { error: e });
                } else {
                    logBackgroundEntry('WARN', 'Error sending collectionsUpdated after media update', { error: e });
                }
            });
        } catch (error) {
            logBackgroundEntry('ERROR', `Error updating media in collection ${message.collectionId}`, { error: error });
            sendResponse({ success: false, error: error.message || 'Failed to update media in collection' });
        }
    })();
    return true;
  }

  if (message.action === 'deleteCollection') {
    (async () => {
        try {
            await deleteCollectionFromDB(message.collectionId);
            sendResponse({ success: true });
            chrome.runtime.sendMessage({ action: 'collectionsUpdated', deletedCollectionId: message.collectionId })
            .catch(e => {
                if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                    logBackgroundEntry('DEBUG', 'Error sending collectionsUpdated (popup likely closed after delete)', { error: e });
                } else {
                    logBackgroundEntry('WARN', 'Error sending collectionsUpdated after delete', { error: e });
                }
            });
        } catch (error) {
            logBackgroundEntry('ERROR', `Error deleting collection ${message.collectionId}`, { error: error });
            sendResponse({ success: false, error: error.message || 'Failed to delete collection' });
        }
    })();
    return true;
  }

  if (message.action === 'renameCollection') {
    (async () => {
        try {
            const collection = await renameCollectionInDB(message.collectionId, message.newName);
            sendResponse({ success: true, collection: collection });
            chrome.runtime.sendMessage({ action: 'collectionsUpdated', collectionId: message.collectionId })
            .catch(e => {
                if (e.message.includes("Receiving end does not exist") || e.message.includes("Port_was_closed")) {
                    logBackgroundEntry('DEBUG', 'Error sending collectionsUpdated (popup likely closed after rename)', { error: e });
                } else {
                    logBackgroundEntry('WARN', 'Error sending collectionsUpdated after rename', { error: e });
                }
            });
        } catch (error) {
             logBackgroundEntry('ERROR', `Error renaming collection ${message.collectionId} to "${message.newName}"`, { error: error });
            sendResponse({ success: false, error: error.message || 'Failed to rename collection' });
        }
    })();
    return true;
  }

  if (message.action === 'prepareAndClearAuthorsForImport') {
    (async () => {
      try {
        const authorsToClear = message.authors || [];
        logBackgroundEntry('INFO', `Background preparing for import. Clearing ${authorsToClear.length} authors. Expected total files: ${message.totalFiles || 'N/A'}.`, { additionalDetails: { authors: authorsToClear } });

        const db = await openDB();
        const transaction = db.transaction(MEDIA_STORE_NAME, 'readwrite');
        const store = transaction.objectStore(MEDIA_STORE_NAME);
        const authorIndex = store.index('author');

        const deletePromises = authorsToClear.map(author => {
          return new Promise((resolveDelete, rejectDelete) => {
            if (clearedAuthorsThisSession.has(author)) {
                logBackgroundEntry('INFO', `Author ${author} already cleared this session for import. Skipping re-clear.`);
                resolveDelete();
                return;
            }
            const request = authorIndex.openCursor(IDBKeyRange.only(author));
            let itemsDeletedForAuthor = 0;
            request.onsuccess = (event) => {
              const cursor = event.target.result;
              if (cursor) {
                if (cursor.value.imported || cursor.value.originalRemoteUrl === null) {
                  store.delete(cursor.primaryKey);
                  itemsDeletedForAuthor++;
                }
                cursor.continue();
              } else {
                logBackgroundEntry('INFO', `Cleared ${itemsDeletedForAuthor} previously imported/local items for author ${author}.`);
                clearedAuthorsThisSession.add(author);
                resolveDelete();
              }
            };
            request.onerror = (event) => {
              logBackgroundEntry('ERROR', `Error clearing items for author ${author}`, { error: event.target.error });
              rejectDelete(event.target.error);
            };
          });
        });

        await Promise.all(deletePromises);
        sendResponse({ success: true, totalFiles: message.totalFiles });
      } catch (error) {
        logBackgroundEntry('CRITICAL', 'Error in prepareAndClearAuthorsForImport', { error: error });
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true;
  }

  if (message.action === 'batchImportAuthorMedia') {
    (async () => {
        const mediaItems = message.mediaItems || [];
        if (mediaItems.length === 0) {
            sendResponse({ success: true, itemReceived: false, message: "No items in batch." });
            return;
        }

        const item = mediaItems[0];

        if (item.imported && item._import_webkitRelativePath) {
            const sanitizedPath = item._import_webkitRelativePath.replace(/[^\w.-]/g, '_');
            item.id = `imported-${sanitizedPath}`;
        } else {
            const mediaTypeForId = item.isGif ? 'gif' : item.type;
            item.id = getMediaIdFromUrl(item.originalFilename || item.id, mediaTypeForId);
        }

        if (typeof item.url === 'string' && item.url.startsWith('data:')) {
            item.localDataUrl = await dataURLtoBlob(item.url, item.mimeType);
            if (!item.localDataUrl) {
                 logBackgroundEntry('ERROR', 'Failed to convert DataURL to Blob for imported item', { additionalDetails: {itemId: item.id, path: item._import_webkitRelativePath }});
                 sendResponse({success: false, error: 'Failed to process DataURL', itemReceived: false });
                 return;
            }
            item.url = null;
        } else if (item.url instanceof Blob){
            item.localDataUrl = item.url;
            item.url = null;
        }

        if (item.localDataUrl && item.imported) {
            item.contentHash = await generateContentHash(item.localDataUrl);
        }

        mediaImportBuffer.push(item);
        if (!bufferFlushTimer) {
            bufferFlushTimer = setTimeout(flushMediaImportBufferToDB, BUFFER_FLUSH_TIMEOUT_MS);
        }
        if (mediaImportBuffer.length >= IMPORT_DB_WRITE_BATCH_SIZE) {
            await flushMediaImportBufferToDB();
        }
        sendResponse({ success: true, itemReceived: true, successfullySentPathsInBatch: [item._import_webkitRelativePath], itemReceivedCountForProgress: 1 });
    })();
    return true;
  }

  if (message.action === 'finalizeImport') {
    (async () => {
      try {
        logBackgroundEntry('INFO', 'Received finalizeImport. Flushing remaining buffer.');
        const flushResult = await flushMediaImportBufferToDB();
        sendResponse({ success: flushResult.success, flushedCount: flushResult.flushedCount, error: flushResult.error ? String(flushResult.error) : null });
        clearedAuthorsThisSession.clear();
      } catch (error) {
        logBackgroundEntry('ERROR', 'Error in finalizeImport', { error: error });
        sendResponse({ success: false, error: error.message, flushedCount: 0 });
      }
    })();
    return true;
  }

  if (message.action === 'favoriteAuthorsUpdated') {
    try {
      logBackgroundEntry('INFO', 'favoriteAuthorsUpdated received in background.', { source: 'BACKGROUND' });
      // Broadcast to other contexts (popup/gallery) if needed
      try { chrome.runtime.sendMessage({ action: 'favoriteAuthorsUpdated' }); } catch(e) {}
      sendResponse({ success: true });
    } catch (error) {
      logBackgroundEntry('WARN', 'Error handling favoriteAuthorsUpdated in background', { error: error });
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  // Default for unhandled actions
  logBackgroundEntry('WARN', 'Unhandled action in background listener', { additionalDetails: { action: message.action } });
  sendResponse({ success: false, error: `Unhandled action: ${message.action}` });
  return false;
});

// --- Context Menu Handler ---
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === "open-full-gallery") {
    logBackgroundEntry('INFO', 'Opening full gallery from context menu', { source: 'CONTEXT_MENU' });
    chrome.tabs.create({
      url: chrome.runtime.getURL('gallery.html')
    });
  }
});

// Ensure context menu is available even after service worker restarts
function registerContextMenu() {
  try {
    // Clear any existing items for this extension action, then create fresh.
    chrome.contextMenus.removeAll(() => {
      // Consume potential lastError from removeAll
      if (chrome.runtime.lastError) { /* no-op: suppress id-not-found warnings */ }
      chrome.contextMenus.create({
        id: "open-full-gallery",
        title: "Open Full Gallery",
        contexts: ["action"]
      }, () => {
        // Consume potential lastError from create (e.g., duplicate)
        if (chrome.runtime.lastError) { /* no-op */ }
      });
    });
  } catch (e) {
    // Fallback: Try to create directly
    try {
      chrome.contextMenus.create({
        id: "open-full-gallery",
        title: "Open Full Gallery",
        contexts: ["action"]
      }, () => { if (chrome.runtime.lastError) { /* no-op */ } });
    } catch (_) {}
  }
}

// Call on service worker startup
registerContextMenu();


openDB().then(() => {
  logBackgroundEntry('INFO', 'Background script initialized and DB opened successfully.');
}).catch(error => {
  logBackgroundEntry('CRITICAL', 'Failed to initialize DB on background script start.', { error: error });
});


function getMediaIdFromUrl(url, type = 'image') {
  if (typeof url !== 'string' || url.trim() === '') {
    url = `invalid_url_${type}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  let baseId = '';
  try {
    if (url.startsWith('data:')) {
        const parts = url.substring(0, Math.min(url.length, 100)).split(',');
        baseId = parts[0].split('/')[1]?.split(';')[0] || 'data_media';
    } else {
        const fullUrl = url.startsWith('//') ? `https:${url}` : url;
        const urlObj = new URL(fullUrl);
        baseId = urlObj.pathname.substring(urlObj.pathname.lastIndexOf('/') + 1) || urlObj.hostname + urlObj.pathname.replace(/\//g, '_');
    }

    if (type === 'video' || type === 'gif') {
      baseId = baseId.split('.')[0];
    }
  } catch (e) {
    baseId = url.substring(url.lastIndexOf('/') + 1) || url;
    if (type === 'video' || type === 'gif') {
        baseId = baseId.split('.')[0];
    }
  }

  baseId = baseId.replace(/[^\w.-]/g, '_').substring(0, 50);
  return `${type}-${baseId}`;
}

async function clearAllLogsImmediatelyForUpdate() {
  try {
    const db = await openDB();
    const transaction = db.transaction(LOG_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(LOG_STORE_NAME);
    const request = store.clear();

    return new Promise((resolve, reject) => {
      request.onsuccess = () => {
        console.log('XMS BG [SYSTEM]: Logs cleared due to extension update/install.'); // Direct console log
        resolve();
      };
      request.onerror = (event) => {
        console.error('XMS BG [SYSTEM_ERROR]: Failed to clear logs during update/install.', event.target.error); // Direct console log
        reject(event.target.error);
      };
    });
  } catch (error) {
    console.error('XMS BG [SYSTEM_ERROR]: Exception in clearAllLogsImmediatelyForUpdate.', error); // Direct console log
    // If DB can't even be opened, reject the promise so the caller knows.
    return Promise.reject(error);
  }
}

chrome.runtime.onInstalled.addListener(async (details) => {
    if (details.reason === "install" || details.reason === "update") {
        try {
            await clearAllLogsImmediatelyForUpdate();
        } catch (clearError) {
            // Error already logged by clearAllLogsImmediatelyForUpdate to console
            // We still want to log the install/update event if possible
        }

        if (details.reason === "install") {
            logBackgroundEntry('INFO', `X.com Media Saver extension installed. Version: ${chrome.runtime.getManifest().version}`, { source: 'BACKGROUND_SYSTEM' });
        } else if (details.reason === "update") {
            logBackgroundEntry('INFO', `X.com Media Saver extension updated. Version: ${chrome.runtime.getManifest().version}. Previous: ${details.previousVersion || 'N/A'}`, { source: 'BACKGROUND_SYSTEM' });
        }
    }
    
    // (Re)create context menu for extension icon on install/update
    registerContextMenu();
});

logBackgroundEntry('INFO', 'Background script fully loaded and listeners active.');