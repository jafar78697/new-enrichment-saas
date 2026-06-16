document.addEventListener('DOMContentLoaded', () => {
  const apiKeyInput = document.getElementById('api-key');
  const saveBtn = document.getElementById('save-btn');
  const statusMsg = document.getElementById('status-msg');
  const taskListContainer = document.getElementById('task-list-container');
  const refreshTasksBtn = document.getElementById('refresh-tasks-btn');

  // Tab switching
  const tabs = document.querySelectorAll('.tab');
  const tabContents = document.querySelectorAll('.tab-content');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Remove active class from all
      tabs.forEach(t => t.classList.remove('active'));
      tabContents.forEach(tc => tc.classList.remove('active'));

      // Add active class to clicked
      tab.classList.add('active');
      const target = tab.getAttribute('data-tab');
      document.getElementById(`${target}-view`).classList.add('active');

      if (target === 'tasks') {
        loadTasks();
      } else if (target === 'habits') {
        loadHabits();
      }
    });
  });

  // Load habit stats
  function loadHabits() {
    chrome.storage.local.get(['dailyHabits'], (res) => {
      const habits = res.dailyHabits || { likes: 0, comments: 0, reels: 0 };
      
      const likes = habits.likes || 0;
      const comments = habits.comments || 0;
      const reels = habits.reels || 0;

      document.getElementById('popup-likes-count').textContent = `${likes}/10`;
      document.getElementById('popup-likes-bar').style.width = `${Math.min(100, (likes / 10) * 100)}%`;

      document.getElementById('popup-comments-count').textContent = `${comments}/5`;
      document.getElementById('popup-comments-bar').style.width = `${Math.min(100, (comments / 5) * 100)}%`;

      document.getElementById('popup-reels-count').textContent = `${reels}/1`;
      document.getElementById('popup-reels-bar').style.width = `${Math.min(100, (reels / 1) * 100)}%`;
    });
  }

  // Load saved key
  chrome.storage.local.get(['jentoApiKey'], (result) => {
    if (result.jentoApiKey) {
      apiKeyInput.value = result.jentoApiKey;
      saveBtn.textContent = 'Update Connection';
      loadTasks(); // initial load
    } else {
      // If no key, switch to settings tab
      tabs[1].click();
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

  refreshTasksBtn.addEventListener('click', loadTasks);

  const syncRepliesBtn = document.getElementById('sync-replies-btn');
  if (syncRepliesBtn) {
    syncRepliesBtn.addEventListener('click', () => {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {type: 'FORCE_SYNC_REPLIES'}, function(response) {
            const originalText = syncRepliesBtn.textContent;
            syncRepliesBtn.textContent = 'Sync Triggered!';
            setTimeout(() => { syncRepliesBtn.textContent = originalText; }, 2000);
          });
        }
      });
    });
  }

  async function loadTasks() {
    chrome.storage.local.get(['jentoApiKey'], async (result) => {
      const apiKey = result.jentoApiKey;
      if (!apiKey) {
        taskListContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Please connect your API Key first.</div>';
        return;
      }

      taskListContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">Loading tasks...</div>';

      try {
        const response = await fetch('https://app.jentoai.pro/v1/outreach/facebook/tasks', {
          headers: {
            'Authorization': `Bearer ${apiKey}`
          }
        });

        if (!response.ok) throw new Error('Failed to fetch tasks');

        const data = await response.json();
        
        if (data.tasks.length === 0) {
          taskListContainer.innerHTML = '<div style="text-align: center; color: #999; padding: 20px;">No recent tasks found.</div>';
          return;
        }

        let html = '';
        data.tasks.forEach(task => {
          const badgeClass = task.status === 'pending' ? 'badge-pending' 
                           : task.status === 'sent' ? 'badge-sent' 
                           : task.status === 'replied' ? 'badge-replied'
                           : 'badge-failed';
          
          html += `
            <div class="task-item">
              <div class="task-title">${task.company_name || 'Unknown Prospect'}</div>
              <div class="task-meta">
                <span>${task.channel === 'facebook' ? 'Facebook' : 'Instagram'}</span>
                <span class="task-badge ${badgeClass}">${task.status}</span>
              </div>
            </div>
          `;
        });

        taskListContainer.innerHTML = html;
      } catch (error) {
        taskListContainer.innerHTML = `<div style="text-align: center; color: #991b1b; padding: 20px;">Error loading tasks.</div>`;
      }
    });
  }
});
