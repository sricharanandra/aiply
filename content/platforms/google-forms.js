// Aiply Google Forms Scraper

window.AiplyGoogleForms = {
  async scrape() {
    const data = {
      platform: 'Google Forms',
      company: '',
      role: '',
      jobDescription: '',
      questions: [],
      profileFields: []
    };

    // Get form title (often contains company/role info)
    const formTitle = document.querySelector('[role="heading"][aria-level="1"]');
    if (formTitle) {
      data.company = formTitle.textContent.trim();
    }

    // Get form description
    const formDesc = document.querySelector('.freebirdFormviewerViewHeaderDescription');
    if (formDesc) {
      data.jobDescription = formDesc.textContent.trim();
    }

    // Find all question containers
    const questionContainers = document.querySelectorAll('[role="listitem"]');
    
    for (const container of questionContainers) {
      // Get question text
      const questionText = container.querySelector('[role="heading"]');
      if (!questionText) continue;

      const text = questionText.textContent.trim();
      
      // Check if required
      const required = container.querySelector('[aria-label*="Required"]') !== null ||
                       text.includes('*');

      // Determine question type and get selector
      const input = this.findInput(container);
      
      if (!input) continue;

      // Categorize as profile field or question based on label
      if (this.isProfileField(text)) {
        data.profileFields.push({
          label: text.replace(/\*$/, '').trim(),
          selector: this.getSelector(input.element),
          type: input.type,
          required
        });
      } else {
        data.questions.push({
          text: text.replace(/\*$/, '').trim(),
          selector: this.getSelector(input.element),
          type: input.type,
          required
        });
      }
    }

    return data;
  },

  findInput(container) {
    // Text input
    let input = container.querySelector('input[type="text"]');
    if (input) return { element: input, type: 'text' };

    // Textarea
    input = container.querySelector('textarea');
    if (input) return { element: input, type: 'textarea' };

    // Email input
    input = container.querySelector('input[type="email"]');
    if (input) return { element: input, type: 'email' };

    // Radio buttons (paragraph/multiple choice)
    const radioGroup = container.querySelector('[role="radiogroup"]');
    if (radioGroup) return { element: radioGroup, type: 'radio' };

    // Checkboxes
    const checkboxGroup = container.querySelector('[role="group"]');
    if (checkboxGroup) return { element: checkboxGroup, type: 'checkbox' };

    // Dropdown
    const dropdown = container.querySelector('[role="listbox"]');
    if (dropdown) return { element: dropdown, type: 'dropdown' };

    return null;
  },

  getSelector(element) {
    // Try to get a unique selector
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.name) {
      return `[name="${element.name}"]`;
    }

    // Use data attributes if available
    if (element.dataset.params) {
      const params = element.dataset.params;
      return `[data-params="${params}"]`;
    }

    // Fall back to aria-label
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    }

    // Last resort: generate path
    return this.generatePath(element);
  },

  generatePath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ').filter(c => c && !c.includes('--'));
        if (classes.length > 0) {
          selector += '.' + classes.slice(0, 2).join('.');
        }
      }
      
      path.unshift(selector);
      current = current.parentElement;
      
      // Limit depth
      if (path.length > 5) break;
    }
    
    return path.join(' > ');
  },

  isProfileField(label) {
    const profilePatterns = [
      /^name$/i,
      /first\s*name/i,
      /last\s*name/i,
      /full\s*name/i,
      /email/i,
      /e-mail/i,
      /phone/i,
      /mobile/i,
      /linkedin/i,
      /github/i,
      /twitter/i,
      /portfolio/i,
      /website/i,
      /contact/i
    ];

    return profilePatterns.some(pattern => pattern.test(label));
  }
};
