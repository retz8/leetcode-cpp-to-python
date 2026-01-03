// =============================================================================
// DOM Helpers - GitHub DOM queries and code manipulation
// =============================================================================

export const DOMHelpers = {
  /**
   * Escape HTML for safe rendering
   */
  escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  },

  /**
   * Create the HTML for a Python line, matching GitHub's code structure
   */
  createPythonLineHTML(displayText, pythonColor) {
    if (displayText === "") {
      return `<span class="pl-lens-python" style="color: ${pythonColor};"> </span>`;
    } else {
      const escapedContent = this.escapeHtml(displayText);
      return `<span class="pl-lens-python" style="color: ${pythonColor}; white-space: pre;">${escapedContent}</span>`;
    }
  },

  /**
   * Apply Python content to a line element
   */
  applyPythonToElement(el, displayText, pythonColor) {
    el.innerHTML = this.createPythonLineHTML(displayText, pythonColor);
    el.style.whiteSpace = "pre";
    el.style.tabSize = "4";
  },

  /**
   * Check if current page is a C++ file
   */
  isCppFile(supportedExtensions) {
    const path = window.location.pathname;
    return supportedExtensions.some((ext) => path.toLowerCase().endsWith(ext));
  },

  /**
   * Check if current page is a GitHub blob page
   */
  isGitHubBlobPage() {
    return (
      window.location.hostname === "github.com" &&
      window.location.pathname.includes("/blob/")
    );
  },

  /**
   * Extract line number from element
   */
  getLineNumber(el) {
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
        const num = parseInt(
          lineNumCell.textContent || lineNumCell.dataset?.lineNumber,
          10
        );
        if (!isNaN(num)) return num;
      }
    }

    return null;
  },

  /**
   * Extract C++ code from the page
   */
  extractCppCode(selectors) {
    const textarea = document.querySelector(selectors.codeTextarea);
    if (textarea && textarea.value) {
      return textarea.value;
    }

    const lineSelectors = [
      selectors.reactLineContents,
      selectors.reactLineById,
      selectors.legacyBlobCode,
    ];

    for (const selector of lineSelectors) {
      const lines = document.querySelectorAll(selector);
      if (lines.length > 0) {
        const codeLines = [];
        lines.forEach((el) => {
          const lineNum = this.getLineNumber(el);
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

    const preBlock = document.querySelector(selectors.legacyBlobPre);
    if (preBlock) {
      return preBlock.textContent;
    }

    return null;
  },

  /**
   * Get all code line elements
   */
  getCodeLineElements(selectors) {
    let elements = document.querySelectorAll(selectors.reactLineContents);
    if (elements.length > 0) return Array.from(elements);

    elements = document.querySelectorAll(selectors.reactLineById);
    if (elements.length > 0) return Array.from(elements);

    elements = document.querySelectorAll(selectors.legacyBlobCode);
    if (elements.length > 0) return Array.from(elements);

    return [];
  },

  /**
   * Get code container element
   */
  getCodeContainer(selectors) {
    return (
      document.querySelector(selectors.reactBlobCode) ||
      document.querySelector(selectors.reactCodeContainer) ||
      document.querySelector(".blob-wrapper")
    );
  },
};
