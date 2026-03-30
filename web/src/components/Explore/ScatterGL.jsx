import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { select } from 'd3-selection';
import { scaleLinear } from 'd3-scale';
import { zoom, zoomIdentity } from 'd3-zoom';
import { rgb } from 'd3-color';
import { quadtree } from 'd3-quadtree';
import REGL from 'regl';
import {
  mapSelectionColorsLight,
  mapSelectionColorsDark,
  mapSelectionOpacity,
  mapPointSizeRange,
  mapSelectionKey,
} from '@/lib/colors';
import { useFilter } from '@/contexts/FilterContext';
import { useColorMode } from '@/hooks/useColorMode';
import styles from './Scatter.module.css';
import useDebounce from '@/hooks/useDebounce';

import PropTypes from 'prop-types';
ScatterGL.propTypes = {
  points: PropTypes.array.isRequired, // an array of [x,y] points
  width: PropTypes.number.isRequired,
  maxZoom: PropTypes.number,
  pointScale: PropTypes.number,
  quadtreeRadius: PropTypes.number,
  ignoreNotSelected: PropTypes.bool,
  height: PropTypes.number.isRequired,
  onView: PropTypes.func,
  onSelect: PropTypes.func,
  onHover: PropTypes.func,
  isSmallScreen: PropTypes.bool,
};

const calculatePointColor = (valueA) => {
  return mapSelectionColorsLight[valueA];
};

const calculatePointOpacity = (featureIsSelected, valueA, activation) => {
  // when a feature is selected, we want to use the activation value to set the opacity
  if (featureIsSelected && valueA === mapSelectionKey.selected && activation !== undefined) {
    return activation + 0.5;
  }
  return mapSelectionOpacity[valueA];
};

const calculatePointSize = (valueA) => {
  return mapPointSizeRange[valueA];
};

const calculateDynamicPointScale = (pointCount, width, height) => {
  // Calculate area per point
  const totalArea = width * height;
  const areaPerPoint = totalArea / pointCount;

  // Calculate ideal point diameter based on area
  // Using sqrt because area is squared
  const baseSize = Math.sqrt(areaPerPoint);

  // Apply non-linear scaling to make points grow faster with fewer points
  // Using a power less than 1 creates this effect
  const scalingPower = 0.9; // Adjust this value to control growth rate
  const scaledSize = Math.pow(baseSize, scalingPower);

  // Apply scaling factor and constraints
  const size = Math.min(Math.max(scaledSize * 0.3, 1), 10);

  return size;
};

// Converts a screen coordinate (e.g. width / 2, height / 2) to data coordinates
const screenToDataCoordinates = (screenX, screenY, transform, xScale, yScale) => {
  // First apply inverse zoom transform to get back to untransformed screen coordinates
  const untransformedX = transform.invertX(screenX);
  const untransformedY = transform.invertY(screenY);

  // Then use scales to convert to data coordinates
  const dataX = xScale.invert(untransformedX);
  const dataY = yScale.invert(untransformedY);

  return { x: dataX, y: dataY };
};

// Get the center coordinates of the screen in data coordinate space
const getCenterCoordinates = (width, height, transform, xScale, yScale) => {
  const screenCenterX = width / 2;
  const screenCenterY = height / 2;

  return screenToDataCoordinates(screenCenterX, screenCenterY, transform, xScale, yScale);
};

