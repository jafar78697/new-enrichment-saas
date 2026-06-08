const API_URL = 'https://api.jentoai.pro';

document.addEventListener('DOMContentLoaded', async () => {
  const loginSection = document.getElementById('login-section');
  const mainSection = document.getElementById('main-section');
  const loginBtn = document.getElementById('login-btn');
  const logoutBtn = document.getElementById('logout-btn');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');
  const statusDiv = document.getElementById('status');
  const campaignSelect = document.getElementById('campaign-select');
  const startAutoBtn = document.getElementById('start-auto-btn');

  // Check if already logged in
  const data = await chrome.storage.local.get(['token']);
  if (data.token) {
    showMain();
    fetchCampaigns(data.token);
  }

  loginBtn.addEventListener('click', async () => {
    const email = emailInput.value;
    const password = passwordInput.value;
    statusDiv.textContent = 'Logging in...';
    statusDiv.className = '';

    try {
      const res = await fetch(`${API_URL}/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const result = await res.json();
      if (res.ok) {
        await chrome.storage.local.set({ token: result.token, user: result.user });
        statusDiv.textContent = '';
        showMain();
        fetchCampaigns(result.token);
      } else {
        throw new Error(result.error || 'Login failed');
      }
    } catch (err) {
      statusDiv.textContent = err.message;
      statusDiv.className = 'error';
    }
  });

  logoutBtn.addEventListener('click', () => {
    chrome.storage.local.remove(['token', 'user']);
    loginSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    statusDiv.textContent = '';
  });

  campaignSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedCampaign: e.target.value });
  });

  startAutoBtn.addEventListener('click', () => {
    statusDiv.textContent = 'Worker active! Running in background...';
    statusDiv.className = 'success';
    startAutoBtn.textContent = 'Running...';
    startAutoBtn.style.background = '#059669';
    // Tell background to start polling
    chrome.runtime.sendMessage({ action: "startAutomation" });
  });

  function showMain() {
    loginSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
  }

  async function fetchCampaigns(token) {
    try {
      const res = await fetch(`${API_URL}/api/campaigns`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      
      campaignSelect.innerHTML = '<option value="">Select a Campaign</option>';
      if (data.campaigns) {
        data.campaigns.forEach(c => {
          const opt = document.createElement('option');
          opt.value = c.id;
          opt.textContent = c.name;
          campaignSelect.appendChild(opt);
        });
        
        const stored = await chrome.storage.local.get(['selectedCampaign']);
        if (stored.selectedCampaign) {
          campaignSelect.value = stored.selectedCampaign;
        }
      }
    } catch (err) {
      console.error('Failed to fetch campaigns', err);
    }
  }
});
