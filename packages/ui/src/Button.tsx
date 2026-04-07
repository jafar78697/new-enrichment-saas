import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: 'sm' | 'md';
}

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-[#0F766E] hover:bg-[#115E59] text-white',
  secondary: 'bg-white border border-[#D8E1D7] text-[#52606D] hover:border-[#0F766E]',
  ghost: 'text-[#52606D] hover:bg-[#EEF2EA]',
  danger: 'bg-[#DC2626] hover:bg-red-700 text-white',
};

export default function Button({ variant = 'primary', size = 'md', className = '', children, ...props }: ButtonProps) {
  const sizeClass = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <button className={`${VARIANTS[variant]} ${sizeClass} rounded-lg font-medium transition-colors disabled:opacity-50 ${className}`} {...props}>
      {children}
    </button>
  );
}
