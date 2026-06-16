// Facebook DOM Selectors (These may change over time, need to be robust)
const SELECTORS = {
  chatInput: 'div[aria-label="Message"][contenteditable="true"], div[aria-label="Type a message"][contenteditable="true"]',
  sendButton: 'div[aria-label="Press Enter to send"]'
};

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForElement(selector, maxWait = 10000) {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const el = document.querySelector(selector);
    if (el) return el;
    await sleep(500);
  }
  return null;
}

// Function to simulate human typing
async function typeMessage(element, message) {
  element.focus();
  
  // Facebook uses draft-js or lexical, direct value assignment doesn't trigger state updates.
  // We need to use execCommand to insert text cleanly.
  document.execCommand('insertText', false, message);
  
  await sleep(1000); // Wait for FB UI to register the text and show the send button
}

async function startAutomation() {
  chrome.storage.local.get(['currentOutreach'], async (result) => {
    const outreach = result.currentOutreach;
    if (!outreach || !outreach.text) return;

    // We are on a Facebook page and we have an active outreach task!
    console.log('[Jento] Starting Facebook Automation for log:', outreach.logId);

    try {
      // 1. Wait for the chat input to load
      const inputEl = await waitForElement(SELECTORS.chatInput);
      if (!inputEl) throw new Error('Chat input not found. DOM might have changed or page did not load.');

      // 2. Add human delay before typing
      await sleep(2000 + Math.random() * 2000); 

      // 3. Type the message
      await typeMessage(inputEl, outreach.text);

      // 4. Find and click the send button
      // Note: Facebook often sends on "Enter" keypress, we can simulate Enter or click the button.
      const sendBtn = await waitForElement(SELECTORS.sendButton, 3000);
      if (sendBtn) {
        sendBtn.click();
      } else {
        // Fallback: Dispatch Enter key
        const enterEvent = new KeyboardEvent('keydown', {
          bubbles: true, cancelable: true, keyCode: 13, key: 'Enter'
        });
        inputEl.dispatchEvent(enterEvent);
      }

      // 5. Wait for message to actually send
      await sleep(2000);

      // 6. Clear the current outreach so it doesn't run again, and notify background
      chrome.storage.local.remove('currentOutreach');
      chrome.runtime.sendMessage({ type: 'MESSAGE_SENT', logId: outreach.logId });

    } catch (error) {
      console.error('[Jento]', error);
      chrome.storage.local.remove('currentOutreach');
      chrome.runtime.sendMessage({ type: 'MESSAGE_FAILED', logId: outreach.logId, error: error.message });
    }
  });
}

// Start immediately when injected
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  startAutomation();
  setupReplyTracker();
} else {
  window.addEventListener('DOMContentLoaded', () => {
    startAutomation();
    setupReplyTracker();
  });
}

// Listen for messages from background to force sync
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FORCE_SYNC_REPLIES') {
    syncReplies();
    sendResponse({ status: 'started' });
  }
});

// Reply Tracking Logic
function setupReplyTracker() {
  // We only care about tracking when the user is explicitly on the messages page
  if (!window.location.href.includes('/messages')) return;

  // Run initial sync after a short delay
  setTimeout(syncReplies, 5000);

  // Setup observer for when they switch chats
  let lastUrl = location.href; 
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      if (url.includes('/messages')) {
        setTimeout(syncReplies, 3000); // sync when switching chats
      }
    }
  }).observe(document, {subtree: true, childList: true});
}

