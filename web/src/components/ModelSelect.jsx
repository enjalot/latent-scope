import { useState, useCallback } from 'react';
import Select from 'react-select';
import { selectStyles } from './Explore/SelectStyles';
import { format } from 'd3-format';

const intf = format(',d');

const groupStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
// machine facts (sizes, download counts) — mono, token-colored so both modes work
const downloadsStyle = {
  color: 'var(--text-color-text-subtle)',
  display: 'inline-block',
  fontFamily: 'var(--ls-font-mono)',
  fontSize: 'var(--ls-text-xs)',
  fontVariantNumeric: 'tabular-nums',
  fontWeight: 400,
  lineHeight: '1',
  minWidth: 1,
  padding: '0 0.5em',
  textAlign: 'center',
};
const providerStyle = {
  color: 'var(--text-color-text-subtle)',
  display: 'inline-block',
  fontFamily: 'var(--ls-font-mono)',
  fontSize: 'var(--ls-text-xs)',
  fontWeight: 400,
  lineHeight: '1',
  minWidth: 1,
  padding: '0 0.5em',
  textAlign: 'center',
};

function ModelSelect({
  defaultValue,
  placeholder = 'Select or search for model...',
  options,
  onChange,
  onInputChange,
}) {
  // const [defaultModel, setDefaultModel] = useState(defaultValue);
  // Add a state to track the input value
  const [inputValue, setInputValue] = useState('');
  // Update the input value and trigger the debounced search
  const handleInputChange = (newValue) => {
    setInputValue(newValue);
    onInputChange(newValue);
    return newValue;
  };
  const customFilterOption = (option, inputValue) => {
    const { provider, name } = option.data;
    return (
      provider.toLowerCase().includes(inputValue.toLowerCase()) ||
      name.toLowerCase().includes(inputValue.toLowerCase())
    );
  };
  const formatOptionLabel = useCallback((option) => {
    return (
      <div>
        <span style={providerStyle}>{option.provider} </span>
        <span>{option.name} </span>
        {option.size ? <span style={downloadsStyle}>size: {option.size}</span> : null}
        {option.downloads ? (
          <span style={downloadsStyle}>downloads: {intf(+option.downloads)}</span>
        ) : null}
      </div>
    );
  }, []);
  const formatGroupLabel = useCallback((option) => {
    return (
      <div style={groupStyles}>
        {option.label == 'huggingface' ? <span>Local Models</span> : <span>{option.label}</span>}
        {option.options.length ? (
          <span className="ls-chip">{option.options.length}</span>
        ) : null}
      </div>
    );
  }, []);

  return (
    <Select
      placeholder={placeholder}
      options={options}
      formatOptionLabel={formatOptionLabel}
      formatGroupLabel={formatGroupLabel}
      onInputChange={handleInputChange}
      inputValue={inputValue}
      filterOption={customFilterOption}
      getOptionValue={(option) => option.id}
      onChange={onChange}
      value={defaultValue}
      styles={selectStyles}
      // menuIsOpen={true}
    />
  );
}

export default ModelSelect;
