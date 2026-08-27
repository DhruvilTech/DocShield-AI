import React, { useEffect, useRef } from 'react';
import { useReducedMotion } from '../../hooks/useReducedMotion';

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  baseX: number;
  baseY: number;
  size: number;
  pulsePhase: number;
  connections: number[];
}

interface Packet {
  fromIndex: number;
  toIndex: number;
  progress: number;
  speed: number;
}

interface SecurityNetworkBackgroundProps {
  theme?: 'dark' | 'light';
  variant?: 'command' | 'neural' | 'scanner' | 'forensics' | 'threats' | 'matrix' | 'vault' | 'minimal';
  opacity?: number;
  interactive?: boolean;
}

export const SecurityNetworkBackground: React.FC<SecurityNetworkBackgroundProps> = ({
  theme = 'dark',
  variant = 'command',
  opacity = 0.45,
  interactive = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const reducedMotion = useReducedMotion();
  const mouseRef = useRef<{ x: number; y: number; active: boolean }>({ x: -1000, y: -1000, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || reducedMotion) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initNetwork();
    };

    window.addEventListener('resize', handleResize, { passive: true });

    const handleMouseMove = (e: MouseEvent) => {
      if (!interactive) return;
      mouseRef.current = { x: e.clientX, y: e.clientY, active: true };
    };

    const handleMouseLeave = () => {
      mouseRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    document.addEventListener('mouseleave', handleMouseLeave);

    // Color definitions based on theme & variant
    const isDark = theme === 'dark';
    const primaryColor = isDark ? 'rgba(0, 184, 169, ' : 'rgba(0, 150, 136, ';
    const secondaryColor = isDark ? 'rgba(37, 99, 235, ' : 'rgba(59, 130, 246, ';
    const alertColor = isDark ? 'rgba(239, 68, 68, ' : 'rgba(220, 38, 38, ';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.025)' : 'rgba(0, 0, 0, 0.025)';

    // Node Count adjusted per screen width
    const cols = Math.max(4, Math.floor(width / (width < 768 ? 160 : 200)));
    const rows = Math.max(3, Math.floor(height / (width < 768 ? 160 : 180)));
    const nodes: Node[] = [];
    const packets: Packet[] = [];

    function initNetwork() {
      nodes.length = 0;
      packets.length = 0;

      const colSpacing = width / (cols + 1);
      const rowSpacing = height / (rows + 1);

      for (let r = 1; r <= rows; r++) {
        for (let c = 1; c <= cols; c++) {
          const jitterX = (Math.random() - 0.5) * (colSpacing * 0.45);
          const jitterY = (Math.random() - 0.5) * (rowSpacing * 0.45);
          const x = c * colSpacing + jitterX;
          const y = r * rowSpacing + jitterY;

          nodes.push({
            x,
            y,
            baseX: x,
            baseY: y,
            vx: (Math.random() - 0.5) * 0.25,
            vy: (Math.random() - 0.5) * 0.25,
            size: Math.random() > 0.85 ? 2.5 : 1.5,
            pulsePhase: Math.random() * Math.PI * 2,
            connections: [],
          });
        }
      }

      // Connect nearby nodes
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          const maxDist = width < 768 ? 190 : 250;
          if (dist < maxDist && nodes[i].connections.length < 3) {
            nodes[i].connections.push(j);
          }
        }
      }

      // Initial active data packets
      const packetCount = Math.min(12, Math.floor(nodes.length * 0.35));
      for (let k = 0; k < packetCount; k++) {
        const validNodes = nodes.filter(n => n.connections.length > 0);
        if (validNodes.length > 0) {
          const srcIdx = Math.floor(Math.random() * nodes.length);
          if (nodes[srcIdx].connections.length > 0) {
            const targetIdx = nodes[srcIdx].connections[Math.floor(Math.random() * nodes[srcIdx].connections.length)];
            packets.push({
              fromIndex: srcIdx,
              toIndex: targetIdx,
              progress: Math.random(),
              speed: 0.003 + Math.random() * 0.005,
            });
          }
        }
      }
    }

    initNetwork();

    let radarAngle = 0;

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      // 1. Draw subtle background coordinate grid
      const gridSize = 48;
      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < width; x += gridSize) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = 0; y < height; y += gridSize) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();

      // 2. Radar sweep for 'command' or 'scanner' variants
      if (variant === 'command' || variant === 'scanner' || variant === 'threats') {
        radarAngle += 0.008;
        const centerX = width * 0.5;
        const centerY = height * 0.45;
        const radarRadius = Math.max(width, height) * 0.5;

        const grad = ctx.createRadialGradient(centerX, centerY, 10, centerX, centerY, radarRadius);
        grad.addColorStop(0, primaryColor + (isDark ? '0.04)' : '0.02)'));
        grad.addColorStop(1, 'transparent');

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radarRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // 3. Update & render nodes
      const mouse = mouseRef.current;
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Slight drift
        node.x += node.vx;
        node.y += node.vy;

        // Bounding bounce around base
        if (Math.abs(node.x - node.baseX) > 20) node.vx *= -1;
        if (Math.abs(node.y - node.baseY) > 20) node.vy *= -1;

        // Interactive cursor repulsion
        if (mouse.active) {
          const dx = node.x - mouse.x;
          const dy = node.y - mouse.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 140) {
            const force = (140 - dist) / 140;
            node.x += (dx / dist) * force * 2;
            node.y += (dy / dist) * force * 2;
          }
        }

        node.pulsePhase += 0.03;
        const pulse = 0.5 + Math.sin(node.pulsePhase) * 0.5;

        // Draw connections
        for (const targetIdx of node.connections) {
          const target = nodes[targetIdx];
          if (!target) continue;

          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(target.x, target.y);

          // Subtle circuit lines
          ctx.strokeStyle = primaryColor + (isDark ? '0.07)' : '0.05)');
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Draw Node point
        ctx.beginPath();
        ctx.arc(node.x, node.y, node.size + pulse * 0.8, 0, Math.PI * 2);
        ctx.fillStyle = primaryColor + (isDark ? (0.3 + pulse * 0.4) + ')' : (0.2 + pulse * 0.3) + ')');
        ctx.fill();

        // Subtle outer glow on larger nodes
        if (node.size > 2) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, node.size * 3.5, 0, Math.PI * 2);
          ctx.fillStyle = primaryColor + (isDark ? '0.03)' : '0.015)');
          ctx.fill();
        }
      }

      // 4. Update & render flowing data packets
      for (let p = 0; p < packets.length; p++) {
        const pkt = packets[p];
        const src = nodes[pkt.fromIndex];
        const dst = nodes[pkt.toIndex];

        if (!src || !dst) continue;

        pkt.progress += pkt.speed;
        if (pkt.progress >= 1) {
          pkt.progress = 0;
          pkt.fromIndex = pkt.toIndex;
          if (nodes[pkt.fromIndex].connections.length > 0) {
            const nextConns = nodes[pkt.fromIndex].connections;
            pkt.toIndex = nextConns[Math.floor(Math.random() * nextConns.length)];
          }
        }

        const currX = src.x + (dst.x - src.x) * pkt.progress;
        const currY = src.y + (dst.y - src.y) * pkt.progress;

        // Data packet dot
        ctx.beginPath();
        ctx.arc(currX, currY, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = variant === 'threats'
          ? alertColor + (isDark ? '0.85)' : '0.7)')
          : primaryColor + (isDark ? '0.9)' : '0.8)');
        ctx.fill();

        // Data packet head trail
        ctx.beginPath();
        ctx.arc(currX, currY, 4.5, 0, Math.PI * 2);
        ctx.fillStyle = primaryColor + (isDark ? '0.15)' : '0.08)');
        ctx.fill();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [theme, variant, interactive, reducedMotion]);

  if (reducedMotion) {
    return <div className="fixed inset-0 pointer-events-none tech-grid opacity-30 -z-10" />;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none -z-10 transition-opacity duration-700"
      style={{ opacity }}
      aria-hidden="true"
    />
  );
};
