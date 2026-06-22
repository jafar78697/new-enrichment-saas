// ──────────────────────────────────────────────
// JENTOAI SETTER EXTENSION — Content Script
// Detects which FB/IG profile is active, shows
// daily/weekly task progress with animations.
// ──────────────────────────────────────────────

// ── DETECT CURRENT PROFILE ──
// The profile email is passed via URL param ?jento_profile=email
// from launch_accounts.py. Fallback: try to read from cookies/DOM.
function getProfileEmail() {
  const urlParams = new URLSearchParams(window.location.search);
  const fromUrl = urlParams.get('jento_profile');
  if (fromUrl) return fromUrl;
  
  // Fallback: try to read from chrome storage via background
  return null;
}

// ── DEFAULT TARGETS (from SETTERS GUIDE) ──
const DEFAULT_DAILY_TARGETS = {
  likes: { label: 'Likes', target: 30, icon: 'L', color: '#3B82F6' },
  comments: { label: 'Comments', target: 20, icon: 'C', color: '#8B5CF6' },
  friend_requests: { label: 'Friend Reqs', target: 15, icon: 'F', color: '#EC4899' },
  group_joins: { label: 'Group Joins', target: 5, icon: 'G', color: '#F59E0B' },
  posts: { label: 'Posts', target: 1, icon: 'P', color: '#10B981' }
};

const DEFAULT_WEEKLY_TARGETS = {
  likes: { label: 'Likes', target: 210, icon: 'L', color: '#3B82F6' },
  comments: { label: 'Comments', target: 140, icon: 'C', color: '#8B5CF6' },
  friend_requests: { label: 'Friend Reqs', target: 105, icon: 'F', color: '#EC4899' },
  group_joins: { label: 'Group Joins', target: 35, icon: 'G', color: '#F59E0B' },
  posts: { label: 'Posts', target: 7, icon: 'P', color: '#10B981' }
};

// ── STATE ──
let currentProfileEmail = getProfileEmail();
let dailyProgress = {};
let weeklyProgress = {};
let isVisible = true;

// ── LOAD PROGRESS FROM STORAGE ──
async function loadProgress() {
  if (!currentProfileEmail) return;
  
  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart();
  
  const result = await chrome.storage.local.get([
    `daily_${currentProfileEmail}_${today}`,
    `weekly_${currentProfileEmail}_${weekStart}`
  ]);
  
  dailyProgress = result[`daily_${currentProfileEmail}_${today}`] || {
    likes: 0, comments: 0, friend_requests: 0, group_joins: 0, posts: 0
  };
  
  weeklyProgress = result[`weekly_${currentProfileEmail}_${weekStart}`] || {
    likes: 0, comments: 0, friend_requests: 0, group_joins: 0, posts: 0
  };
}