function ScatterGL({
  points,
  width,
  height,
  pointScale = 1,
  quadtreeRadius = 10,
  minZoom = 0.75,
  maxZoom = 40,
  onView,
  onSelect,
  onHover,
  featureIsSelected,
  ignoreNotSelected = false,
  isSmallScreen = false,
}) {
  const { isDark: isDarkMode } = useColorMode();
  const { setCenteredIndices } = useFilter();

  const debouncedSetCenteredIndices = useDebounce(setCenteredIndices, 50);

  const canvasRef = useRef(null);
  const reglRef = useRef(null);
  const drawPointsRef = useRef(null);
  const xScaleRef = useRef(scaleLinear().domain([-1, 1]).range([0, width]));
  const yScaleRef = useRef(scaleLinear().domain([-1, 1]).range([height, 0]));
  const quadtreeRef = useRef(null);

  const TOP_N_POINTS = 10;

  // Set initial data center
  // useEffect(() => {
  //   if (quadtreeRef.current) {
  //     // if (!anyFilterActive) {
  //     const center = getCenterCoordinates(
  //       width,
  //       height,
  //       transform,
  //       xScaleRef.current,
  //       yScaleRef.current
  //     );
  //     const closest = findNClosestPoints(center.x, center.y, TOP_N_POINTS);
  //     setCenteredIndices(closest);
  //     // }
  //     // const closest = findNearestPointData(center.x, center.y);
  //     // setFilteredIndices(closest);
  //     // if (closest !== -1 && useDefaultIndices) {
  //     //   setHoveredIndex(closest);
  //     //   const cluster = clusterMap[closest];
  //     //   if (cluster) {
  //     //     setHoveredCluster(cluster);
  //     //   }
  //     // }
  //   }
  // }, [width, height]);

  // make xScaleRef and yScaleRef update when width and height change
  useEffect(() => {
    xScaleRef.current = scaleLinear().domain([-1, 1]).range([0, width]);
    yScaleRef.current = scaleLinear().domain([-1, 1]).range([height, 0]);
  }, [width, height]);

  const [transform, setTransform] = useState(zoomIdentity);

  // Ref so zoom end handler always calls the latest updateCenteredIndices
  const updateCenteredIndicesRef = useRef(null);

  // Setup canvas, regl, zoom behavior — only re-runs on resize
  useEffect(() => {
    const canvas = canvasRef.current;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;

    reglRef.current = REGL({
      canvas,
      attributes: {
        antialias: true,
        preserveDrawingBuffer: true,
        alpha: true,
      },
      pixelRatio: pixelRatio,
    });

    const zoomBehavior = zoom()
      .scaleExtent([minZoom, maxZoom])
      .on('zoom', (event) => {
        setTransform(event.transform);
        const newXScale = event.transform.rescaleX(xScaleRef.current);
        const newYScale = event.transform.rescaleY(yScaleRef.current);

        if (onView) {
          onView(newXScale.domain(), newYScale.domain(), event.transform);
        }
      })
      .on('end', (event) => {
        if (updateCenteredIndicesRef.current) {
          updateCenteredIndicesRef.current(event.transform);
        }
      });

    const zoomSelection = select(canvas).call(zoomBehavior);

    const zoomOutFactor = 0.8;
    const centerX = width / 2;
    const centerY = height / 2;
    const initialTransform = zoomIdentity
      .translate(centerX, centerY)
      .scale(zoomOutFactor)
      .translate(-centerX, -centerY);

    zoomSelection.call(zoomBehavior.transform, initialTransform);

    return () => {
      select(canvas).on('.zoom', null);
      if (reglRef.current) {
        reglRef.current.destroy();
      }
    };
  }, [width, height]);

  // Rebuild buffers and draw command when points change — does NOT touch zoom
  useEffect(() => {
    if (!reglRef.current) return;

    const positionBuffer = reglRef.current.buffer(points.map((p) => [p[0], p[1]]));
    const colorBuffer = reglRef.current.buffer(
      points.map(([, , valueA]) => {
        const colorHex = calculatePointColor(valueA);
        const rgbColor = rgb(colorHex);
        return [rgbColor.r / 255, rgbColor.g / 255, rgbColor.b / 255];
      })
    );
    const opacityBuffer = reglRef.current.buffer(
      points.map(([, , valueA, activation]) =>
        calculatePointOpacity(featureIsSelected, valueA, activation)
      )
    );
    const sizeBuffer = reglRef.current.buffer(
      points.map(([, , valueA]) => calculatePointSize(valueA))
    );

    drawPointsRef.current = reglRef.current({
      vert: `
        precision mediump float;
        attribute vec2 position;
        attribute vec3 color;
        attribute float opacity;
        attribute float size;

        uniform vec2 uTranslate;
        uniform float uScale;
        uniform vec2 uScreenSize;

        uniform float pointScale;
        uniform float dotScaleFactor;

        varying vec3 v_color;
        varying float v_opacity;

        void main() {
          v_color = color;
          v_opacity = opacity;

          vec2 screen = vec2(
            (position.x + 1.0) * 0.5 * uScreenSize.x,
            (1.0 - position.y) * 0.5 * uScreenSize.y
          );

          vec2 transformed = screen * uScale + uTranslate;

          vec2 clip = vec2(
            (transformed.x / uScreenSize.x) * 2.0 - 1.0,
            -(transformed.y / uScreenSize.y) * 2.0 + 1.0
          );

          gl_Position = vec4(clip, 0, 1);

          gl_PointSize = pointScale * size * dotScaleFactor;
        }
      `,
      frag: `
        precision mediump float;
        varying vec3 v_color;
        varying float v_opacity;
        uniform float uScale;
        uniform bool isDarkMode;
        uniform float dotScaleFactor;
        void main() {
          float dist = length(gl_PointCoord.xy - 0.5) * 2.0;
          if (dist > 1.0) discard;
          float alpha;
          if(isDarkMode) {
            alpha = v_opacity * (1.0 - pow(dist, uScale * dotScaleFactor));
          } else {
            alpha = v_opacity * (1.0 - pow(dist, uScale * dotScaleFactor * 2.0));
          }
          vec3 color = v_color * 0.95;

          gl_FragColor = vec4(color * alpha*1.25, alpha);

        }
      `,
      attributes: {
        position: positionBuffer,
        color: colorBuffer,
        opacity: opacityBuffer,
        size: sizeBuffer,
      },
      uniforms: {
        pointScale: (context, props) => props.pointScale,
        uTranslate: (context, props) => [props.transform.x, props.transform.y],
        uScale: (context, props) => props.transform.k,
        uScreenSize: (context, props) => [props.width, props.height],
        dotScaleFactor: (context, props) => {
          let sf = 1.25 + (props.transform.k / maxZoom) * 4;
          return sf;
        },
        isDarkMode: (context, props) => isDarkMode,
      },
      count: points.length,
      primitive: 'points',
      blend: {
        enable: true,
        func: (context, props) => {
          return props.blendParams;
        },
      },
      depth: { enable: false },
    });
  }, [points, featureIsSelected]);

  const dynamicSize = useMemo(() => {
    let size = calculateDynamicPointScale(points.length, width, height);
    // console.log('dynamicSize', size, points.length);
    return size;
  }, [points, width, height]);

  // Draw points when they change
  useEffect(() => {
    if (!reglRef.current || !drawPointsRef.current) return;

    reglRef.current.clear({
      color: isDarkMode ? [0.067, 0.067, 0.067, 1] : [0.98, 0.98, 0.98, 1],
      depth: 1,
    });

    const pointsToRender = points;

    const blendParams = isDarkMode
      ? {
          srcRGB: 'src alpha',
          srcAlpha: 'src alpha',
          dstRGB: 'one',
          dstAlpha: 'one',
        }
      : {
          srcRGB: 'one',
          srcAlpha: 'one',
          dstRGB: 'one minus src alpha',
          dstAlpha: 'one minus src alpha',
          // srcRGB: 'src alpha',
          // srcAlpha: 'src alpha',
          // dstRGB: 'one',
          // dstAlpha: 'one',
        };

    drawPointsRef.current({
      points: pointsToRender,
      pointScale: dynamicSize * pointScale,
      featureIsSelected,
      transform,
      width,
      height,
      blendParams,
    });
  }, [points, transform, pointScale, featureIsSelected, width, height, isDarkMode, dynamicSize]);

  // Update useEffect to rebuild quadtree when points change
  useEffect(() => {
    if (!points || !points.length) return;

    // if ignoreNotSelected is true, we only want to add points that are selected as a result of the
    // filter to the quadtree. if it is false, we want to add all points to the quadtree.
    const filteredPoints = points.filter(
      (d) =>
        d[2] !== mapSelectionKey.hidden &&
        (ignoreNotSelected ? d[2] === mapSelectionKey.selected : true)
    );

    quadtreeRef.current = quadtree()
      .x((d) => d[0])
      .y((d) => d[1])
      .addAll(filteredPoints);
  }, [points, ignoreNotSelected]);

  // Replace the existing handleMouseMove with this updated version
  const findNearestPoint = useCallback(
    (x, y) => {
      if (!points || !quadtreeRef.current) return -1;

      // const transform = transformRef.current;
      // Convert screen coordinates back to data space
      const dataX = xScaleRef.current.invert(transform.invertX(x));
      const dataY = yScaleRef.current.invert(transform.invertY(y));

      let nearest = null;
      let minDistance = Infinity;

      // Search radius in data coordinates
      const zoomFactor = Math.pow(transform.k, 0.5); // Square root provides a more moderate scaling
      const radius =
        (((quadtreeRadius * (1 + zoomFactor)) / transform.k) *
          (xScaleRef.current.domain()[1] - xScaleRef.current.domain()[0])) /
        width;

      quadtreeRef.current.visit((node, x1, y1, x2, y2) => {
        // First check if this node's bounding box is outside our search area
        const isOutsideSearchArea =
          x1 > dataX + radius || x2 < dataX - radius || y1 > dataY + radius || y2 < dataY - radius;

        // If outside, stop traversing this branch
        if (isOutsideSearchArea) {
          return true;
        }

        // Only process points from nodes within our search area
        if (!node.length) {
          const dx = node.data[0] - dataX;
          const dy = node.data[1] - dataY;
          const distance = dx * dx + dy * dy;

          if (distance < minDistance) {
            minDistance = distance;
            nearest = node.data;
          }
        }

        // Continue traversing this branch's children
        return false;
      });

      if (nearest && Math.sqrt(minDistance) <= radius) {
        return points.findIndex((p) => p[0] === nearest[0] && p[1] === nearest[1]);
      }
      return -1;
    },
    [points, width, transform, quadtreeRadius]
  );

  // Find the n closest points to the given data coordinates (dataX, dataY)
  const findNClosestPoints = useCallback((dataX, dataY, n) => {
    const closestPoints = [];

    // Search radius in data coordinates
    const radius = 0.05;
    // ((quadtreeRadius / transform.k) *
    //   (xScaleRef.current.domain()[1] - xScaleRef.current.domain()[0])) /
    // width;

    quadtreeRef.current.visit((node, x1, y1, x2, y2) => {
      // First check if this node's bounding box is outside our search area
      const isOutsideSearchArea =
        x1 > dataX + radius || x2 < dataX - radius || y1 > dataY + radius || y2 < dataY - radius;

      // If outside, stop traversing this branch
      if (isOutsideSearchArea) {
        return true;
      }

      // Only process points from nodes within our search area
      if (!node.length) {
        const dx = node.data[0] - dataX;
        const dy = node.data[1] - dataY;
        const distance = dx * dx + dy * dy;

        if (closestPoints.length < n) {
          closestPoints.push({ point: node.data, distance });
          closestPoints.sort((a, b) => a.distance - b.distance);
        } else if (distance < closestPoints[closestPoints.length - 1].distance) {
          closestPoints[closestPoints.length - 1] = { point: node.data, distance };
          closestPoints.sort((a, b) => a.distance - b.distance);
        }
      }

      // Continue traversing this branch's children
      return false;
    });
    // debugger;
    // console.log('closestPoints', closestPoints);

    return closestPoints.map(({ point }) =>
      points.findIndex((p) => p[0] === point[0] && p[1] === point[1])
    );
  }, [points]);

  const handleMouseMove = useCallback(
    (event) => {
      if (!points || !onHover) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const nearestPoint = findNearestPoint(x, y);
      onHover(nearestPoint === -1 ? null : nearestPoint);
    },
    [points, onHover, findNearestPoint]
  );

  // Add click handler
  const handleClick = useCallback(
    (event) => {
      if (!points || !onSelect) return;

      const rect = canvasRef.current.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      const nearestPoint = findNearestPoint(x, y);
      if (nearestPoint !== -1) {
        onSelect([nearestPoint]);
      }
    },
    [points, onSelect, findNearestPoint]
  );

  const updateCenteredIndices = useCallback(
    (transform) => {
      if (!isSmallScreen) return;
      const newCenter = getCenterCoordinates(
        width,
        height,
        transform,
        xScaleRef.current,
        yScaleRef.current
      );
      if (!quadtreeRef.current) return;
      const closest = findNClosestPoints(newCenter.x, newCenter.y, TOP_N_POINTS);
      debouncedSetCenteredIndices(closest);
    },
    [width, height, debouncedSetCenteredIndices, findNClosestPoints, isSmallScreen]
  );

  // Keep the ref in sync so the zoom end handler always calls the latest version
  useEffect(() => {
    updateCenteredIndicesRef.current = updateCenteredIndices;
  }, [updateCenteredIndices]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className={styles.scatter}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => onHover && onHover(null)}
      onClick={handleClick}
    />
  );
}

export default ScatterGL;
