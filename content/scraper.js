// Aiply Content Script - Universal Scraper
// Grabs page text and form fields for any website

(function() {
  'use strict';

  if (window.aiplyScraperInitialized) return;
  window.aiplyScraperInitialized = true;

  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  });

  async function handleMessage(message) {
    switch (message.action) {
      case 'scrape':
        return await scrapePage();
      case 'fillField':
        return await fillField(message.data);
      default:
        throw new Error(`Unknown action: ${message.action}`);
    }
  }

  async function scrapePage() {
    try {
      await waitForSPA();

      const pageText = getCleanPageText();
      const response = await browser.runtime.sendMessage({ action: 'getProfile' });
      const profile = response?.success === false ? null : response;
      const formFields = findFormFields();
      const customWidgets = findCustomWidgets();
      const allFields = [...formFields, ...customWidgets];
      const matchedFields = matchProfileFields(allFields, profile);

      return {
        success: true,
        data: {
          pageText,
          formFields: matchedFields,
          url: window.location.href,
          title: document.title
        }
      };
    } catch (error) {
      console.error('Aiply scrape error:', error);
      throw new Error(`Scrape failed: ${error.message}`);
    }
  }

  async function waitForSPA() {
    return new Promise(resolve => {
      const checkReady = () => {
        const forms = document.querySelectorAll('input, textarea, select, [role="textbox"], [contenteditable]');
        if (forms.length > 0) {
          resolve();
          return;
        }
        if (document.readyState === 'complete') {
          setTimeout(resolve, 500);
          return;
        }
        setTimeout(checkReady, 200);
      };

      let elapsed = 0;
      const maxWait = 5000;
      const interval = setInterval(() => {
        elapsed += 200;
        const forms = document.querySelectorAll('input, textarea, select, [role="textbox"], [contenteditable]');
        if (forms.length > 0 || elapsed >= maxWait) {
          clearInterval(interval);
          resolve();
        }
      }, 200);

      checkReady();
    });
  }

  function getAllFormElements() {
    const elements = [];
    const standard = document.querySelectorAll('input, textarea, select');
    elements.push(...standard);

    const richText = document.querySelectorAll('[contenteditable="true"], [contenteditable="plaintext-only"]');
    elements.push(...richText);

    const ariaRoles = document.querySelectorAll('[role="textbox"], [role="combobox"], [role="searchbox"]');
    elements.push(...ariaRoles);

    try {
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        if (el.shadowRoot) {
          const shadowInputs = el.shadowRoot.querySelectorAll('input, textarea, select, [contenteditable="true"]');
          elements.push(...shadowInputs);
        }
      }
    } catch (e) {}

    return elements;
  }

  function getCleanPageText() {
    const clone = document.body.cloneNode(true);

    const removeSelectors = [
      'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
      '[role="navigation"]', '[role="banner"]',
      '.cookie-banner', '.cookie-consent', '#cookie-banner',
      '.advertisement', '.ad', '[data-ad]'
    ];

    removeSelectors.forEach(selector => {
      try {
        clone.querySelectorAll(selector).forEach(el => el.remove());
      } catch (e) {}
    });

    let text = clone.innerText || clone.textContent || '';
    text = text.replace(/\s+/g, ' ').trim();

    const MAX_LENGTH = 15000;
    if (text.length > MAX_LENGTH) {
      text = text.substring(0, MAX_LENGTH) + '...';
    }

    return text;
  }

  function findFormFields() {
    const fields = [];
    const processedElements = new Set();
    const formElements = getAllFormElements();

    formElements.forEach(element => {
      if (processedElements.has(element)) return;

      const tagName = element.tagName.toLowerCase();
      const type = element.type?.toLowerCase();

      if (tagName === 'input' && (type === 'hidden' || type === 'submit' || type === 'button' ||
          type === 'file' || type === 'image' || type === 'reset')) {
        return;
      }

      if (!isVisible(element)) return;

      processedElements.add(element);

      const label = getFieldLabel(element);
      const selector = generateSelector(element);

      if (label && selector) {
        fields.push({
          label: label.trim(),
          selector,
          type: tagName,
          inputType: type || element.getAttribute('role') || null,
          required: element.required || element.getAttribute('aria-required') === 'true',
          currentValue: element.value || element.textContent || ''
        });
      }
    });

    return fields;
  }

  function findCustomWidgets() {
    const widgets = [];
    const processed = new Set();

    const selectors = [
      '[class*="MuiInputBase"]',
      '[class*="MuiSelect"]',
      '[class*="ant-select"]',
      '[class*="ant-input"]',
      '[class*="chakra-input"]',
      '[data-testid*="input"]',
      '[data-testid*="textbox"]',
      '[class*="form-control"]',
      '[role="combobox"]',
      '[role="listbox"]'
    ];

    selectors.forEach(sel => {
      try {
        document.querySelectorAll(sel).forEach(el => {
          if (processed.has(el) || !isVisible(el)) return;
          processed.add(el);

          const label = getFieldLabel(el);
          const selector = generateSelector(el);
          if (label && selector) {
            widgets.push({
              label: label.trim(),
              selector,
              type: el.tagName.toLowerCase(),
              inputType: el.getAttribute('role') || 'custom',
              required: el.getAttribute('aria-required') === 'true',
              currentValue: el.textContent || el.getAttribute('aria-label') || ''
            });
          }
        });
      } catch (e) {}
    });

    return widgets;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           (element.offsetParent !== null || style.position === 'fixed');
  }

  function getFieldLabel(element) {
    if (element.id) {
      const label = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (label) return label.textContent;
    }

    const parentLabel = element.closest('label');
    if (parentLabel) {
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, textarea, select').forEach(el => el.remove());
      return clone.textContent;
    }

    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const ids = labelledBy.split(/\s+/);
      const texts = [];
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) texts.push(el.textContent);
      }
      if (texts.length > 0) return texts.join(' ');
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && !isGenericPlaceholder(ariaLabel)) return ariaLabel;

    const listItem = element.closest('[role="listitem"]');
    if (listItem) {
      const questionSpan = listItem.querySelector('[role="heading"]') ||
                           listItem.querySelector('[class*="question"], [class*="label"]');
      if (questionSpan) {
        const text = questionSpan.textContent.trim();
        if (text && text.length < 200 && !isGenericPlaceholder(text)) return text;
      }
    }

    let container = element.parentElement;
    let depth = 0;
    while (container && depth < 6) {
      const candidates = container.querySelectorAll('span, label, div > span, [class*="label"], [class*="question"], [class*="title"]');
      for (const candidate of candidates) {
        const text = candidate.textContent.trim();
        if (text && text.length > 0 && text.length < 150 && !isGenericPlaceholder(text)) {
          if (!candidate.querySelector('input, textarea, select') &&
              !candidate.closest('input, textarea, select')) {
            return text;
          }
        }
      }
      container = container.parentElement;
      depth++;
    }

    if (element.placeholder && !isGenericPlaceholder(element.placeholder)) {
      return element.placeholder;
    }

    const prevSibling = element.previousElementSibling;
    if (prevSibling) {
      const text = prevSibling.textContent.trim();
      if (text && text.length < 150 && !isGenericPlaceholder(text)) return text;
    }

    const parent = element.parentElement;
    if (parent) {
      const prevParentSibling = parent.previousElementSibling;
      if (prevParentSibling && prevParentSibling.textContent.length < 100) {
        const text = prevParentSibling.textContent.trim();
        if (!isGenericPlaceholder(text)) return text;
      }
    }

    if (element.name) {
      return element.name
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
    }

    return null;
  }

  function isGenericPlaceholder(text) {
    if (!text) return true;
    const lower = text.toLowerCase().trim();
    const genericPhrases = [
      'your answer', 'enter your answer', 'type your answer',
      'your response', 'enter here', 'type here', 'write here',
      'answer here', 'optional', 'required', '*',
      'short answer', 'long answer', 'paragraph', 'text'
    ];
    return genericPhrases.some(phrase => lower === phrase || lower === phrase + ' text');
  }

  function generateSelector(element) {
    if (element.id) return `#${CSS.escape(element.id)}`;

    if (element.name) {
      const selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      if (document.querySelectorAll(selector).length === 1) return selector;
    }

    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-') && attr.value) {
        const selector = `${element.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
        if (document.querySelectorAll(selector).length === 1) return selector;
      }
    }

    const path = [];
    let current = element;

    while (current && current !== document.body && current !== document.documentElement) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          child => child.tagName === current.tagName
        );
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      path.unshift(selector);
      current = parent;
    }

    return path.join(' > ');
  }

  function matchProfileFields(fields, profile) {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return fields;

    const profileMatchers = [
      {
        keywords: ['full name', 'fullname', 'your name', 'candidate name', 'applicant name', 'legal name'],
        exactMatch: ['name'],
        getValue: () => getFullName(profile)
      },
      {
        keywords: ['first name', 'firstname', 'first_name', 'given name', 'forename'],
        getValue: () => profile.firstName
      },
      {
        keywords: ['middle name', 'middlename', 'middle_name'],
        getValue: () => profile.middleName
      },
      {
        keywords: ['last name', 'lastname', 'last_name', 'surname', 'family name', 'familyname'],
        getValue: () => profile.lastName
      },
      {
        keywords: ['email', 'e-mail', 'mail address'],
        excludeKeywords: ['company email', 'employer email'],
        getValue: () => profile.email
      },
      {
        keywords: ['phone', 'mobile', 'cell', 'telephone', 'contact number', 'tel no', 'tel.', 'whatsapp'],
        excludeKeywords: ['company phone', 'employer phone', 'emergency'],
        getValue: () => profile.phone
      },
      {
        keywords: ['linkedin', 'linked in', 'linked-in'],
        getValue: () => profile.linkedinUrl
      },
      {
        keywords: ['github', 'git hub', 'git-hub'],
        getValue: () => profile.githubUsername ? `https://github.com/${profile.githubUsername}` : ''
      },
      {
        keywords: ['twitter', 'x.com', 'x profile', 'x handle', 'x url'],
        exactMatch: ['x'],
        getValue: () => profile.twitterUrl
      },
      {
        keywords: ['portfolio', 'personal website', 'personal site', 'personal url', 'your website', 'your site', 'homepage'],
        exactMatch: ['website', 'site'],
        getValue: () => profile.portfolioUrl
      }
    ];

    return fields.map(field => {
      const labelLower = (field.label || '').toLowerCase().trim();
      const cleanLabel = labelLower
        .replace(/\s*\*\s*/g, '')
        .replace(/\s*:\s*/g, '')
        .replace(/^\s*(your|enter|please|provide|candidate's?|applicant's?)\s+/i, '')
        .trim();

      for (const matcher of profileMatchers) {
        if (matcher.excludeKeywords) {
          const isExcluded = matcher.excludeKeywords.some(exclude =>
            cleanLabel.includes(exclude) || labelLower.includes(exclude)
          );
          if (isExcluded) continue;
        }

        if (matcher.exactMatch) {
          const isExactMatch = matcher.exactMatch.some(exact =>
            cleanLabel === exact || labelLower === exact
          );
          if (isExactMatch) {
            const value = matcher.getValue();
            if (value) {
              field.profileValue = value;
              field.isProfileField = true;
              return field;
            }
          }
        }

        if (matcher.keywords) {
          const isMatch = matcher.keywords.some(keyword =>
            cleanLabel.includes(keyword) || labelLower.includes(keyword)
          );
          if (isMatch) {
            const value = matcher.getValue();
            if (value) {
              field.profileValue = value;
              field.isProfileField = true;
              return field;
            }
          }
        }
      }

      field.isProfileField = false;
      return field;
    });
  }

  function getFullName(profile) {
    const parts = [profile.firstName, profile.middleName, profile.lastName].filter(Boolean);
    return parts.join(' ');
  }

  async function fillField(data) {
    const { selector, value } = data;

    if (!selector || value === undefined) {
      throw new Error('Selector and value are required');
    }

    const element = document.querySelector(selector);

    if (!element) {
      throw new Error('Field not found on page');
    }

    const tagName = element.tagName.toLowerCase();

    if (tagName === 'input' || tagName === 'textarea') {
      element.focus();
      element.value = '';
      element.value = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new Event('blur', { bubbles: true }));
    } else if (tagName === 'select') {
      const options = Array.from(element.options);
      const match = options.find(opt =>
        opt.value.toLowerCase() === value.toLowerCase() ||
        opt.text.toLowerCase() === value.toLowerCase()
      );
      if (match) {
        element.value = match.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (element.contentEditable === 'true' || element.contentEditable === 'plaintext-only') {
      element.focus();
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      const role = element.getAttribute('role');
      if (role === 'textbox' || role === 'combobox' || role === 'searchbox') {
        element.focus();
        element.textContent = value;
        element.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    element.blur();

    return { success: true };
  }

  console.log('Aiply universal scraper initialized');
})();
