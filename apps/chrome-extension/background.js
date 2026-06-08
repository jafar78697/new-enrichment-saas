chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "saveLead") {
    chrome.storage.local.get(['token', 'selectedCampaign'], async (data) => {
      if (!data.token) {
        sendResponse({ success: false, error: 'Not logged in to CRM' });
        return;
      }
      
      try {
        const res = await fetch('https://api.jentoai.pro/api/contacts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.token}`
          },
          body: JSON.stringify({
            name: request.lead.name,
            facebook: request.lead.profileUrl,
            notes: request.lead.bio,
            source: 'Facebook Extension',
            campaign_id: data.selectedCampaign || null
          })
        });

        const result = await res.json();
        sendResponse({ success: res.ok, data: result });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true; // Keep message channel open for async response
  }

  if (request.action === "startAutomation") {
    console.log("Automation Worker Started");
    chrome.alarms.create("pollCRM", { periodInMinutes: 3 }); // Poll every 3 minutes
    chrome.alarms.create("pollReddit", { periodInMinutes: 4 }); // Poll every 4 minutes to avoid overlap
    pollForNextTask(); // Run once immediately
    pollForNextRedditTask();
    sendResponse({ success: true });
  }

  if (request.action === "logLinkedInAction") {
    console.log("Completed LinkedIn Action: ", request.type, request.profileUrl);
    chrome.storage.local.get(['token', 'currentTaskId'], async (data) => {
      if (data.token && data.currentTaskId) {
         try {
           await fetch('https://api.jentoai.pro/api/linkedin/complete-task', {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${data.token}`
             },
             body: JSON.stringify({ task_id: data.currentTaskId })
           });
           chrome.storage.local.remove(['currentTaskId']);
           console.log("Task marked completed in CRM");
         } catch (e) {
           console.error("Failed to mark task completed", e);
         }
      }
    });
    sendResponse({ success: true });
  }

  if (request.action === "logRedditAction") {
    console.log("Completed Reddit Action: ", request.type, request.profileUrl);
    chrome.storage.local.get(['token', 'currentRedditTaskId'], async (data) => {
      if (data.token && data.currentRedditTaskId) {
         try {
           await fetch('https://api.jentoai.pro/api/reddit/complete-task', {
             method: 'POST',
             headers: {
               'Content-Type': 'application/json',
               'Authorization': `Bearer ${data.token}`
             },
             body: JSON.stringify({ task_id: data.currentRedditTaskId })
           });
           chrome.storage.local.remove(['currentRedditTaskId']);
           console.log("Reddit task marked completed in CRM");
         } catch (e) {
           console.error("Failed to mark Reddit task completed", e);
         }
      }
    });
    sendResponse({ success: true });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "pollCRM") {
    pollForNextTask();
  }
  if (alarm.name === "pollReddit") {
    pollForNextRedditTask();
  }
});

async function pollForNextTask() {
  chrome.storage.local.get(['token'], async (data) => {
    if (!data.token) return;

    try {
      const res = await fetch('https://api.jentoai.pro/api/linkedin/next-task', {
        headers: { 'Authorization': `Bearer ${data.token}` }
      });
      const result = await res.json();

      if (result.task) {
        console.log("Received Task:", result.task);
        // Save task info
        await chrome.storage.local.set({ 
          currentTaskId: result.task.id,
          currentTaskTemplate: result.task.template
        });

        // Open profile in a new active tab (required for scripts to run)
        chrome.tabs.create({ url: result.task.profile_url, active: true });
      } else {
        console.log("No pending tasks or limit reached: ", result.message);
      }
    } catch (e) {
      console.error("Polling error", e);
    }
  });
}

async function pollForNextRedditTask() {
  chrome.storage.local.get(['token'], async (data) => {
    if (!data.token) return;

    try {
      const res = await fetch('https://api.jentoai.pro/api/reddit/next-task', {
        headers: { 'Authorization': `Bearer ${data.token}` }
      });
      const result = await res.json();

      if (result.task) {
        console.log("Received Reddit Task:", result.task);
        // Save task info
        await chrome.storage.local.set({ 
          currentRedditTaskId: result.task.id,
          currentRedditTaskTemplate: result.task.template
        });

        // Open profile in a new active tab
        chrome.tabs.create({ url: result.task.profile_url, active: true });
      } else {
        console.log("No pending Reddit tasks or limit reached.");
      }
    } catch (e) {
      console.error("Reddit Polling error", e);
    }
  });
}
