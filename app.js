// ===== PID Filter — Application Logic =====

(function () {
  'use strict';

  // ===== State =====
  let allEntries = [];
  let groupedData = new Map();
  let activeTab = null;

  // ===== DOM References =====
  const inputPage = document.getElementById('input-page');
  const resultsPage = document.getElementById('results-page');
  const textarea = document.getElementById('key-input');
  const nextBtn = document.getElementById('btn-next');
  const backBtn = document.getElementById('btn-back');
  const exportBtn = document.getElementById('btn-export');
  const exportAllBtn = document.getElementById('btn-export-all');
  const copyAllBtn = document.getElementById('btn-copy-all');
  const clearBtn = document.getElementById('btn-clear');
  const themeToggle = document.getElementById('theme-toggle');
  const tabBar = document.getElementById('tab-bar');
  const tabContent = document.getElementById('tab-content');
  const statKeys = document.getElementById('stat-keys');
  const statErrors = document.getElementById('stat-errors');
  const toast = document.getElementById('toast');

  // ===== Initialization =====
  function init() {
    // Restore saved theme
    const savedTheme = localStorage.getItem('pidfilter-theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    // Restore saved input
    const savedInput = localStorage.getItem('pidfilter-input');
    if (savedInput) {
      textarea.value = savedInput;
    }

    // Bind events
    nextBtn.addEventListener('click', navigateToResults);
    backBtn.addEventListener('click', navigateToInput);
    exportBtn.addEventListener('click', exportCSV);
    exportAllBtn.addEventListener('click', exportAllCSV);
    copyAllBtn.addEventListener('click', copyAllKeys);
    clearBtn.addEventListener('click', clearAll);
    themeToggle.addEventListener('click', toggleTheme);

    // Auto-save input as user types
    textarea.addEventListener('input', () => {
      localStorage.setItem('pidfilter-input', textarea.value);
    });

    // Handle keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Ctrl/Cmd + Enter to go to results
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        if (inputPage.classList.contains('active')) {
          navigateToResults();
        }
      }
    });
  }

  // ===== Theme =====
  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('pidfilter-theme', next);
  }

  // ===== Parsing =====
  /**
   * Parses raw text input into an array of entry objects.
   */
  function parseInput(text) {
    if (!text || !text.trim()) return [];

    const entries = [];
    // Split into blocks separated by one or more blank lines
    const blocks = text.trim().split(/\n\s*\n/);

    for (const block of blocks) {
      const lines = block.trim().split('\n');
      const entry = {
        key: '',
        description: '',
        subType: '',
        errorCode: '',
        time: '',
      };

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Match "Field: Value" pattern
        const match = trimmed.match(/^([^:]+):\s*(.+)$/);
        if (match) {
          const field = match[1].trim().toLowerCase();
          const value = match[2].trim();

          if (field === 'key') {
            entry.key = value;
          } else if (field === 'description') {
            entry.description = value;
          } else if (field === 'sub type') {
            entry.subType = value;
          } else if (field === 'error code') {
            entry.errorCode = value;
          } else if (field === 'time') {
            entry.time = value;
          }
        }
      }

      // Only add entries that have at least a key and error code
      if (entry.key && entry.errorCode) {
        entries.push(entry);
      }
    }

    return entries;
  }

  /**
   * Groups entries by error code into a Map.
   */
  function groupByErrorCode(entries) {
    const groups = new Map();

    for (const entry of entries) {
      const code = entry.errorCode;
      if (!groups.has(code)) {
        groups.set(code, []);
      }
      groups.get(code).push(entry);
    }

    // Sort error codes alphabetically
    return new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  }

  // ===== Rendering =====

  /**
   * Renders tab buttons in the tab bar.
   */
  function renderTabs(groups) {
    tabBar.innerHTML = '';

    let first = true;
    for (const [errorCode, entries] of groups) {
      const tab = document.createElement('button');
      tab.className = 'tab-btn' + (first ? ' active' : '');
      tab.dataset.errorCode = errorCode;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', first ? 'true' : 'false');
      tab.innerHTML = `
        <span class="tab-label">${escapeHTML(errorCode)}</span>
        <span class="tab-badge">${entries.length}</span>
      `;
      tab.addEventListener('click', () => switchTab(errorCode));
      tabBar.appendChild(tab);

      if (first) {
        activeTab = errorCode;
        first = false;
      }
    }
  }

  /**
   * Renders the Excel-like data table for the given entries.
   */
  function renderTable(entries) {
    if (!entries || entries.length === 0) {
      tabContent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <div class="empty-state-text">No entries found for this error code.</div>
        </div>
      `;
      return;
    }

    let html = `
      <div class="table-container">
        <div class="table-scroll">
          <table class="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Key</th>
                <th>Description</th>
                <th>Sub Type</th>
                <th>Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
    `;

    entries.forEach((entry, index) => {
      html += `
        <tr>
          <td>${index + 1}</td>
          <td class="cell-key">${escapeHTML(entry.key)}</td>
          <td class="cell-desc">${escapeHTML(entry.description)}</td>
          <td class="cell-subtype">${escapeHTML(entry.subType)}</td>
          <td class="cell-time">${escapeHTML(entry.time)}</td>
          <td>
            <button class="copy-btn" title="Copy key" data-key="${escapeAttr(entry.key)}" aria-label="Copy key ${escapeAttr(entry.key)}">
              📋
            </button>
          </td>
        </tr>
      `;
    });

    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;

    tabContent.innerHTML = html;

    // Bind copy buttons
    tabContent.querySelectorAll('.copy-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        copyToClipboard(btn.dataset.key).then(() => {
          btn.textContent = '✓';
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = '📋';
            btn.classList.remove('copied');
          }, 1500);
        });
      });
    });
  }

  /**
   * Switches the active tab.
   */
  function switchTab(errorCode) {
    activeTab = errorCode;

    tabBar.querySelectorAll('.tab-btn').forEach((btn) => {
      const isActive = btn.dataset.errorCode === errorCode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const entries = groupedData.get(errorCode) || [];
    renderTable(entries);
  }

  // ===== Navigation =====

  function navigateToResults() {
    const text = textarea.value.trim();

    if (!text) {
      showToast('⚠️ Please paste your key details before proceeding.');
      return;
    }

    allEntries = parseInput(text);

    if (allEntries.length === 0) {
      showToast('⚠️ No valid entries found. Check the format and try again.');
      return;
    }

    groupedData = groupByErrorCode(allEntries);

    // Update stats
    statKeys.textContent = allEntries.length;
    statErrors.textContent = groupedData.size;

    // Render UI
    renderTabs(groupedData);
    renderTable(groupedData.get(activeTab) || []);

    // Page transition
    inputPage.classList.remove('active');
    requestAnimationFrame(() => {
      resultsPage.classList.add('active');
      // Scroll to top on mobile
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function navigateToInput() {
    resultsPage.classList.remove('active');
    requestAnimationFrame(() => {
      inputPage.classList.add('active');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ===== Copy All Keys =====

  function copyAllKeys() {
    if (!activeTab || !groupedData.has(activeTab)) return;

    const entries = groupedData.get(activeTab);
    const keys = entries.map((e) => e.key).join('\n');

    copyToClipboard(keys).then(() => {
      copyAllBtn.classList.add('copied');
      const originalText = copyAllBtn.innerHTML;
      copyAllBtn.innerHTML = '✓ Copied!';
      showToast(`✅ ${entries.length} key(s) copied to clipboard!`, 'success');
      setTimeout(() => {
        copyAllBtn.innerHTML = originalText;
        copyAllBtn.classList.remove('copied');
      }, 2000);
    });
  }

  // ===== Export CSV =====

  function exportCSV() {
    if (!activeTab || !groupedData.has(activeTab)) return;

    const entries = groupedData.get(activeTab);
    const headers = ['Error Code', 'Key', 'Description', 'Sub Type', 'Time'];
    const rows = entries.map((e) => [
      e.errorCode,
      e.key,
      e.description,
      e.subType,
      e.time,
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach((row) => {
      csvContent += row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const safeCode = activeTab.replace(/[^a-zA-Z0-9]/g, '_');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pid_filter_${safeCode}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`✅ Exported ${entries.length} key(s) from ${activeTab}`, 'success');
  }

  // ===== Export All CSV =====

  function exportAllCSV() {
    if (allEntries.length === 0) return;

    const headers = ['Error Code', 'Key', 'Description', 'Sub Type', 'Time'];
    const rows = allEntries.map((e) => [
      e.errorCode,
      e.key,
      e.description,
      e.subType,
      e.time,
    ]);

    let csvContent = headers.join(',') + '\n';
    rows.forEach((row) => {
      csvContent += row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',') + '\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pid_filter_all_results_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast(`✅ Exported all ${allEntries.length} key(s) across ${groupedData.size} error code(s)`, 'success');
  }

  // ===== Clear =====

  function clearAll() {
    textarea.value = '';
    localStorage.removeItem('pidfilter-input');
    allEntries = [];
    groupedData = new Map();
    activeTab = null;
    textarea.focus();
    showToast('🗑️ Input cleared.', 'success');
  }

  // ===== Clipboard =====

  function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    // Fallback for older browsers / non-HTTPS
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  // ===== Toast =====

  let toastTimeout;
  function showToast(message, type = 'error') {
    toast.textContent = message;
    toast.className = 'toast' + (type === 'success' ? ' toast-success' : '');

    // Force reflow, then show
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  }

  // ===== Utility =====

  function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ===== Boot =====
  document.addEventListener('DOMContentLoaded', init);
})();
