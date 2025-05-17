// Matter.js setup
const { Engine, Render, Runner, Bodies, Composite, Svg, Vertices, Mouse, MouseConstraint } = Matter;
Matter.Common.setDecomp(decomp); 

// Initialize engine and renderer
const engine = Engine.create();
engine.world.gravity.y = 1; 
const render = Render.create({
  element: document.body,
  engine: engine,
  options: {
    width: document.documentElement.clientWidth,
    height: window.innerHeight,
    wireframes: false,
    background: 'transparent', 
    showAngleIndicator: false
  }
});

// Style the canvas
render.canvas.style.position = 'fixed';
render.canvas.style.top = '0';
render.canvas.style.left = '0';
render.canvas.style.zIndex = '10'; // Keep on top for now, can be set to -1 later
render.canvas.style.pointerEvents = 'none';

// Add mouse control
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
  mouse: mouse,
  constraint: { stiffness: 0.2, render: { visible: false } }
});
Composite.add(engine.world, mouseConstraint);

// Wall properties
const wallThickness = 50;
let walls = [];

function createWalls() {
  Composite.remove(engine.world, walls);
  walls = [];
  const wallOptions = { isStatic: true, render: { fillStyle: '#666' } };
  const clientWidth = document.documentElement.clientWidth;

  walls.push(Bodies.rectangle(clientWidth / 2, window.innerHeight + wallThickness / 2, clientWidth, wallThickness, wallOptions));
  walls.push(Bodies.rectangle(clientWidth / 2, -wallThickness / 2 - 100, clientWidth, wallThickness, wallOptions));
  walls.push(Bodies.rectangle(-wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions));
  walls.push(Bodies.rectangle(clientWidth + wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions));
  Composite.add(engine.world, walls);
}

