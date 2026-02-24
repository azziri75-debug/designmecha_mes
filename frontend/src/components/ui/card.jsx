import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs) {
    return twMerge(clsx(inputs));
}

export const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700 shadow-sm", className)}>
        {children}
    </div>
);

export const CardHeader = ({ children, className }) => (
    <div className={cn("p-6 pb-4 border-b border-gray-700", className)}>
        {children}
    </div>
);

export const CardTitle = ({ children, className }) => (
    <h3 className={cn("text-lg font-semibold text-white", className)}>
        {children}
    </h3>
);

export const CardDescription = ({ children, className }) => (
    <p className={cn("text-sm text-gray-500", className)}>
        {children}
    </p>
);

export const CardContent = ({ children, className }) => (
    <div className={cn("p-6", className)}>
        {children}
    </div>
);

export const CardFooter = ({ children, className }) => (
    <div className={cn("p-6 pt-0 border-t border-gray-700 flex items-center", className)}>
        {children}
    </div>
);
