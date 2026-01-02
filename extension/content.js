// Check if we're viewing a C++ file
function isCppFile() {
  const path = window.location.pathname;
  return path.endsWith('.cpp') || path.endsWith('.cc') || path.endsWith('.cxx') || path.endsWith('.h') || path.endsWith('.hpp');
}

// Create and inject the floating convert button
function createConvertButton() {
  // Only show button on C++ files
  if (!isCppFile()) {
    return;
  }
  
  const button = document.createElement('button');
  button.id = 'cpp-to-python-convert-btn';
  button.textContent = 'Convert to Python';
  button.className = 'cpp-to-python-btn';
  document.body.appendChild(button);
  
  button.addEventListener('click', handleConvert);
}

// Extract code from GitHub code viewer
function extractCode() {
  // Method 1: Try to get code from the read-only textarea (new GitHub UI)
  const textarea = document.querySelector('textarea#read-only-cursor-text-area[aria-label="file content"]');
  if (textarea && textarea.value) {
    return textarea.value;
  }
  
  // Method 2: Try alternative textarea selector
  const readOnlyTextarea = document.querySelector('textarea[readonly]');
  if (readOnlyTextarea && readOnlyTextarea.value) {
    return readOnlyTextarea.value;
  }
  
  // Method 3: Try to get code from the blob content div (old GitHub UI)
  const blobContent = document.querySelector('.blob-wrapper table');
  if (blobContent) {
    const lines = blobContent.querySelectorAll('td.blob-code');
    if (lines.length > 0) {
      return Array.from(lines)
        .map(line => line.textContent)
        .join('\n');
    }
  }
  
  // Method 4: Try raw text from pre tag
  const preElement = document.querySelector('.blob-wrapper pre');
  if (preElement) {
    return preElement.textContent;
  }
  
  // Method 5: Try Lines component
  const codeLines = document.querySelectorAll('[data-code-text]');
  if (codeLines.length > 0) {
    return Array.from(codeLines)
      .map(line => line.getAttribute('data-code-text'))
      .join('\n');
  }
  
  return null;
}

// Handle convert button click
async function handleConvert() {
  const code = extractCode();
  
  if (!code) {
    showOverlay('Error: Could not extract code from editor');
    return;
  }
  
  try {
    // const apiUrl = `${window.CONFIG.BACKEND_URL}${window.CONFIG.API_ENDPOINTS.CONVERT}`;
    const apiUrl = "https://vnw20xbg-8080.asse.devtunnels.ms/convert";
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    showOverlay(data.python_code || data.result || 'Conversion completed');
  } catch (error) {
    showOverlay(`Error: ${error.message}\n\nMake sure the backend server is running on ${window.CONFIG.BACKEND_URL}`);
  }
}

// Create and show overlay panel
function showOverlay(content) {
  // Remove existing overlay if any
  const existingOverlay = document.getElementById('cpp-to-python-overlay');
  if (existingOverlay) {
    existingOverlay.remove();
  }
  
  // Create overlay
  const overlay = document.createElement('div');
  overlay.id = 'cpp-to-python-overlay';
  overlay.className = 'cpp-to-python-overlay';
  
  overlay.innerHTML = `
    <div class="cpp-to-python-overlay-header">
      <h3>Python Code</h3>
      <button class="cpp-to-python-close-btn" id="cpp-to-python-close">×</button>
    </div>
    <div class="cpp-to-python-overlay-content">
      <pre><code>${escapeHtml(content)}</code></pre>
    </div>
    <div class="cpp-to-python-overlay-footer">
      <button class="cpp-to-python-copy-btn" id="cpp-to-python-copy">Copy to Clipboard</button>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Add event listeners
  document.getElementById('cpp-to-python-close').addEventListener('click', () => {
    overlay.remove();
  });
  
  document.getElementById('cpp-to-python-copy').addEventListener('click', () => {
    navigator.clipboard.writeText(content).then(() => {
      const copyBtn = document.getElementById('cpp-to-python-copy');
      const originalText = copyBtn.textContent;
      copyBtn.textContent = 'Copied!';
      setTimeout(() => {
        copyBtn.textContent = originalText;
      }, 2000);
    });
  });
}

// Utility function to escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Initialize when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', createConvertButton);
} else {
  createConvertButton();
}
