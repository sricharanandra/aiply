// Aiply Generic Scraper (best-effort fallback for unknown platforms)

window.AiplyGeneric = {
  async scrape() {
    const data = {
      platform: 'Unknown',
      company: '',
      role: '',
      jobDescription: '',
      questions: [],
      profileFields: []
    };

    // Try to get page title/company from various sources
    data.company = this.findCompany();
    data.role = this.findRole();
    data.jobDescription = this.findJobDescription();

    // Find the main form on the page
    const form = this.findMainForm();
    
    if (form) {
      const fields = this.extractFormFields(form);
      
      for (const field of fields) {
        if (this.isProfileField(field.label)) {
          data.profileFields.push(field);
        } else if (this.isQuestion(field.label)) {
          data.questions.push(field);
        }
      }
    }

    return data;
  },

  findCompany() {
    // Try various common selectors
    const selectors = [
      '[class*="company"]',
      '[class*="employer"]',
      '[class*="organization"]',
      '[data-company]',
      '[data-employer]',
      'meta[property="og:site_name"]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        if (el.tagName === 'META') {
          return el.content || '';
        }
        const text = el.textContent.trim();
        if (text && text.length < 100) {
          return text;
        }
      }
    }

    // Try to extract from page title
    const title = document.title;
    if (title) {
      // Common patterns: "Job at Company" or "Company - Job Title"
      const atMatch = title.match(/at\s+([^-|]+)/i);
      if (atMatch) return atMatch[1].trim();
      
      const dashMatch = title.split(/[-|]/);
      if (dashMatch.length > 1) {
        // Often company is first or last
        return dashMatch[0].trim();
      }
    }

    return '';
  },

  findRole() {
    // Try to find job title
    const selectors = [
      'h1',
      '[class*="job-title"]',
      '[class*="jobtitle"]',
      '[class*="position"]',
      '[data-job-title]'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent.trim();
        if (text && text.length < 150) {
          return text;
        }
      }
    }

    return '';
  },

  findJobDescription() {
    // Look for job description content
    const selectors = [
      '[class*="description"]',
      '[class*="job-details"]',
      '[class*="job-content"]',
      '[id*="description"]',
      'article',
      '.content',
      'main'
    ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent.trim();
        if (text && text.length > 200) {
          return text.substring(0, 5000);
        }
      }
    }

    return '';
  },

  findMainForm() {
    // Find the most likely application form
    const forms = document.querySelectorAll('form');
    
    // Score each form based on likelihood of being an application form
    let bestForm = null;
    let bestScore = 0;

    for (const form of forms) {
      let score = 0;
      
      // Check for relevant keywords in form attributes
      const formStr = form.outerHTML.toLowerCase();
      if (formStr.includes('apply')) score += 5;
      if (formStr.includes('application')) score += 5;
      if (formStr.includes('submit')) score += 2;
      if (formStr.includes('candidate')) score += 3;
      
      // Check number of inputs
      const inputs = form.querySelectorAll('input, textarea, select');
      score += Math.min(inputs.length, 10);
      
      // Check for textareas (often used for essay questions)
      const textareas = form.querySelectorAll('textarea');
      score += textareas.length * 2;
      
      // Check for required fields
      const required = form.querySelectorAll('[required]');
      score += required.length;

      if (score > bestScore) {
        bestScore = score;
        bestForm = form;
      }
    }

    return bestForm;
  },

  extractFormFields(form) {
    const fields = [];
    
    // Find all potential form field containers
    const containers = form.querySelectorAll(
      '.form-group, .field, [class*="form-field"], [class*="input-group"], ' +
      'label, .form-row, [class*="question"]'
    );

    const processed = new Set();

    for (const container of containers) {
      // Skip if we've already processed an input in this container
      const input = this.findInput(container);
      if (!input || processed.has(input)) continue;
      
      processed.add(input);

      const label = this.findLabel(container, input);
      if (!label) continue;

      const required = input.hasAttribute('required') ||
                       input.getAttribute('aria-required') === 'true' ||
                       label.includes('*');

      fields.push({
        label: label.replace(/\*$/, '').trim(),
        selector: this.getSelector(input),
        type: this.getInputType(input),
        required
      });
    }

    return fields;
  },

  findInput(container) {
    return container.querySelector(
      'input:not([type="hidden"]):not([type="submit"]):not([type="button"]),' +
      'textarea,' +
      'select'
    );
  },

  findLabel(container, input) {
    // Try to find label by for attribute
    if (input.id) {
      const label = document.querySelector(`label[for="${input.id}"]`);
      if (label) return label.textContent.trim();
    }

    // Try to find label within container
    const labelEl = container.querySelector('label');
    if (labelEl) return labelEl.textContent.trim();

    // Try placeholder
    if (input.placeholder) return input.placeholder;

    // Try aria-label
    const ariaLabel = input.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel;

    // Try name attribute
    if (input.name) {
      return input.name.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
    }

    return '';
  },

  getSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.name) {
      const tagName = element.tagName.toLowerCase();
      return `${tagName}[name="${element.name}"]`;
    }

    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `[aria-label="${ariaLabel.replace(/"/g, '\\"')}"]`;
    }

    return this.generatePath(element);
  },

  generatePath(element) {
    const path = [];
    let current = element;
    
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      
      if (current.id) {
        path.unshift(`#${current.id}`);
        break;
      }
      
      // Add class if helpful
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ').filter(c => c && c.length < 30);
        if (classes.length > 0) {
          selector += '.' + classes[0];
        }
      }
      
      // Add index among siblings if needed
      const siblings = current.parentElement ? 
        Array.from(current.parentElement.children).filter(c => c.tagName === current.tagName) : [];
      if (siblings.length > 1) {
        const index = siblings.indexOf(current);
        selector += `:nth-of-type(${index + 1})`;
      }
      
      path.unshift(selector);
      current = current.parentElement;
      
      if (path.length > 6) break;
    }
    
    return path.join(' > ');
  },

  getInputType(element) {
    const tagName = element.tagName.toLowerCase();
    if (tagName === 'textarea') return 'textarea';
    if (tagName === 'select') return 'select';
    return element.type || 'text';
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
      /telephone/i,
      /linkedin/i,
      /github/i,
      /twitter/i,
      /portfolio/i,
      /website/i,
      /address/i,
      /city/i,
      /state/i,
      /zip/i,
      /postal/i,
      /country/i
    ];

    return profilePatterns.some(pattern => pattern.test(label));
  },

  isQuestion(label) {
    // Skip very short or common non-question labels
    if (label.length < 5) return false;
    
    const skipPatterns = [
      /^submit$/i,
      /^send$/i,
      /^upload$/i,
      /^attach$/i,
      /^file$/i,
      /^browse$/i
    ];

    if (skipPatterns.some(pattern => pattern.test(label))) {
      return false;
    }

    // Include if it looks like a question
    const questionPatterns = [
      /\?$/,
      /why/i,
      /what/i,
      /how/i,
      /when/i,
      /where/i,
      /describe/i,
      /explain/i,
      /tell us/i,
      /share/i,
      /please/i,
      /experience/i,
      /project/i,
      /skill/i,
      /cover letter/i,
      /message/i,
      /comments/i,
      /additional/i
    ];

    return label.length > 20 || questionPatterns.some(pattern => pattern.test(label));
  }
};
