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
  // STATE
  // ===========================================================================
  const lensState = {
    active: false,
    pythonLines: [],
    pythonFullCode: "",

    originalState: {
      textareaValue: "",
      // WeakMap allows garbage collection when elements are removed from DOM
      elementData: new WeakMap(),  // element -> { originalHTML, originalWhiteSpace, originalTabSize, lineNum }
      lineNumbers: [],  // Track which line numbers we've processed
    },

    observer: null,
    button: null,
    isConverting: false,
  };

  // ===========================================================================
  // INITIALIZE HANDLERS
  // ===========================================================================
  const textareaHandler = new TextareaHandler(LENS_CONFIG.selectors);
  const eventHandlers = new EventHandlers(LENS_CONFIG, lensState, {
    onToggle: handleButtonClick,
  });

  // ===========================================================================
  // CORE LENS FUNCTIONS
  // ===========================================================================

  function storeOriginalState() {
    const textarea = document.querySelector(LENS_CONFIG.selectors.codeTextarea);
    if (textarea) {
      lensState.originalState.textareaValue = textarea.value;
    }

    const lineElements = DOMHelpers.getCodeLineElements(LENS_CONFIG.selectors);
    
    lineElements.forEach((el) => {
      const lineNum = DOMHelpers.getLineNumber(el);
      
      lensState.originalState.elementData.set(el, {
        originalHTML: el.innerHTML,
        originalWhiteSpace: el.style.whiteSpace,
        originalTabSize: el.style.tabSize,
        lineNum: lineNum,
      });
      
      if (!lensState.originalState.lineNumbers.includes(lineNum)) {
        lensState.originalState.lineNumbers.push(lineNum);
      }
    });

    console.log(
      "[Lens] Stored original state for",
      lineElements.length,
      "lines"
    );
  }

  function replaceWithPython() {
    const lineElements = DOMHelpers.getCodeLineElements(LENS_CONFIG.selectors);

    lineElements.forEach((el) => {
      const lineNum = DOMHelpers.getLineNumber(el);
      if (lineNum === null || lineNum < 1) return;

      const pythonLine = lensState.pythonLines[lineNum - 1];
      const displayText = pythonLine !== undefined ? pythonLine : "";

      DOMHelpers.applyPythonToElement(el, displayText, LENS_CONFIG.pythonColor);
    });

    // Update the textarea
    textareaHandler.replaceWithPython(lensState.pythonFullCode);

    console.log("[Lens] Replaced", lineElements.length, "lines with Python");
  }

  function restoreOriginal() {
    const lineElements = DOMHelpers.getCodeLineElements(LENS_CONFIG.selectors);
    
    lineElements.forEach((element) => {
      const data = lensState.originalState.elementData.get(element);
      if (data && element.isConnected) {
        element.innerHTML = data.originalHTML;
        element.style.whiteSpace = data.originalWhiteSpace || "";
        element.style.tabSize = data.originalTabSize || "";
      }
    });

    textareaHandler.restore();

    console.log("[Lens] Restored original C++ code");
  }

  function handleNewLines() {
    if (!lensState.active) return;

    const lineElements = DOMHelpers.getCodeLineElements(LENS_CONFIG.selectors);

    lineElements.forEach((el) => {
      const isAlreadyProcessed = el.querySelector(".pl-lens-python") !== null;
      if (isAlreadyProcessed) return;

      const stored = lensState.originalState.elementData.has(el);

      if (!stored) {
        const lineNum = DOMHelpers.getLineNumber(el);
        if (lineNum === null || lineNum < 1) return;

        // Store in WeakMap with all CSS properties
        lensState.originalState.elementData.set(el, {
          originalHTML: el.innerHTML,
          originalWhiteSpace: el.style.whiteSpace,
          originalTabSize: el.style.tabSize,
          lineNum: lineNum,
        });

        if (!lensState.originalState.lineNumbers.includes(lineNum)) {
          lensState.originalState.lineNumbers.push(lineNum);
        }

        const pythonLine = lensState.pythonLines[lineNum - 1];
        const displayText = pythonLine !== undefined ? pythonLine : "";

        DOMHelpers.applyPythonToElement(
          el,
          displayText,
          LENS_CONFIG.pythonColor
        );
      }
    });
  }

  function activateLens(pythonCode, pythonLines) {
    lensState.pythonFullCode = pythonCode;
    lensState.pythonLines = pythonLines;

    console.log("[Lens] Activating with", pythonLines.length, "lines");

    storeOriginalState();
    replaceWithPython();
    eventHandlers.setupMutationObserver(handleNewLines);
    eventHandlers.setupDragAndCopyListeners();

    lensState.active = true;
    eventHandlers.updateButtonState();

    console.log("[Lens] Activated - Python code now displayed");
  }

  function deactivateLens() {
    eventHandlers.disconnectObserver();
    eventHandlers.removeDragAndCopyListeners();

    restoreOriginal();

    // Log memory stats for large files
    if (lensState.originalState.lineNumbers.length > 1000) {
      console.warn(
        `[Lens] Large file: tracked ${lensState.originalState.lineNumbers.length} lines`
      );
    }

    // Clear WeakMap by creating new instance (allows GC of detached elements)
    lensState.originalState.elementData = new WeakMap();
    lensState.originalState.lineNumbers = [];
    lensState.originalState.textareaValue = "";
    lensState.active = false;

    eventHandlers.updateButtonState();

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
  // BUTTON HANDLER
  // ===========================================================================

  async function handleButtonClick() {
    if (lensState.isConverting) return;

    if (lensState.active) {
      deactivateLens();
    } else {
      if (lensState.pythonLines.length > 0) {
        activateLens(lensState.pythonFullCode, lensState.pythonLines);
      } else {
        const cppCode = DOMHelpers.extractCppCode(LENS_CONFIG.selectors);
        if (!cppCode) {
          console.error("[Lens] Could not extract C++ code");
          alert("Could not extract code from this page.");
          return;
        }

        console.log("[Lens] Extracting and converting C++ code...");
        lensState.isConverting = true;
        eventHandlers.updateButtonState();

        try {
          const result = await convertCode(cppCode);
          lensState.isConverting = false;
          activateLens(result.python, result.lines);
        } catch (error) {
          lensState.isConverting = false;
          eventHandlers.updateButtonState();
          console.error("[Lens] Conversion error:", error);
          alert(`Conversion failed: ${error.message}`);
        }
      }
    }
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
    lensState.originalState.elementData = new WeakMap();
    lensState.originalState.lineNumbers = [];
    lensState.originalState.textareaValue = "";

    textareaHandler.reset();
  }

  function initializeLens() {
    resetLensState();

    if (
      !DOMHelpers.isGitHubBlobPage() ||
      !DOMHelpers.isCppFile(LENS_CONFIG.supportedExtensions)
    ) {
      eventHandlers.removeButton();
      return;
    }

    if (!lensState.button || !lensState.button.isConnected) {
      eventHandlers.createButton(handleButtonClick);
    }

    eventHandlers.updateButtonState();
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
  // MAIN
  // ===========================================================================

  function main() {
    console.log("[Lens] C++ to Python Lens loaded");
    initializeLens();
    setupNavigationDetection();
    eventHandlers.setupKeyboardShortcuts();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", main);
  } else {
    main();
  }
})();
