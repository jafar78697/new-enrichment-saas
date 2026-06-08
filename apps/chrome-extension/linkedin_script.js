function injectLinkedInUI() {
  if (document.getElementById('jento-ext-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'jento-ext-wrapper';
  wrapper.innerHTML = `
    <div id="jento-ext-header" style="background:#0a66c2;">
      <img src="https://app.jentoai.pro/logo-ai.png" alt="JentoAI" width="20">
      <span>JentoAI LinkedIn Auto</span>
      <button id="jento-ext-close">✕</button>
    </div>
    <div id="jento-ext-body">
      <div id="jento-ext-status"></div>
    </div>
  `;
  document.body.appendChild(wrapper);

  document.getElementById('jento-ext-close').addEventListener('click', () => {
    wrapper.style.display = 'none';
  });

  // Automatically start connection process if we have a task
  chrome.storage.local.get(['currentTaskId', 'currentTaskTemplate'], (data) => {
    if (data.currentTaskId) {
      autoConnect(data.currentTaskTemplate);
    }
  });
}

async function autoConnect(noteText) {
  const statusDiv = document.getElementById('jento-ext-status');
  
  statusDiv.textContent = 'Searching for Connect button...';
  statusDiv.className = '';

  // 1. Find the Connect button (LinkedIn changes classes often, so we look by aria-label or text)
  const buttons = Array.from(document.querySelectorAll('button'));
  let connectBtn = buttons.find(b => b.innerText.includes('Connect') && !b.innerText.includes('Pending'));

  // If not found directly, it might be in the "More" dropdown
  if (!connectBtn) {
    const moreBtn = buttons.find(b => b.getAttribute('aria-label') === 'More actions');
    if (moreBtn) {
      moreBtn.click();
      await new Promise(r => setTimeout(r, 1000)); // wait for dropdown
      const dropdownItems = Array.from(document.querySelectorAll('.artdeco-dropdown__item'));
      const hiddenConnect = dropdownItems.find(i => i.innerText.includes('Connect'));
      if (hiddenConnect) {
        hiddenConnect.click();
        statusDiv.textContent = 'Clicked Connect from dropdown...';
      } else {
        statusDiv.textContent = 'Connect button not found.';
        statusDiv.className = 'error';
        return;
      }
    } else {
      statusDiv.textContent = 'Connect button not found.';
      statusDiv.className = 'error';
      return;
    }
  } else {
    connectBtn.click();
  }

  await new Promise(r => setTimeout(r, 1500)); // Wait for modal

  // 2. Add a note if requested
  if (noteText) {
    const addNoteBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Add a note'));
    if (addNoteBtn) {
      addNoteBtn.click();
      await new Promise(r => setTimeout(r, 1000));
      
      const textArea = document.querySelector('textarea[name="message"]');
      if (textArea) {
        textArea.value = noteText;
        // Dispatch input event to trigger React state
        textArea.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }
  }

  await new Promise(r => setTimeout(r, 1000));

  // 3. Click Send
  const sendBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Send'));
  if (sendBtn) {
    sendBtn.click();
    statusDiv.textContent = 'Connection Request Sent!';
    statusDiv.className = 'success';
    
    // Send info back to background to log in CRM
    chrome.runtime.sendMessage({
      action: "logLinkedInAction",
      type: "connect",
      profileUrl: window.location.href
    }, () => {
      // Close the tab after success
      setTimeout(() => {
        window.close();
      }, 3000);
    });
  } else {
    statusDiv.textContent = 'Could not find Send button.';
    statusDiv.className = 'error';
    // Report failure if needed
  }
}

// Add the UI when navigating to a profile
const observer = new MutationObserver(() => {
  if (window.location.href.includes('linkedin.com/in/')) {
    if (document.querySelector('h1')) {
      injectLinkedInUI();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Check immediately on load
if (window.location.href.includes('linkedin.com/in/')) {
  setTimeout(injectLinkedInUI, 2000);
}
