import React, { useState } from "react";
import { IconEye, IconEyeOff } from "./icons.jsx";

// Champ mot de passe réutilisable avec bouton œil pour afficher/masquer.
// S'utilise comme un <input> : props value, onChange, placeholder, required,
// minLength, autoComplete, className, id, autoFocus...
export default function PasswordInput({
  value,
  onChange,
  className = "input",
  classNameField = "password-field",
  iconSize = 18,
  ...props
}) {
  const [visible, setVisible] = useState(false);
  const toggle = (e) => {
    e.preventDefault();
    setVisible((v) => !v);
  };
  return (
    <span className={classNameField}>
      <input
        type={visible ? "text" : "password"}
        className={className}
        value={value}
        onChange={onChange}
        {...props}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={toggle}
        tabIndex={-1}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        title={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
      >
        {visible ? <IconEyeOff size={iconSize} /> : <IconEye size={iconSize} />}
      </button>
    </span>
  );
}
