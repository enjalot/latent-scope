import React from 'react';
import './LeftPane.css';
import { Button } from 'react-element-forge';

export default function LeftPane() {
  return (
    <div className="left-pane-container">
      <div className="button-column main-buttons">
        <Button
          className="left-pane-button"
          size="small"
          icon="table"
          color="secondary"
          title="Filter data points"
        />
        <Button
          className="left-pane-button disabled"
          size="small"
          icon="edit"
          color="secondary"
          title="View scope metadata"
        />
        <Button
          className="left-pane-button disabled"
          size="small"
          icon="pen-tool"
          color="secondary"
          title="Annotate"
          disabled
        />
      </div>
      <div className="button-column info-button">
        <Button
          className="left-pane-button"
          size="small"
          icon="info"
          color="secondary"
          title="Edit data points"
        />
      </div>
    </div>
  );
}
