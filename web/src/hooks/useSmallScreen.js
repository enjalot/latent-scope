import { useState, useEffect } from 'react';

export const useSmallScreen = (breakpoint = 1024) => {
  const [isSmallScreen, setIsSmallScreen] = useState(window.innerWidth <= breakpoint);

  useEffect(() => {
    const handleResize = () => {
      setIsSmallScreen(window.innerWidth <= breakpoint);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [breakpoint]);

  return isSmallScreen;
};
