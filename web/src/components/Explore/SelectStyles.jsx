export const selectStyles = {
  control: (styles) => ({
    ...styles,
    backgroundColor: 'var(--neutrals-color-neutral-0)',
    borderColor: 'var(--borders-color-border-1)',
    '&:hover': {
      borderColor: 'var(--borders-color-border-2)',
    },
  }),
  menu: (styles) => ({
    ...styles,
    backgroundColor: 'var(--neutrals-color-neutral-0)',
    border: '1px solid var(--borders-color-border-1)',
  }),
  option: (styles, { isFocused, isSelected }) => ({
    ...styles,
    backgroundColor: isSelected
      ? 'var(--interactions---primary-color-interaction-primary)'
      : isFocused
        ? 'var(--neutrals-color-neutral-1)'
        : 'var(--neutrals-color-neutral-0)',
    color: isSelected ? 'var(--text-color-text-reverse)' : 'var(--text-color-text-main)',
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
    color: 'var(--text-color-text-subtle)',
  }),
};
