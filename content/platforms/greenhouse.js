// Aiply Greenhouse Scraper

window.AiplyGreenhouse = {
  async scrape() {
    const data = {
      platform: 'Greenhouse',
      company: '',
      role: '',
      jobDescription: '',
      questions: [],
      profileFields: []
    };

    // Get company name
    const companyEl = document.querySelector('.company-name') || 
                      document.querySelector('[data-company-name]') ||
                      document.querySelector('.job-company');
    if (companyEl) {
      data.company = companyEl.textContent.trim();
    }

    // Get job title
    const roleEl = document.querySelector('.job-title') ||
                   document.querySelector('.app-title') ||
                   document.querySelector('h1.heading');
    if (roleEl) {
      data.role = roleEl.textContent.trim();
    }

    // Get job description
    const jdEl = document.querySelector('#content') ||
                 document.querySelector('.job-description') ||
                 document.querySelector('[data-automation="job-description"]');
    if (jdEl) {
      data.jobDescription = jdEl.textContent.trim().substring(0, 5000);
    }

    // Find form fields
    const form = document.querySelector('form#application-form') ||
                 document.querySelector('form[data-automation="job-application"]') ||
                 document.querySelector('form');

    if (form) {
      // Find all field containers
      const fieldContainers = form.querySelectorAll('.field, [class*="field-"]');
      
      for (const container of fieldContainers) {
        const field = this.parseField(container);
        if (field) {
          if (this.isProfileField(field.label)) {
            data.profileFields.push(field);
          } else if (this.isQuestion(field.label)) {
            data.questions.push(field);
          }
        }
      }

      // Also check for custom questions section
      const customQuestions = form.querySelectorAll('[data-automation*="custom-question"], .custom-question');
      for (const qEl of customQuestions) {
        const field = this.parseField(qEl);
        if (field) {
          data.questions.push(field);
        }
      }
    }

    return data;
  },

  parseField(container) {
    // Get label
    const label = container.querySelector('label');
    if (!label) return null;

    const labelText = label.textContent.trim();
    const required = container.querySelector('[required]') !== null ||
                     label.querySelector('.required') !== null ||
                     labelText.includes('*');

    // Find input
    const input = container.querySelector('input:not([type="hidden"]):not([type="submit"])') ||
                  container.querySelector('textarea') ||
                  container.querySelector('select');

    if (!input) return null;

    return {
      label: labelText.replace(/\*$/, '').replace('Required', '').trim(),
      selector: this.getSelector(input),
      type: this.getInputType(input),
      required
    };
  },

  getSelector(element) {
    if (element.id) {
      return `#${element.id}`;
    }
    
    if (element.name) {
      return `[name="${element.name}"]`;
    }

    const dataAutomation = element.getAttribute('data-automation');
    if (dataAutomation) {
      return `[data-automation="${dataAutomation}"]`;
    }

    // Use aria-labelledby
    const labelledBy = element.getAttribute('aria-labelledby');
    if (labelledBy) {
      return `[aria-labelledby="${labelledBy}"]`;
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
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ').filter(c => c && !c.startsWith('--'));
        if (classes.length > 0) {
          selector += '.' + classes[0];
        }
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
      /phone/i,
      /mobile/i,
      /linkedin/i,
      /github/i,
      /twitter/i,
      /portfolio/i,
      /website/i,
      /address/i,
      /city/i,
      /state/i,
      /zip/i,
      /country/i,
      /resume/i,
      /cover letter/i
    ];

    return profilePatterns.some(pattern => pattern.test(label));
  },

  isQuestion(label) {
    // Exclude standard form labels that aren't questions
    const skipPatterns = [
      /^add$/i,
      /^upload$/i,
      /^select$/i,
      /^choose$/i
    ];

    if (skipPatterns.some(pattern => pattern.test(label))) {
      return false;
    }

    // Include if it looks like a question or open-ended field
    const questionPatterns = [
      /\?$/,
      /why/i,
      /what/i,
      /how/i,
      /describe/i,
      /explain/i,
      /tell us/i,
      /share/i,
      /experience/i,
      /project/i,
      /skill/i,
      /additional/i,
      /interest/i,
      /motivation/i
    ];

    // If label is long or matches question patterns, treat as question
    return label.length > 30 || questionPatterns.some(pattern => pattern.test(label));
  }
};
