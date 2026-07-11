import { useEffect, useRef } from 'react';
import { scaleLinear, scaleSequential } from 'd3-scale';
import { extent } from 'd3-array';
import { interpolateOranges } from 'd3-scale-chromatic';
import { useColorMode } from '@/hooks/useColorMode';
import styles from './TilePlot.module.scss';

/*
Tiles are grouped points that have the same tile index

We expect:
tiles : [ 
  {
    tile_index: 0,
    points: [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
    ]
  }
]
*/

const TilePlot = ({ 
  tiles, 
  tileMeta,
  fill,
  stroke,
  size,
  xDomain,
  yDomain, 
  width, 
  height
}) => {
  const container = useRef();
  // The base fill is chrome (the map well behind the tiles), so it must flip
  // with the theme; colorMode in the effect deps re-paints on theme change.
  const { colorMode } = useColorMode();

  useEffect(() => {
    if(xDomain && yDomain) {
      const xScale = scaleLinear()
        .domain(xDomain)
        .range([0, width])
      const yScale = scaleLinear()
        .domain(yDomain)
        .range([height, 0])

      const zScale = (t) => t/(.01 + xDomain[1] - xDomain[0])
      const canvas = container.current
      // Render at device resolution (retina) while laying out at CSS pixels.
      const dpr = window.devicePixelRatio || 1
      canvas.width = width * dpr
      canvas.height = height * dpr
      const ctx = canvas.getContext('2d')
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, width, height)
      ctx.globalAlpha = 1
      ctx.fillStyle =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--ls-surface-map')
          .trim() || '#ffffff'
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = fill 
      ctx.strokeStyle = stroke
      ctx.globalAlpha = 0.75
      ctx.lineWidth = zScale(.75)

      if(!tiles.length) return

      // Cell size in pixels per axis. The x and y scales stretch the square
      // data domain to the (possibly non-square) canvas, so a cell is a
      // rectangle on screen — sizing per axis keeps the grid gapless and
      // aligned with the atlas image tiles, which fill the same rects.
      let rwx = Math.abs(xScale(tileMeta.size) - xScale(0))
      let rwy = Math.abs(yScale(tileMeta.size) - yScale(0))

      // global extent of count
      let countExtent = extent(tiles.map(tile => tile.points.length))
      let colorScale = scaleSequential(interpolateOranges)
        .domain(countExtent)

      tiles.map((tile) => {
        if(!tile) return;
        let tx = xScale(tile.tile_index % tileMeta.cols * tileMeta.size - tileMeta.cols * tileMeta.size / 2)
        let ty = yScale(Math.floor(tile.tile_index / tileMeta.cols) * tileMeta.size - tileMeta.cols * tileMeta.size / 2 + tileMeta.size)

        if(fill){
          // calculate color based on the count
          let count = tile.points.length
          let color = colorScale(count)
          ctx.fillStyle = color
          ctx.fillRect(tx, ty, rwx, rwy);
        }
        if(stroke){
          ctx.strokeRect(tx, ty, rwx, rwy);
        }

      })
    }

  }, [tiles, tileMeta, fill, stroke, size, xDomain, yDomain, width, height, colorMode])

  return <canvas
    className={styles["tile-plot"]}
    ref={container}
    style={{ width, height }}
    width={width}
    height={height} />;
};

export default TilePlot;