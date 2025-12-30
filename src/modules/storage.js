/**
 * Storage module with GM → localStorage → memory fallback
 * Handles userscript storage across different environments
 */

export class Storage {
  constructor() {
    this.memory = new Map();
    this.namespace = '__neutralizer__';
  }

  /**
   * Get value from storage with fallback chain
   * @param {string} key - Storage key
   * @param {any} defaultValue - Default value if not found
   * @returns {Promise<any>}
   */
  async get(key, defaultValue = '') {
    // Try GM.getValue (async)
    try {
      if (typeof GM?.getValue === 'function') {
        const value = await GM.getValue(key);
        if (value != null) return value;
      }
    } catch {}

    // Try GM_getValue (sync, legacy)
    try {
      if (typeof GM_getValue === 'function') {
        const value = GM_getValue(key);
        if (value != null) return value;
      }
    } catch {}

    // Try localStorage
    try {
      const bag = JSON.parse(localStorage.getItem(this.namespace) || '{}');
      if (key in bag) return bag[key];
    } catch {}

    // Try memory fallback
    if (this.memory.has(key)) {
      return this.memory.get(key);
    }

    return defaultValue;
  }

  /**
   * Set value in storage with fallback chain
   * @param {string} key - Storage key
   * @param {any} value - Value to store
   * @returns {Promise<boolean>} - Success status
   */
  async set(key, value) {
    let success = false;

    // Try GM.setValue (async)
    try {
      if (typeof GM?.setValue === 'function') {
        await GM.setValue(key, value);
        success = true;
      }
    } catch {}

    // Try GM_setValue (sync, legacy)
    if (!success) {
      try {
        if (typeof GM_setValue === 'function') {
          GM_setValue(key, value);
          success = true;
        }
      } catch {}
    }

    // Try localStorage
    if (!success) {
      try {
        const bag = JSON.parse(localStorage.getItem(this.namespace) || '{}');
        bag[key] = value;
        localStorage.setItem(this.namespace, JSON.stringify(bag));
        success = true;
      } catch {}
    }

    // Fallback to memory
    if (!success) {
      this.memory.set(key, value);
    }

    return success;
  }

  /**
   * Delete value from storage
   * @param {string} key - Storage key
   * @returns {Promise<boolean>} - Success status
   */
  async delete(key) {
    let success = false;

    // Try GM.deleteValue (async)
    try {
      if (typeof GM?.deleteValue === 'function') {
        await GM.deleteValue(key);
        success = true;
      }
    } catch {}

    // Try GM_deleteValue (sync, legacy)
    try {
      if (typeof GM_deleteValue === 'function') {
        GM_deleteValue(key);
        success = true;
      }
    } catch {}

    // Try localStorage
    try {
      const bag = JSON.parse(localStorage.getItem(this.namespace) || '{}');
      if (key in bag) {
        delete bag[key];
        localStorage.setItem(this.namespace, JSON.stringify(bag));
        success = true;
      }
    } catch {}

    // Always delete from memory
    this.memory.delete(key);

    return success;
  }
}
