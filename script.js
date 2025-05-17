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
    background: '#f0f0f0',
    showAngleIndicator: false
  }
});

// Style the canvas
render.canvas.style.position = 'fixed';
render.canvas.style.top = '0';
render.canvas.style.left = '0';
render.canvas.style.zIndex = '-1';
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

  walls.push(Bodies.rectangle(clientWidth / 2, window.innerHeight + wallThickness / 2, clientWidth, wallThickness, wallOptions)); // Ground
  walls.push(Bodies.rectangle(clientWidth / 2, -wallThickness / 2 - 100, clientWidth, wallThickness, wallOptions)); // Ceiling
  walls.push(Bodies.rectangle(-wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions)); // Left
  walls.push(Bodies.rectangle(clientWidth + wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions)); // Right
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
    
    // --- SCALING AND CENTERING THE VIEWBOX ---
    const paddingPercent = 0.2; // Aim to use 80% of window dimension (20% total padding)
    
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
    scale *= 0.5; // User's additional scaling factor

    const scaledViewBoxWidth = svgViewBoxWidth * scale;
    const scaledViewBoxHeight = svgViewBoxHeight * scale;

    const desiredPixelPadding = 0; // For flush bottom-right margin
    // Align bottom-right of the scaled viewBox with padding
    const worldOffsetX = document.documentElement.clientWidth - scaledViewBoxWidth - desiredPixelPadding - (svgViewBoxX * scale);
    const worldOffsetY = window.innerHeight - scaledViewBoxHeight - desiredPixelPadding - (svgViewBoxY * scale);

    // Event listener to draw the viewBox's bounding box
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
    const svgBodies = []; // To store references to SVG bodies
    
    paths.forEach((pathElement) => {
      const rawPathVertices = Svg.pathToVertices(pathElement, 10); 
      if (!rawPathVertices || rawPathVertices.length === 0) {
        console.warn('Could not get vertices for path:', pathElement.id);
        return;
      }

      const svgPathCentroid = Vertices.centre(rawPathVertices);
      const translatedPathVertices = Vertices.translate(rawPathVertices, { x: -svgPathCentroid.x, y: -svgPathCentroid.y }, 1);
      const scaledPathVertices = Vertices.scale(translatedPathVertices, scale, scale);

      // Position body relative to its centroid within the scaled and offset viewBox
      const worldBodyX = (svgPathCentroid.x * scale) + worldOffsetX;
      const worldBodyY = (svgPathCentroid.y * scale) + worldOffsetY;
      
      const body = Bodies.fromVertices(
        worldBodyX, 
        worldBodyY, 
        [scaledPathVertices], 
        {
          isStatic: false, // Dynamic during initial invisible settle
          restitution: 0.2,
          friction: 0.3,
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
        if (body.parts && body.parts.length > 1) {
          for (let i = 1; i < body.parts.length; i++) {
            body.parts[i].render.strokeStyle = body.render.fillStyle;
          }
        }
        Composite.add(engine.world, body);
        svgBodies.push(body); // Store reference
      }
    });

    // Allow engine to settle dynamic bodies before making them static for initial view
    const settleSteps = 15; // Increased for more robust settling
    const settleDelta = (1000 / 60) / settleSteps;
    for (let i = 0; i < settleSteps; i++) {
      Engine.update(engine, settleDelta);
    }
    console.log("Initial dynamic settle complete.");

    // Now make them static for the initial view
    svgBodies.forEach(body => {
      Matter.Body.setStatic(body, true);
    });

    Render.world(render); // Render the settled, now static, state
    console.log("Scene initialized with pre-settled static objects. Simulation paused.");

    let simulationStarted = false;
    const initialPageScrollY = window.scrollY;

    function startMainScrollListener() {
      const initialGravityY = engine.world.gravity.y;
      let scrollTimeout = null;
      let lastScrollY = window.scrollY;
      const scrollStopDelay = 150;

      window.addEventListener('scroll', function gravityScrollHandler() {
        const currentScrollY = window.scrollY;
        clearTimeout(scrollTimeout);
        if (currentScrollY > lastScrollY) {
          engine.world.gravity.y = -0.8;
        } else if (currentScrollY < lastScrollY) {
          engine.world.gravity.y = 4.0;
        }
        lastScrollY = currentScrollY;
        scrollTimeout = setTimeout(() => {
          engine.world.gravity.y = initialGravityY;
        }, scrollStopDelay);
      });
      console.log("Main scroll listener with gravity changes attached.");
    }

    function startSimulation(firstScrollEventY) {
      if (!simulationStarted) {
        simulationStarted = true;
        svgBodies.forEach(body => { Matter.Body.setStatic(body, false); });

        // Settle steps already performed during init, no need here.
        // const settleSteps = 5;
        // const settleDelta = (1000 / 60) / settleSteps;
        // for (let i = 0; i < settleSteps; i++) { Engine.update(engine, settleDelta); }
        
        // Conditional bump logic remains commented out for now
        // if (initialPageScrollY > 0 && firstScrollEventY < initialPageScrollY) {
        //   console.log("Applying bump: page loaded scrolled, and first scroll was up.");
        //   svgBodies.forEach(body => {
        //     if (!body.isStatic) {
        //       Matter.Body.applyForce(body, body.position, { x: 0, y: -0.01 * body.mass });
        //     }
        //   });
        // }
        
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
      // Note: For this placement logic, a full re-init or more complex resize handling 
      // for SVG objects would be needed if you want them to rescale/reposition on window resize.
    });

  } catch (error) {
    console.error('Error initializing scene:', error);
  }
}

document.addEventListener('DOMContentLoaded', initScene);