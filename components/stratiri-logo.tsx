// Stratiri Logo Component
// Professional finance-oriented branding

interface StratiriLogoProps {
  variant?: 'full' | 'icon' | 'text';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function StratiriLogo({ variant = 'full', size = 'md', className = '' }: StratiriLogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 48, text: 'text-3xl' },
  };

  const iconSize = sizes[size].icon;
  const textSize = sizes[size].text;

  // Icon only (for sidebar collapsed, favicon)
  if (variant === 'icon') {
    return (
      <div className={`inline-flex items-center justify-center ${className}`}>
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Geometric frame representing structure & security */}
          <rect
            x="2"
            y="2"
            width="28"
            height="28"
            rx="6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          {/* Bold S letterform */}
          <path
            d="M 19 10 C 19 8 17 7 15 7 C 13 7 11 8 11 10 C 11 12 13 12 16 13 C 19 14 21 15 21 18 C 21 21 19 23 16 23 C 13 23 11 21 11 19"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
    );
  }

  // Text only
  if (variant === 'text') {
    return (
      <span className={`font-bold tracking-tight ${textSize} ${className}`}>
        Stratiri
      </span>
    );
  }

  // Full logo (icon + text)
  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div className="flex-shrink-0">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="2"
            y="2"
            width="28"
            height="28"
            rx="6"
            stroke="currentColor"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 19 10 C 19 8 17 7 15 7 C 13 7 11 8 11 10 C 11 12 13 12 16 13 C 19 14 21 15 21 18 C 21 21 19 23 16 23 C 13 23 11 21 11 19"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className={`font-bold tracking-tight leading-none ${textSize}`}>
          Stratiri
        </span>
        <span className="text-[10px] text-muted-foreground tracking-wide uppercase leading-none mt-0.5">
          Strategic Finance
        </span>
      </div>
    </div>
  );
}

// Colored version for marketing/hero sections
export function StratiriLogoColored({ size = 'md', className = '' }: Omit<StratiriLogoProps, 'variant'>) {
  const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 48, text: 'text-3xl' },
  };

  const iconSize = sizes[size].icon;
  const textSize = sizes[size].text;

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      <div className="flex-shrink-0 bg-primary rounded-lg p-1.5">
        <svg
          width={iconSize}
          height={iconSize}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect
            x="2"
            y="2"
            width="28"
            height="28"
            rx="6"
            stroke="white"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M 19 10 C 19 8 17 7 15 7 C 13 7 11 8 11 10 C 11 12 13 12 16 13 C 19 14 21 15 21 18 C 21 21 19 23 16 23 C 13 23 11 21 11 19"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
            fill="none"
          />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className={`font-bold tracking-tight leading-none ${textSize} bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent`}>
          Stratiri
        </span>
        <span className="text-[10px] text-muted-foreground tracking-wide uppercase leading-none mt-0.5">
          Strategic Finance
        </span>
      </div>
    </div>
  );
}

