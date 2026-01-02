// Aiply LinkedIn Scraper (JD extraction only - no Easy Apply)

window.AiplyLinkedIn = {
  async scrape() {
    const data = {
      platform: 'LinkedIn',
      company: '',
      role: '',
      jobDescription: '',
      questions: [],
      profileFields: []
    };

    // Get company name
    const companyEl = document.querySelector('.job-details-jobs-unified-top-card__company-name a') ||
                      document.querySelector('.jobs-unified-top-card__company-name a') ||
                      document.querySelector('.topcard__org-name-link') ||
                      document.querySelector('[data-tracking-control-name="public_jobs_topcard-org-name"]');
    if (companyEl) {
      data.company = companyEl.textContent.trim();
    }

    // Get job title
    const roleEl = document.querySelector('.job-details-jobs-unified-top-card__job-title h1') ||
                   document.querySelector('.jobs-unified-top-card__job-title') ||
                   document.querySelector('.topcard__title') ||
                   document.querySelector('h1.t-24');
    if (roleEl) {
      data.role = roleEl.textContent.trim();
    }

    // Get job description
    const jdEl = document.querySelector('.jobs-description__content') ||
                 document.querySelector('.jobs-box__html-content') ||
                 document.querySelector('.description__text') ||
                 document.querySelector('[data-job-description]') ||
                 document.querySelector('.show-more-less-html__markup');
    if (jdEl) {
      // Clean up the job description
      let jdText = jdEl.textContent.trim();
      // Remove excessive whitespace
      jdText = jdText.replace(/\s+/g, ' ').trim();
      data.jobDescription = jdText.substring(0, 5000);
    }

    // Get additional job details
    const detailsSection = document.querySelector('.job-details-jobs-unified-top-card__primary-description-container') ||
                           document.querySelector('.jobs-unified-top-card__subtitle-primary-grouping');
    if (detailsSection) {
      const details = detailsSection.textContent.trim();
      if (details && !data.jobDescription.includes(details)) {
        data.jobDescription = details + '\n\n' + data.jobDescription;
      }
    }

    // LinkedIn Easy Apply is not supported - add note
    const easyApplyBtn = document.querySelector('[data-control-name="jobdetails_topcard_inapply"]') ||
                         document.querySelector('.jobs-apply-button--top-card') ||
                         document.querySelector('.jobs-s-apply button');
    
    if (easyApplyBtn && easyApplyBtn.textContent.toLowerCase().includes('easy apply')) {
      // Could add a note about Easy Apply not being supported
      // But we still return the JD for reference
    }

    return data;
  }
};
