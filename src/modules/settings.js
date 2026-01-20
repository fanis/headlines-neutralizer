/**
 * Settings dialogs and management
 */

import { UI_ATTR, CFG, TEMPERATURE_LEVELS, TEMPERATURE_ORDER, STORAGE_KEYS, MODEL_OPTIONS } from './config.js';
import { parseLines, escapeHtml } from './utils.js';
import { xhrGet } from './api.js';

/**
 * Polymorphic editor for lists, secrets, domains, and info display
 */
export function openEditor({ title, hint = 'One item per line', mode = 'list', initial = [], globalItems = [], onSave, onValidate }) {
  const host = document.createElement('div');
  host.setAttribute(UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center}
    .modal{background:#fff;max-width:680px;width:92%;border-radius:10px;
           box-shadow:0 10px 40px rgba(0,0,0,.35);padding:16px 16px 12px;box-sizing:border-box}
    .modal h3{margin:0 0 8px;font:600 16px/1.2 system-ui,sans-serif}
    .section-label{font:600 13px/1.2 system-ui,sans-serif;margin:8px 0 4px;color:#444}
    textarea{width:100%;height:220px;resize:vertical;padding:10px;box-sizing:border-box;
             font:13px/1.4 ui-monospace,Consolas,monospace;border:1px solid #ccc;border-radius:4px}
    textarea.readonly{background:#f5f5f5;color:#666;height:120px}
    textarea.editable{height:180px}
    .row{display:flex;gap:8px;align-items:center}
    input[type=password],input[type=text]{flex:1;padding:10px;border-radius:8px;border:1px solid #ccc;
             font:14px/1.3 ui-monospace,Consolas,monospace;box-sizing:border-box}
    .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}
    .actions button{padding:8px 12px;border-radius:8px;border:1px solid #d0d0d0;background:#f6f6f6;cursor:pointer}
    .actions .save{background:#1a73e8;color:#fff;border-color:#1a73e8}
    .actions .test{background:#34a853;color:#fff;border-color:#34a853}
    .hint{margin:8px 0 0;color:#666;font:12px/1.2 system-ui,sans-serif}
  `;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const bodyList = `<textarea spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">${
    Array.isArray(initial) ? initial.join('\n') : ''
  }</textarea>`;
  const bodyDomain = `
    <div class="section-label">Global settings (read-only):</div>
    <textarea class="readonly" readonly spellcheck="false">${Array.isArray(globalItems) ? globalItems.join('\n') : ''}</textarea>
    <div class="section-label">Domain-specific additions (editable):</div>
    <textarea class="editable" spellcheck="false" autocomplete="off" autocapitalize="off" autocorrect="off">${Array.isArray(initial) ? initial.join('\n') : ''}</textarea>
  `;
  const bodySecret = `
    <div class="row">
      <input id="sec" type="password" placeholder="sk-..." autocomplete="off" />
      <button id="toggle" title="Show/Hide">👁</button>
    </div>`;
  const bodyInfo = `<textarea class="readonly" readonly spellcheck="false" style="height:auto;min-height:60px;max-height:300px;">${
    Array.isArray(initial) ? initial.join('\n') : String(initial)
  }</textarea>`;

  let bodyContent, actionsContent;
  if (mode === 'info') {
    bodyContent = bodyInfo;
    actionsContent = '<button class="cancel">Close</button>';
  } else if (mode === 'secret') {
    bodyContent = bodySecret;
    actionsContent = (onValidate ? '<button class="test">Validate</button>' : '') + '<button class="save">Save</button><button class="cancel">Cancel</button>';
  } else if (mode === 'domain') {
    bodyContent = bodyDomain;
    actionsContent = '<button class="save">Save</button><button class="cancel">Cancel</button>';
  } else {
    bodyContent = bodyList;
    actionsContent = '<button class="save">Save</button><button class="cancel">Cancel</button>';
  }

  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="${title}">
      <h3>${title}</h3>
      ${bodyContent}
      <div class="actions">
        ${actionsContent}
      </div>
      <p class="hint">${hint}</p>
    </div>`;
  shadow.append(style, wrap);
  document.body.appendChild(host);
  const close = () => host.remove();

  if (mode === 'info') {
    const btnClose = shadow.querySelector('.cancel');
    btnClose.addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    shadow.addEventListener('keydown', e => {
      if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); close(); }
    });
    wrap.setAttribute('tabindex', '-1');
    wrap.focus();
  } else if (mode === 'secret') {
    const inp = shadow.querySelector('#sec');
    const btnSave = shadow.querySelector('.save');
    const btnCancel = shadow.querySelector('.cancel');
    const btnToggle = shadow.querySelector('#toggle');
    const btnTest = shadow.querySelector('.test');
    if (typeof initial === 'string' && initial) inp.value = initial;
    btnToggle.addEventListener('click', () => { inp.type = (inp.type === 'password') ? 'text' : 'password'; inp.focus(); });
    btnSave.addEventListener('click', async () => {
      const v = inp.value.trim();
      if (!v) return;
      await onSave?.(v);
      btnSave.textContent = 'Saved';
      btnSave.style.background = '#34a853';
      btnSave.style.borderColor = '#34a853';
      setTimeout(close, 1000);
    });
    btnCancel.addEventListener('click', close);
    btnTest?.addEventListener('click', async () => { await onValidate?.(inp.value.trim()); });
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btnSave.click(); } });
    inp.focus();
  } else if (mode === 'domain') {
    const ta = shadow.querySelector('textarea.editable');
    const btnSave = shadow.querySelector('.save');
    const btnCancel = shadow.querySelector('.cancel');
    btnSave.addEventListener('click', async () => { const lines = parseLines(ta.value); await onSave?.(lines); close(); });
    btnCancel.addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btnSave.click(); } });
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  } else {
    const ta = shadow.querySelector('textarea');
    const btnSave = shadow.querySelector('.save');
    const btnCancel = shadow.querySelector('.cancel');
    btnSave.addEventListener('click', async () => { const lines = parseLines(ta.value); await onSave?.(lines); close(); });
    btnCancel.addEventListener('click', close);
    wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
    shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); btnSave.click(); } });
    ta.focus();
    ta.selectionStart = ta.selectionEnd = ta.value.length;
  }
}

