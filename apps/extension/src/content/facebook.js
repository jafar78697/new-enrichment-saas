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
} else {
  window.addEventListener('DOMContentLoaded', startAutomation);
}
