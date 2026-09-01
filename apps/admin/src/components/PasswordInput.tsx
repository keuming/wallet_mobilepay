'use client';

import { useState, InputHTMLAttributes } from 'react';

/**
 * Champ mot de passe / code PIN avec icône œil pour afficher/masquer la
 * saisie — accepte les mêmes props qu'un <input> classique.
 */
export default function PasswordInput({ style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <input
        {...props}
        type={visible ? 'text' : 'password'}
        style={{ ...style, width: '100%', paddingRight: 38, boxSizing: 'border-box' }}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Masquer' : 'Afficher'}
        style={{
          position: 'absolute',
          right: 10,
          top: '50%',
          transform: 'translateY(-50%)',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontSize: 16,
          padding: 0,
          lineHeight: 1,
          opacity: 0.6,
        }}
      >
        {visible ? '🙈' : '👁️'}
      </button>
    </div>
  );
}
