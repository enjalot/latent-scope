import { NavLink } from 'react-router-dom';
import SettingsModal from './SettingsModal';
import { StatusDiode } from './ui';
import './Nav.css';

const Nav = () => {
  return (
    <nav className="main-nav">
      <NavLink to="/" end className="wordmark">
        <StatusDiode status="ready" />
        Latent Scope
      </NavLink>
      <div className="settings">
        <SettingsModal tooltip={false} color="secondary" variant="clear" />
      </div>
    </nav>
  );
};

export default Nav;
