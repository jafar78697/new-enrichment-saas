document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');

  // Load saved key
  chrome.storage.local.get(['jentoApiKey'], (result) => {
    if (result.jentoApiKey) {
      apiKeyInput.value = result.jentoApiKey;
      saveBtn.textContent = 'Update Connection';
    }
  });

  saveBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
      statusMsg.textContent = 'Please enter an API Key';
      statusMsg.className = 'status error';
      return;
    }

    chrome.storage.local.set({ jentoApiKey: key }, () => {
      statusMsg.textContent = 'Connected successfully!';
      statusMsg.className = 'status success';
      saveBtn.textContent = 'Update Connection';
      
      // Notify background script to start polling
      chrome.runtime.sendMessage({ type: 'CREDENTIALS_UPDATED' });
      
      setTimeout(() => {
        statusMsg.style.display = 'none';
      }, 3000);
    });
  });
});
