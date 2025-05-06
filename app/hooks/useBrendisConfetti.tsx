import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  rotation: number;
  color: string; // `hsl(${Math.random() * 360}, 80%, 60%)`
  tiltAngle: number;
  tilt: number;
  tiltAngleIncremental: number;
  angle: number;
  density: number;
};

type BrendisConfettiArgs = {
  colors?: string[];
  duration?: number;
};

const initialColors = [
  "#6A6966",
  "#BAD9D8",
  "#ECD66E",
  "#AA4958",
  "#96B894",
  "#FFAFA3",
  "#F3F0F5",
  "#9870ED",
];
// @todo move to refs?
let angle = 0; // wind 🌬️
let tiltAngle = 0;
export const useBrendisConfetti = (options?: BrendisConfettiArgs) => {
  const { colors = initialColors, duration = 3 } = options || {};
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  //   const animationHandler = useRef<number>(null)
  const start = () => {
    const canvas = getCanvas();
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    // cleanParticles(); // @todo
    requestAnimationFrame(start);
    particlesRef.current.length < 500 && createParticle(); // one more
    updateParticles(); // move
    drawParticles(); // draw
  };
  useEffect(() => {
    start();
  }, []);

  // Main funcs
  const cleanParticles = () => {
    particlesRef.current = particlesRef.current.filter(
      (p) => p.y < innerHeight
    );
  };
  const updateParticles = () => {
    const particles = particlesRef.current;
    // const indexesToremove: number[] = [];
    // @todo wind
    angle += 0.01;
    tiltAngle += 0.1;
    particles.forEach((particle, i) => {
      particle.tiltAngle += particle.tiltAngleIncremental;
      //   particle.y += Math.cos(particle.angle) / 1.2;
      particle.y += (Math.cos(angle) + particle.size) / 4;
      particle.x += Math.sin(particle.angle);
      particle.tilt = Math.sin(particle.tiltAngle - i) * 5; // giro
      // @wip
      if (
        particle.y > innerHeight ||
        particle.x < 0 - particle.size ||
        particle.x > innerWidth
      ) {
        // @todo clean up
        // particles.splice(i, 1);
        // indexesToremove.push(i);
      } else {
      }
    });

    console.log("Length", particles.length);
  };

  const drawParticles = () => {
    const particles = particlesRef.current;
    const ctx = getCanvas().getContext("2d")!;
    particles.forEach((p) => {
      ctx.beginPath();
      ctx.lineWidth = p.size;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt / 15 + p.size / 4, p.y);
      ctx.lineTo(p.x, p.y + p.tilt);
      return ctx.stroke();
    });
  };

  // utils
  const getCanvas = () => {
    canvasRef.current ??= document.createElement("canvas");
    const { current: canvas } = canvasRef;

    canvas.style.position = "fixed";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.top = "0";
    canvas.style.left = "0";
    canvas.style.zIndex = "1000";
    canvas.style.pointerEvents = "none";

    document.body.appendChild(canvas);
    return canvas;
  };
  const rand = (min = 1, max = min + (min = 0)) =>
    Math.floor(Math.random() * (max - min) + min);
  const floatRand = (min = 1, max = min + (min = 0)) =>
    Math.random() * (max - min) + min;
  const getColor = (i?: number) => colors[i || rand(0, colors.length)];

  // creation
  const createParticle = () => {
    const particles = particlesRef.current;
    const canvas = getCanvas();
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      size: rand(3, 5),
      color: getColor(),
      // experiment
      tiltAngle: 0,
      tilt: 0,
      tiltAngleIncremental: floatRand(0.04, 0.05),
      //   tiltAngleIncremental: rand(0.07) + 0.05,
      angle: rand(Math.PI * 2),
      density: rand(100) + 10,
    });
    // console.info(particles.length);
  };
};
