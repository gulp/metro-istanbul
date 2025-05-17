// Attempt to control scroll restoration
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Matter.js setup
const { Engine, Render, Runner, Bodies, Composite, Svg, Vertices, Mouse, MouseConstraint } = Matter;
Matter.Common.setDecomp(decomp); 

let isProgrammaticScroll = false; 
let runner = null; 
let currentGravityScrollHandler = null; 
let currentResizeHandler = null; 
let currentStartSimulationScrollHandler = null; 
let currentDebugRenderHandler = null; 

// Global coefficient variables REMOVED

let engine = Engine.create(); 
let render = Render.create({
    element: document.body, 
    engine: engine,         
    options: { width: 800, height: 600 } 
}); 

function debounce(func, delay) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
}

function cleanupCurrentScene() {
  console.log("Cleaning up current scene...");
  if (runner) { Runner.stop(runner); runner = null; console.log("Runner stopped."); }
  if (render && render.canvas) { 
    if (currentDebugRenderHandler) {
        Matter.Events.off(render, 'afterRender', currentDebugRenderHandler);
        currentDebugRenderHandler = null;
        console.log("Debug render listener removed.");
    }
    Render.stop(render); 
    render.canvas.remove(); 
    console.log("Render stopped and canvas removed."); 
  }
  if (engine) { Composite.clear(engine.world, false); Engine.clear(engine); console.log("Engine cleared."); }
  if (currentGravityScrollHandler) { window.removeEventListener('scroll', currentGravityScrollHandler); currentGravityScrollHandler = null; console.log("Gravity scroll listener removed."); }
  if (currentStartSimulationScrollHandler) { window.removeEventListener('scroll', currentStartSimulationScrollHandler); currentStartSimulationScrollHandler = null; console.log("Start simulation scroll listener removed."); }
}

const wallThickness = 50;

function createWalls(currentEngine) { 
  let sceneWalls = []; 
  const wallOptions = { isStatic: true, render: { fillStyle: '#666' } };
  const clientWidth = document.documentElement.clientWidth;
  const currentWindowHeight = window.innerHeight;
  sceneWalls.push(Bodies.rectangle(clientWidth / 2, currentWindowHeight + wallThickness / 2, clientWidth, wallThickness, wallOptions));
  sceneWalls.push(Bodies.rectangle(clientWidth / 2, -wallThickness / 2 - 100, clientWidth, wallThickness, wallOptions));
  sceneWalls.push(Bodies.rectangle(-wallThickness / 2, currentWindowHeight / 2, wallThickness, currentWindowHeight, wallOptions));
  sceneWalls.push(Bodies.rectangle(clientWidth + wallThickness / 2, currentWindowHeight / 2, wallThickness, currentWindowHeight, wallOptions));
  Composite.add(currentEngine.world, sceneWalls);
}