function getWeekStart() {
  const now = new Date();
  const day = now.getDay();
  const diff = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// ── SAVE PROGRESS ──
async function saveProgress() {
  if (!currentProfileEmail) return;
  
  const today = new Date().toISOString().split('T')[0];
  const weekStart = getWeekStart();
  
  await chrome.storage.local.set({
    [`daily_${currentProfileEmail}_${today}`]: dailyProgress,
    [`weekly_${currentProfileEmail}_${weekStart}`]: weeklyProgress
  });
  
  // Also sync to background for API calls
  chrome.runtime.sendMessage({
    action: "syncProgress",
    profileEmail: currentProfileEmail,
    dailyProgress,
    weeklyProgress
  });
}

// ── INCREMENT ACTION ──
async function incrementAction(actionType) {
  if (!dailyProgress[actionType]) dailyProgress[actionType] = 0;
  if (!weeklyProgress[actionType]) weeklyProgress[actionType] = 0;
  
  dailyProgress[actionType]++;
  weeklyProgress[actionType]++;
  
  await saveProgress();
  updateUI();
  
  // Animate the specific card
  const card = document.querySelector(`[data-action="${actionType}"]`);
  if (card) {
    card.classList.remove('jento-pop');
    void card.offsetWidth; // trigger reflow
    card.classList.add('jento-pop');
  }
}

// ── INJECT MAIN UI ──
function injectUI() {
  if (document.getElementById('jento-ext-wrapper')) return;
  
  const isFacebook = window.location.hostname.includes('facebook.com');
  const platform = isFacebook ? 'Facebook' : 'Instagram';
  const accentColor = isFacebook ? '#1877F2' : '#E1306C';
  
  const wrapper = document.createElement('div');
  wrapper.id = 'jento-ext-wrapper';
  wrapper.innerHTML = `
    <div id="jento-ext-header" style="background: linear-gradient(135deg, ${accentColor}, ${isFacebook ? '#4267B2' : '#833AB4'});">
      <div class="jento-header-left">
        <span class="jento-logo">J</span>
        <div>
          <span class="jento-title">JentoAI Setter</span>
          <span class="jento-platform">${platform}</span>
        </div>
      </div>
      <div class="jento-header-right">
        <span class="jento-profile-badge" id="jento-profile-badge">${currentProfileEmail ? currentProfileEmail.split('@')[0] : 'Unknown'}</span>
        <button id="jento-ext-toggle">−</button>
        <button id="jento-ext-close">✕</button>
      </div>
    </div>
    <div id="jento-ext-body">
      <!-- Profile Info -->
      <div class="jento-profile-row">
        <div class="jento-profile-avatar">${(currentProfileEmail || '?')[0].toUpperCase()}</div>
        <div class="jento-profile-info">
          <div class="jento-profile-name" id="jento-profile-name">${currentProfileEmail || 'Not detected'}</div>
          <div class="jento-profile-date">${new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</div>
        </div>
        <div class="jento-overall-progress" id="jento-overall-progress">
          <svg viewBox="0 0 36 36" class="jento-circular-chart">
            <path class="jento-circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <path class="jento-circle" id="jento-circle-progress" stroke-dasharray="0, 100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
            <text x="18" y="20.5" class="jento-circle-text" id="jento-circle-text">0%</text>
          </svg>
        </div>
      </div>
      
      <!-- Tab: Daily / Weekly -->
      <div class="jento-tabs">
        <button class="jento-tab active" data-tab="daily">Daily</button>
        <button class="jento-tab" data-tab="weekly">Weekly</button>
      </div>
      
      <!-- Tasks Container -->
      <div class="jento-tasks" id="jento-tasks-daily">
        ${Object.entries(DEFAULT_DAILY_TARGETS).map(([key, cfg]) => `
          <div class="jento-task-card" data-action="${key}" data-tab="daily">
            <div class="jento-task-icon" style="background: ${cfg.color}20; color: ${cfg.color}">${cfg.icon}</div>
            <div class="jento-task-content">
              <div class="jento-task-label">${cfg.label}</div>
              <div class="jento-task-progress-row">
                <div class="jento-task-bar-bg">
                  <div class="jento-task-bar-fill" style="width: 0%; background: ${cfg.color};" id="bar-daily-${key}"></div>
                </div>
                <span class="jento-task-count" id="count-daily-${key}">0/${cfg.target}</span>
              </div>
            </div>
            <button class="jento-task-btn" data-action="${key}" style="color: ${cfg.color}; border-color: ${cfg.color}30;">+1</button>
          </div>
        `).join('')}
      </div>
      
      <div class="jento-tasks jento-hidden" id="jento-tasks-weekly">
        ${Object.entries(DEFAULT_WEEKLY_TARGETS).map(([key, cfg]) => `
          <div class="jento-task-card" data-action="${key}" data-tab="weekly">
            <div class="jento-task-icon" style="background: ${cfg.color}20; color: ${cfg.color}">${cfg.icon}</div>
            <div class="jento-task-content">
              <div class="jento-task-label">${cfg.label}</div>
              <div class="jento-task-progress-row">
                <div class="jento-task-bar-bg">
                  <div class="jento-task-bar-fill" style="width: 0%; background: ${cfg.color};" id="bar-weekly-${key}"></div>
                </div>
                <span class="jento-task-count" id="count-weekly-${key}">0/${cfg.target}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      
      <!-- Quick Actions -->
      <div class="jento-actions">
        <button class="jento-action-btn" id="jento-scrape-lead">Save Lead</button>
        <button class="jento-action-btn secondary" id="jento-reset-today">Reset Today</button>
      </div>
      
      <div id="jento-ext-status"></div>
    </div>
  `;
  document.body.appendChild(wrapper);
  
  // ── EVENT LISTENERS ──
  
  // Toggle minimize
  document.getElementById('jento-ext-toggle').addEventListener('click', () => {
    const body = document.getElementById('jento-ext-body');
    const isHidden = body.style.display === 'none';
    body.style.display = isHidden ? 'block' : 'none';
    document.getElementById('jento-ext-toggle').textContent = isHidden ? '−' : '+';
  });
  
  // Close
  document.getElementById('jento-ext-close').addEventListener('click', () => {
    wrapper.style.display = 'none';
    isVisible = false;
  });
  
  // Tab switching
  document.querySelectorAll('.jento-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.jento-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const tabName = tab.dataset.tab;
      document.getElementById('jento-tasks-daily').classList.toggle('jento-hidden', tabName !== 'daily');
      document.getElementById('jento-tasks-weekly').classList.toggle('jento-hidden', tabName !== 'weekly');
    });
  });
  
  // +1 buttons (daily only)
  document.querySelectorAll('.jento-task-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const action = btn.dataset.action;
      await incrementAction(action);
    });
  });
  
  // Scrape lead
  document.getElementById('jento-scrape-lead').addEventListener('click', scrapeProfile);
  
  // Reset today
  document.getElementById('jento-reset-today').addEventListener('click', async () => {
    if (confirm('Reset today\'s progress for this profile?')) {
      const today = new Date().toISOString().split('T')[0];
      dailyProgress = { likes: 0, comments: 0, friend_requests: 0, group_joins: 0, posts: 0 };
      await chrome.storage.local.set({ [`daily_${currentProfileEmail}_${today}`]: dailyProgress });
      updateUI();
    }
  });
  
  // Load progress and update UI
  loadProgress().then(() => updateUI());
}

// ── SCRAPE LEAD ──
function scrapeProfile() {
  const statusDiv = document.getElementById('jento-ext-status');
  statusDiv.textContent = 'Scraping...';
  statusDiv.className = '';

  let name = document.querySelector('h1')?.innerText || 'Unknown';
  let bio = document.querySelector('meta[property="og:description"]')?.content || '';
  let profileUrl = window.location.href;

  const lead = { name, bio, profileUrl, capturedBy: currentProfileEmail };

  chrome.runtime.sendMessage({ action: "saveLead", lead }, (response) => {
    if (response && response.success) {
      statusDiv.textContent = '✅ Lead saved to CRM!';
      statusDiv.className = 'success';
      // Auto-increment lead capture
      incrementAction('friend_requests');
    } else {
      statusDiv.textContent = response?.error || '❌ Failed to save lead.';
      statusDiv.className = 'error';
    }
    setTimeout(() => { statusDiv.textContent = ''; }, 3000);
  });
}

// ── UPDATE UI ──
function updateUI() {
  if (!isVisible) return;
  
  // Update daily cards
  let totalDailyPct = 0;
  let dailyCount = 0;
  
  Object.entries(DEFAULT_DAILY_TARGETS).forEach(([key, cfg]) => {
    const done = dailyProgress[key] || 0;
    const pct = Math.min(100, (done / cfg.target) * 100);
    
    const bar = document.getElementById(`bar-daily-${key}`);
    const count = document.getElementById(`count-daily-${key}`);
    if (bar) bar.style.width = `${pct}%`;
    if (count) count.textContent = `${done}/${cfg.target}`;
    
    totalDailyPct += pct;
    dailyCount++;
  });
  
  // Update weekly cards
  let totalWeeklyPct = 0;
  let weeklyCount = 0;
  
  Object.entries(DEFAULT_WEEKLY_TARGETS).forEach(([key, cfg]) => {
    const done = weeklyProgress[key] || 0;
    const pct = Math.min(100, (done / cfg.target) * 100);
    
    const bar = document.getElementById(`bar-weekly-${key}`);
    const count = document.getElementById(`count-weekly-${key}`);
    if (bar) bar.style.width = `${pct}%`;
    if (count) count.textContent = `${done}/${cfg.target}`;
    
    totalWeeklyPct += pct;
    weeklyCount++;
  });
  
  // Update circular progress (show daily %)
  const avgPct = Math.round(totalDailyPct / Math.max(1, dailyCount));
  const circle = document.getElementById('jento-circle-progress');
  const text = document.getElementById('jento-circle-text');
  if (circle) {
    const dashArray = (avgPct / 100) * 100;
    circle.setAttribute('stroke-dasharray', `${dashArray}, 100`);
  }
  if (text) text.textContent = `${avgPct}%`;
}

// ── OBSERVER FOR PAGE NAVIGATION ──
const observer = new MutationObserver(() => {
  if (window.location.href.includes('facebook.com') || window.location.href.includes('instagram.com')) {
    // Re-detect profile on navigation
    const newEmail = getProfileEmail();
    if (newEmail && newEmail !== currentProfileEmail) {
      currentProfileEmail = newEmail;
      const badge = document.getElementById('jento-profile-badge');
      if (badge) badge.textContent = newEmail.split('@')[0];
      loadProgress().then(() => updateUI());
    }
    
    if (!document.getElementById('jento-ext-wrapper')) {
      injectUI();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial inject
if (window.location.href.includes('facebook.com') || window.location.href.includes('instagram.com')) {
  // Wait a bit for page to load
  setTimeout(injectUI, 1500);
}