function syncReplies() {
  try {
    const profileUrl = window.location.href;
    
    // Attempt to extract the last message from the chat window
    // On Facebook, incoming messages are typically aligned left and have specific aria labels or structure.
    // As a generic heuristic: we look for the last message bubble.
    // If it's from the prospect, we sync it.
    
    // Very simplified heuristic: look for message rows
    const messageRows = document.querySelectorAll('[role="row"]');
    if (messageRows.length === 0) return;

    const lastRow = messageRows[messageRows.length - 1];
    
    // Usually, Facebook adds 'You sent' or your name to your own messages,
    // or positions them differently.
    // For this simple implementation, we'll try to find text content.
    const messageText = lastRow.textContent?.trim() || '';

    // If the message is very empty or just a "Seen" receipt, skip
    if (!messageText || messageText.includes('Seen')) return;

    // Send the last message text to the backend to determine if it's a valid reply
    chrome.storage.local.get(['jentoApiKey'], async (result) => {
      const apiKey = result.jentoApiKey;
      if (!apiKey) return;

      fetch('https://app.jentoai.pro/v1/outreach/facebook/sync-reply', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          profileUrl,
          messageText,
          platform: 'facebook'
        })
      }).catch(console.error);
    });

  } catch (error) {
    console.error('[Jento] Error syncing reply:', error);
  }
}

// --- CONSISTENCY TRACKER WIDGET ---

function injectConsistencyWidget() {
  if (document.getElementById('jento-consistency-widget')) return;

  const widget = document.createElement('div');
  widget.id = 'jento-consistency-widget';
  widget.innerHTML = `
    <div style="background: white; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.15); width: 280px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; overflow: hidden; border: 1px solid #e2e8f0; position: fixed; bottom: 24px; left: 24px; z-index: 999999; transition: transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275);">
      <div style="background: linear-gradient(135deg, #0F766E 0%, #115e59 100%); color: white; padding: 12px 16px; font-weight: 600; font-size: 14px; display: flex; justify-content: space-between; align-items: center; cursor: pointer;" id="jento-widget-header">
        <span>Jento Daily Goals</span>
        <span id="jento-widget-toggle" style="font-size: 18px; transform: rotate(0deg); transition: transform 0.3s;">▼</span>
      </div>
      <div id="jento-widget-body" style="padding: 16px; background: #f8fafc; transition: max-height 0.3s ease-out; max-height: 500px; overflow: hidden;">
        
        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">
            <span>👍 Likes (Goal: 10)</span>
            <span id="jento-likes-count">0/10</span>
          </div>
          <div style="height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
            <div id="jento-likes-bar" style="height: 100%; width: 0%; background: #0ea5e9; transition: width 0.4s ease;"></div>
          </div>
        </div>

        <div style="margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">
            <span>💬 Comments (Goal: 5)</span>
            <span id="jento-comments-count">0/5</span>
          </div>
          <div style="height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
            <div id="jento-comments-bar" style="height: 100%; width: 0%; background: #10b981; transition: width 0.4s ease;"></div>
          </div>
        </div>

        <div style="margin-bottom: 16px;">
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; color: #334155; margin-bottom: 4px;">
            <span>🎥 Reels (Goal: 1)</span>
            <span id="jento-reels-count">0/1</span>
          </div>
          <div style="height: 6px; background: #e2e8f0; border-radius: 3px; overflow: hidden;">
            <div id="jento-reels-bar" style="height: 100%; width: 0%; background: #8b5cf6; transition: width 0.4s ease;"></div>
          </div>
        </div>

        <button id="jento-manual-reel-btn" style="width: 100%; background: white; border: 1px solid #cbd5e1; padding: 8px; border-radius: 6px; font-size: 12px; font-weight: 600; color: #475569; cursor: pointer; transition: background 0.2s;">
          ✓ I Posted a Reel
        </button>

      </div>
    </div>
  `;
  document.body.appendChild(widget);

  // Toggle Collapse
  let isCollapsed = false;
  document.getElementById('jento-widget-header').addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    document.getElementById('jento-widget-body').style.maxHeight = isCollapsed ? '0px' : '500px';
    document.getElementById('jento-widget-body').style.padding = isCollapsed ? '0px 16px' : '16px';
    document.getElementById('jento-widget-toggle').style.transform = isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)';
  });

  // Manual Reel Button
  document.getElementById('jento-manual-reel-btn').addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'RECORD_ACTION', action: 'reel' });
    triggerConfetti(document.getElementById('jento-reels-bar'));
    setTimeout(updateWidgetStats, 200);
  });

  updateWidgetStats();
  
  // Listen for storage changes from background to update UI instantly
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.dailyHabits) {
      updateWidgetStats(changes.dailyHabits.newValue);
    }
  });
}

