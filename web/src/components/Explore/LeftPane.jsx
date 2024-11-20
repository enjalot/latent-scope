import React from 'react';
import './LeftPane.css';
import { Icon, Button } from 'react-element-forge';

export default function LeftPane() {
  const filterIcon = <Icon name="filter" color="black" />;

  const infoIcon = <Icon name="info" color="black" />;

  const editIcon = <Icon name="edit" color="green" />;

  return (
    <div className="left-pane-container">
      {infoIcon}
      {filterIcon}
      {editIcon}
      {/* <Button icon={infoIcon} color="secondary" />
      <Button icon={filterIcon} color="secondary" /> */}
    </div>
  );
}
