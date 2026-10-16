import React, { useEffect, useRef } from 'react';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  baseRadius: number;
  color: string;
  glowColor: string;
  alpha: number;
  pulsePhase: number;
  pulseSpeed: number;
}

interface ParticleBackgroundProps {
  particleCount?: number;
  className?: string;
}

export const ParticleBackground: React.FC<ParticleBackgroundProps> = ({
  particleCount = 65,
  className = '',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef<{ x: number | null; y: number | null }>({ x: null, y: null });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = 0;
    let height = 0;

    // Glowing cyan & blue color palette
    const colors = [
      { color: '#22d3ee', glow: 'rgba(34, 211, 238, 0.95)' }, // Bright Cyan
      { color: '#06b6d4', glow: 'rgba(6, 182, 212, 0.95)' },  // Deep Cyan
      { color: '#38bdf8', glow: 'rgba(56, 189, 248, 0.9)' },  // Sky Blue
      { color: '#60a5fa', glow: 'rgba(96, 165, 250, 0.85)' }, // Soft Blue
      { color: '#3b82f6', glow: 'rgba(59, 130, 246, 0.9)' },  // Electric Blue
      { color: '#a5f3fc', glow: 'rgba(165, 243, 252, 0.95)' }, // Ice White-Cyan
    ];

    let particles: Particle[] = [];

    const handleResize = () => {
      const parent = canvas.parentElement;
      if (!parent) return;

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = parent.clientWidth;
      height = parent.clientHeight;

      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      ctx.scale(dpr, dpr);
    };

    const initParticles = () => {
      particles = [];
      const count = Math.max(35, Math.min(particleCount, Math.floor((width * height) / 16000)));

      for (let i = 0; i < count; i++) {
        const palette = colors[Math.floor(Math.random() * colors.length)];
        // Random direction velocities (-0.45 to +0.45)
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.2 + Math.random() * 0.45;
        const baseRadius = 1.6 + Math.random() * 2.2;

        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: baseRadius,
          baseRadius,
          color: palette.color,
          glowColor: palette.glow,
          alpha: 0.35 + Math.random() * 0.55,
          pulsePhase: Math.random() * Math.PI * 2,
          pulseSpeed: 0.02 + Math.random() * 0.03,
        });
      }
    };

    handleResize();
    initParticles();

    // Mouse movement listener
    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    };

    const handleMouseLeave = () => {
      mouseRef.current = { x: null, y: null };
    };

    window.addEventListener('resize', () => {
      handleResize();
      initParticles();
    });
    window.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);

    // Animation Loop running at 60fps
    const render = () => {
      if (document.hidden) {
        animationFrameId = requestAnimationFrame(render);
        return;
      }

      ctx.clearRect(0, 0, width, height);

      const mouse = mouseRef.current;
      const maxConnectDist = 115;
      const maxConnectDistSq = maxConnectDist * maxConnectDist;

      // 1. Draw glowing constellation connections between nearby particles
      for (let i = 0; i < particles.length; i++) {
        const p1 = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const p2 = particles[j];
          const dx = p1.x - p2.x;
          const dy = p1.y - p2.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < maxConnectDistSq) {
            const dist = Math.sqrt(distSq);
            const lineAlpha = (1 - dist / maxConnectDist) * 0.22;
            
            ctx.beginPath();
            ctx.moveTo(p1.x, p1.y);
            ctx.lineTo(p2.x, p2.y);
            ctx.strokeStyle = `rgba(6, 182, 212, ${lineAlpha})`;
            ctx.lineWidth = 0.85;
            ctx.stroke();
          }
        }
      }

      // 2. Draw & update particles
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        // Move in random direction with slight natural wander
        p.x += p.vx;
        p.y += p.vy;

        // Oscillate radius and alpha gently (glowing breathing effect)
        p.pulsePhase += p.pulseSpeed;
        const pulse = Math.sin(p.pulsePhase);
        p.radius = p.baseRadius + pulse * 0.45;
        const currentAlpha = Math.max(0.2, Math.min(1, p.alpha + pulse * 0.18));

        // Subtle mouse repulsion / aura interaction
        if (mouse.x !== null && mouse.y !== null) {
          const mdx = p.x - mouse.x;
          const mdy = p.y - mouse.y;
          const mDist = Math.sqrt(mdx * mdx + mdy * mdy);
          if (mDist < 120 && mDist > 0) {
            const force = (120 - mDist) / 120;
            p.x += (mdx / mDist) * force * 1.5;
            p.y += (mdy / mDist) * force * 1.5;
          }
        }

        // Screen boundary wrap with margin for seamless entry
        if (p.x < -15) p.x = width + 15;
        else if (p.x > width + 15) p.x = -15;

        if (p.y < -15) p.y = height + 15;
        else if (p.y > height + 15) p.y = -15;

        // Draw glowing particle core and radiant outer halo
        ctx.save();
        ctx.shadowColor = p.glowColor;
        ctx.shadowBlur = 12;

        // Particle Outer Radiant Gradient
        const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 2.2);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.35, p.color);
        gradient.addColorStop(1, 'rgba(6, 182, 212, 0)');

        ctx.fillStyle = gradient;
        ctx.globalAlpha = currentAlpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius * 2.2, 0, Math.PI * 2);
        ctx.fill();

        // Inner Sharp Specular Core
        ctx.shadowBlur = 4;
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = Math.min(1, currentAlpha * 1.2);
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.8, p.radius * 0.55), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [particleCount]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 z-0 ${className}`}
      style={{ opacity: 0.95 }}
    />
  );
};
