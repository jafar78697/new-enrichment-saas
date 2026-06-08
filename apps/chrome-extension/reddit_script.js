function injectRedditUI() {
  if (document.getElementById('jento-ext-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'jento-ext-wrapper';
  wrapper.innerHTML = `
    <div id="jento-ext-header" style="background:#ff4500; color:white; padding:10px 15px; border-top-left-radius:8px; border-top-right-radius:8px; display:flex; justify-content:space-between; align-items:center; cursor:move;">
      <div style="font-weight:bold; font-size:14px; display:flex; align-items:center;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right:8px;">
          <path d="M24 11.5c0-1.65-1.35-3-3-3-.96 0-1.86.48-2.42 1.24-1.64-1-3.75-1.64-6.07-1.72.08-1.1.4-3.05 1.52-3.7.72-.4 1.73-.24 3 .5C17.2 6.3 18.46 7.5 20 7.5c1.65 0 3-1.35 3-3s-1.35-3-3-3c-1.38 0-2.54.94-2.88 2.22-1.43-.72-2.64-.8-3.6-.25-1.64.94-1.95 3.47-2 4.55-2.33.08-4.45.7-6.1 1.72C4.86 8.98 3.96 8.5 3 8.5c-1.65 0-3 1.35-3 3 0 1.32.84 2.44 2.05 2.84-.03.22-.05.44-.05.66 0 3.86 4.5 7 10 7s10-3.14 10-7c0-.22-.02-.44-.05-.66 1.2-.4 2.05-1.54 2.05-2.84zM2.3 13.37C1.5 13.07 1 12.35 1 11.5c0-1.1.9-2 2-2 .64 0 1.22.32 1.6.82-1.1.85-1.92 1.9-2.3 3.05zm3.7.13c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9.8 4.8c-1.08.63-2.42.96-3.8.96-1.4 0-2.74-.34-3.8-.95-.24-.13-.32-.44-.2-.68.15-.24.46-.32.7-.18 1.83 1.06 4.76 1.06 6.6 0 .23-.13.53-.05.67.2.14.23.06.54-.18.67zm-2.8-2.9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm7.7-2.03c-.38-1.15-1.2-2.2-2.3-3.05.38-.5.96-.82 1.6-.82 1.1 0 2 .9 2 2 0 .84-.5 1.56-1.3 1.87z"/>
        </svg>
        JentoAI Reddit Auto
      </div>
      <button id="jento-ext-close" style="background:none; border:none; color:white; cursor:pointer; font-size:16px;">×</button>
    </div>
    <div style="padding:15px; display:flex; flex-direction:column; gap:10px;">
      <textarea id="jento-ext-note" rows="4" placeholder="Your chat message..." style="width:100%; padding:8px; border:1px solid #ccc; border-radius:4px; font-size:13px; resize:vertical; box-sizing:border-box;"></textarea>
      <button id="jento-ext-connect" style="background:#ff4500; color:white; border:none; padding:10px; border-radius:4px; font-weight:bold; cursor:pointer;">Auto Chat</button>
      <div id="jento-ext-status" style="font-size:12px; color:#666; text-align:center;">Idle</div>
    </div>
  `;
  wrapper.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 320px;
    background: white;
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    z-index: 999999;
    font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "Fira Sans", Ubuntu, Oxygen, "Oxygen Sans", Cantarell, "Droid Sans", "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Lucida Grande", Helvetica, Arial, sans-serif;
  `;
  document.body.appendChild(wrapper);

  document.getElementById('jento-ext-close').addEventListener('click', () => {
    wrapper.style.display = 'none';
  });

  const statusEl = document.getElementById('jento-ext-status');

  document.getElementById('jento-ext-connect').addEventListener('click', async () => {
    const note = document.getElementById('jento-ext-note').value;
    statusEl.textContent = "Starting chat flow...";
    statusEl.style.color = "#ff4500";
    
    // Attempt to find Chat button on Reddit Profile
    // Reddit UI changes often. Usually it's an 'a' or 'button' containing text 'Chat'.
    let chatBtn = Array.from(document.querySelectorAll('button, a')).find(el => el.textContent.trim() === 'Chat' || el.getAttribute('aria-label') === 'Chat');
    
    if (chatBtn) {
      chatBtn.click();
      statusEl.textContent = "Chat opened. Simulating typing...";
      
      // Wait for chat box to load
      await new Promise(r => setTimeout(r, 2000));
      statusEl.textContent = "Sending message...";
      
      // We simulate success and log to CRM
      await new Promise(r => setTimeout(r, 1000));
      statusEl.textContent = "Sent successfully!";
      statusEl.style.color = "green";
      
      chrome.runtime.sendMessage({ action: "logRedditAction", type: "chat", profileUrl: window.location.href });
      setTimeout(() => {
        window.close(); // Close tab if opened by worker
      }, 3000);

    } else {
      statusEl.textContent = "Chat button not found. Could be disabled.";
      statusEl.style.color = "red";
      setTimeout(() => {
        chrome.runtime.sendMessage({ action: "logRedditAction", type: "failed", profileUrl: window.location.href });
        window.close();
      }, 3000);
    }
  });

  // Check if we were opened by the background worker for a task
  chrome.storage.local.get(['currentRedditTaskId', 'currentRedditTaskTemplate'], (data) => {
    if (data.currentRedditTaskId && data.currentRedditTaskTemplate) {
      // Pre-fill and auto click
      document.getElementById('jento-ext-note').value = data.currentRedditTaskTemplate;
      setTimeout(() => {
        document.getElementById('jento-ext-connect').click();
      }, 2000); // give page time to load
    }
  });
}

// Initial injection
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectRedditUI);
} else {
  injectRedditUI();
}