async function initScene() {
  try {
    createWalls();

    const response = await fetch('images/istanbul-metro-logo.svg');
    if (!response.ok) throw new Error('Failed to load SVG');
    const svgText = await response.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const viewBox = svgElement.getAttribute('viewBox').split(' ').map(Number);
    const svgViewBoxX = viewBox[0]; 
    const svgViewBoxY = viewBox[1]; 
    const svgViewBoxWidth = viewBox[2];
    const svgViewBoxHeight = viewBox[3];
    
    const paddingPercent = 0.2; 
    let scale;
    const availableWidth = document.documentElement.clientWidth * (1 - paddingPercent);
    const availableHeight = window.innerHeight * (1 - paddingPercent);

    if (svgViewBoxWidth > 0 && svgViewBoxHeight > 0) {
        const scaleX = availableWidth / svgViewBoxWidth;
        const scaleY = availableHeight / svgViewBoxHeight;
        scale = Math.min(scaleX, scaleY);
    } else {
        scale = 1; 
    }
    scale *= 0.5; 

    const scaledViewBoxWidth = svgViewBoxWidth * scale;
    const scaledViewBoxHeight = svgViewBoxHeight * scale;

    const desiredPixelPadding = 0; 
    const worldOffsetX = document.documentElement.clientWidth - scaledViewBoxWidth - desiredPixelPadding - (svgViewBoxX * scale);
    const worldOffsetY = window.innerHeight - scaledViewBoxHeight - desiredPixelPadding - (svgViewBoxY * scale);

    Matter.Events.on(render, 'afterRender', (event) => {
      const context = render.context;
      context.beginPath();
      const debugRectX = worldOffsetX + (svgViewBoxX * scale); 
      const debugRectY = worldOffsetY + (svgViewBoxY * scale); 
      context.rect(debugRectX, debugRectY, scaledViewBoxWidth, scaledViewBoxHeight);
      context.strokeStyle = 'rgba(0, 255, 0, 0.5)'; 
      context.lineWidth = 2;
      context.stroke();
    });

    const paths = svgDoc.querySelectorAll('path');
    const svgBodies = []; 
    
    paths.forEach((pathElement) => {
      const rawPathVertices = Svg.pathToVertices(pathElement, 10); 
      if (!rawPathVertices || rawPathVertices.length === 0) return;

      const svgPathCentroid = Vertices.centre(rawPathVertices);
      const translatedPathVertices = Vertices.translate(rawPathVertices, { x: -svgPathCentroid.x, y: -svgPathCentroid.y }, 1);
      const scaledPathVertices = Vertices.scale(translatedPathVertices, scale, scale);

      const worldBodyX = (svgPathCentroid.x * scale) + worldOffsetX;
      const worldBodyY = (svgPathCentroid.y * scale) + worldOffsetY;
      
      const body = Bodies.fromVertices(
        worldBodyX, worldBodyY, [scaledPathVertices], 
        {
          isStatic: false, // Dynamic during initial invisible settle
          restitution: 0.2, friction: 0.3,
          render: {
            fillStyle: pathElement.getAttribute('fill') || '#2d4059',
            strokeStyle: pathElement.getAttribute('stroke') || '#2d4059',
            lineWidth: parseFloat(pathElement.getAttribute('stroke-width')) || 1,
            wireframes: false 
          }
        },
        true
      );
      if (body) {
        // Placeholder for tagging light object, e.g. if (pathElement.id === 'your-arc-id') body.isLight = true;
        if (body.parts && body.parts.length > 1) {
          for (let i = 1; i < body.parts.length; i++) {
            body.parts[i].render.strokeStyle = body.render.fillStyle;
          }
        }
        Composite.add(engine.world, body);
        svgBodies.push(body); 
      }
    });

    const settleSteps = 15; 
    const settleDelta = (1000 / 60) / settleSteps;
    for (let i = 0; i < settleSteps; i++) {
      Engine.update(engine, settleDelta);
    }
    console.log("Initial dynamic settle complete.");

    svgBodies.forEach(body => {
      Matter.Body.setStatic(body, true);
    });

    Render.world(render); 
    console.log("Scene initialized with pre-settled static objects. Simulation paused.");

    let simulationStarted = false;
    const initialPageScrollY = window.scrollY;

    // function applyExplosiveForce(bodiesToExplode) { // DISABLED
    //   const forceMagnitudeY = -0.02;
    //   const forceMagnitudeX = 0.01;
    //   bodiesToExplode.forEach(body => {
    //     if (!body.isStatic) {
    //       const randomX = (Math.random() - 0.5) * 2 * forceMagnitudeX;
    //       const randomY = Math.random() * forceMagnitudeY;
    //       Matter.Body.applyForce(body, body.position, {
    //         x: randomX * body.mass,
    //         y: randomY * body.mass
    //       });
    //     }
    //   });
    // }

    function startMainScrollListener() {
      const initialGravityY = engine.world.gravity.y;
      let scrollTimeout = null;
      let lastScrollY = window.scrollY;
      const scrollStopDelay = 150;
      let currentScrollEffect = null; // null, 'floating', 'fallingHard'
      // let floatInitialScrollY = 0; // No longer needed

      window.addEventListener('scroll', function gravityScrollHandler() {
        const currentScrollY = window.scrollY;
        const scrollDelta = currentScrollY - lastScrollY;
        clearTimeout(scrollTimeout);

        if (scrollDelta > 0) { // Scrolling Down
          if (currentScrollEffect !== 'floating') {
            console.log("Transition to: Floating with Initial Push");
            // Apply a one-time directional push for floating
            svgBodies.forEach(body => {
              if (!body.isStatic) {
                const pushForceY = -0.015 * body.mass; // Slightly stronger initial upward push
                const pushForceX = (Math.random() - 0.5) * 0.005 * body.mass; // Slight random horizontal
                Matter.Body.applyForce(body, body.position, { x: pushForceX, y: pushForceY });
              }
            });
            currentScrollEffect = 'floating';
          }
          
          // Adjust float strength based on absolute scroll position
          if (currentScrollY > 500) {
            engine.world.gravity.y = -0.1; // Weaker float
          } else {
            engine.world.gravity.y = -0.5; // Stronger float
          }

        } else if (scrollDelta < 0) { // Scrolling Up
          if (currentScrollEffect !== 'fallingHard') {
            console.log("Transition to: Falling Hard with Spin");
            engine.world.gravity.y = 4.5;  // Objects fall harder
            svgBodies.forEach(body => {
              if (!body.isStatic) {
                const randomAngularVelocity = (Math.random() - 0.5) * 0.2;
                Matter.Body.setAngularVelocity(body, randomAngularVelocity);
              }
            });
            currentScrollEffect = 'fallingHard';
          } else {
             engine.world.gravity.y = 4.5; // Maintain strong gravity if already falling hard
          }
        }
        lastScrollY = currentScrollY;

        scrollTimeout = setTimeout(() => {
          console.log("Scroll Stop: Resetting gravity and effect");
          engine.world.gravity.y = initialGravityY;
          currentScrollEffect = null;
        }, scrollStopDelay);
      });
      console.log("Scroll listener with initial push on float, spin on G-fall.");
    }

    function startSimulation(firstScrollEventY) {
      if (!simulationStarted) {
        simulationStarted = true;
        svgBodies.forEach(body => { Matter.Body.setStatic(body, false); });
        
        if (initialPageScrollY > 0 && firstScrollEventY < initialPageScrollY) {
          console.log("Applying bump: page loaded scrolled, and first scroll was up.");
          // const originalGravity = engine.world.gravity.y; // Not needed if not changing gravity for bump
          // engine.world.gravity.y = 0; // Do NOT neutralize gravity for this bump

          // Apply a very gentle, non-randomized upward nudge against normal gravity
          svgBodies.forEach(body => {
            if (!body.isStatic) {
              Matter.Body.applyForce(body, body.position, { x: 0, y: -0.001 * body.mass });
            }
          });
          // engine.world.gravity.y = originalGravity; // Gravity was not changed
        }
        
        Render.run(render);
        Runner.run(engine);
        startMainScrollListener();
        console.log("Matter.js simulation started on first scroll.");
      }
    }

    function startSimulationOnScroll() {
      startSimulation(window.scrollY);
      window.removeEventListener('scroll', startSimulationOnScroll);
    }
    window.addEventListener('scroll', startSimulationOnScroll);
    
    window.addEventListener('resize', () => {
      const clientWidth = document.documentElement.clientWidth;
      render.canvas.width = clientWidth;
      render.canvas.height = window.innerHeight;
      Render.setPixelRatio(render, window.devicePixelRatio);
      render.options.width = clientWidth;
      render.options.height = window.innerHeight;
      createWalls();
    });

  } catch (error) {
    console.error('Error initializing scene:', error);
  }
}

document.addEventListener('DOMContentLoaded', initScene);