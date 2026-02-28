import React from 'react';
import { cn } from '../lib/utils';

const Card = ({ children, className }) => (
    <div className={cn("bg-gray-800 rounded-xl border border-gray-700 shadow-sm overflow-hidden", className)}>
        {children}
    </div>
);

export default Card;
