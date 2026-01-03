// =============================================================================
// LeetCode C++ to Python Lens - Content Script
// =============================================================================
// Simple approach: Store original code, completely replace with Python,
// restore original when toggling back. No overlays, no fighting with GitHub's
// textarea - just clean DOM replacement.
// =============================================================================

(function () {
  "use strict";

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================
  const LENS_CONFIG = {
    pythonColor: "#2563eb",
    buttonActiveColor: "#16a34a",
    buttonInactiveColor: "#2563eb",

    selectors: {
      codeTextarea: '#read-only-cursor-text-area[aria-label="file content"]',
      reactLineContents: ".react-code-line-contents-no-virtualization",
      reactLineById: '[id^="LC"]',
      reactCodeContainer: ".react-code-lines",
      reactBlobCode: '[data-testid="blob-code"]',
      legacyBlobCode: ".blob-wrapper table td.blob-code",
      legacyBlobPre: ".blob-wrapper pre",
    },

    supportedExtensions: [".cpp", ".cc", ".cxx", ".hpp", ".h"],
  };

  // ===========================================================================
  // LENS STATE
  // ===========================================================================
  const lensState = {
    active: false,
    pythonLines: [],
    pythonFullCode: "",
    
    // Store original state for complete restoration
    originalState: {
      textareaValue: "",
      lineElements: [], // Array of { element, originalHTML }
    },
    
    observer: null,
    button: null,
    isConverting: false,
  };

  // ===========================================================================
  // UTILITY FUNCTIONS
  // ===========================================================================

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Create the HTML for a Python line, matching GitHub's code structure
   */
  function createPythonLineHTML(displayText) {
    if (displayText === "") {
      // Empty line - use a regular space to maintain line height
      return `<span class="pl-lens-python" style="color: ${LENS_CONFIG.pythonColor};"> </span>`;
    } else {
      // For non-empty lines, preserve all whitespace exactly
      const escapedContent = escapeHtml(displayText);
      return `<span class="pl-lens-python" style="color: ${LENS_CONFIG.pythonColor}; white-space: pre;">${escapedContent}</span>`;
    }
  }

  /**
   * Apply Python content to a line element
   */
  function applyPythonToElement(el, displayText) {
    // Set the innerHTML with our Python content
    el.innerHTML = createPythonLineHTML(displayText);
    
    // Also ensure the parent element preserves whitespace
    // This is crucial for indentation to display correctly
    el.style.whiteSpace = "pre";
    el.style.tabSize = "4";
  }

  function isCppFile() {
    const path = window.location.pathname;
    return LENS_CONFIG.supportedExtensions.some((ext) =>
      path.toLowerCase().endsWith(ext)
    );
  }

  function isGitHubBlobPage() {
    return (
      window.location.hostname === "github.com" &&
      window.location.pathname.includes("/blob/")
    );
  }

  function getLineNumber(el) {
    if (el.id) {
      const idMatch = el.id.match(/^LC(\d+)$/);
      if (idMatch) return parseInt(idMatch[1], 10);
    }

    if (el.dataset?.lineNumber) {
      return parseInt(el.dataset.lineNumber, 10);
    }

    const rowWithData = el.closest("[data-line-number]");
    if (rowWithData) {
      return parseInt(rowWithData.dataset.lineNumber, 10);
    }

    const parentRow = el.closest(".react-code-line");
    if (parentRow) {
      const lineNumEl = parentRow.querySelector(".react-line-number");
      if (lineNumEl) {
        return parseInt(lineNumEl.textContent, 10);
      }
    }

    const tableRow = el.closest("tr");
    if (tableRow) {
      const lineNumCell = tableRow.querySelector(".blob-num");
      if (lineNumCell) {
        const num = parseInt(lineNumCell.textContent || lineNumCell.dataset?.lineNumber, 10);
        if (!isNaN(num)) return num;
      }
    }

    return null;
  }

  function extractCppCode() {
    const textarea = document.querySelector(LENS_CONFIG.selectors.codeTextarea);
    if (textarea && textarea.value) {
      return textarea.value;
    }

    const lineSelectors = [
      LENS_CONFIG.selectors.reactLineContents,
      LENS_CONFIG.selectors.reactLineById,
      LENS_CONFIG.selectors.legacyBlobCode,
    ];

    for (const selector of lineSelectors) {
      const lines = document.querySelectorAll(selector);
      if (lines.length > 0) {
        const codeLines = [];
        lines.forEach((el) => {
          const lineNum = getLineNumber(el);
          if (lineNum !== null) {
            while (codeLines.length < lineNum) {
              codeLines.push("");
            }
            codeLines[lineNum - 1] = el.textContent || "";
          }
        });
        return codeLines.join("\n");
      }
    }

    const preBlock = document.querySelector(LENS_CONFIG.selectors.legacyBlobPre);
    if (preBlock) {
      return preBlock.textContent;
    }

    return null;
  }

  function getCodeLineElements() {
    let elements = document.querySelectorAll(LENS_CONFIG.selectors.reactLineContents);
    if (elements.length > 0) return Array.from(elements);

    elements = document.querySelectorAll(LENS_CONFIG.selectors.reactLineById);
    if (elements.length > 0) return Array.from(elements);

    elements = document.querySelectorAll(LENS_CONFIG.selectors.legacyBlobCode);
    if (elements.length > 0) return Array.from(elements);

    return [];
  }

  function getCodeContainer() {
    return (
      document.querySelector(LENS_CONFIG.selectors.reactBlobCode) ||
      document.querySelector(LENS_CONFIG.selectors.reactCodeContainer) ||
      document.querySelector(".blob-wrapper")
    );
  }

  // ===========================================================================
  // CORE LENS FUNCTIONS - SIMPLE REPLACEMENT APPROACH
  // ===========================================================================

  /**
   * Store the original state of all code elements
   */
  function storeOriginalState() {
    // Store textarea value
    const textarea = document.querySelector(LENS_CONFIG.selectors.codeTextarea);
    if (textarea) {
      lensState.originalState.textareaValue = textarea.value;
    }

    // Store each line element's original HTML and styles
    const lineElements = getCodeLineElements();
    lensState.originalState.lineElements = lineElements.map((el) => ({
      element: el,
      originalHTML: el.innerHTML,
      originalWhiteSpace: el.style.whiteSpace,
      originalTabSize: el.style.tabSize,
      lineNum: getLineNumber(el),
    }));

    console.log("[Lens] Stored original state for", lineElements.length, "lines");
  }

  /**
   * Replace all code lines with Python code
   * 
   * GitHub renders code with the text content directly inside spans.
   * The leading whitespace is preserved as part of the text.
   * We need to mimic this exact structure.
   */
  function replaceWithPython() {
    const lineElements = getCodeLineElements();

    lineElements.forEach((el) => {
      const lineNum = getLineNumber(el);
      if (lineNum === null || lineNum < 1) return;

      const pythonLine = lensState.pythonLines[lineNum - 1];
      const displayText = pythonLine !== undefined ? pythonLine : "";

      // Apply Python content using our helper
      applyPythonToElement(el, displayText);
    });

    // Also update the textarea so copy from GitHub's native mechanism works
    const textarea = document.querySelector(LENS_CONFIG.selectors.codeTextarea);
    if (textarea) {
      textarea.value = lensState.pythonFullCode;
    }

    console.log("[Lens] Replaced", lineElements.length, "lines with Python");
  }

  /**
   * Restore original C++ code
   */
  function restoreOriginal() {
    // Restore each line element's HTML and styles
    lensState.originalState.lineElements.forEach(({ element, originalHTML, originalWhiteSpace, originalTabSize }) => {
      if (element.isConnected) {
        element.innerHTML = originalHTML;
        element.style.whiteSpace = originalWhiteSpace || "";
        element.style.tabSize = originalTabSize || "";
      }
    });

    // Restore textarea
    const textarea = document.querySelector(LENS_CONFIG.selectors.codeTextarea);
    if (textarea && lensState.originalState.textareaValue) {
      textarea.value = lensState.originalState.textareaValue;
    }

    console.log("[Lens] Restored original C++ code");
  }

  /**
   * Handle new lines added by GitHub's virtualized scrolling
   */
  function handleNewLines() {
    if (!lensState.active) return;

    const lineElements = getCodeLineElements();
    
    lineElements.forEach((el) => {
      // Check if this element was already processed
      const isAlreadyProcessed = el.querySelector('.pl-lens-python') !== null;
      if (isAlreadyProcessed) return;

      // Check if we have this element stored
      const stored = lensState.originalState.lineElements.find(
        (item) => item.element === el
      );

      if (!stored) {
        // New element - store its original HTML and replace with Python
        const lineNum = getLineNumber(el);
        if (lineNum === null || lineNum < 1) return;

        lensState.originalState.lineElements.push({
          element: el,
          originalHTML: el.innerHTML,
          lineNum: lineNum,
        });

        const pythonLine = lensState.pythonLines[lineNum - 1];
        const displayText = pythonLine !== undefined ? pythonLine : "";

        // Apply Python content using our helper
        applyPythonToElement(el, displayText);
      }
    });
  }

  /**
   * Set up MutationObserver for virtualized scrolling
   */
  function setupMutationObserver() {
    if (lensState.observer) {
      lensState.observer.disconnect();
    }

    const container = getCodeContainer();
    if (!container) {
      console.warn("[Lens] Could not find code container for observer");
      return;
    }

    lensState.observer = new MutationObserver((mutations) => {
      if (!lensState.active) return;

      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }

      if (hasNewNodes) {
        requestAnimationFrame(() => {
          handleNewLines();
        });
      }
    });

    lensState.observer.observe(container, {
      childList: true,
      subtree: true,
    });

    console.log("[Lens] MutationObserver set up");
  }

  /**
   * Activate the lens
   */
  function activateLens(pythonCode, pythonLines) {
    lensState.pythonFullCode = pythonCode;
    lensState.pythonLines = pythonLines;

    console.log("[Lens] Activating with", pythonLines.length, "lines");

    // Store original state FIRST
    storeOriginalState();

    // Replace with Python
    replaceWithPython();

    // Set up observer for scroll virtualization
    setupMutationObserver();

    lensState.active = true;
    updateButtonState();

    console.log("[Lens] Activated - Python code now displayed");
  }

  /**
   * Deactivate the lens
   */
  function deactivateLens() {
    // Disconnect observer
    if (lensState.observer) {
      lensState.observer.disconnect();
      lensState.observer = null;
    }

    // Restore original
    restoreOriginal();

    // Clear stored state
    lensState.originalState.lineElements = [];
    lensState.originalState.textareaValue = "";

    lensState.active = false;
    updateButtonState();

    console.log("[Lens] Deactivated - Original C++ code restored");
  }

  // ===========================================================================
  // BACKEND COMMUNICATION
  // ===========================================================================

  async function convertCode(cppCode) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        { action: "convertCode", code: cppCode },
        (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          if (response && response.success) {
            const data = response.data;
            let lines = data.lines;
            if (!lines || lines.length === 0) {
              lines = data.python.split("\n");
            }
            resolve({
              python: data.python,
              lines: lines,
            });
          } else {
            reject(new Error(response?.error || "Conversion failed"));
          }
        }
      );
    });
  }

  // ===========================================================================
  // UI COMPONENTS
  // ===========================================================================

  function updateButtonState() {
    if (!lensState.button) return;

    if (lensState.isConverting) {
      lensState.button.textContent = "Converting...";
      lensState.button.disabled = true;
      lensState.button.style.backgroundColor = "#9ca3af";
      lensState.button.style.cursor = "wait";
    } else if (lensState.active) {
      lensState.button.textContent = "Show Original (C++)";
      lensState.button.disabled = false;
      lensState.button.style.backgroundColor = LENS_CONFIG.buttonActiveColor;
      lensState.button.style.cursor = "pointer";
    } else {
      lensState.button.textContent = "Convert to Python";
      lensState.button.disabled = false;
      lensState.button.style.backgroundColor = LENS_CONFIG.buttonInactiveColor;
      lensState.button.style.cursor = "pointer";
    }
  }

  async function handleButtonClick() {
    if (lensState.isConverting) return;

    if (lensState.active) {
      deactivateLens();
    } else {
      // Check if we already have converted code cached
      if (lensState.pythonLines.length > 0) {
        activateLens(lensState.pythonFullCode, lensState.pythonLines);
      } else {
        const cppCode = extractCppCode();
        if (!cppCode) {
          console.error("[Lens] Could not extract C++ code");
          alert("Could not extract code from this page.");
          return;
        }

        console.log("[Lens] Extracting and converting C++ code...");
        lensState.isConverting = true;
        updateButtonState();

        try {
          const result = await convertCode(cppCode);
          lensState.isConverting = false;
          activateLens(result.python, result.lines);
        } catch (error) {
          lensState.isConverting = false;
          updateButtonState();
          console.error("[Lens] Conversion error:", error);
          alert(`Conversion failed: ${error.message}`);
        }
      }
    }
  }

  function createButton() {
    const existing = document.getElementById("lens-toggle-button");
    if (existing) existing.remove();

    const button = document.createElement("button");
    button.id = "lens-toggle-button";
    button.textContent = "Convert to Python";

    Object.assign(button.style, {
      position: "fixed",
      bottom: "20px",
      right: "20px",
      zIndex: "10000",
      padding: "12px 20px",
      backgroundColor: LENS_CONFIG.buttonInactiveColor,
      color: "white",
      border: "none",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      transition: "all 0.2s ease",
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });

    button.addEventListener("mouseenter", () => {
      if (!lensState.isConverting) {
        button.style.transform = "translateY(-2px)";
        button.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
      }
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    });

    button.addEventListener("click", handleButtonClick);

    document.body.appendChild(button);
    lensState.button = button;

    console.log("[Lens] Button created");
  }

  // ===========================================================================
  // NAVIGATION HANDLING
  // ===========================================================================

  function resetLensState() {
    if (lensState.active) {
      deactivateLens();
    }
    lensState.pythonLines = [];
    lensState.pythonFullCode = "";
    lensState.originalState.lineElements = [];
    lensState.originalState.textareaValue = "";
  }

  function initializeLens() {
    resetLensState();

    if (!isGitHubBlobPage() || !isCppFile()) {
      if (lensState.button) {
        lensState.button.remove();
        lensState.button = null;
      }
      return;
    }

    if (!lensState.button || !lensState.button.isConnected) {
      createButton();
    }

    updateButtonState();
    console.log("[Lens] Initialized for C++ file");
  }

  function setupNavigationDetection() {
    let lastUrl = window.location.href;

    setInterval(() => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        console.log("[Lens] Navigation detected");
        setTimeout(initializeLens, 500);
      }
    }, 500);

    window.addEventListener("popstate", () => {
      setTimeout(initializeLens, 500);
    });

    document.addEventListener("turbo:load", () => {
      setTimeout(initializeLens, 100);
    });

    document.addEventListener("turbo:render", () => {
      setTimeout(initializeLens, 100);
    });
  }

  // ===========================================================================
  // KEYBOARD SHORTCUTS
  // ===========================================================================

  function setupKeyboardShortcuts() {
    document.addEventListener("keydown", (e) => {
      if (e.altKey && e.key.toLowerCase() === "p") {
        e.preventDefault();
        if (lensState.button && isGitHubBlobPage() && isCppFile()) {
          handleButtonClick();
        }
      }
    });
  }

  // ===========================================================================
  // MAIN
  // ===========================================================================

  function main() {
    console.log("[Lens] C++ to Python Lens loaded");
    initializeLens();
    setupNavigationDetection();
    setupKeyboardShortcuts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();