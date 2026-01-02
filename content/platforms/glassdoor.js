// Aiply Glassdoor Scraper

window.AiplyGlassdoor = {
  async scrape() {
    const data = {
      platform: 'Glassdoor',
      company: '',
      role: '',
      jobDescription: '',
      questions: [],
      profileFields: []
    };

    // Get company name from job listing
    const companyEl = document.querySelector('[data-test="employer-name"]') ||
                      document.querySelector('.EmployerProfile_employerName__tthV_') ||
                      document.querySelector('.css-87uc0g');
    if (companyEl) {
      data.company = companyEl.textContent.trim();
    }

    // Get job title
    const roleEl = document.querySelector('[data-test="job-title"]') ||
                   document.querySelector('.JobDetails_jobTitle__Rw_gN') ||
                   document.querySelector('h1');
    if (roleEl) {
      data.role = roleEl.textContent.trim();
    }

    // Get job description
    const jdEl = document.querySelector('[data-test="job-description"]') ||
                 document.querySelector('.JobDetails_jobDescription__uW_fK') ||
                 document.querySelector('.desc');
    if (jdEl) {
      data.jobDescription = jdEl.textContent.trim().substring(0, 5000);
    }

    // Find application form (if on apply page)
    const form = document.querySelector('form[data-test="apply-form"]') ||
                 document.querySelector('.applyForm') ||
                 document.querySelector('form');

    if (form) {
      // Find all form groups
      const formGroups = form.querySelectorAll('.form-group, [data-test*="form"], .css-1mmpw1j');
      
      for (const group of formGroups) {
        const field = this.parseField(group);
        if (field) {
          if (this.isProfileField(field.label)) {
            data.profileFields.push(field);
          } else if (this.isQuestion(field.label)) {
            data.questions.push(field);
          }
        }
      }
    }

    return data;
  },

  parseField(container) {
    // Get label
    const label = container.querySelector('label, .css-dvxtzn');
    if (!label) return null;

    const labelText = label.textContent.trim();
    if (!labelText) return null;

    const required = container.querySelector('[required]') !== null ||
                     container.querySelector('[aria-required="true"]') !== null ||
                     labelText.includes('*');

    // Find input
    const input = container.querySelector('input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])') ||
                  container.querySelector('textarea') ||
                  container.querySelector('select');

    if (!input) return null;

    return {
      label: labelText.replace(/\*$/, '').trim(),
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

    const dataTest = element.getAttribute('data-test');
    if (dataTest) {
      return `[data-test="${dataTest}"]`;
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
      
      const dataTest = current.getAttribute('data-test');
      if (dataTest) {
        path.unshift(`[data-test="${dataTest}"]`);
        break;
      }
      
      if (current.className && typeof current.className === 'string') {
        const classes = current.className.split(' ').filter(c => c && !c.startsWith('css-'));
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
      /location/i,
      /city/i
    ];

    return profilePatterns.some(pattern => pattern.test(label));
  },

  isQuestion(label) {
    const skipPatterns = [
      /^add$/i,
      /^upload$/i,
      /^attach$/i
    ];

    if (skipPatterns.some(pattern => pattern.test(label))) {
      return false;
    }

    const questionPatterns = [
      /\?$/,
      /why/i,
      /what/i,
      /how/i,
      /describe/i,
      /explain/i,
      /tell us/i,
      /experience/i,
      /cover letter/i,
      /additional/i
    ];

    return label.length > 25 || questionPatterns.some(pattern => pattern.test(label));
  }
};
