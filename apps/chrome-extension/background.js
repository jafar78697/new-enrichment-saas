// ──────────────────────────────────────────────
// JENTOAI SETTER EXTENSION — Background Worker
// Handles: lead saving, progress sync, task polling
// Uses API key for auth - no login required
// ──────────────────────────────────────────────

const API_BASE = 'https://api.jentoai.pro';
const EXT_API_KEY = 'jento-ext-2026-secure-key-change-in-production';

function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': EXT_API_KEY
  };
}

// ── MESSAGE HANDLER ──
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case "saveLead":
      handleSaveLead(request, sendResponse);
      return true; // Keep channel open for async

    case "syncProgress":
      handleSyncProgress(request);
      break;

    case "getProfileEmail":
      // Content script asks which profile email is active
      chrome.storage.local.get(['activeProfiles'], (data) => {
        const profiles = data.activeProfiles || {};
        // Find profile by tab ID
        const tabId = sender.tab?.id;
        sendResponse({ profileEmail: tabId ? profiles[tabId] : null });
      });
      return true;

    case "startAutomation":
      console.log("Automation Worker Started");
      chrome.alarms.create("pollCRM", { periodInMinutes: 3 });
      chrome.alarms.create("pollReddit", { periodInMinutes: 4 });
      pollForNextTask();
      pollForNextRedditTask();
      sendResponse({ success: true });
      break;

    case "logLinkedInAction":
      handleLogLinkedIn(request);
      break;

    case "logRedditAction":
      handleLogReddit(request);
      break;

    default:
      sendResponse({ success: false, error: 'Unknown action' });
  }
});

// ── TRACK ACTIVE PROFILES BY TAB ──
// When a tab loads with jento_profile param, store it
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    try {
      const url = new URL(tab.url);
      const profileEmail = url.searchParams.get('jento_profile');
      if (profileEmail) {
        chrome.storage.local.get(['activeProfiles'], (data) => {
          const profiles = data.activeProfiles || {};
          profiles[tabId] = profileEmail;
          chrome.storage.local.set({ activeProfiles: profiles });
        });
      }
    } catch (e) {
      // Ignore invalid URLs
    }
  }
});

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
  chrome.storage.local.get(['activeProfiles'], (data) => {
    const profiles = data.activeProfiles || {};
    if (profiles[tabId]) {
      delete profiles[tabId];
      chrome.storage.local.set({ activeProfiles: profiles });
    }
  });
});

// ── SAVE LEAD ──
async function handleSaveLead(request, sendResponse) {
  const data = await chrome.storage.local.get(['selectedCampaign']);
  
  try {
    const res = await fetch(`${API_BASE}/api/contacts`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        name: request.lead.name,
        facebook: request.lead.profileUrl,
        notes: request.lead.bio,
        source: 'Facebook Extension',
        campaign_id: data.selectedCampaign || null,
        captured_by: request.lead.capturedBy || null
      })
    });

    const result = await res.json();
    sendResponse({ success: res.ok, data: result });
  } catch (err) {
    sendResponse({ success: false, error: err.message });
  }
}

// ── SYNC PROGRESS TO API ──
async function handleSyncProgress(request) {
  try {
    await fetch(`${API_BASE}/v1/outreach/meta/actions/sync-progress`, {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        profileEmail: request.profileEmail,
        dailyProgress: request.dailyProgress,
        weeklyProgress: request.weeklyProgress,
        date: new Date().toISOString().split('T')[0]
      })
    });
  } catch (e) {
    console.error('Progress sync error:', e);
  }
}

// ── LINKEDIN TASK LOGGING ──
async function handleLogLinkedIn(request) {
  console.log("Completed LinkedIn Action: ", request.type, request.profileUrl);
  const data = await chrome.storage.local.get(['currentTaskId']);
  if (data.currentTaskId) {
    try {
      await fetch(`${API_BASE}/api/linkedin/complete-task`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ task_id: data.currentTaskId })
      });
      chrome.storage.local.remove(['currentTaskId']);
      console.log("Task marked completed in CRM");
    } catch (e) {
      console.error("Failed to mark task completed", e);
    }
  }
}

// ── REDDIT TASK LOGGING ──
async function handleLogReddit(request) {
  console.log("Completed Reddit Action: ", request.type, request.profileUrl);
  const data = await chrome.storage.local.get(['currentRedditTaskId']);
  if (data.currentRedditTaskId) {
    try {
      await fetch(`${API_BASE}/api/reddit/complete-task`, {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ task_id: data.currentRedditTaskId })
      });
      chrome.storage.local.remove(['currentRedditTaskId']);
      console.log("Reddit task marked completed in CRM");
    } catch (e) {
      console.error("Failed to mark Reddit task completed", e);
    }
  }
}

// ── ALARMS ──
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pollCRM") pollForNextTask();
  if (alarm.name === "pollReddit") pollForNextRedditTask();
});

// ── POLL FOR LINKEDIN TASKS ──
async function pollForNextTask() {
  try {
    const res = await fetch(`${API_BASE}/api/linkedin/next-task`, {
      headers: apiHeaders()
    });
    const result = await res.json();

    if (result.task) {
      console.log("Received Task:", result.task);
      await chrome.storage.local.set({ 
        currentTaskId: result.task.id,
        currentTaskTemplate: result.task.template
      });
      chrome.tabs.create({ url: result.task.profile_url, active: true });
    }
  } catch (e) {
    console.error("Polling error", e);
  }
}

// ── POLL FOR REDDIT TASKS ──
async function pollForNextRedditTask() {
  const data = await chrome.storage.local.get(['token']);
  if (!data.token) return;

  try {
    const res = await fetch(`${API_BASE}/api/reddit/next-task`, {
      headers: { 'Authorization': `Bearer ${data.token}` }
    });
    const result = await res.json();

    if (result.task) {
      console.log("Received Reddit Task:", result.task);
      await chrome.storage.local.set({ 
        currentRedditTaskId: result.task.id,
        currentRedditTaskTemplate: result.task.template
      });
      chrome.tabs.create({ url: result.task.profile_url, active: true });
    }
  } catch (e) {
    console.error("Reddit Polling error", e);
  }
}
