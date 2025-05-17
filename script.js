// Matter.js setup
const { Engine, Render, Bodies, Composite, Svg, Vertices, Mouse, MouseConstraint } = Matter;
Matter.Common.setDecomp(decomp); // Use poly-decomp for better decomposition

// Initialize engine and renderer
const engine = Engine.create();
engine.world.gravity.y = 1; // Stronger gravity for better falling effect
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

// Add mouse control
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
  mouse: mouse,
  constraint: {
    stiffness: 0.2,
    render: { visible: false }
  }
});
Composite.add(engine.world, mouseConstraint);

// Wall properties
const wallThickness = 50;
let walls = [];

function createWalls() {
  // Remove existing walls if any
  Composite.remove(engine.world, walls);
  walls = [];

  const wallOptions = {
    isStatic: true,
    render: {
      fillStyle: '#666' // Dark grey for walls
    }
  };

  // Ground
  walls.push(Bodies.rectangle(window.innerWidth / 2, window.innerHeight + wallThickness / 2, window.innerWidth, wallThickness, wallOptions));
  // Ceiling (slightly above viewport to allow objects to fall in)
  walls.push(Bodies.rectangle(window.innerWidth / 2, -wallThickness / 2 - 100, window.innerWidth, wallThickness, wallOptions));
  // Left wall
  walls.push(Bodies.rectangle(-wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions));
  // Right wall
  walls.push(Bodies.rectangle(window.innerWidth + wallThickness / 2, window.innerHeight / 2, wallThickness, window.innerHeight, wallOptions));

  Composite.add(engine.world, walls);
}

async function initScene() {
  try {
    createWalls(); // Create initial walls

    // Load and parse SVG
    const response = await fetch('images/istanbul-metro-logo.svg');
    if (!response.ok) throw new Error('Failed to load SVG');
    const svgText = await response.text();
    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    // SVG viewBox dimensions
    const viewBox = svgElement.getAttribute('viewBox').split(' ').map(Number);
    const svgViewBoxX = viewBox[0];
    const svgViewBoxY = viewBox[1];
    const svgViewBoxWidth = viewBox[2];
    const svgViewBoxHeight = viewBox[3];

    // Calculate scale factor and offsets to center SVG in window
    const padding = 0.1; // 10% padding around the SVG content
    const scaleX = (window.innerWidth * (1 - 2 * padding)) / svgViewBoxWidth;
    const scaleY = (window.innerHeight * (1 - 2 * padding)) / svgViewBoxHeight;
    const scale = Math.min(scaleX, scaleY);

    const scaledSvgWidth = svgViewBoxWidth * scale;
    const scaledSvgHeight = svgViewBoxHeight * scale;

    const worldOffsetX = (window.innerWidth - scaledSvgWidth) / 2 - (svgViewBoxX * scale);
    const worldOffsetY = (window.innerHeight - scaledSvgHeight) / 2 - (svgViewBoxY * scale);
    
    // Extract all path elements
    const paths = svgDoc.querySelectorAll('path');
    
    // Create Matter bodies from SVG paths
    paths.forEach((path, index) => {
      const rawSvgVertices = Svg.pathToVertices(path, 10);

      if (!rawSvgVertices || rawSvgVertices.length === 0) {
        console.warn('Could not get vertices for path:', path.id);
        return;
      }

      // Calculate centroid of original SVG vertices
      const svgCentroid = Vertices.centre(rawSvgVertices);

      // Translate vertices so their centroid is at (0,0)
      const translatedVertices = Vertices.translate(rawSvgVertices, { x: -svgCentroid.x, y: -svgCentroid.y }, 1);
      
      // Scale these centered vertices
      const scaledVertices = Vertices.scale(translatedVertices, scale, scale);

      // Calculate world position for the body's CoM
      const worldBodyX = (svgCentroid.x * scale) + worldOffsetX;
      const worldBodyY = (svgCentroid.y * scale) + worldOffsetY;
      
      const body = Bodies.fromVertices(
        worldBodyX,
        worldBodyY,
        [scaledVertices], // fromVertices expects an array of vertex sets
        {
          isStatic: false, // Make them dynamic
          restitution: 0.2,
          friction: 0.3,
          render: {
            fillStyle: path.getAttribute('fill') || '#2d4059',
            strokeStyle: path.getAttribute('stroke') || '#2d4059',
            lineWidth: parseFloat(path.getAttribute('stroke-width')) || 1,
            wireframes: false // Ensure solid fills for decomposed parts
          }
        },
        true
      );
      if (body) {
        // If the body is a compound body (decomposed), make internal lines invisible
        if (body.parts && body.parts.length > 1) {
          for (let i = 1; i < body.parts.length; i++) {
            body.parts[i].render.strokeStyle = body.render.fillStyle;
            // Optionally, ensure lineWidth is consistent or minimal for these parts
            // body.parts[i].render.lineWidth = body.render.lineWidth;
          }
        }
        Composite.add(engine.world, body);
      }
    });

    // Start the engine
    Render.run(render);
    Engine.run(engine);

    // Window resize handling
    window.addEventListener('resize', () => {
      render.canvas.width = window.innerWidth;
      render.canvas.height = window.innerHeight;
      
      // Update renderer bounds (important for Matter.js internal calculations)
      Render.setPixelRatio(render, window.devicePixelRatio); // Handle high-DPI displays
      render.options.width = window.innerWidth;
      render.options.height = window.innerHeight;
      // Engine.update might need to be called or bounds updated if objects misbehave after resize
      // For simplicity, we'll recreate walls which also handles their positioning.
      createWalls();
    });

  } catch (error) {
    console.error('Error initializing scene:', error);
  }
}

// Start the simulation after the DOM is fully loaded
document.addEventListener('DOMContentLoaded', initScene);