function updateWidgetStats(habitsData = null) {
  if (habitsData) {
    renderStats(habitsData);
  } else {
    chrome.storage.local.get(['dailyHabits'], (res) => {
      renderStats(res.dailyHabits || { likes: 0, comments: 0, reels: 0 });
    });
  }
}

function renderStats(habits) {
  const likes = habits.likes || 0;
  const comments = habits.comments || 0;
  const reels = habits.reels || 0;

  const elLikesCount = document.getElementById('jento-likes-count');
  const elLikesBar = document.getElementById('jento-likes-bar');
  if (elLikesCount) {
    elLikesCount.textContent = `${likes}/10`;
    elLikesBar.style.width = `${Math.min(100, (likes / 10) * 100)}%`;
  }

  const elCommCount = document.getElementById('jento-comments-count');
  const elCommBar = document.getElementById('jento-comments-bar');
  if (elCommCount) {
    elCommCount.textContent = `${comments}/5`;
    elCommBar.style.width = `${Math.min(100, (comments / 5) * 100)}%`;
  }

  const elReelCount = document.getElementById('jento-reels-count');
  const elReelBar = document.getElementById('jento-reels-bar');
  if (elReelCount) {
    elReelCount.textContent = `${reels}/1`;
    elReelBar.style.width = `${Math.min(100, (reels / 1) * 100)}%`;
  }
}

function triggerConfetti(element) {
  // Simple CSS pop animation
  const origBg = element.style.background;
  element.style.transition = 'none';
  element.style.background = '#fde047'; // yellow flash
  element.style.transform = 'scale(1.05)';
  setTimeout(() => {
    element.style.transition = 'all 0.4s ease';
    element.style.background = origBg;
    element.style.transform = 'scale(1)';
  }, 300);
}

// Track DOM clicks for Likes and Comments
function setupActionTracking() {
  document.addEventListener('click', (e) => {
    // Basic heuristic for Facebook Like button
    const likeBtn = e.target.closest('div[aria-label*="Like"], div[aria-label*="like"]');
    if (likeBtn) {
      chrome.runtime.sendMessage({ type: 'RECORD_ACTION', action: 'like' });
      const bar = document.getElementById('jento-likes-bar');
      if (bar) triggerConfetti(bar);
      return;
    }

    // Basic heuristic for Facebook Comment submit
    // FB comments are usually submitted via Enter key on an input, or a specific aria-label button
    const commentBtn = e.target.closest('div[aria-label="Comment"]');
    if (commentBtn) {
      // Actually clicking the comment button just opens the box. 
      // We might need to listen to Enter key inside comment boxes for a real implementation, 
      // but for this demo, we can just trigger on the comment button click or any generic submit.
      chrome.runtime.sendMessage({ type: 'RECORD_ACTION', action: 'comment' });
      const bar = document.getElementById('jento-comments-bar');
      if (bar) triggerConfetti(bar);
    }
  }, true);

  // Listen for Enter key on comment inputs
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      const el = e.target;
      if (el.getAttribute('aria-label') === 'Write a comment' || el.closest('[role="textbox"]')) {
        chrome.runtime.sendMessage({ type: 'RECORD_ACTION', action: 'comment' });
        const bar = document.getElementById('jento-comments-bar');
        if (bar) triggerConfetti(bar);
      }
    }
  }, true);
}

// Initialize Tracker
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  injectConsistencyWidget();
  setupActionTracking();
} else {
  window.addEventListener('DOMContentLoaded', () => {
    injectConsistencyWidget();
    setupActionTracking();
  });
}

