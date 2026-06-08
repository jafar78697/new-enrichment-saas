// Instagram DOM Selectors (Subject to change)
const SELECTORS = {
  chatInput: 'div[role="textbox"]',
  sendButton: 'button:contains("Send")' // We'll find it by text content if needed, or trigger Enter
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

async function typeMessage(element, message) {
  element.focus();
  document.execCommand('insertText', false, message);
  await sleep(1000);
}

async function startAutomation() {
  chrome.storage.local.get(['currentOutreach'], async (result) => {
    const outreach = result.currentOutreach;
    // For Instagram, we can check a specific flag or just share the same logic
    if (!outreach || !outreach.text || !window.location.href.includes('instagram.com')) return;

    console.log('[Jento] Starting Instagram Automation for log:', outreach.logId);

    try {
      const inputEl = await waitForElement(SELECTORS.chatInput);
      if (!inputEl) throw new Error('Chat input not found on Instagram.');

      await sleep(2000 + Math.random() * 2000); 

      await typeMessage(inputEl, outreach.text);

      // Instagram usually sends on Enter
      const enterEvent = new KeyboardEvent('keydown', {
        bubbles: true, cancelable: true, keyCode: 13, key: 'Enter'
      });
      inputEl.dispatchEvent(enterEvent);

      await sleep(2000);

      chrome.storage.local.remove('currentOutreach');
      chrome.runtime.sendMessage({ type: 'MESSAGE_SENT', logId: outreach.logId });

    } catch (error) {
      console.error('[Jento]', error);
      chrome.storage.local.remove('currentOutreach');
      chrome.runtime.sendMessage({ type: 'MESSAGE_FAILED', logId: outreach.logId, error: error.message });
    }
  });
}

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  startAutomation();
} else {
  window.addEventListener('DOMContentLoaded', startAutomation);
}
