// Aiply Content Script - Universal Scraper
// Grabs page text and form fields for any website

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.aiplyScraperInitialized) return;
  window.aiplyScraperInitialized = true;

  // Message handler
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    handleMessage(message)
      .then(response => sendResponse(response))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Keep channel open for async response
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

  // Main scrape function - universal approach
  async function scrapePage() {
    try {
      // Get entire page text
      const pageText = getCleanPageText();
      
      // Get user profile for matching profile fields
      const profile = await browser.runtime.sendMessage({ action: 'getProfile' });
      
      // Find all form fields with their labels
      const formFields = findFormFields();
      
      // Match profile fields
      const matchedFields = matchProfileFields(formFields, profile);
      
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

  // Get clean page text (removes scripts, styles, etc.)
  function getCleanPageText() {
    // Clone body to avoid modifying the actual page
    const clone = document.body.cloneNode(true);
    
    // Remove elements that don't contain useful text
    const removeSelectors = [
      'script', 'style', 'noscript', 'iframe', 'svg', 'canvas',
      'header', 'footer', 'nav', '[role="navigation"]', '[role="banner"]',
      '.cookie-banner', '.cookie-consent', '#cookie-banner',
      '.advertisement', '.ad', '[data-ad]'
    ];
    
    removeSelectors.forEach(selector => {
      clone.querySelectorAll(selector).forEach(el => el.remove());
    });
    
    // Get text content and clean it up
    let text = clone.innerText || clone.textContent || '';
    
    // Normalize whitespace
    text = text.replace(/\s+/g, ' ').trim();
    
    // Limit to reasonable size (Groq has token limits)
    const MAX_LENGTH = 15000;
    if (text.length > MAX_LENGTH) {
      text = text.substring(0, MAX_LENGTH) + '...';
    }
    
    return text;
  }

  // Find all form fields with their associated labels
  function findFormFields() {
    const fields = [];
    const processedElements = new Set();
    
    // Find all input, textarea, and select elements
    const formElements = document.querySelectorAll('input, textarea, select');
    
    formElements.forEach(element => {
      // Skip hidden, submit, button, file inputs
      const type = element.type?.toLowerCase();
      if (type === 'hidden' || type === 'submit' || type === 'button' || 
          type === 'file' || type === 'image' || type === 'reset') {
        return;
      }
      
      // Skip if already processed or not visible
      if (processedElements.has(element) || !isVisible(element)) {
        return;
      }
      
      processedElements.add(element);
      
      // Get label text
      const label = getFieldLabel(element);
      
      // Generate a unique selector
      const selector = generateSelector(element);
      
      if (label && selector) {
        fields.push({
          label: label.trim(),
          selector,
          type: element.tagName.toLowerCase(),
          inputType: type || null,
          required: element.required || element.getAttribute('aria-required') === 'true',
          currentValue: element.value || ''
        });
      }
    });
    
    return fields;
  }

  // Check if element is visible
  function isVisible(element) {
    const style = window.getComputedStyle(element);
    return style.display !== 'none' && 
           style.visibility !== 'hidden' && 
           style.opacity !== '0' &&
           element.offsetParent !== null;
  }

  // Get the label associated with a form field
  function getFieldLabel(element) {
    // 1. Check for explicit label via 'for' attribute
    if (element.id) {
      const label = document.querySelector(`label[for="${element.id}"]`);
      if (label) {
        return label.textContent;
      }
    }
    
    // 2. Check for wrapping label
    const parentLabel = element.closest('label');
    if (parentLabel) {
      // Get text without the input's value
      const clone = parentLabel.cloneNode(true);
      clone.querySelectorAll('input, textarea, select').forEach(el => el.remove());
      return clone.textContent;
    }
    
    // 3. Check aria-label
    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label');
    }
    
    // 4. Check aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) {
        return labelEl.textContent;
      }
    }
    
    // 5. Check placeholder
    if (element.placeholder) {
      return element.placeholder;
    }
    
    // 6. Check previous sibling text
    const prevSibling = element.previousElementSibling;
    if (prevSibling && (prevSibling.tagName === 'LABEL' || prevSibling.tagName === 'SPAN')) {
      return prevSibling.textContent;
    }
    
    // 7. Check parent's previous sibling or nearby text
    const parent = element.parentElement;
    if (parent) {
      const prevParentSibling = parent.previousElementSibling;
      if (prevParentSibling && prevParentSibling.textContent.length < 100) {
        return prevParentSibling.textContent;
      }
    }
    
    // 8. Check name attribute as fallback
    if (element.name) {
      // Convert name to readable format (e.g., 'first_name' -> 'First Name')
      return element.name
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    
    return null;
  }

  // Generate a unique CSS selector for an element
  function generateSelector(element) {
    // Try ID first
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }
    
    // Try name attribute
    if (element.name) {
      const selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
    
    // Try data attributes
    for (const attr of element.attributes) {
      if (attr.name.startsWith('data-') && attr.value) {
        const selector = `${element.tagName.toLowerCase()}[${attr.name}="${CSS.escape(attr.value)}"]`;
        if (document.querySelectorAll(selector).length === 1) {
          return selector;
        }
      }
    }
    
    // Build path-based selector
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }
      
      // Add nth-child if there are siblings of the same type
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

  // Match form fields with user profile data
  function matchProfileFields(fields, profile) {
    if (!profile) return fields;
    
    const fieldMatchers = {
      // Name fields
      'first name': () => profile.firstName,
      'first_name': () => profile.firstName,
      'firstname': () => profile.firstName,
      'given name': () => profile.firstName,
      'middle name': () => profile.middleName,
      'middle_name': () => profile.middleName,
      'middlename': () => profile.middleName,
      'last name': () => profile.lastName,
      'last_name': () => profile.lastName,
      'lastname': () => profile.lastName,
      'surname': () => profile.lastName,
      'family name': () => profile.lastName,
      'full name': () => getFullName(profile),
      'your name': () => getFullName(profile),
      'name': () => getFullName(profile),
      
      // Contact
      'email': () => profile.email,
      'e-mail': () => profile.email,
      'email address': () => profile.email,
      'phone': () => profile.phone,
      'phone number': () => profile.phone,
      'mobile': () => profile.phone,
      'mobile number': () => profile.phone,
      'contact number': () => profile.phone,
      'telephone': () => profile.phone,
      'cell': () => profile.phone,
      
      // Links
      'linkedin': () => profile.linkedinUrl,
      'linkedin url': () => profile.linkedinUrl,
      'linkedin profile': () => profile.linkedinUrl,
      'github': () => profile.githubUsername ? `https://github.com/${profile.githubUsername}` : '',
      'github url': () => profile.githubUsername ? `https://github.com/${profile.githubUsername}` : '',
      'github profile': () => profile.githubUsername ? `https://github.com/${profile.githubUsername}` : '',
      'twitter': () => profile.twitterUrl,
      'twitter url': () => profile.twitterUrl,
      'x url': () => profile.twitterUrl,
      'portfolio': () => profile.portfolioUrl,
      'portfolio url': () => profile.portfolioUrl,
      'website': () => profile.portfolioUrl,
      'personal website': () => profile.portfolioUrl,
      'personal site': () => profile.portfolioUrl
    };

    return fields.map(field => {
      const labelLower = (field.label || '').toLowerCase().trim();
      
      // Try exact match first
      if (fieldMatchers[labelLower]) {
        field.profileValue = fieldMatchers[labelLower]();
        field.isProfileField = true;
        return field;
      }
      
      // Try partial match
      for (const [key, getter] of Object.entries(fieldMatchers)) {
        if (labelLower.includes(key) || key.includes(labelLower)) {
          const value = getter();
          if (value) {
            field.profileValue = value;
            field.isProfileField = true;
            return field;
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

  // Fill a single field on the page
  async function fillField(data) {
    const { selector, value } = data;
    
    if (!selector || value === undefined) {
      throw new Error('Selector and value are required');
    }

    const element = document.querySelector(selector);
    
    if (!element) {
      throw new Error('Field not found on page');
    }

    // Handle different input types
    const tagName = element.tagName.toLowerCase();
    
    if (tagName === 'input' || tagName === 'textarea') {
      // Focus the element first
      element.focus();
      
      // Clear existing value
      element.value = '';
      
      // Set value using native setter (works with React/Vue/Angular)
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        tagName === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        'value'
      ).set;
      nativeInputValueSetter.call(element, value);
      
      // Trigger events
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
      
    } else if (tagName === 'select') {
      // Try to find option with matching value or text
      const options = Array.from(element.options);
      const match = options.find(opt => 
        opt.value.toLowerCase() === value.toLowerCase() ||
        opt.text.toLowerCase() === value.toLowerCase()
      );
      
      if (match) {
        element.value = match.value;
        element.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else if (element.contentEditable === 'true') {
      // Contenteditable elements
      element.focus();
      element.textContent = value;
      element.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Blur the element
    element.blur();

    return { success: true };
  }

  // Log initialization
  console.log('Aiply universal scraper initialized');
})();
