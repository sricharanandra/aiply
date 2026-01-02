// Aiply Content Script - Main Orchestrator
// Handles message passing and coordinates platform-specific scrapers

(function() {
  'use strict';

  // Prevent multiple injections
  if (window.aiplyScraperInitialized) return;
  window.aiplyScraperInitialized = true;

  // Platform detection
  function detectPlatform() {
    const url = window.location.href;
    
    if (url.includes('docs.google.com/forms')) return 'google-forms';
    if (url.includes('greenhouse.io') || url.includes('boards.greenhouse.io')) return 'greenhouse';
    if (url.includes('glassdoor.com') || url.includes('glassdoor.co.in')) return 'glassdoor';
    if (url.includes('linkedin.com/jobs')) return 'linkedin';
    if (url.includes('internshala.com')) return 'internshala';
    
    return 'generic';
  }

  // Get platform scraper
  function getScraper() {
    const platform = detectPlatform();
    
    switch (platform) {
      case 'google-forms':
        return window.AiplyGoogleForms;
      case 'greenhouse':
        return window.AiplyGreenhouse;
      case 'glassdoor':
        return window.AiplyGlassdoor;
      case 'linkedin':
        return window.AiplyLinkedIn;
      case 'internshala':
        return window.AiplyInternshala;
      default:
        return window.AiplyGeneric;
    }
  }

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
      case 'detectPlatform':
        return { success: true, platform: detectPlatform() };
      default:
        throw new Error(`Unknown action: ${message.action}`);
    }
  }

  // Main scrape function
  async function scrapePage() {
    const scraper = getScraper();
    
    if (!scraper) {
      // Fallback to generic if platform scraper not available
      return await scrapeGeneric();
    }

    try {
      // Get user profile for matching profile fields
      const profile = await browser.runtime.sendMessage({ action: 'getProfile' });
      
      // Call platform-specific scraper
      const data = await scraper.scrape();
      
      // Match profile fields
      if (data.profileFields && profile) {
        data.profileFields = matchProfileFields(data.profileFields, profile);
      }
      
      return { success: true, data };
    } catch (error) {
      console.error('Aiply scrape error:', error);
      throw new Error(`Scrape failed: ${error.message}`);
    }
  }

  // Generic scrape fallback
  async function scrapeGeneric() {
    const generic = window.AiplyGeneric;
    if (generic) {
      const profile = await browser.runtime.sendMessage({ action: 'getProfile' });
      const data = await generic.scrape();
      if (data.profileFields && profile) {
        data.profileFields = matchProfileFields(data.profileFields, profile);
      }
      return { success: true, data };
    }
    throw new Error('No scraper available for this page');
  }

  // Match profile fields with user profile
  function matchProfileFields(fields, profile) {
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
      'personal website': () => profile.portfolioUrl
    };

    return fields.map(field => {
      const labelLower = (field.label || '').toLowerCase().trim();
      
      // Try exact match first
      if (fieldMatchers[labelLower]) {
        field.profileValue = fieldMatchers[labelLower]();
        return field;
      }
      
      // Try partial match
      for (const [key, getter] of Object.entries(fieldMatchers)) {
        if (labelLower.includes(key) || key.includes(labelLower)) {
          field.profileValue = getter();
          return field;
        }
      }
      
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
    
    if (!selector || !value) {
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
      
      // Set value
      element.value = value;
      
      // Trigger input events (for frameworks like React)
      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
      
      // For some frameworks, we need to set the property directly
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        tagName === 'input' ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
        'value'
      ).set;
      nativeInputValueSetter.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
      
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
  console.log('Aiply content script initialized for:', detectPlatform());
})();
