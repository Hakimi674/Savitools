import React from 'react';

interface HexInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  length?: number;
}

export const HexInput: React.FC<HexInputProps> = ({
  label,
  value,
  onChange,
  required = false,
  length = 32
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const hexValue = e.target.value.replace(/[^0-9a-fA-F]/g, '');
    if (hexValue.length <= length) {
      onChange(hexValue);
    }
  };

  return (
    <div>
      <label>
        {label}
        {required && <span>*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        placeholder={`32-byte hex (e.g. ${'a'.repeat(64)})`}
        maxLength={length * 2}
      />
      {value.length > 0 && value.length < length * 2 && (
        <small>Must be {length}-byte hex</small>
      )}
    </div>
  );
};