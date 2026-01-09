import React from 'react';

const Input = ({ label, type = 'text', value, onChange, placeholder, name, required = false, options = null, ...props }) => {
    return (
        <div className="mb-4">
            {label && <label htmlFor={name} className="block mb-2 text-sm font-bold text-gray-700">{label}</label>}
            {options ? (
                <div className="relative">
                    <select
                        id={name}
                        name={name}
                        value={value}
                        onChange={onChange}
                        required={required}
                        className="w-full p-3 border border-gray-300 rounded text-lg appearance-none bg-white"
                        {...props}
                    >
                        <option value="" disabled>Select {label}</option>
                        {options.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                    <span className="absolute right-4 top-1/2 transform -translate-y-1/2 text-primary font-bold">▼</span>
                </div>
            ) : (
                <input
                    id={name}
                    name={name}
                    type={type}
                    value={value}
                    onChange={onChange}
                    placeholder={placeholder}
                    required={required}
                    className="w-full p-3 border border-gray-300 rounded text-lg"
                    {...props}
                />
            )}
        </div>
    );
};

export default Input;
