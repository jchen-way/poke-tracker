'use client';

import { useEffect, useState } from 'react';

type CursorAuraProps = {
  variant?: 'landing' | 'about';
};

export default function CursorAura({ variant = 'landing' }: CursorAuraProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(pointer: fine)');
    if (!mediaQuery.matches) {
      return undefined;
    }

    const handleMove = (event: MouseEvent) => {
      setVisible(true);
      setPosition({ x: event.clientX, y: event.clientY });
    };

    const handleLeave = () => setVisible(false);

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseout', handleLeave);

    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseout', handleLeave);
    };
  }, []);

  return (
    <>
      <div
        aria-hidden="true"
        className={`cursor-aura cursor-aura-${variant} ${visible ? 'is-visible' : ''}`}
        style={{
          transform: `translate(${position.x}px, ${position.y}px)`,
        }}
      />

      <style jsx>{`
        .cursor-aura {
          position: fixed;
          top: 0;
          left: 0;
          width: 220px;
          height: 220px;
          border-radius: 999px;
          pointer-events: none;
          z-index: 0;
          opacity: 0;
          filter: blur(26px);
          transition: opacity 220ms ease;
          mix-blend-mode: multiply;
          will-change: transform, opacity;
        }

        .cursor-aura.is-visible {
          opacity: 0.55;
        }

        .cursor-aura-landing {
          background:
            radial-gradient(circle, rgba(160, 196, 255, 0.34) 0%, rgba(168, 230, 207, 0.22) 42%, rgba(255, 255, 255, 0) 74%);
        }

        .cursor-aura-about {
          width: 240px;
          height: 240px;
          background:
            radial-gradient(circle, rgba(255, 170, 165, 0.24) 0%, rgba(160, 196, 255, 0.22) 38%, rgba(255, 255, 255, 0) 76%);
        }

        @media (pointer: coarse) {
          .cursor-aura {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
