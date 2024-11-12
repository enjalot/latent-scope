import React from 'react';
import { Link } from 'react-router-dom';
import SubNav from './SubNav';
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
            <Link to="/settings">⚙ settings</Link>
          </li>
        </ul>
      </nav>
      {/* <SubNav /> */}
    </>
  );
};

export default Nav;
