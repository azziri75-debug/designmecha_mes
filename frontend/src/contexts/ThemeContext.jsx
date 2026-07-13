import React, { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
    const [isDark, setIsDark] = useState(() => {
        const saved = localStorage.getItem('mes_theme');
        return saved !== null ? saved === 'dark' : true; // 기본값: 다크모드
    });

    useEffect(() => {
        localStorage.setItem('mes_theme', isDark ? 'dark' : 'light');
        // html 최상위에 class 적용 (Tailwind dark: 접두사 방식과 병용)
        if (isDark) {
            document.documentElement.classList.add('dark');
            document.documentElement.classList.remove('light-mode');
        } else {
            document.documentElement.classList.remove('dark');
            document.documentElement.classList.add('light-mode');
        }
    }, [isDark]);

    const toggleTheme = () => setIsDark(prev => !prev);

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
};

export default ThemeContext;
