// =============================================================================
// Event Handlers - Drag, copy, keyboard, button, and mutation observer
// =============================================================================

import { DOMHelpers } from "./dom-helpers.js";

export class EventHandlers {
  constructor(config, state, callbacks) {
    this.config = config;
    this.state = state;
    this.callbacks = callbacks;

    // Bind event handlers
    this.handleDragStart = this.handleDragStart.bind(this);
    this.handleCopy = this.handleCopy.bind(this);
    this.handleKeydown = this.handleKeydown.bind(this);
  }

  // ===========================================================================
  // DRAG AND COPY EVENTS
  // ===========================================================================

  handleDragStart(e) {
    if (!this.state.active) return;

    e.stopPropagation();
    e.stopImmediatePropagation();

    const selection = window.getSelection();
    let selectedText = selection.toString();

    if (!selectedText) {
      selectedText = this.state.pythonFullCode;
    }

    if (e.dataTransfer.clearData) {
      e.dataTransfer.clearData();
    }

    e.dataTransfer.effectAllowed = "copy";
    e.dataTransfer.setData("text/plain", selectedText);
    e.dataTransfer.setData("text/html", selectedText);
    e.dataTransfer.setData("Text", selectedText);

    console.log(
      "[Lens] Drag intercepted - providing Python code:",
      selectedText.substring(0, 100)
    );
  }

  handleCopy(e) {
    if (!this.state.active) return;

    const selection = window.getSelection();
    const selectedText = selection.toString();

    if (selectedText) {
      e.preventDefault();
      e.clipboardData.setData("text/plain", selectedText);
      e.clipboardData.setData("text/html", selectedText);

      console.log("[Lens] Copy intercepted - providing Python code");
    }
  }

  setupDragAndCopyListeners() {
    document.addEventListener("dragstart", this.handleDragStart, true);

    const container = DOMHelpers.getCodeContainer(this.config.selectors);
    if (container) {
      container.addEventListener("dragstart", this.handleDragStart, true);
    }

    const textarea = document.querySelector(this.config.selectors.codeTextarea);
    if (textarea) {
      textarea.addEventListener("dragstart", this.handleDragStart, true);
    }

    document.addEventListener("copy", this.handleCopy, true);

    console.log("[Lens] Drag and copy event listeners set up");
  }

  removeDragAndCopyListeners() {
    document.removeEventListener("dragstart", this.handleDragStart, true);

    const container = DOMHelpers.getCodeContainer(this.config.selectors);
    if (container) {
      container.removeEventListener("dragstart", this.handleDragStart, true);
    }

    const textarea = document.querySelector(this.config.selectors.codeTextarea);
    if (textarea) {
      textarea.removeEventListener("dragstart", this.handleDragStart, true);
    }

    document.removeEventListener("copy", this.handleCopy, true);

    console.log("[Lens] Drag and copy event listeners removed");
  }

  // ===========================================================================
  // KEYBOARD SHORTCUTS
  // ===========================================================================

  handleKeydown(e) {
    if (e.altKey && e.key.toLowerCase() === "p") {
      e.preventDefault();
      if (
        this.state.button &&
        DOMHelpers.isGitHubBlobPage() &&
        DOMHelpers.isCppFile(this.config.supportedExtensions)
      ) {
        this.callbacks.onToggle();
      }
    }
  }

  setupKeyboardShortcuts() {
    document.addEventListener("keydown", this.handleKeydown);
  }

  removeKeyboardShortcuts() {
    document.removeEventListener("keydown", this.handleKeydown);
  }

  // ===========================================================================
  // MUTATION OBSERVER
  // ===========================================================================

  setupMutationObserver(onNewLines) {
    if (this.state.observer) {
      this.state.observer.disconnect();
    }

    const container = DOMHelpers.getCodeContainer(this.config.selectors);
    if (!container) {
      console.warn("[Lens] Could not find code container for observer");
      return;
    }

    this.state.observer = new MutationObserver((mutations) => {
      if (!this.state.active) return;

      let hasNewNodes = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          hasNewNodes = true;
          break;
        }
      }

      if (hasNewNodes) {
        requestAnimationFrame(() => {
          onNewLines();
        });
      }
    });

    this.state.observer.observe(container, {
      childList: true,
      subtree: true,
    });

    console.log("[Lens] MutationObserver set up");
  }

  disconnectObserver() {
    if (this.state.observer) {
      this.state.observer.disconnect();
      this.state.observer = null;
    }
  }

  // ===========================================================================
  // BUTTON UI
  // ===========================================================================

  createButton(onClick) {
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
      backgroundColor: this.config.buttonInactiveColor,
      color: "white",
      border: "none",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
      cursor: "pointer",
      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
      transition: "all 0.2s ease",
      fontFamily:
        '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    });

    button.addEventListener("mouseenter", () => {
      if (!this.state.isConverting) {
        button.style.transform = "translateY(-2px)";
        button.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
      }
    });

    button.addEventListener("mouseleave", () => {
      button.style.transform = "translateY(0)";
      button.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
    });

    button.addEventListener("click", onClick);

    document.body.appendChild(button);
    this.state.button = button;

    console.log("[Lens] Button created");
  }

  updateButtonState() {
    if (!this.state.button) return;

    if (this.state.isConverting) {
      this.state.button.textContent = "Converting...";
      this.state.button.disabled = true;
      this.state.button.style.backgroundColor = "#9ca3af";
      this.state.button.style.cursor = "wait";
    } else if (this.state.active) {
      this.state.button.textContent = "Show Original (C++)";
      this.state.button.disabled = false;
      this.state.button.style.backgroundColor = this.config.buttonActiveColor;
      this.state.button.style.cursor = "pointer";
    } else {
      this.state.button.textContent = "Convert to Python";
      this.state.button.disabled = false;
      this.state.button.style.backgroundColor = this.config.buttonInactiveColor;
      this.state.button.style.cursor = "pointer";
    }
  }

  removeButton() {
    if (this.state.button) {
      this.state.button.remove();
      this.state.button = null;
    }
  }
}
