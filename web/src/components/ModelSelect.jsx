import { useState, useCallback } from 'react';
import Select from 'react-select'

import { format } from 'd3-format'

const intf = format(",d")

const groupStyles = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
};
const groupBadgeStyles = {
  backgroundColor: '#EBECF0',
  borderRadius: '2em',
  color: '#172B4D',
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 'normal',
  lineHeight: '1',
  minWidth: 1,
  padding: '0.16666666666667em 0.5em',
  textAlign: 'center',
};
const downloadsStyle = {
  color: '#172B4D',
  display: 'inline-block',
  fontSize: 12,
  fontWeight: 'normal',
  lineHeight: '1',
  minWidth: 1,
  padding: '0.16666666666667em 0.5em',
  textAlign: 'center',
};
const providerStyle = {
  color: '#ccc',
  display: 'inline-block',
  // fontSize: 12,
  fontWeight: 'normal',
  lineHeight: '1',
  minWidth: 1,
  padding: '0.16666666666667em 0.5em',
  textAlign: 'center',
};

function ModelSelect({
  defaultValue,
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
    return newValue
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
        {option.downloads ? <span style={downloadsStyle}>downloads: {intf(+option.downloads)}</span> : null}
      </div>
    );
  }, []);
  const formatGroupLabel = useCallback((option) => {
    return (
      <div style={groupStyles}>
        {option.label == "🤗" ? <span>🤗 Sentence Transformers</span> : <span>{option.label}</span>}
        {option.options.length ? <span style={groupBadgeStyles}>{option.options.length}</span> : null}
      </div>
    );
  }, []); 

  return (
    <Select 
      placeholder="Select or search for model..."
      options={options} 
      formatOptionLabel={formatOptionLabel} 
      formatGroupLabel={formatGroupLabel}
      onInputChange={handleInputChange}
      inputValue={inputValue} 
      filterOption={customFilterOption}
      getOptionValue={(option) => option.id} 
      onChange={onChange}
      value={defaultValue}
      // menuIsOpen={true}
    />

  )
}

export default ModelSelect