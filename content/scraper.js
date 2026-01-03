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
    
    // 3. Check aria-labelledby first (more specific than aria-label)
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      const labelEl = document.getElementById(labelledBy);
      if (labelEl) {
        return labelEl.textContent;
      }
    }
    
    // 4. Check aria-label (but skip generic ones like "Your answer")
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel && !isGenericPlaceholder(ariaLabel)) {
      return ariaLabel;
    }
    
    // 5. Google Forms specific: Look for question container
    // Google Forms structure: div[role="listitem"] > div > div > span (question text)
    const listItem = element.closest('[role="listitem"]');
    if (listItem) {
      // Find the question text - usually in a span with specific attributes or the first text content
      const questionSpan = listItem.querySelector('[role="heading"]') || 
                           listItem.querySelector('[data-params]')?.closest('div')?.querySelector('span') ||
                           listItem.querySelector('div > div > div > span');
      if (questionSpan) {
        const text = questionSpan.textContent.trim();
        if (text && text.length < 200 && !isGenericPlaceholder(text)) {
          return text;
        }
      }
    }
    
    // 6. Look for nearby heading or question text (walking up the DOM)
    let container = element.parentElement;
    let depth = 0;
    while (container && depth < 6) {
      // Look for text content that looks like a label
      const textNodes = [];
      
      // Check for span, div, or label with short text content
      const candidates = container.querySelectorAll('span, label, div > span, [class*="label"], [class*="question"], [class*="title"]');
      for (const candidate of candidates) {
        const text = candidate.textContent.trim();
        if (text && text.length > 0 && text.length < 150 && !isGenericPlaceholder(text)) {
          // Make sure this isn't a child of the input or another input's label
          if (!candidate.querySelector('input, textarea, select') && 
              !candidate.closest('input, textarea, select')) {
            textNodes.push(text);
          }
        }
      }
      
      // Return the first reasonable label found
      if (textNodes.length > 0) {
        // Filter out common non-label texts
        const filtered = textNodes.filter(t => !isGenericPlaceholder(t));
        if (filtered.length > 0) {
          return filtered[0];
        }
      }
      
      container = container.parentElement;
      depth++;
    }
    
    // 7. Check placeholder (but skip generic ones)
    if (element.placeholder && !isGenericPlaceholder(element.placeholder)) {
      return element.placeholder;
    }
    
    // 8. Check previous sibling text
    const prevSibling = element.previousElementSibling;
    if (prevSibling && (prevSibling.tagName === 'LABEL' || prevSibling.tagName === 'SPAN' || prevSibling.tagName === 'DIV')) {
      const text = prevSibling.textContent.trim();
      if (text && text.length < 150 && !isGenericPlaceholder(text)) {
        return text;
      }
    }
    
    // 9. Check parent's previous sibling or nearby text
    const parent = element.parentElement;
    if (parent) {
      const prevParentSibling = parent.previousElementSibling;
      if (prevParentSibling && prevParentSibling.textContent.length < 100) {
        const text = prevParentSibling.textContent.trim();
        if (!isGenericPlaceholder(text)) {
          return text;
        }
      }
    }
    
    // 10. Check name attribute as fallback
    if (element.name) {
      // Convert name to readable format (e.g., 'first_name' -> 'First Name')
      return element.name
        .replace(/[_-]/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    
    return null;
  }

  // Check if text is a generic placeholder that shouldn't be used as a label
  function isGenericPlaceholder(text) {
    if (!text) return true;
    const lower = text.toLowerCase().trim();
    const genericPhrases = [
      'your answer',
      'enter your answer',
      'type your answer',
      'your response',
      'enter here',
      'type here',
      'write here',
      'answer here',
      'optional',
      'required',
      '*',
      'short answer',
      'long answer',
      'paragraph',
      'text'
    ];
    return genericPhrases.some(phrase => lower === phrase || lower === phrase + ' text');
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
    
    // Define keyword groups - if ANY keyword matches, use that profile value
    // Keywords are checked as word boundaries or partial matches
    const profileMatchers = [
      {
        // Full name - matches: name, full name, candidate name, your name, applicant name, legal name
        keywords: ['full name', 'fullname', 'your name', 'candidate name', 'applicant name', 'legal name'],
        exactMatch: ['name'], // Only match "name" if it's the entire label (not "company name")
        getValue: () => getFullName(profile)
      },
      {
        // First name
        keywords: ['first name', 'firstname', 'first_name', 'given name', 'forename'],
        getValue: () => profile.firstName
      },
      {
        // Middle name
        keywords: ['middle name', 'middlename', 'middle_name'],
        getValue: () => profile.middleName
      },
      {
        // Last name
        keywords: ['last name', 'lastname', 'last_name', 'surname', 'family name', 'familyname'],
        getValue: () => profile.lastName
      },
      {
        // Email - matches: email, e-mail, email address, your email, candidate email, work email, personal email
        keywords: ['email', 'e-mail', 'mail address'],
        excludeKeywords: ['company email', 'employer email'], // Don't match these
        getValue: () => profile.email
      },
      {
        // Phone - matches: phone, mobile, cell, telephone, contact number, phone number
        keywords: ['phone', 'mobile', 'cell', 'telephone', 'contact number', 'tel no', 'tel.', 'whatsapp'],
        excludeKeywords: ['company phone', 'employer phone', 'emergency'],
        getValue: () => profile.phone
      },
      {
        // LinkedIn - matches: linkedin, linked in, linkedin url, linkedin profile
        keywords: ['linkedin', 'linked in', 'linked-in'],
        getValue: () => profile.linkedinUrl
      },
      {
        // GitHub - matches: github, git hub, github url, github profile, github link
        keywords: ['github', 'git hub', 'git-hub'],
        getValue: () => profile.githubUsername ? `https://github.com/${profile.githubUsername}` : ''
      },
      {
        // Twitter/X - matches: twitter, x.com, x profile, twitter handle
        keywords: ['twitter', 'x.com', 'x profile', 'x handle', 'x url'],
        exactMatch: ['x'], // Only match "x" if it's exact (avoid matching "experience")
        getValue: () => profile.twitterUrl
      },
      {
        // Portfolio - matches: portfolio, portfolio link, portfolio url, personal website, website, personal site
        keywords: ['portfolio', 'personal website', 'personal site', 'personal url', 'your website', 'your site', 'homepage'],
        exactMatch: ['website', 'site'],
        getValue: () => profile.portfolioUrl
      }
    ];

    return fields.map(field => {
      const labelLower = (field.label || '').toLowerCase().trim();
      // Remove common suffixes/prefixes for cleaner matching
      const cleanLabel = labelLower
        .replace(/\s*\*\s*/g, '') // Remove asterisks (required markers)
        .replace(/\s*:\s*/g, '') // Remove colons
        .replace(/^\s*(your|enter|please|provide|candidate's?|applicant's?)\s+/i, '') // Remove common prefixes
        .trim();
      
      // Try to find a matching profile field
      for (const matcher of profileMatchers) {
        // Check exclude keywords first
        if (matcher.excludeKeywords) {
          const isExcluded = matcher.excludeKeywords.some(exclude => 
            cleanLabel.includes(exclude) || labelLower.includes(exclude)
          );
          if (isExcluded) continue;
        }
        
        // Check exact matches (for short/ambiguous keywords like "name", "website", "x")
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
        
        // Check keyword matches (partial matching)
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
