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
    width: window.innerWidth, 
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
  const currentWidth = window.innerWidth; 

  walls.push(Bodies.rectangle(currentWidth / 2, window.innerHeight + wallThickness / 2, currentWidth, wallThickness, wallOptions)); // Ground
  walls.push(Bodies.rectangle(currentWidth / 2, -wallThickness / 2 - 100, currentWidth, wallThickness, wallOptions)); // Ceiling
  walls.push(Bodies.rectangle(-wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions)); // Left
  walls.push(Bodies.rectangle(currentWidth + wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions)); // Right
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
    const availableWidth = window.innerWidth * (1 - paddingPercent);
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

    // Center the scaled viewBox
    const worldOffsetX = (window.innerWidth - scaledViewBoxWidth) / 2 - (svgViewBoxX * scale);
    const worldOffsetY = (window.innerHeight - scaledViewBoxHeight) / 2 - (svgViewBoxY * scale);

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
          isStatic: false, // Dynamic from start
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
      }
    });

    // Start simulation immediately
    Render.run(render); 
    Runner.run(engine);
    console.log("Matter.js simulation started (centered, dynamic from start).");

    window.addEventListener('resize', () => {
      const currentWidth = window.innerWidth; 
      render.canvas.width = currentWidth;
      render.canvas.height = window.innerHeight;
      Render.setPixelRatio(render, window.devicePixelRatio);
      render.options.width = currentWidth;
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