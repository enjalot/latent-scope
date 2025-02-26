import React from 'react';
import styles from './FilterActions.module.scss';
import Container from './Search/Container';

export default function FilterActions() {
  return (
    <div className={styles.container}>
      <div className={styles.actionsRow}>
        <Container />
      </div>
    </div>
  );
}
