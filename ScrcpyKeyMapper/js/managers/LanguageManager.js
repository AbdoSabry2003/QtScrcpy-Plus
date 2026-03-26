export class LanguageManager {
    constructor() {
        this.currentLanguage = localStorage.getItem('language') || 'en';
        this.translations = {};
        this.rtlLanguages = ['ar'];
        this.init();
    }

    async init() {
        try {
            // Load all translations
            const languages = ['en', 'ar', 'zh'];
            for (const lang of languages) {
                const module = await import(`../i18n/${lang}.js`);
                this.translations[lang] = module.default;
            }

            // Initial setup
            this.setLanguage(this.currentLanguage);
            
            // Wait for DOM to be fully loaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.setupLanguageSelector());
            } else {
                this.setupLanguageSelector();
            }
        } catch (error) {
            console.error('Error initializing LanguageManager:', error);
        }
    }

    setLanguage(lang) {
        this.currentLanguage = lang;
        localStorage.setItem('language', lang);
        
        // Update HTML dir attribute for RTL support
        document.documentElement.dir = this.rtlLanguages.includes(lang) ? 'rtl' : 'ltr';
        
        // Update all text content
        this.updatePageContent();
    }

    setupLanguageSelector() {
        const container = document.getElementById('languageSelector');
        if (!container) {
            console.error('Language selector container not found');
            return;
        }

        // Create dropdown button with globe icon
        const dropdownButton = document.createElement('button');
        dropdownButton.className = 'btn btn-outline-secondary dropdown-toggle';
        dropdownButton.setAttribute('type', 'button');
        dropdownButton.setAttribute('data-bs-toggle', 'dropdown');
        dropdownButton.setAttribute('aria-expanded', 'false');
        dropdownButton.innerHTML = '<i class="bi bi-globe2"></i>';

        // Create dropdown menu
        const dropdownMenu = document.createElement('ul');
        dropdownMenu.className = 'dropdown-menu';

        const languages = [
            { code: 'en', name: 'English', flag: 'us' },
            { code: 'ar', name: 'العربية', flag: 'sa' },
            { code: 'zh', name: '中文', flag: 'cn' }
        ];

        languages.forEach(lang => {
            const li = document.createElement('li');
            const a = document.createElement('a');
            a.className = `dropdown-item${lang.code === this.currentLanguage ? ' active' : ''}`;
            a.href = '#';
            const flagSpan = document.createElement('span');
            flagSpan.className = `fi fi-${lang.flag} flag-icon`;
            const nameSpan = document.createElement('span');
            nameSpan.textContent = lang.name;
            
            a.appendChild(flagSpan);
            a.appendChild(nameSpan);
            a.addEventListener('click', (e) => {
                e.preventDefault();
                this.setLanguage(lang.code);
                // Update active state
                dropdownMenu.querySelectorAll('.dropdown-item').forEach(item => {
                    item.classList.toggle('active', item === a);
                });
            });
            li.appendChild(a);
            dropdownMenu.appendChild(li);
        });

        // Clear previous content and add the new dropdown
        container.innerHTML = '';
        container.appendChild(dropdownButton);
        container.appendChild(dropdownMenu);
    }

    updatePageContent() {
        // Update text content
        const elements = document.querySelectorAll('[data-i18n]');
        elements.forEach(element => {
            const key = element.getAttribute('data-i18n');
            if (this.translations[this.currentLanguage][key]) {
                element.textContent = this.translations[this.currentLanguage][key];
            }
        });

        // Update titles
        const elementsWithTitle = document.querySelectorAll('[data-i18n-title]');
        elementsWithTitle.forEach(element => {
            const key = element.getAttribute('data-i18n-title');
            if (this.translations[this.currentLanguage][key]) {
                element.title = this.translations[this.currentLanguage][key];
            }
        });

        // Update placeholders
        const elementsWithPlaceholder = document.querySelectorAll('[data-i18n-placeholder]');
        elementsWithPlaceholder.forEach(element => {
            const key = element.getAttribute('data-i18n-placeholder');
            if (this.translations[this.currentLanguage][key]) {
                element.placeholder = this.translations[this.currentLanguage][key];
            }
        });
    }

    translate(key) {
        return this.translations[this.currentLanguage][key] || key;
    }
}