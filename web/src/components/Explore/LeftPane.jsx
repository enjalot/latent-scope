import React from 'react';
import './LeftPane.css';
import { Icon, Button } from 'react-element-forge';



export default function LeftPane() {
  return (
    <div className="left-pane-container">
      <Button
        className="left-pane-button"
        size="small"
        icon="info"
        color="secondary"
        title="View scope metadata"
      />
      <Button
        className="left-pane-button"
        size="small"
        icon="filter"
        color="secondary"
        title="Filter data points"
      />
      <Button
        className="left-pane-button disabled"
        size="small"
        icon="pen-tool"
        color="#efefef"
        title="Annotate"
        disabled
      />
      <Button
        className="left-pane-button disabled"
        size="small"
        icon="edit"
        color="#efefef"
        title="Edit data points"
        disabled
      />
    </div>
  );
}
