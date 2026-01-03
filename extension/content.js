// Global lens state
let lensState = { active: false, cleanup: null };
let convertButton = null;

// Check if we're viewing a C++ file
function isCppFile() {
  const path = window.location.pathname;
  return path.endsWith('.cpp') || path.endsWith('.cc') || path.endsWith('.cxx') || path.endsWith('.h') || path.endsWith('.hpp');
}

// Create and inject the floating convert button
function createConvertButton() {
  if (!isCppFile()) {
    return;
  }
  
  convertButton = document.createElement('button');
  convertButton.id = 'cpp-to-python-convert-btn';
  convertButton.textContent = 'Convert to Python';
  convertButton.className = 'cpp-to-python-btn';
  document.body.appendChild(convertButton);
  
  convertButton.addEventListener('click', onConvertButtonClick);
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

function normalizePythonLines(data) {
  if (!data) return [];
  if (Array.isArray(data.lines)) return data.lines.map(String);
  if (Array.isArray(data.python_lines)) return data.python_lines.map(String);
  const block = data.python || data.python_code || data.result || '';
  if (typeof block === 'string') {
    return block.split(/\r?\n/);
  }
  return [];
}

function getCodeContext() {
  const textarea = document.querySelector('textarea#read-only-cursor-text-area[aria-label="file content"]') || document.querySelector('textarea[readonly]');
  if (textarea) {
    const renderedLines = document.querySelectorAll('.react-code-line-contents-no-virtualization, [id^="LC"]');
    return { type: 'textarea', textarea, renderedLines: Array.from(renderedLines) };
  }
  const tableLines = document.querySelectorAll('.blob-wrapper table td.blob-code');
  if (tableLines && tableLines.length) {
    return { type: 'table', lines: Array.from(tableLines) };
  }
  const preElement = document.querySelector('.blob-wrapper pre');
  if (preElement) {
    return { type: 'pre', pre: preElement };
  }
  return null;
}

function applyLens(pythonLines) {
  const context = getCodeContext();
  if (!context) {
    throw new Error('Could not find a compatible GitHub code viewer');
  }
  if (context.type === 'textarea') {
    return applyTextareaLens(context.textarea, pythonLines, context.renderedLines || []);
  }
  if (context.type === 'table') {
    return applyTableLens(context.lines, pythonLines);
  }
  return applyPreLens(context.pre, pythonLines);
}

function applyTextareaLens(textarea, pythonLines, renderedLines) {
  const parent = textarea.parentElement;
  const parentComputedPosition = getComputedStyle(parent).position;
  const restoreParentPosition = parent.style.position;
  if (parentComputedPosition === 'static') {
    parent.style.position = 'relative';
  }

  const overlay = document.createElement('div');
  overlay.className = 'cpp-lens-overlay';
  const overlayPre = document.createElement('pre');
  overlayPre.className = 'cpp-lens-overlay-pre';
  overlayPre.textContent = pythonLines.join('\n');
  overlay.appendChild(overlayPre);
  parent.appendChild(overlay);

  const computed = getComputedStyle(textarea);
  overlay.style.position = 'absolute';
  overlay.style.pointerEvents = 'none';
  overlay.style.background = computed.backgroundColor || 'transparent';
  overlay.style.whiteSpace = 'pre';
  overlay.style.overflow = 'hidden';
  overlay.style.font = computed.font;
  overlay.style.lineHeight = computed.lineHeight;
  overlay.style.padding = computed.padding;
  overlay.style.left = `${textarea.offsetLeft}px`;
  overlay.style.top = `${textarea.offsetTop}px`;
  overlay.style.width = `${textarea.offsetWidth}px`;
  overlay.style.height = `${textarea.offsetHeight}px`;
  overlay.style.zIndex = '2';
  overlayPre.style.margin = '0';
  overlayPre.style.color = '#d4d4d4';
  overlayPre.style.whiteSpace = 'pre';

  const originalStyles = {
    color: textarea.style.color,
    caretColor: textarea.style.caretColor,
    pointerEvents: textarea.style.pointerEvents
  };

  textarea.classList.add('cpp-lens-hidden-text');
  textarea.style.pointerEvents = 'auto';

  const syncScroll = () => {
    overlayPre.style.transform = `translateY(-${textarea.scrollTop}px)`;
  };
  const syncPosition = () => {
    overlay.style.left = `${textarea.offsetLeft}px`;
    overlay.style.top = `${textarea.offsetTop}px`;
    overlay.style.width = `${textarea.offsetWidth}px`;
    overlay.style.height = `${textarea.offsetHeight}px`;
  };

  // Replace rendered lines in the React view if present
  const renderedOriginals = renderedLines.map(node => node.textContent);
  if (renderedLines.length) {
    const padded = [...pythonLines];
    while (padded.length < renderedLines.length) padded.push('');
    renderedLines.forEach((node, idx) => {
      node.textContent = padded[idx] ?? '';
      node.classList.add('cpp-lens-table-line');
    });
  }

  textarea.addEventListener('scroll', syncScroll);
  const resizeObserver = new ResizeObserver(() => {
    syncPosition();
  });
  resizeObserver.observe(textarea);
  syncPosition();
  syncScroll();

  return () => {
    resizeObserver.disconnect();
    textarea.removeEventListener('scroll', syncScroll);
    if (renderedLines.length) {
      renderedLines.forEach((node, idx) => {
        node.textContent = renderedOriginals[idx];
        node.classList.remove('cpp-lens-table-line');
      });
    }
    textarea.classList.remove('cpp-lens-hidden-text');
    textarea.style.color = originalStyles.color;
    textarea.style.caretColor = originalStyles.caretColor;
    textarea.style.pointerEvents = originalStyles.pointerEvents;
    overlay.remove();
    parent.style.position = restoreParentPosition;
  };
}

function applyTableLens(lineNodes, pythonLines) {
  const originals = lineNodes.map(node => node.textContent);
  const padded = [...pythonLines];
  while (padded.length < lineNodes.length) {
    padded.push('');
  }
  lineNodes.forEach((node, idx) => {
    node.textContent = padded[idx];
    node.classList.add('cpp-lens-table-line');
  });
  return () => {
    lineNodes.forEach((node, idx) => {
      node.textContent = originals[idx];
      node.classList.remove('cpp-lens-table-line');
    });
  };
}

function applyPreLens(preElement, pythonLines) {
  const original = preElement.textContent;
  preElement.textContent = pythonLines.join('\n');
  preElement.classList.add('cpp-lens-table-line');
  return () => {
    preElement.textContent = original;
    preElement.classList.remove('cpp-lens-table-line');
  };
}

// Handle convert button click with lens toggle
async function onConvertButtonClick() {
  if (lensState.active) {
    removeLens();
    return;
  }
  await handleConvert();
}

async function handleConvert() {
  const code = extractCode();
  
  if (!code) {
    showOverlay('Error: Could not extract code from editor');
    return;
  }
  
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'convertCode',
      code: code
    });
    
    if (!response.success) {
      throw new Error(response.error);
    }
    
    const pythonLines = normalizePythonLines(response.data);
    if (!pythonLines.length) {
      throw new Error('No translated Python code returned');
    }
    
    // Remove any previous lens before applying a new one
    removeLens();
    const cleanup = applyLens(pythonLines);
    lensState = { active: true, cleanup };
    updateButtonLabel();
  } catch (error) {
    showOverlay(`Error: ${error.message}\n\nMake sure the backend server is running.`);
  }
}

function removeLens() {
  if (lensState.cleanup) {
    lensState.cleanup();
  }
  lensState = { active: false, cleanup: null };
  updateButtonLabel();
}

function updateButtonLabel() {
  if (!convertButton) return;
  convertButton.textContent = lensState.active ? 'Show Original (C++)' : 'Convert to Python';
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
