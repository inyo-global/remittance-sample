import React from 'react';

const Input = ({ label, type = 'text', value, onChange, placeholder, name, required = false, options = null }) => {
    return (
        <div className="mb-4">
            {label && <label htmlFor={name} className="block mb-2 text-sm font-bold text-gray-700">{label}</label>}
            {options ? (
                <select
                    id={name}
                    name={name}
                    value={value}
                    onChange={onChange}
                    required={required}
                >
                    <option value="" disabled>Select {label}</option>
                    {options.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
            ) : (
                <input
                    id={name}
                    name={name}
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required={required}
                />
            )}
        </div>
    );
};

export default Input;
