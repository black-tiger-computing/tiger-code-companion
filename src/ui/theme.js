/* Tiger Code Pilot - Theme Configuration */

module.exports = {
  name: 'Tiger Code Pilot Theme',
  version: '1.0.0',

  // Color Palette
  colors: {
    // Primary Colors — Brand Red
    primary: '#dc2626',
    primaryHover: '#b91c1c',
    primaryLight: '#f87171',

    // Secondary Colors
    secondary: '#10b981',
    secondaryHover: '#059669',

    // Accent Colors
    accent: '#f59e0b',
    danger: '#ef4444',
    warning: '#f59e0b',
    success: '#10b981',
    info: '#3b82f6',

    // Background Colors
    bgPrimary: '#0f172a',
    bgSecondary: '#1e293b',
    bgTertiary: '#334155',
    bgHover: '#475569',

    // Text Colors
    textPrimary: '#f8fafc',
    textSecondary: '#94a3b8',
    textMuted: '#64748b',
    textDisabled: '#475569',

    // Border Colors
    border: '#334155',
    borderLight: '#475569',
    borderFocus: '#dc2626',

    // Code Highlighting (vs-dark inspired)
    code: {
      background: '#1e1e1e',
      text: '#d4d4d4',
      keyword: '#569cd6',
      string: '#ce9178',
      comment: '#6a9955',
      number: '#b5cea8',
      function: '#dcdcaa',
      type: '#4ec9b0',
      variable: '#9cdcfe',
      operator: '#d4d4d4'
    },

    // Gradients
    gradients: {
      primary: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
      success: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
      header: 'linear-gradient(135deg, #1e293b 0%, #334155 100%)'
    },

    // Shadows
    shadows: {
      sm: '0 1px 2px 0 rgba(0, 0, 0, 0.2)',
      md: '0 4px 6px -1px rgba(0, 0, 0, 0.3)',
      lg: '0 10px 15px -3px rgba(0, 0, 0, 0.4)',
      xl: '0 20px 25px -5px rgba(0, 0, 0, 0.5)'
    }
  },

  // Typography
  typography: {
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    codeFontFamily: "'JetBrains Mono', 'Fira Code', 'Consolas', monospace",

    fontSize: {
      xs: '0.75rem',
      sm: '0.8125rem',
      base: '0.875rem',
      lg: '0.9375rem',
      xl: '1.125rem',
      '2xl': '1.25rem',
      '3xl': '1.5rem'
    },

    fontWeight: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700
    },

    lineHeight: {
      tight: 1.25,
      normal: 1.5,
      relaxed: 1.75
    }
  },

  // Spacing
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    base: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
    '2xl': '2rem'
  },

  // Border Radius
  borderRadius: {
    sm: '4px',
    base: '6px',
    md: '8px',
    lg: '12px',
    xl: '16px',
    full: '9999px'
  },

  // Transitions
  transitions: {
    fast: 'all 0.15s ease',
    base: 'all 0.2s ease',
    slow: 'all 0.3s ease'
  },

  // Animations
  animations: {
    pulse: `
      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
      }
    `,
    spin: `
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    `,
    slideIn: `
      @keyframes slideIn {
        from {
          opacity: 0;
          transform: translateY(10px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
    `,
    shimmer: `
      @keyframes shimmer {
        0% { background-position: -200% 0; }
        100% { background-position: 200% 0; }
      }
    `
  }
};
