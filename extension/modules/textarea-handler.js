// =============================================================================
// Textarea Handler - Manages textarea element replacement
// =============================================================================

export class TextareaHandler {
  constructor(selectors) {
    this.selectors = selectors;
    this.originalTextarea = null;
    this.replacementTextarea = null;
  }

  /**
   * Replace the entire textarea element with a new one containing Python code
   */
  replaceWithPython(pythonCode) {
    const textarea = document.querySelector(this.selectors.codeTextarea);
    if (!textarea) {
      console.warn("[Lens] Textarea not found for replacement");
      return null;
    }

    // Store original if we don't have it
    if (!this.originalTextarea) {
      this.originalTextarea = textarea;
    }

    // Create a new textarea with the Python code
    const newTextarea = textarea.cloneNode(true);

    // Remove readonly to allow value setting
    newTextarea.removeAttribute("aria-readonly");
    newTextarea.removeAttribute("readonly");

    // Set the Python code
    newTextarea.value = pythonCode;
    newTextarea.textContent = pythonCode;

    // Make it readonly again
    newTextarea.setAttribute("aria-readonly", "true");
    newTextarea.setAttribute("readonly", "true");

    // Replace in DOM
    textarea.parentNode.replaceChild(newTextarea, textarea);
    this.replacementTextarea = newTextarea;

    console.log(
      "[Lens] Textarea element completely replaced with Python code, length:",
      pythonCode.length
    );

    return this.originalTextarea.value;
  }

  /**
   * Restore the original textarea element
   */
  restore() {
    if (!this.replacementTextarea || !this.originalTextarea) {
      return;
    }

    // Replace back with original
    if (this.replacementTextarea.parentNode) {
      this.replacementTextarea.parentNode.replaceChild(
        this.originalTextarea,
        this.replacementTextarea
      );
    }

    this.replacementTextarea = null;
    this.originalTextarea = null;

    console.log("[Lens] Original textarea element restored");
  }

  /**
   * Reset state
   */
  reset() {
    this.originalTextarea = null;
    this.replacementTextarea = null;
  }
}
