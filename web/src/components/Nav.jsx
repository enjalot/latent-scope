import { useState } from 'react';
import { Link } from 'react-router-dom';
import SettingsModal from './SettingsModal';
import SubNav from './SubNav';
import './Nav.css';

const Nav = () => {
  const [showSettings, setShowSettings] = useState(false);
  return (
    <>
      <nav>
        <ul>
          <li>
            <Link to="/">Latent Scope</Link>
          </li>
          <li className="settings">
            <SettingsModal tooltip={false} color="secondary" variant="clear" />
          </li>
        </ul>
      </nav>
      {/* <SubNav /> */}
    </>
  );
};

export default Nav;
