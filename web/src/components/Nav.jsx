import { Link } from 'react-router-dom';
import SettingsModal from './SettingsModal';
import './Nav.css';

const Nav = () => {
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
