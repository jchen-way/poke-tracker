'use client';

import { type CSSProperties, type ReactNode, useRef } from 'react';

type PointerTiltProps = {
  children: ReactNode;
  className?: string;
  maxTilt?: number;
  glow?: boolean;
};

export default function PointerTilt({
  children,
  className = '',
  maxTilt = 8,
  glow = true,
}: PointerTiltProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  function handleMove(event: React.MouseEvent<HTMLDivElement>) {
    const element = ref.current;
    if (!element || typeof window === 'undefined') {
      return;
    }

    if (!window.matchMedia('(pointer: fine)').matches) {
      return;
    }

    const rect = element.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    const rotateY = (x - 0.5) * maxTilt * 2;
    const rotateX = (0.5 - y) * maxTilt * 2;

    element.style.setProperty('--tilt-x', `${rotateX.toFixed(2)}deg`);
    element.style.setProperty('--tilt-y', `${rotateY.toFixed(2)}deg`);
    element.style.setProperty('--glow-x', `${(x * 100).toFixed(2)}%`);
    element.style.setProperty('--glow-y', `${(y * 100).toFixed(2)}%`);
  }

  function resetTilt() {
    const element = ref.current;
    if (!element) {
      return;
    }

    element.style.setProperty('--tilt-x', '0deg');
    element.style.setProperty('--tilt-y', '0deg');
    element.style.setProperty('--glow-x', '50%');
    element.style.setProperty('--glow-y', '50%');
  }

  return (
    <>
      <div
        ref={ref}
        className={`pointer-tilt ${glow ? 'pointer-tilt-glow' : ''} ${className}`.trim()}
        onMouseMove={handleMove}
        onMouseLeave={resetTilt}
        style={
          {
            '--tilt-x': '0deg',
            '--tilt-y': '0deg',
            '--glow-x': '50%',
            '--glow-y': '50%',
          } as CSSProperties
        }
      >
        {children}
      </div>

      <style jsx>{`
        .pointer-tilt {
          position: relative;
          transform:
            perspective(1200px)
            rotateX(var(--tilt-x))
            rotateY(var(--tilt-y));
          transform-style: preserve-3d;
          transition: transform 160ms ease-out, box-shadow 160ms ease-out;
          will-change: transform;
        }

        .pointer-tilt-glow::after {
          content: '';
          position: absolute;
          inset: -1px;
          border-radius: inherit;
          pointer-events: none;
          background:
            radial-gradient(circle at var(--glow-x) var(--glow-y), rgba(255, 255, 255, 0.34), transparent 36%);
          opacity: 0.8;
        }

        @media (pointer: coarse) {
          .pointer-tilt {
            transform: none !important;
          }

          .pointer-tilt-glow::after {
            display: none;
          }
        }
      `}</style>
    </>
  );
}
