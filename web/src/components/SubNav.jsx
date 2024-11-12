import { Link, useLocation } from 'react-router-dom';
import styles from './SubNav.module.css';

const SubNav = ({ children }) => {
  const location = useLocation();

  const tabs = [
    { label: 'Setup', path: '/setup' },
    { label: 'Explore', path: '/explore' },
    { label: 'Export', path: '/export' },
    { label: 'Job History', path: '/job-history' },
  ];

  return (
    <div className={styles.subHeaderContainer}>
      <div className={styles.tabsContainer}>
        {tabs.map((tab) => (
          <Link
            key={tab.path}
            to={tab.path}
            className={`${styles.tab} ${location.pathname === tab.path ? styles.activeTab : ''}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
};

export default SubNav;
