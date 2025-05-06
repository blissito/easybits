import { useEffect, useRef } from "react";

type Particle = {
  id: number;
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
  "DodgerBlue",
  "OliveDrab",
  "Gold",
  "pink",
  "SlateBlue",
  "lightblue",
  "Violet",
  "PaleGreen",
  "SteelBlue",
  "SandyBrown",
  "Chocolate",
  "Crimson",
];
// @todo move to refs?
let angle = 0;
let tiltAngle = 0;
export const useBrendisConfetti = (options?: BrendisConfettiArgs) => {
  const { colors = initialColors, duration = 3 } = options || {};
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]).current;
  //   const animationHandler = useRef<number>(null)
  const start = () => {
    const canvas = getCanvas();
    const ctx = canvas.getContext("2d");
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
    requestAnimationFrame(start);
    createParticle(); // one more
    updateParticles(); // move
    drawParticles(); // draw
  };
  useEffect(() => {
    start();
  }, []);

  // Main funcs
  const updateParticles = () => {
    // @todo wind
    angle += 0.01;
    tiltAngle += 0.1;
    particles.forEach((p) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(angle + p.density) + p.size / 2) / 2;
      p.x += Math.sin(angle);
      p.tilt = Math.sin(p.tiltAngle - p.id / 3) * 15;
    });
  };

  const drawParticles = () => {
    const ctx = getCanvas().getContext("2d")!;
    particles.forEach((p) => {
      ctx.beginPath();

      ctx.lineWidth = p.size / 2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.size + p.size / 4, p.y);
      ctx.lineTo(p.x + p.size, p.y + p.size + p.size / 4);
      //   ctx.setTransform(
      //     Math.cos(p.tiltAngle), // set the x axis to the tilt angle
      //     Math.sin(p.tiltAngle),
      //     0,
      //     1,
      //     p.x,
      //     p.y // set the origin
      //   );
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
  const getColor = (i?: number) => colors[i || rand(0, colors.length)];

  let id = 0;
  // creation
  const createParticle = () => {
    const canvas = getCanvas();
    particles.push({
      id: id++,
      x: Math.random() * canvas.width,
      //   y: Math.random() * canvas.height - canvas.height, // to the top
      y: Math.random() * canvas.height, // to the top
      size: Math.random() * 6 + 3 + Math.floor(Math.random() * 10) - 10, // tilt
      speedX: (Math.random() - 0.5) * 4,
      speedY: Math.random() * 4 + 2,
      rotation: (Math.random() - 0.5) * 5,
      //   color: `hsl(${Math.random() * 360}, 80%, 60%)`,
      color: getColor(),
      // experiment
      tiltAngle: 0,
      tilt: 0.01,
      tiltAngleIncremental: (rand(0.08) + 0.04) * (rand() < 0.5 ? -1 : 1),
      angle: rand(Math.PI * 2),
      density: rand(150) + 10, //density @todo I don't like density 😅
    });
    // console.info(particles.length);
  };
};
