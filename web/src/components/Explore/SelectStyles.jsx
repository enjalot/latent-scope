// react-select theme — the standard styles object for every react-select in
// the app. All values are CSS custom-property strings so both color modes
// resolve automatically; never put hex literals here.
export const selectStyles = {
  control: (styles, { isFocused }) => ({
    ...styles,
    backgroundColor: 'var(--ls-surface-input)',
    borderColor: isFocused
      ? 'var(--interactions---primary-color-interaction-primary)'
      : 'var(--borders-color-border-2)',
    borderRadius: 'var(--ls-radius-2)',
    boxShadow: 'none',
    fontFamily: 'var(--ls-font-ui)',
    fontSize: 'var(--ls-text-sm)',
    '&:hover': {
      borderColor: isFocused
        ? 'var(--interactions---primary-color-interaction-primary)'
        : 'var(--neutrals-color-neutral-3)',
    },
  }),
  menu: (styles) => ({
    ...styles,
    backgroundColor: 'var(--ls-surface-panel)',
    border: '1px solid var(--borders-color-border-1)',
    borderRadius: 'var(--ls-radius-2)',
    boxShadow: 'var(--ls-shadow-2)',
    zIndex: 'var(--ls-z-dropdown)',
  }),
  option: (styles, { isFocused, isSelected }) => ({
    ...styles,
    backgroundColor: isSelected
      ? 'var(--interactions---primary-color-interaction-primary)'
      : isFocused
        ? 'var(--neutrals-color-neutral-2)'
        : 'var(--ls-surface-panel)',
    color: isSelected ? 'var(--text-color-text-reverse)' : 'var(--text-color-text-main)',
    fontFamily: 'var(--ls-font-ui)',
    fontSize: 'var(--ls-text-sm)',
    '&:active': {
      backgroundColor: 'var(--interactions---primary-color-interaction-primary-active)',
    },
  }),
  singleValue: (styles) => ({
    ...styles,
    color: 'var(--text-color-text-main)',
  }),
  input: (styles) => ({
    ...styles,
    color: 'var(--text-color-text-main)',
  }),
  placeholder: (styles) => ({
    ...styles,
    color: 'var(--text-color-text-disabled)',
  }),
};
