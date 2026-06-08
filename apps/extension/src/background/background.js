const API_BASE = 'https://app.jentoai.pro/v1/outreach';

chrome.runtime.onInstalled.addListener(() => {
  console.log('Jento Social Automator Installed');
  chrome.alarms.create('pollApi', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pollApi') {
    pollForMessages();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CREDENTIALS_UPDATED') {
    pollForMessages();
  }
  
  if (message.type === 'MESSAGE_SENT') {
    // The content script successfully sent the message
    markMessageAsSent(message.logId).then(() => {
      // Close the tab that was opened for this outreach
      if (sender.tab && sender.tab.id) {
        chrome.tabs.remove(sender.tab.id);
      }
    });
  }
  
  if (message.type === 'MESSAGE_FAILED') {
    console.error('Failed to send message:', message.error);
    markMessageAsFailed(message.logId, message.error).then(() => {
      if (sender.tab && sender.tab.id) {
        chrome.tabs.remove(sender.tab.id);
      }
    });
  }
});

async function getApiKey() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['jentoApiKey'], (result) => {
      resolve(result.jentoApiKey);
    });
  });
}

let isPolling = false;

async function pollForMessages() {
  if (isPolling) return;
  
  const apiKey = await getApiKey();
  if (!apiKey) return;

  isPolling = true;
  try {
    const response = await fetch(`${API_BASE}/facebook/pending`, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    
    if (!response.ok) throw new Error('API Error');
    
    const data = await response.json();
    if (data.pending && data.pending.length > 0) {
      // Process one message at a time to avoid opening 50 tabs
      const msg = data.pending[0];
      processOutreach(msg);
    }
  } catch (error) {
    console.error('Polling error:', error);
  } finally {
    isPolling = false;
  }
}

function processOutreach(msg) {
  // msg should contain: logId, facebookProfileId, textBody
  if (!msg.facebookProfileId) {
    markMessageAsFailed(msg.logId, 'No Facebook Profile ID found');
    return;
  }

  const url = `https://www.facebook.com/messages/t/${msg.facebookProfileId}`;
  
  chrome.tabs.create({ url, active: false }, (tab) => {
    // Save the message context so the content script can grab it
    chrome.storage.local.set({
      currentOutreach: {
        tabId: tab.id,
        logId: msg.logId,
        text: msg.textBody
      }
    });
  });
}

async function markMessageAsSent(logId) {
  const apiKey = await getApiKey();
  await fetch(`${API_BASE}/facebook/status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ log_id: logId, status: 'sent' })
  });
}

async function markMessageAsFailed(logId, errorMsg) {
  const apiKey = await getApiKey();
  await fetch(`${API_BASE}/facebook/status`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ log_id: logId, status: 'failed', error: errorMsg })
  });
}
