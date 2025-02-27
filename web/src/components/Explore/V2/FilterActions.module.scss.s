@media (prefers-color-scheme: dark) {
  .filter-actions-button {
    border: .5px solid var(--neutrals-color-neutral-3) !important;
  }
}

.container {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actionsContainer {
  display: flex;
  gap: 8px;
  flex-direction: row;
}

.actionsButton {
  border-radius: 4px !important;
  padding: 0.25rem 0.5rem !important;
  font-size: 0.875rem !important;

  &:focus {
    outline: none;
  }

  &:hover {
    background-color: var(--interactions---primary-color-interaction-primary-hover) !important;
    color: var(--text-color-text-reverse) !important;
  }
  
  &.active {
    background-color: var(--interactions---primary-color-interaction-primary) !important;
    color: var(--text-color-text-reverse) !important;
  }
  
  &.notActive {
    background-color: var(--surface-color);
    color: var(--text-color-text-primary);
    opacity: 0.75;
  }

  @media (prefers-color-scheme: dark) {
    border: .5px solid var(--neutrals-color-neutral-3);
  }
}

.actionsRow {
  display: flex;
  width: 100%;
  flex-direction: row;
  gap: 0.5rem;
  margin-top: 0.5rem;
  align-items: center;
}

.filterRow {
  display: flex;
  width: 100%;
  align-items: center;
  padding: 8px;
  
  &.active {
    background-color: var(--surface-variant);
    border-radius: 4px;
  }
}

.filterCell {
  &.left {
    flex: 1;
  }
  
  &.middle {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  &.right {
    width: 40px;
  }
}

.count {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 52px;
}