/**
 * Show info dialog
 */
export function openInfo(message) {
  openEditor({ title: 'Neutralizer', mode: 'info', initial: message, hint: 'Press Enter or Escape to close.' });
}

/**
 * Show API key dialog
 */
export function openKeyDialog(storage, extra, apiKeyDialogShown) {
  if (apiKeyDialogShown.value) {
    return;
  }
  apiKeyDialogShown.value = true;

  openEditor({
    title: 'OpenAI API key',
    mode: 'secret',
    initial: '',
    hint: 'Stored locally (GM → localStorage → memory). Validate sends GET /v1/models.',
    onSave: async (val) => {
      const ok = await storage.set(STORAGE_KEYS.OPENAI_KEY, val);
      const verify = await storage.get(STORAGE_KEYS.OPENAI_KEY, '');
      console.log('API key saved:', ok, verify ? `••••${verify.slice(-4)}` : '(empty)');
      apiKeyDialogShown.value = false;
    },
    onValidate: async (val) => {
      const key = val || await storage.get(STORAGE_KEYS.OPENAI_KEY, '');
      if (!key) { openInfo('No key to test'); return; }
      try {
        await xhrGet('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
        openInfo('Validation OK (HTTP 200)');
      } catch (e) {
        openInfo(`Validation failed: ${e.message || e}`);
      }
    }
  });
}

/**
 * Show welcome dialog (first install)
 */
export function openWelcomeDialog(storage, openEditor, openInfo) {
  const host = document.createElement('div');
  host.setAttribute(UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);
          display:flex;align-items:center;justify-content:center}
    .modal{background:#fff;max-width:580px;width:94%;border-radius:12px;
           box-shadow:0 10px 40px rgba(0,0,0,.4);padding:24px;box-sizing:border-box}
    .modal h2{margin:0 0 16px;font:700 20px/1.3 system-ui,sans-serif;color:#1a1a1a}
    .modal p{margin:0 0 12px;font:14px/1.6 system-ui,sans-serif;color:#444}
    .modal .steps{background:#f8f9fa;padding:16px;border-radius:8px;margin:16px 0;
                   font:13px/1.5 system-ui,sans-serif}
    .modal .steps ol{margin:8px 0 0;padding-left:20px}
    .modal .steps li{margin:6px 0}
    .modal .steps a{color:#1a73e8;text-decoration:none}
    .modal .steps a:hover{text-decoration:underline}
    .actions{display:flex;gap:12px;justify-content:flex-end;margin-top:20px}
    .btn{padding:10px 20px;border-radius:8px;border:none;font:600 14px system-ui,sans-serif;
         cursor:pointer;transition:all 0.15s ease}
    .btn.primary{background:#1a73e8;color:#fff}
    .btn.primary:hover{background:#1557b0}
    .btn.secondary{background:#e8eaed;color:#1a1a1a}
    .btn.secondary:hover{background:#dadce0}
  `;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Welcome">
      <h2>Welcome to Neutralize Headlines!</h2>
      <p>This userscript helps you browse the web with calmer, more informative headlines by neutralizing sensationalist language.</p>
      <p>To get started, you'll need an OpenAI API key:</p>
      <div class="steps">
        <ol>
          <li>Visit <a href="https://platform.openai.com/api-keys" target="_blank">OpenAI API Keys</a></li>
          <li>Sign in or create an account</li>
          <li>Click "Create new secret key"</li>
          <li>Copy the key and paste it in the next dialog</li>
        </ol>
      </div>
      <p style="font-size:13px;color:#666;margin-top:16px"><strong>Domain control:</strong> By default, all websites are disabled. After setup, you can enable websites one by one via the menu, or toggle to "All domains with Denylist" mode to enable everywhere.</p>
      <p style="font-size:13px;color:#666">The script uses GPT-4.1 Nano Priority by default (fast processing for headlines). You can change the model anytime via the menu. Your key is stored locally and never shared.</p>
      <div class="actions">
        <button class="btn secondary cancel">Maybe Later</button>
        <button class="btn primary continue">Set Up API Key</button>
      </div>
    </div>`;

  shadow.append(style, wrap);
  document.body.appendChild(host);

  const btnContinue = shadow.querySelector('.continue');
  const btnCancel = shadow.querySelector('.cancel');

  btnContinue.addEventListener('click', async () => {
    host.remove();
    openEditor({
      title: 'OpenAI API key',
      mode: 'secret',
      initial: '',
      hint: 'Paste your API key here. Click Validate to test it, then Save.',
      onSave: async (val) => {
        await storage.set(STORAGE_KEYS.OPENAI_KEY, val);
        await storage.set(STORAGE_KEYS.DOMAINS_MODE, 'deny');
        await storage.set(STORAGE_KEYS.FIRST_INSTALL, 'true');
        openInfo('API key saved! The script will now work on all websites. Reload any page to see it in action.');
      },
      onValidate: async (val) => {
        const key = val || await storage.get(STORAGE_KEYS.OPENAI_KEY, '');
        if (!key) { openInfo('Please enter your API key first'); return; }
        try {
          await xhrGet('https://api.openai.com/v1/models', { Authorization: `Bearer ${key}` });
          openInfo('Validation OK! Click Save to continue.');
        } catch (e) {
          openInfo(`Validation failed: ${e.message || e}`);
        }
      }
    });
  });

  btnCancel.addEventListener('click', async () => {
    host.remove();
    await storage.set(STORAGE_KEYS.FIRST_INSTALL, 'true');
    openInfo('You can set up your API key anytime via the userscript menu:\n"Set / Validate OpenAI API key"');
  });

  wrap.addEventListener('click', (e) => { if (e.target === wrap) btnCancel.click(); });
  shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); btnCancel.click(); } });
  wrap.setAttribute('tabindex', '-1');
  wrap.focus();
}

/**
 * Show temperature selection dialog
 */
export function openTemperatureDialog(storage, TEMPERATURE_LEVEL, setTemperature) {
  const host = document.createElement('div');
  host.setAttribute(UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.45);
          display:flex;align-items:center;justify-content:center}
    .modal{background:#fff;max-width:520px;width:92%;border-radius:10px;
           box-shadow:0 10px 40px rgba(0,0,0,.35);padding:20px;box-sizing:border-box}
    .modal h3{margin:0 0 16px;font:600 16px/1.2 system-ui,sans-serif}
    .options{display:flex;flex-direction:column;gap:10px}
    .option-btn{padding:14px 16px;border-radius:8px;border:2px solid #d0d0d0;background:#fff;
                cursor:pointer;text-align:left;font:14px/1.4 system-ui,sans-serif;
                transition:all 0.15s ease;display:flex;justify-content:space-between;align-items:center}
    .option-btn:hover{background:#f8f9fa;border-color:#1a73e8}
    .option-btn.selected{background:#e8f0fe;border-color:#1a73e8;font-weight:600}
    .option-btn .label{flex:1}
    .option-btn .value{color:#666;font-size:12px;margin-left:8px}
    .option-btn .checkmark{color:#1a73e8;margin-left:8px;font-weight:bold}
    .hint{margin:16px 0 0;color:#666;font:12px/1.4 system-ui,sans-serif;text-align:center}
  `;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const optionsHTML = TEMPERATURE_ORDER.map(level => {
    const isSelected = level === TEMPERATURE_LEVEL;
    const value = TEMPERATURE_LEVELS[level];
    return `<button class="option-btn ${isSelected ? 'selected' : ''}" data-level="${level}">
      <span class="label">${level}</span>
      <span class="value">${value}</span>
      ${isSelected ? '<span class="checkmark">✓</span>' : ''}
    </button>`;
  }).join('');

  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="Neutralization Strength">
      <h3>Neutralization Strength</h3>
      <div class="options">
        ${optionsHTML}
      </div>
      <p class="hint">Select how aggressively to neutralize headlines. Lower values preserve more of the original meaning.</p>
    </div>`;

  shadow.append(style, wrap);
  document.body.appendChild(host);
  const close = () => host.remove();

  shadow.querySelectorAll('.option-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const level = btn.getAttribute('data-level');
      await setTemperature(level);
    });
  });

  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  wrap.setAttribute('tabindex', '-1');
  wrap.focus();
}

/**
 * Show model selection dialog
 */
export function openModelSelectionDialog(storage, currentModel, onSelect) {
  const host = document.createElement('div');
  host.setAttribute(UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.5);
          display:flex;align-items:center;justify-content:center}
    .modal{background:#fff;max-width:600px;width:90%;border-radius:12px;
           box-shadow:0 10px 40px rgba(0,0,0,.3);padding:24px;box-sizing:border-box}
    h3{margin:0 0 8px;font:600 18px/1.2 system-ui,sans-serif;color:#1a1a1a}
    .subtitle{margin:0 0 20px;font:13px/1.4 system-ui,sans-serif;color:#666}
    .option{padding:16px;margin:10px 0;border:2px solid #e0e0e0;border-radius:8px;
            cursor:pointer;transition:all 0.2s;position:relative}
    .option:hover{border-color:#1a73e8;background:#f8f9ff}
    .option.selected{border-color:#1a73e8;background:#1a73e8;color:#fff}
    .option-header{display:flex;justify-content:space-between;align-items:start;margin-bottom:8px}
    .option-title{font:600 16px/1.2 system-ui,sans-serif}
    .option-badge{font:600 10px/1.2 system-ui,sans-serif;padding:4px 8px;
                  border-radius:4px;background:#34a853;color:#fff;text-transform:uppercase}
    .option.selected .option-badge{background:rgba(255,255,255,0.3)}
    .option-desc{font:13px/1.5 system-ui,sans-serif;opacity:0.85;margin-bottom:8px}
    .option-pricing{font:12px/1.3 system-ui,sans-serif;opacity:0.7;font-family:ui-monospace,monospace}
    .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
    .btn{padding:10px 20px;border-radius:8px;border:none;cursor:pointer;
         font:600 14px system-ui,sans-serif}
    .btn-save{background:#1a73e8;color:#fff}
    .btn-save:hover{background:#1557b0}
    .btn-cancel{background:#e0e0e0;color:#333}
    .btn-cancel:hover{background:#d0d0d0}
  `;

  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  const optionsHtml = Object.keys(MODEL_OPTIONS).map(modelId => {
    const model = MODEL_OPTIONS[modelId];
    const isSelected = modelId === currentModel;
    const badge = model.recommended ? '<span class="option-badge">Recommended</span>' : '';
    return `
      <div class="option ${isSelected ? 'selected' : ''}" data-model="${modelId}">
        <div class="option-header">
          <div class="option-title">${model.name}</div>
          ${badge}
        </div>
        <div class="option-desc">${model.description}</div>
        <div class="option-pricing">$${model.inputPer1M.toFixed(2)}/1M input - $${model.outputPer1M.toFixed(2)}/1M output</div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = `
    <div class="modal">
      <h3>AI Model Selection</h3>
      <p class="subtitle">Choose the OpenAI model for headline neutralization. Higher-tier models cost more but may produce better results.</p>
      ${optionsHtml}
      <div class="actions">
        <button class="btn btn-cancel">Cancel</button>
        <button class="btn btn-save">Save & Reload</button>
      </div>
    </div>
  `;
  shadow.append(style, wrap);
  document.body.appendChild(host);

  let selectedModel = currentModel;

  const options = shadow.querySelectorAll('.option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      selectedModel = opt.dataset.model;
    });
  });

  const btnSave = shadow.querySelector('.btn-save');
  const btnCancel = shadow.querySelector('.btn-cancel');

  const close = () => host.remove();

  btnSave.addEventListener('click', async () => {
    if (!MODEL_OPTIONS[selectedModel]) return;
    await onSelect(selectedModel);
    btnSave.textContent = 'Saved! Reloading...';
    btnSave.style.background = '#34a853';
    setTimeout(() => location.reload(), 800);
  });

  btnCancel.addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  shadow.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

  wrap.setAttribute('tabindex', '-1');
  wrap.focus();
}

/**
 * Show API pricing configuration dialog
 */
export function openPricingDialog(storage, PRICING, updatePricing, resetPricingToDefaults, openInfo) {
  const host = document.createElement('div');
  host.setAttribute(UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .wrap{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.55);
          display:flex;align-items:center;justify-content:center}
    .modal{background:#fff;max-width:520px;width:92%;border-radius:10px;
           box-shadow:0 10px 40px rgba(0,0,0,.35);padding:20px;box-sizing:border-box}
    .modal h3{margin:0 0 16px;font:600 16px/1.2 system-ui,sans-serif}
    .modal p{margin:0 0 12px;font:13px/1.5 system-ui,sans-serif;color:#666}
    .modal .info{background:#f8f9fa;padding:12px;border-radius:6px;margin:12px 0;font-size:12px;color:#444}
    .modal .info a{color:#1a73e8;text-decoration:none}
    .modal .info a:hover{text-decoration:underline}
    .form-group{margin:16px 0}
    .form-group label{display:block;margin-bottom:6px;font:600 13px system-ui,sans-serif;color:#333}
    .form-group input{width:100%;padding:10px;border:2px solid #d0d0d0;border-radius:6px;
                      font:14px system-ui,sans-serif;box-sizing:border-box}
    .form-group input:focus{outline:none;border-color:#1a73e8}
    .form-group .hint{margin-top:4px;font-size:11px;color:#666}
    .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:20px}
    .btn{padding:10px 16px;border-radius:6px;border:none;font:600 13px system-ui,sans-serif;
         cursor:pointer;transition:all 0.15s ease}
    .btn.primary{background:#1a73e8;color:#fff}
    .btn.primary:hover{background:#1557b0}
    .btn.secondary{background:#e8eaed;color:#1a1a1a}
    .btn.secondary:hover{background:#dadce0}
    .btn:disabled{opacity:0.5;cursor:not-allowed}
  `;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';

  wrap.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true" aria-label="API Pricing Configuration">
      <h3>API Pricing Configuration</h3>
      <p>Update pricing if OpenAI changes their rates. Current model: ${PRICING.model}</p>
      <div class="info">
        Last updated: ${PRICING.lastUpdated}<br>
        Source: <a href="${PRICING.source}" target="_blank">OpenAI Pricing Page</a>
      </div>
      <div class="form-group">
        <label for="inputPrice">Input tokens (per 1M tokens)</label>
        <input type="number" id="inputPrice" step="0.01" min="0" value="${PRICING.inputPer1M}">
        <div class="hint">USD per 1 million input tokens</div>
      </div>
      <div class="form-group">
        <label for="outputPrice">Output tokens (per 1M tokens)</label>
        <input type="number" id="outputPrice" step="0.01" min="0" value="${PRICING.outputPer1M}">
        <div class="hint">USD per 1 million output tokens</div>
      </div>
      <div class="actions">
        <button class="btn secondary reset">Reset to Defaults</button>
        <button class="btn secondary cancel">Cancel</button>
        <button class="btn primary save">Save</button>
      </div>
    </div>`;

  shadow.append(style, wrap);
  document.body.appendChild(host);
  const close = () => host.remove();

  const inputEl = shadow.querySelector('#inputPrice');
  const outputEl = shadow.querySelector('#outputPrice');
  const btnSave = shadow.querySelector('.save');
  const btnCancel = shadow.querySelector('.cancel');
  const btnReset = shadow.querySelector('.reset');

  btnSave.addEventListener('click', async () => {
    const inputPrice = parseFloat(inputEl.value);
    const outputPrice = parseFloat(outputEl.value);

    if (isNaN(inputPrice) || inputPrice < 0 || isNaN(outputPrice) || outputPrice < 0) {
      alert('Please enter valid positive numbers');
      return;
    }

    await updatePricing(storage, {
      inputPer1M: inputPrice,
      outputPer1M: outputPrice
    });

    openInfo(`Pricing updated!\nInput: $${inputPrice}/1M tokens\nOutput: $${outputPrice}/1M tokens`);
    close();
  });

  btnReset.addEventListener('click', async () => {
    if (confirm('Reset pricing to GPT-4.1 Nano Priority defaults ($0.20 input, $0.80 output per 1M tokens)?')) {
      await resetPricingToDefaults(storage);
      openInfo('Pricing reset to defaults (GPT-4.1 Nano Priority: $0.20 input, $0.80 output per 1M tokens)');
      close();
    }
  });

  btnCancel.addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  wrap.setAttribute('tabindex', '-1');
  wrap.focus();
}

/**
 * Show long headline warning dialog
 */
export function showLongHeadlineDialog(elements, HOST, CFG) {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.setAttribute(UI_ATTR, '');
    const shadow = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      .wrap { position: fixed; inset: 0; z-index: 2147483647; background: rgba(0,0,0,.55);
              display: flex; align-items: center; justify-content: center; }
      .modal { background: #fff; max-width: 600px; width: 92%; border-radius: 12px;
               box-shadow: 0 10px 40px rgba(0,0,0,.4); padding: 20px; box-sizing: border-box; }
      .modal h3 { margin: 0 0 16px; font: 700 18px/1.3 system-ui, sans-serif; color: #1a1a1a; }
      .modal p { margin: 0 0 12px; font: 14px/1.6 system-ui, sans-serif; color: #444; }
      .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px;
                 margin: 16px 0; border-radius: 4px; }
      .warning-icon { font-size: 20px; margin-right: 8px; }
      .element-list { background: #f8f9fa; padding: 12px; border-radius: 6px; margin: 12px 0;
                      max-height: 200px; overflow-y: auto; }
      .element-item { font: 12px/1.5 ui-monospace, Consolas, monospace; color: #666;
                      margin: 6px 0; padding: 6px; background: #fff; border-radius: 4px; }
      .element-length { color: #d32f2f; font-weight: 600; }
      .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 20px; }
      .btn { padding: 10px 20px; border-radius: 8px; border: none;
             font: 600 14px system-ui, sans-serif; cursor: pointer; transition: all 0.15s ease; }
      .btn.primary { background: #1a73e8; color: #fff; }
      .btn.primary:hover { background: #1557b0; }
      .btn.success { background: #34a853; color: #fff; }
      .btn.success:hover { background: #2d8e47; }
      .btn.secondary { background: #e8eaed; color: #1a1a1a; }
      .btn.secondary:hover { background: #dadce0; }
    `;

    const wrap = document.createElement('div');
    wrap.className = 'wrap';

    const elementListHTML = elements.slice(0, 5).map(({ text, length }) => `
      <div class="element-item">
        <span class="element-length">${length} chars:</span> ${escapeHtml(text.substring(0, 80))}${text.length > 80 ? '...' : ''}
      </div>
    `).join('');

    const moreText = elements.length > 5 ? `<p style="text-align:center; font-size:12px; color:#666; margin-top:8px;">...and ${elements.length - 5} more</p>` : '';

    wrap.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-label="Long Headlines Detected">
        <h3>⚠️ Excessively Long Headlines Detected</h3>

        <div class="warning">
          <span class="warning-icon">⚠️</span>
          <strong>Your manual selectors matched ${elements.length} element(s) with text longer than ${CFG.sanityCheckLen} characters.</strong>
        </div>

        <p>These might be entire paragraphs, navigation menus, or article bodies rather than headlines. Processing them will consume unnecessary API tokens.</p>

        <div class="element-list">
          ${elementListHTML}
          ${moreText}
        </div>

        <p><strong>Would you like to process these anyway?</strong></p>

        <div class="actions">
          <button class="btn secondary skip">Skip These</button>
          <button class="btn primary process-once">Process Once</button>
          <button class="btn success remember">Process & Remember for ${HOST}</button>
        </div>
      </div>
    `;

    shadow.append(style, wrap);
    document.body.appendChild(host);

    const close = (result) => {
      host.remove();
      resolve(result);
    };

    shadow.querySelector('.skip').addEventListener('click', () => close(false));
    shadow.querySelector('.process-once').addEventListener('click', () => close('once'));
    shadow.querySelector('.remember').addEventListener('click', () => close(true));

    wrap.addEventListener('click', e => { if (e.target === wrap) close(false); });
    shadow.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); close(false); } });

    wrap.setAttribute('tabindex', '-1');
    wrap.focus();
  });
}

/**
 * Show diff audit (stats and changes)
 */
export function showDiffAudit(STATS, CHANGES, CACHE, API_TOKENS, PRICING, calculateApiCost, escapeHtml, UI_ATTR) {
  const host = document.createElement('div');
  host.setAttribute(UI_ATTR, '');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .wrap { position:fixed; inset:0; z-index:2147483647; background:rgba(0,0,0,.45);
            display:flex; align-items:center; justify-content:center; }
    .modal { background:#fff; max-width:900px; width:94%; border-radius:10px;
             box-shadow:0 10px 40px rgba(0,0,0,.4); padding:14px; box-sizing:border-box; }
    h3, h4 { margin:0 0 8px; font:600 16px/1.2 system-ui,sans-serif; }
    h4 { font-size:14px; }
    .list { max-height:70vh; overflow:auto; }
    .row { border-top:1px solid #eee; padding:8px 2px; }
    .from { color:#666; }
    .to { color:#111; font-weight:600; }
    .meta { color:#888; font-size:11px; }
    .btn { padding:10px 16px; border-radius:6px; border:none;
           font:600 13px system-ui,sans-serif; cursor:pointer;
           background:#e8eaed; color:#1a1a1a; }
    .btn:hover { background:#dadce0; }
  `;
  const wrap = document.createElement('div');
  wrap.className = 'wrap';
  const modal = document.createElement('div');
  modal.className = 'modal';
  const list = document.createElement('div');
  list.className = 'list';

  const headlineCacheSize = Object.keys(CACHE).length;
  const totalInput = API_TOKENS.headlines.input;
  const totalOutput = API_TOKENS.headlines.output;
  const totalTokens = totalInput + totalOutput;
  const totalCalls = API_TOKENS.headlines.calls;
  const estimatedCost = calculateApiCost();

  modal.innerHTML = `
    <h3>Stats & Changes (this page)</h3>
    <div style="background:#f5f5f5;padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px;">
      <strong>Cache Stats:</strong><br>
      Headlines cached: ${headlineCacheSize} entries<br>
    </div>
    <div style="background:#e8f4fd;padding:10px;border-radius:6px;margin-bottom:12px;font-size:13px;border-left:3px solid #1a73e8;">
      <strong>API Usage (since install):</strong><br>
      Total API calls: ${totalCalls.toLocaleString()}<br>
      Total tokens: ${totalTokens.toLocaleString()} (${totalInput.toLocaleString()} input, ${totalOutput.toLocaleString()} output)<br>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #ccc;color:#1557b0;font-weight:600">
        Estimated cost: ~$${estimatedCost.toFixed(4)}
      </div>
      <div style="margin-top:6px;font-size:11px;color:#666">
        Pricing: $${PRICING.inputPer1M} input / $${PRICING.outputPer1M} output per 1M tokens (${PRICING.model}, updated ${PRICING.lastUpdated})
      </div>
    </div>
    <h4 style="margin:0 0 8px">Headlines Changed</h4>
  `;

  if (!CHANGES.length) {
    const p = document.createElement('p');
    p.textContent = 'No recorded changes yet.';
    modal.appendChild(p);
  } else {
    CHANGES.forEach((ch, idx) => {
      const row = document.createElement('div');
      row.className = 'row';
      row.innerHTML = `
        <div class="meta">#${idx + 1} • ${ch.source} • ${ch.mode} • on ${ch.count} element(s)</div>
        <div class="from">– ${escapeHtml(ch.from)}</div>
        <div class="to">+ ${escapeHtml(ch.to)}</div>`;
      list.appendChild(row);
    });
    modal.appendChild(list);
  }
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;margin-top:8px;';
  const btnClose = document.createElement('button');
  btnClose.textContent = 'Close';
  btnClose.className = 'btn';
  actions.appendChild(btnClose);
  modal.appendChild(actions);
  wrap.appendChild(modal);
  shadow.append(style, wrap);
  document.body.appendChild(host);
  const close = () => host.remove();
  wrap.addEventListener('click', (e) => { if (e.target === wrap) close(); });
  btnClose.addEventListener('click', () => close());
  shadow.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } });
  wrap.setAttribute('tabindex', '-1');
  wrap.focus();
}
