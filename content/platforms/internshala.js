// Aiply Internshala Scraper

window.AiplyInternshala = {
  async scrape() {
    const data = {
      platform: 'Internshala',
      company: '',
      role: '',
      jobDescription: '',
      questions: [],
      profileFields: []
    };

    // Get company name
    const companyEl = document.querySelector('.company_name') ||
                      document.querySelector('.heading_4_5 a') ||
                      document.querySelector('.company-name');
    if (companyEl) {
      data.company = companyEl.textContent.trim();
    }

    // Get job/internship title
    const roleEl = document.querySelector('.heading_4_5.profile') ||
                   document.querySelector('.heading_4_5') ||
                   document.querySelector('.job_heading_container h1') ||
                   document.querySelector('h1.heading_4_5');
    if (roleEl) {
      data.role = roleEl.textContent.trim();
    }

    // Get internship/job description
    const jdEl = document.querySelector('.internship_details') ||
                 document.querySelector('.text-container') ||
                 document.querySelector('.about_company_text') ||
                 document.querySelector('#about_company');
    if (jdEl) {
      data.jobDescription = jdEl.textContent.trim().substring(0, 5000);
    }

    // Also get skills required
    const skillsEl = document.querySelector('.round_tabs_container');
    if (skillsEl) {
      const skills = Array.from(skillsEl.querySelectorAll('.round_tabs'))
        .map(el => el.textContent.trim())
        .join(', ');
      if (skills) {
        data.jobDescription += '\n\nRequired Skills: ' + skills;
      }
    }

    // Find application form
    const form = document.querySelector('#application_form') ||
                 document.querySelector('.application-form') ||
                 document.querySelector('form');

    if (form) {
      // Find all form groups
      const formGroups = form.querySelectorAll('.form-group, .application_question');
      
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

      // Check for cover letter
      const coverLetterEl = form.querySelector('#cover_letter') ||
                            form.querySelector('[name="cover_letter"]') ||
                            form.querySelector('textarea[placeholder*="cover letter"]');
      if (coverLetterEl) {
        data.questions.push({
          label: 'Cover Letter',
          selector: this.getSelector(coverLetterEl),
          type: 'textarea',
          required: coverLetterEl.hasAttribute('required')
        });
      }

      // Check for additional questions
      const additionalQuestions = form.querySelectorAll('.additional_question, .custom-question');
      for (const qEl of additionalQuestions) {
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
    if (!labelText) return null;

    const required = container.querySelector('[required]') !== null ||
                     container.classList.contains('required') ||
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
        const classes = current.className.split(' ').filter(c => c);
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
      /email/i,
      /phone/i,
      /mobile/i,
      /linkedin/i,
      /github/i,
      /portfolio/i,
      /website/i,
      /college/i,
      /university/i,
      /graduation/i
    ];

    return profilePatterns.some(pattern => pattern.test(label));
  },

  isQuestion(label) {
    const skipPatterns = [
      /^upload$/i,
      /^attach$/i,
      /^resume$/i
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
      /cover letter/i,
      /experience/i,
      /project/i,
      /availability/i,
      /assessment/i,
      /assignment/i
    ];

    return label.length > 20 || questionPatterns.some(pattern => pattern.test(label));
  }
};
