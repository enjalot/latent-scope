import PropTypes from 'prop-types';

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': 'true',
};

// feather icon paths (chevrons-left / chevron-left / chevron-right / chevrons-right)
const FirstIcon = () => (
  <svg {...iconProps}>
    <polyline points="11 17 6 12 11 7" />
    <polyline points="18 17 13 12 18 7" />
  </svg>
);
const PrevIcon = () => (
  <svg {...iconProps}>
    <polyline points="15 18 9 12 15 6" />
  </svg>
);
const NextIcon = () => (
  <svg {...iconProps}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);
const LastIcon = () => (
  <svg {...iconProps}>
    <polyline points="13 17 18 12 13 7" />
    <polyline points="6 17 11 12 6 7" />
  </svg>
);

// Icon-button pagination + mono readout: |< < PAGE 3 / 128 > >|
// `page` is 1-indexed; onPage receives the 1-indexed target page.
export function Pagination({ page, totalPages, onPage }) {
  const atFirst = page <= 1;
  const atLast = page >= totalPages;
  return (
    <nav className="ls-pagination" aria-label="Pagination">
      <button
        type="button"
        className="ls-icon-btn"
        onClick={() => onPage(1)}
        disabled={atFirst}
        aria-label="First page"
      >
        <FirstIcon />
      </button>
      <button
        type="button"
        className="ls-icon-btn"
        onClick={() => onPage(page - 1)}
        disabled={atFirst}
        aria-label="Previous page"
      >
        <PrevIcon />
      </button>
      <span className="ls-pagination__readout">
        PAGE {page.toLocaleString()} / {totalPages.toLocaleString()}
      </span>
      <button
        type="button"
        className="ls-icon-btn"
        onClick={() => onPage(page + 1)}
        disabled={atLast}
        aria-label="Next page"
      >
        <NextIcon />
      </button>
      <button
        type="button"
        className="ls-icon-btn"
        onClick={() => onPage(totalPages)}
        disabled={atLast}
        aria-label="Last page"
      >
        <LastIcon />
      </button>
    </nav>
  );
}

Pagination.propTypes = {
  page: PropTypes.number.isRequired,
  totalPages: PropTypes.number.isRequired,
  onPage: PropTypes.func.isRequired,
};

export default Pagination;