async function initScene() {
  console.log("initScene called");
  cleanupCurrentScene(); 

  engine = Engine.create(); 
  engine.world.gravity.y = 1;

  render = Render.create({ 
    element: document.body, engine: engine,
    options: { width: document.documentElement.clientWidth, height: window.innerHeight, wireframes: false, background: 'transparent', showAngleIndicator: false }
  });

  render.canvas.style.position = 'fixed'; render.canvas.style.top = '0'; render.canvas.style.left = '0';
  render.canvas.style.zIndex = '10'; render.canvas.style.pointerEvents = 'auto'; 

  const mouse = Mouse.create(render.canvas);
  const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse, constraint: { stiffness: 0.95, render: { visible: true, lineWidth: 2, strokeStyle: 'rgba(0, 255, 0, 0.7)'}}
  });
  Composite.add(engine.world, mouseConstraint);
  
  const DEFAULT_FRICTION_AIR = 0.01; 
  const DRAG_FRICTION_AIR = 0.2;
  const ARROW_FRICTION_AIR = 0.0005; 
  const M_FRICTION_AIR = 0.08;      
  // const ARC_T_FRICTION_AIR = 0.15; // REMOVED

  Matter.Events.on(mouseConstraint, 'startdrag', function(event) { 
    const draggedBody = event.body; 
    if (draggedBody) { 
        draggedBody._originalFrictionAir = draggedBody.frictionAir; 
        draggedBody.frictionAir = DRAG_FRICTION_AIR; 
    }
  });
  Matter.Events.on(mouseConstraint, 'enddrag', function(event) { 
    const draggedBody = event.body; 
    if (draggedBody) { 
        let restoreFrictionAir = DEFAULT_FRICTION_AIR; 
        if (typeof draggedBody._originalFrictionAir === 'number') {
            restoreFrictionAir = draggedBody._originalFrictionAir;
        } else if (draggedBody.isArrow) { 
            restoreFrictionAir = ARROW_FRICTION_AIR;
        } else if (draggedBody.isM || draggedBody.isArcT) { // arc-t now uses M's friction if original not stored
            restoreFrictionAir = M_FRICTION_AIR;
        }
        // Removed isArcT specific case, it will use M_FRICTION_AIR or DEFAULT if _originalFrictionAir is missing
        draggedBody.frictionAir = restoreFrictionAir;
        delete draggedBody._originalFrictionAir; 
    }
  });

  render.canvas.addEventListener('wheel', function(event) { if (!mouseConstraint.body) { window.scrollBy(event.deltaX, event.deltaY); }}, { passive: false }); 

  try {
    isProgrammaticScroll = true; window.scrollTo(0, 0); setTimeout(() => { isProgrammaticScroll = false; }, 0); 
    createWalls(engine); 

    const response = await fetch('images/istanbul-metro-logo.svg');
    if (!response.ok) throw new Error('Failed to load SVG');
    const svgText = await response.text();
    const parser = new DOMParser(); const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
    const svgElement = svgDoc.documentElement;

    const viewBoxAttribute = svgElement.getAttribute('viewBox');
    const viewBoxParts = viewBoxAttribute ? viewBoxAttribute.split(' ').map(Number) : [0,0,100,100];
    const svgMetadata = {
        viewBoxX: viewBoxParts[0], viewBoxY: viewBoxParts[1], viewBoxWidth: viewBoxParts[2], viewBoxHeight: viewBoxParts[3],
        paddingPercent: 0.2, 
        baseScaleMultiplier: 0.5 
    };
    
    const clientWidth = document.documentElement.clientWidth;
    const clientHeight = window.innerHeight;
    const availableWidthForScaling = clientWidth * (1 - svgMetadata.paddingPercent);
    const availableHeightForScaling = clientHeight * (1 - svgMetadata.paddingPercent);
    let overallScale;
    if (svgMetadata.viewBoxWidth > 0 && svgMetadata.viewBoxHeight > 0) {
        const scaleX = availableWidthForScaling / svgMetadata.viewBoxWidth;
        const scaleY = availableHeightForScaling / svgMetadata.viewBoxHeight;
        overallScale = Math.min(scaleX, scaleY);
    } else { overallScale = 1; }
    overallScale *= svgMetadata.baseScaleMultiplier;
    
    const overallScaledViewBoxWidth = svgMetadata.viewBoxWidth * overallScale;
    const overallScaledViewBoxHeight = svgMetadata.viewBoxHeight * overallScale;

    const overallWorldOffsetX = clientWidth - overallScaledViewBoxWidth - (svgMetadata.viewBoxX * overallScale);
    const overallWorldOffsetY = clientHeight - overallScaledViewBoxHeight - (svgMetadata.viewBoxY * overallScale);
    
    const paths = svgDoc.querySelectorAll('path');
    const svgBodies = []; 
    
    paths.forEach((pathElement) => {
      const rawPathVertices = Svg.pathToVertices(pathElement, 10); 
      if (!rawPathVertices || rawPathVertices.length === 0) return;
      const svgPathCentroid = Vertices.centre(rawPathVertices);
      const translatedPathVertices = Vertices.translate(rawPathVertices, { x: -svgPathCentroid.x, y: -svgPathCentroid.y }, 1);
            
      const finalScaledVertices = Vertices.scale(translatedPathVertices, overallScale, overallScale); 
      const worldBodyX = (svgPathCentroid.x * overallScale) + overallWorldOffsetX; 
      const worldBodyY = (svgPathCentroid.y * overallScale) + overallWorldOffsetY; 

      const bodyFillStyle = pathElement.getAttribute('fill') || '#2d4059';
      const bodyStrokeStyle = pathElement.getAttribute('stroke') || bodyFillStyle; 
      const bodyLineWidth = parseFloat(pathElement.getAttribute('stroke-width')) || 0.5; 

      let bodyDensity;
      let bodyFrictionAir = DEFAULT_FRICTION_AIR;
      let isThisBodyArrow = false;
      let isThisBodyM = false; 
      let isThisBodyArcT = false; // Keep for flagging, but physics will match M

      if (pathElement.id === 'arrow') {
        bodyDensity = 0.02; 
        bodyFrictionAir = ARROW_FRICTION_AIR; 
        isThisBodyArrow = true;
      } else if (pathElement.id === 'M' || pathElement.id === 'arc-t') { // arc-t now gets same as M
        bodyDensity = 0.0006; 
        bodyFrictionAir = M_FRICTION_AIR; 
        if (pathElement.id === 'M') isThisBodyM = true;
        if (pathElement.id === 'arc-t') isThisBodyArcT = true; // Still flag it for potential future use or specific enddrag
      } else { 
        bodyDensity = 0.003; 
      }

      const body = Bodies.fromVertices( worldBodyX, worldBodyY, [finalScaledVertices], {
          isStatic: false, restitution: 0.02, friction: 0.3, 
          density: bodyDensity, 
          frictionAir: bodyFrictionAir, 
          render: { fillStyle: bodyFillStyle, strokeStyle: bodyStrokeStyle, lineWidth: bodyLineWidth, wireframes: false }
        }, true );

      if (body) {
        if (isThisBodyArrow) body.isArrow = true;
        if (isThisBodyM) body.isM = true;
        if (isThisBodyArcT) body.isArcT = true; // Keep flag

        if (body.parts && body.parts.length > 1) {
            for (let i = 0; i < body.parts.length; i++) { 
                body.parts[i].render.fillStyle = bodyFillStyle; 
                body.parts[i].render.strokeStyle = bodyFillStyle; 
                body.parts[i].render.lineWidth = 0.5; 
            }
        }
        Composite.add(engine.world, body);
        svgBodies.push(body); 
      }
    });

    const settleSteps = 15; 
    const settleDelta = (1000 / 60) / settleSteps;
    for (let i = 0; i < settleSteps; i++) { Engine.update(engine, settleDelta); }
    console.log("Initial dynamic settle complete.");
    svgBodies.forEach(body => { Matter.Body.setStatic(body, true); });
    Render.world(render); 
    console.log("Scene initialized. Simulation paused.");

    let simulationStarted = false; const initialPageScrollY = window.scrollY;

    function startMainScrollListener() { 
        const initialGravityY = engine.world.gravity.y; let scrollTimeout = null; let lastScrollY = window.scrollY;
        const scrollStopDelay = 150; let currentScrollEffect = null; 
        currentGravityScrollHandler = function gravityScrollHandler() {
            const currentScrollY = window.scrollY; const scrollDelta = currentScrollY - lastScrollY; clearTimeout(scrollTimeout);
            if (scrollDelta > 0) { 
                if (currentScrollEffect !== 'floating') { console.log("Transition to: Floating with Initial Push");
                    svgBodies.forEach(body => { if (!body.isStatic) { 
                        const pushY = -0.015 * body.mass; // Reverted to hardcoded default
                        const pushX = (Math.random() - 0.5) * 0.005 * body.mass; // Reverted to hardcoded default
                        Matter.Body.applyForce(body, body.position, { x: pushX, y: pushY }); 
                    }});
                    currentScrollEffect = 'floating'; }
                if (currentScrollY > 500) { engine.world.gravity.y = -0.1; } else { engine.world.gravity.y = -0.5; }
            } else if (scrollDelta < 0) { 
                if (currentScrollEffect !== 'fallingHard') { console.log("Transition to: Falling Hard with Spin"); engine.world.gravity.y = 4.5;  
                    svgBodies.forEach(body => { if (!body.isStatic) { const randomAngularVelocity = (Math.random() - 0.5) * 0.2; Matter.Body.setAngularVelocity(body, randomAngularVelocity); }});
                    currentScrollEffect = 'fallingHard';
                } else { engine.world.gravity.y = 4.5; } }
            lastScrollY = currentScrollY;
            scrollTimeout = setTimeout(() => { console.log("Scroll Stop: Resetting gravity and effect"); engine.world.gravity.y = initialGravityY; currentScrollEffect = null; }, scrollStopDelay);
        };
        window.addEventListener('scroll', currentGravityScrollHandler); console.log("Main scroll listener added.");
    }

    function startSimulation(firstScrollEventY) { 
        if (!simulationStarted) { simulationStarted = true;
            svgBodies.forEach(body => { Matter.Body.setStatic(body, false); });
            if (initialPageScrollY > 0 && firstScrollEventY < initialPageScrollY) { console.log("Applying bump...");
                svgBodies.forEach(body => { if (!body.isStatic) { Matter.Body.applyForce(body, body.position, { x: 0, y: -0.001 * body.mass }); }}); }
            Render.run(render); runner = Runner.run(engine); startMainScrollListener(); console.log("Matter.js simulation started."); }
    }

    currentStartSimulationScrollHandler = function() { 
      if (isProgrammaticScroll) { return; } startSimulation(window.scrollY); window.removeEventListener('scroll', currentStartSimulationScrollHandler); currentStartSimulationScrollHandler = null; 
    };
    window.addEventListener('scroll', currentStartSimulationScrollHandler);
    
    if (currentResizeHandler) { window.removeEventListener('resize', currentResizeHandler); }
    currentResizeHandler = debounce(() => { 
        console.log("Window resize detected, re-initializing scene..."); 
        initScene(); 
    }, 250); 
    window.addEventListener('resize', currentResizeHandler);

  } catch (error) { console.error('Error initializing scene:', error); isProgrammaticScroll = false; }
}

// Removed slider setup from DOMContentLoaded
document.addEventListener('DOMContentLoaded', initScene);