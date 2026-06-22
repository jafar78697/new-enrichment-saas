const API_URL = 'https://api.jentoai.pro';
const EXT_API_KEY = 'jento-ext-2026-secure-key-change-in-production';

// ── ACCOUNTS CONFIG (mirrors launch_accounts.py) ──
const ACCOUNTS = [
  { email: "siddiqiabdullah39@gmail.com", name: "Siddiqi Abdullah", platforms: ["facebook", "instagram"] },
  { email: "zwahiras@gmail.com", name: "Zwahir As", platforms: ["facebook"] },
  { email: "jentoai.solutions@gmail.com", name: "JentoAI Solutions", platforms: ["facebook", "instagram"] },
  { email: "contact.aijento@gmail.com", name: "AI Jento", platforms: ["facebook", "instagram"] },
  { email: "muhammadanees9908@gmail.com", name: "Muhammad Anees", platforms: ["facebook", "instagram"] }
];

const DAILY_TARGETS = { likes: 30, comments: 20, friend_requests: 15, group_joins: 5, posts: 1 };

// ── HEADERS FOR ALL API CALLS ──
function apiHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-api-key': EXT_API_KEY
  };
}

document.addEventListener('DOMContentLoaded', async () => {
  const mainSection = document.getElementById('main-section');
  const statusDiv = document.getElementById('status');
  const campaignSelect = document.getElementById('campaign-select');
  const startAutoBtn = document.getElementById('start-auto-btn');
  const launchBtn = document.getElementById('launch-profiles-btn');

  // Directly show dashboard - no login needed
  mainSection.classList.remove('hidden');
  fetchCampaigns();
  refreshDashboard();

  // ── CAMPAIGN SELECT ──
  campaignSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedCampaign: e.target.value });
  });

  // ── START BACKGROUND WORKER ──
  startAutoBtn.addEventListener('click', () => {
    statusDiv.textContent = '✅ Worker active! Running in background...';
    statusDiv.className = 'status-success';
    startAutoBtn.textContent = '✅ Running...';
    startAutoBtn.style.background = '#059669';
    chrome.runtime.sendMessage({ action: "startAutomation" });
  });

  // ── LAUNCH ALL PROFILES ──
  launchBtn.addEventListener('click', async () => {
    statusDiv.textContent = 'Opening terminal to launch profiles...';
    statusDiv.className = '';
    
    // Profiles are in different Chrome windows, so we need to use the Python script
    statusDiv.textContent = 'Run in terminal: python3 ~/launch_accounts.py';
    statusDiv.className = 'status-success';
    
    // Try to open terminal automatically
    try {
      const res = await fetch(`${API_URL}/v1/outreach/meta/launch-profiles`, {
        method: 'POST',
        headers: apiHeaders()
      });
      if (res.ok) {
        statusDiv.textContent = 'Profiles launched via server';
        statusDiv.className = 'status-success';
      }
    } catch (e) {
      // Server not available - user runs manually
    }
  });

  // ── REFRESH DASHBOARD EVERY 5 SECONDS ──
  setInterval(refreshDashboard, 5000);

  // ── HELPERS ──

  async function fetchCampaigns() {
    try {
      const res = await fetch(`${API_URL}/api/campaigns`, {
        headers: apiHeaders()
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

  async function refreshDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const profilesList = document.getElementById('profiles-list');
    let totalPct = 0;
    let profileCount = 0;
    let hasData = false;

    let html = '';
    
    for (const account of ACCOUNTS) {
      const result = await chrome.storage.local.get([`daily_${account.email}_${today}`]);
      const progress = result[`daily_${account.email}_${today}`] || {};
      
      const totalDone = Object.values(progress).reduce((a, b) => a + (b || 0), 0);
      const totalTarget = Object.values(DAILY_TARGETS).reduce((a, b) => a + b, 0);
      const pct = Math.min(100, Math.round((totalDone / totalTarget) * 100));
      
      if (totalDone > 0) hasData = true;
      totalPct += pct;
      profileCount++;
      
      const initial = account.email[0].toUpperCase();
      html += `
        <div class="profile-item">
          <div class="profile-avatar">${initial}</div>
          <div class="profile-info">
            <div class="profile-email">${account.email}</div>
            <div class="profile-bar">
              <div class="profile-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="profile-pct">${pct}%</div>
        </div>
      `;
    }

    if (!hasData) {
      html = '<div class="info-text" style="text-align:center; padding: 10px;">Open Facebook/Instagram profiles to see progress</div>';
    }

    profilesList.innerHTML = html;
    
    // Update stats
    document.getElementById('stat-profiles').textContent = profileCount;
    document.getElementById('stat-today').textContent = `${Math.round(totalPct / profileCount)}%`;
  }
});
