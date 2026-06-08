function injectUI() {
  if (document.getElementById('jento-ext-wrapper')) return;

  const wrapper = document.createElement('div');
  wrapper.id = 'jento-ext-wrapper';
  wrapper.innerHTML = `
    <div id="jento-ext-header">
      <img src="https://app.jentoai.pro/logo-ai.png" alt="JentoAI" width="20">
      <span>JentoAI</span>
      <button id="jento-ext-close">✕</button>
    </div>
    <div id="jento-ext-body">
      <button id="jento-ext-scrape">Scrape & Save Lead</button>
      <div id="jento-ext-status"></div>
    </div>
  `;
  document.body.appendChild(wrapper);

  document.getElementById('jento-ext-close').addEventListener('click', () => {
    wrapper.style.display = 'none';
  });

  document.getElementById('jento-ext-scrape').addEventListener('click', scrapeProfile);
}

function scrapeProfile() {
  const statusDiv = document.getElementById('jento-ext-status');
  statusDiv.textContent = 'Scraping...';
  statusDiv.className = '';

  let name = document.querySelector('h1')?.innerText || 'Unknown';
  // Attempt to parse standard FB/IG structures (this is basic and needs robust selectors)
  let bio = document.querySelector('meta[property="og:description"]')?.content || '';
  let profileUrl = window.location.href;

  const lead = { name, bio, profileUrl };

  chrome.runtime.sendMessage({ action: "saveLead", lead }, (response) => {
    if (response && response.success) {
      statusDiv.textContent = 'Lead saved to CRM!';
      statusDiv.className = 'success';
      
      // Auto DM Logic can be added here if needed by simulating clicks
      // simulateDM();
    } else {
      statusDiv.textContent = response?.error || 'Failed to save lead.';
      statusDiv.className = 'error';
    }
  });
}

// Add the UI when navigating
const observer = new MutationObserver(() => {
  if (window.location.href.includes('facebook.com') || window.location.href.includes('instagram.com')) {
    // Basic check if it's a profile page
    if (document.querySelector('h1')) {
      injectUI();
    }
  }
});

observer.observe(document.body, { childList: true, subtree: true });
injectUI();
